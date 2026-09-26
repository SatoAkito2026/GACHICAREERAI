/**
 * 社内管理ダッシュボードAPI
 *
 * GET /api/admin-dashboard-data
 * profiles.is_admin = true のユーザーのみアクセス可能。
 *
 * 返す内容:
 * - プラン別会員数・推定月間売上
 * - 直近30日の新規登録推移
 * - 今月の機能利用状況(feature_usage_counters・interviews集計)
 * - 今月の推定AI利用コスト(Claude/Whisper/TTS/Simliの概算)
 *   ※実際の残クレジットはAPIで取得できないため、利用実績からの概算のみ。
 *     正確な残高は各サービスの管理画面で確認する必要がある。
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey, verifyApiUser } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

const PLAN_PRICES_JPY: Record<string, number> = {
  individual_light: 2200,
  individual_pro: 5500,
  company_light: 33000,
  company_pro: 55000,
};

const USD_JPY = 155;
const CLAUDE_IN = 3 / 1e6;
const CLAUDE_OUT = 15 / 1e6;
const WHISPER_PER_MIN = 0.006;
const TTS_PER_CHAR = 15 / 1e6;
const SIMLI_PER_MIN_HOBBY = 0.01; // Hobbyプラン想定の概算単価

export const Route = createFileRoute("/api/admin-dashboard-data")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Supabase config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);
        const userId = auth.userId;

        const { data: requester } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", userId)
          .maybeSingle();
        if (!requester?.is_admin) return json({ error: "forbidden" }, 403);

        // ① プラン別会員数
        const { data: allProfiles } = await supabase
          .from("profiles")
          .select("plan, created_at, user_mode");
        const planCounts: Record<string, number> = {};
        for (const p of allProfiles ?? []) {
          const plan = (p as any).plan || "free";
          planCounts[plan] = (planCounts[plan] ?? 0) + 1;
        }

        // ② 推定月間売上(サブスク定額分のみ。従量課金は今月の発行回数から概算)
        let monthlyRevenue = 0;
        for (const [plan, count] of Object.entries(planCounts)) {
          monthlyRevenue += (PLAN_PRICES_JPY[plan] ?? 0) * count;
        }

        const now = new Date();
        const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const monthStart = `${jstNow.toISOString().slice(0, 7)}-01`;

        const { count: meteredInterviewsThisMonth } = await supabase
          .from("interview_invitations")
          .select("*", { count: "exact", head: true })
          .is("practice_mode", null)
          .gte("created_at", monthStart);
        monthlyRevenue += (meteredInterviewsThisMonth ?? 0) * 2200;

        // ③ 直近30日の新規登録推移
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentSignups } = await supabase
          .from("profiles")
          .select("created_at")
          .gte("created_at", thirtyDaysAgo);
        const signupsByDate: Record<string, number> = {};
        for (const s of recentSignups ?? []) {
          const dateKey = new Date((s as any).created_at).toISOString().slice(0, 10);
          signupsByDate[dateKey] = (signupsByDate[dateKey] ?? 0) + 1;
        }
        const signupTrend = Object.entries(signupsByDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, count }));

        // ④ 今月の機能利用状況
        const thisMonthKey = jstNow.toISOString().slice(0, 7);
        const { data: usageRows } = await supabase
          .from("feature_usage_counters")
          .select("feature_key, count, window_key");
        const usageThisPeriod: Record<string, number> = {};
        for (const u of usageRows ?? []) {
          const w = (u as any).window_key as string;
          if (w.startsWith(thisMonthKey)) {
            const key = (u as any).feature_key as string;
            usageThisPeriod[key] = (usageThisPeriod[key] ?? 0) + ((u as any).count ?? 0);
          }
        }

        const { count: interviewsThisMonth } = await supabase
          .from("interviews")
          .select("*", { count: "exact", head: true })
          .gte("created_at", monthStart);

        const { data: practiceInvitations } = await supabase
          .from("interview_invitations")
          .select("practice_max_minutes")
          .not("practice_mode", "is", null)
          .gte("created_at", monthStart);
        const estimatedPracticeMinutes = (practiceInvitations ?? []).reduce(
          (sum, r) => sum + ((r as any).practice_max_minutes ?? 15),
          0,
        );

        // ⑤ 今月の推定AI利用コスト(概算。実際の残高はAnthropic/Simliの管理画面で確認する必要あり)
        const totalInterviewsForCost = interviewsThisMonth ?? 0;
        const claudeCostUsd =
          totalInterviewsForCost * 15 * (2000 * CLAUDE_IN + 150 * CLAUDE_OUT) + // 面接ターン分
          totalInterviewsForCost * (3000 * CLAUDE_IN + 800 * CLAUDE_OUT); // 総評生成分
        const whisperCostUsd = totalInterviewsForCost * 15 * WHISPER_PER_MIN;
        const ttsCostUsd = totalInterviewsForCost * 15 * 150 * TTS_PER_CHAR;
        const simliCostUsd =
          (estimatedPracticeMinutes + totalInterviewsForCost * 15) * SIMLI_PER_MIN_HOBBY;

        const estimatedMonthlyCostJpy =
          (claudeCostUsd + whisperCostUsd + ttsCostUsd + simliCostUsd) * USD_JPY;

        // ⑥ 売上の内訳(個人/受験生 と 企業/学校を分けて見る)
        const individualRevenue =
          (planCounts.individual_light ?? 0) * PLAN_PRICES_JPY.individual_light +
          (planCounts.individual_pro ?? 0) * PLAN_PRICES_JPY.individual_pro;
        const companyRevenue =
          (planCounts.company_light ?? 0) * PLAN_PRICES_JPY.company_light +
          (planCounts.company_pro ?? 0) * PLAN_PRICES_JPY.company_pro +
          (meteredInterviewsThisMonth ?? 0) * 2200;

        // ⑦ 希望職種ランキング(個人)
        const { data: individualProfiles } = await supabase
          .from("user_career_profiles")
          .select("desired_conditions, basic_info")
          .eq("mode", "individual");
        const jobTypeCounts: Record<string, number> = {};
        const addressPrefCountsIndividual: Record<string, number> = {};
        for (const p of individualProfiles ?? []) {
          const jt = (p as any).desired_conditions?.job_type as string | undefined;
          if (jt) jobTypeCounts[jt] = (jobTypeCounts[jt] ?? 0) + 1;
        }
        const jobTypeRanking = Object.entries(jobTypeCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([name, count]) => ({ name, count }));

        // ⑧ 志望校ランキング(受験生)
        const { data: studentProfiles } = await supabase
          .from("user_career_profiles")
          .select("desired_schools, basic_info")
          .eq("mode", "student");
        const schoolCounts: Record<string, number> = {};
        for (const p of studentProfiles ?? []) {
          const schools = ((p as any).desired_schools ?? []) as { school_name?: string }[];
          for (const s of schools) {
            if (s?.school_name)
              schoolCounts[s.school_name] = (schoolCounts[s.school_name] ?? 0) + 1;
          }
        }
        const schoolRanking = Object.entries(schoolCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([name, count]) => ({ name, count }));

        // ⑨ 都道府県別の登録者分布(住所の先頭一致で簡易集計。個人情報そのものは返さない)
        const PREFECTURES = [
          "北海道",
          "青森県",
          "岩手県",
          "宮城県",
          "秋田県",
          "山形県",
          "福島県",
          "茨城県",
          "栃木県",
          "群馬県",
          "埼玉県",
          "千葉県",
          "東京都",
          "神奈川県",
          "新潟県",
          "富山県",
          "石川県",
          "福井県",
          "山梨県",
          "長野県",
          "岐阜県",
          "静岡県",
          "愛知県",
          "三重県",
          "滋賀県",
          "京都府",
          "大阪府",
          "兵庫県",
          "奈良県",
          "和歌山県",
          "鳥取県",
          "島根県",
          "岡山県",
          "広島県",
          "山口県",
          "徳島県",
          "香川県",
          "愛媛県",
          "高知県",
          "福岡県",
          "佐賀県",
          "長崎県",
          "熊本県",
          "大分県",
          "宮崎県",
          "鹿児島県",
          "沖縄県",
        ];
        for (const p of [...(individualProfiles ?? []), ...(studentProfiles ?? [])]) {
          const address = ((p as any).basic_info?.address as string | undefined) ?? "";
          const matched = PREFECTURES.find((pref) => address.startsWith(pref));
          if (matched)
            addressPrefCountsIndividual[matched] = (addressPrefCountsIndividual[matched] ?? 0) + 1;
        }
        const prefectureRanking = Object.entries(addressPrefCountsIndividual)
          .sort(([, a], [, b]) => b - a)
          .map(([name, count]) => ({ name, count }));

        // ⑩ 企業の採用ニーズ傾向(募集職種の傾向。面接URL発行時のjob_typeを集計)
        const { data: companyJobTypes } = await supabase
          .from("interview_invitations")
          .select("job_type")
          .is("practice_mode", null);
        const companyJobTypeCounts: Record<string, number> = {};
        for (const r of companyJobTypes ?? []) {
          const jt = (r as any).job_type as string | undefined;
          if (jt) companyJobTypeCounts[jt] = (companyJobTypeCounts[jt] ?? 0) + 1;
        }
        const companyJobTypeRanking = Object.entries(companyJobTypeCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([name, count]) => ({ name, count }));

        // ⑪ 年齢・性別分布(生年月日・性別から。個人+受験生)
        const ageCounts: Record<string, number> = {};
        const genderCounts: Record<string, number> = {};
        const gradeCounts: Record<string, number> = {};
        const weakSubjectCounts: Record<string, number> = {};
        const strongSubjectCounts: Record<string, number> = {};
        const nowYear = jstNow.getFullYear();
        for (const p of [...(individualProfiles ?? []), ...(studentProfiles ?? [])]) {
          const info = (p as any).basic_info ?? {};
          const birthdate = info.birthdate as string | undefined;
          if (birthdate) {
            const birthYear = new Date(birthdate).getFullYear();
            const age = nowYear - birthYear;
            const bucket =
              age < 18 ? "18歳未満" : age < 20 ? "18-19歳" : `${Math.floor(age / 10) * 10}代`;
            ageCounts[bucket] = (ageCounts[bucket] ?? 0) + 1;
          }
          if (info.gender) genderCounts[info.gender] = (genderCounts[info.gender] ?? 0) + 1;
          if (info.grade) gradeCounts[info.grade] = (gradeCounts[info.grade] ?? 0) + 1;
          if (info.weak_subject)
            weakSubjectCounts[info.weak_subject] = (weakSubjectCounts[info.weak_subject] ?? 0) + 1;
          if (info.strong_subject)
            strongSubjectCounts[info.strong_subject] =
              (strongSubjectCounts[info.strong_subject] ?? 0) + 1;
        }
        const ageDistribution = Object.entries(ageCounts)
          .sort(([, a], [, b]) => b - a)
          .map(([name, count]) => ({ name, count }));
        const genderDistribution = Object.entries(genderCounts)
          .sort(([, a], [, b]) => b - a)
          .map(([name, count]) => ({ name, count }));
        const gradeDistribution = Object.entries(gradeCounts)
          .sort(([, a], [, b]) => b - a)
          .map(([name, count]) => ({ name, count }));
        const weakSubjectRanking = Object.entries(weakSubjectCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([name, count]) => ({ name, count }));
        const strongSubjectRanking = Object.entries(strongSubjectCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([name, count]) => ({ name, count }));

        // ⑫ 書類選考のランク分布(企業側。A〜Dの割合)
        const { data: screeningRanks } = await supabase.from("screening_candidates").select("rank");
        const rankCounts: Record<string, number> = {};
        for (const r of screeningRanks ?? []) {
          const rank = (r as any).rank as string | undefined;
          if (rank) rankCounts[rank] = (rankCounts[rank] ?? 0) + 1;
        }
        const rankDistribution = ["A", "B", "C", "D"]
          .filter((r) => rankCounts[r])
          .map((name) => ({ name, count: rankCounts[name] }));

        // ⑬ 機能利用率(全会員のうち、各機能を1回でも使ったことがある人の割合)
        const totalUserCount = (allProfiles ?? []).length || 1;
        const countDistinctUsers = async (table: string) => {
          const { data } = await supabase.from(table).select("user_id");
          return new Set((data ?? []).map((r: any) => r.user_id)).size;
        };
        const [chatUsers, docUsers, analysisUsers, practiceUsers] = await Promise.all([
          countDistinctUsers("career_chat_sessions"),
          countDistinctUsers("generated_documents"),
          countDistinctUsers("self_analysis_reports"),
          supabase
            .from("interviews")
            .select("user_id")
            .not("mode", "is", null)
            .then((r) => new Set((r.data ?? []).map((row: any) => row.user_id)).size),
        ]);
        const featureAdoption = [
          {
            name: "AIチャット",
            count: chatUsers,
            rate: Math.round((chatUsers / totalUserCount) * 100),
          },
          {
            name: "書類生成AI",
            count: docUsers,
            rate: Math.round((docUsers / totalUserCount) * 100),
          },
          {
            name: "自己分析",
            count: analysisUsers,
            rate: Math.round((analysisUsers / totalUserCount) * 100),
          },
          {
            name: "模擬面接練習",
            count: practiceUsers,
            rate: Math.round((practiceUsers / totalUserCount) * 100),
          },
        ];

        // ⑭ 継続率(直近7日/30日で何らかの活動があったユーザーの割合)
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: active7 } = await supabase
          .from("daily_question_responses")
          .select("user_id")
          .gte("created_at", sevenDaysAgo);
        const { data: active30 } = await supabase
          .from("daily_question_responses")
          .select("user_id")
          .gte("created_at", thirtyDaysAgo);
        const active7Count = new Set((active7 ?? []).map((r: any) => r.user_id)).size;
        const active30Count = new Set((active30 ?? []).map((r: any) => r.user_id)).size;
        const retentionRate7d = Math.round((active7Count / totalUserCount) * 100);
        const retentionRate30d = Math.round((active30Count / totalUserCount) * 100);

        return json({
          planCounts,
          monthlyRevenue,
          individualRevenue,
          companyRevenue,
          meteredInterviewsThisMonth: meteredInterviewsThisMonth ?? 0,
          signupTrend,
          totalUsers: (allProfiles ?? []).length,
          usageThisPeriod,
          interviewsThisMonth: interviewsThisMonth ?? 0,
          estimatedMonthlyCostJpy: Math.round(estimatedMonthlyCostJpy),
          estimatedProfitJpy: Math.round(monthlyRevenue - estimatedMonthlyCostJpy),
          jobTypeRanking,
          schoolRanking,
          prefectureRanking,
          companyJobTypeRanking,
          ageDistribution,
          genderDistribution,
          gradeDistribution,
          weakSubjectRanking,
          strongSubjectRanking,
          rankDistribution,
          featureAdoption,
          retentionRate7d,
          retentionRate30d,
          note: "AI利用コストは実績ベースの概算です。正確な残高・請求額はAnthropic/Simli/OpenAIそれぞれの管理画面で確認してください。ランキング・分布は個人を特定しない集計値のみです。",
        });
      },
    },
  },
});
