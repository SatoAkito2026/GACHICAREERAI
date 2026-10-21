/**
 * 個人/受験生の模擬面接練習セッション作成API
 *
 * POST /api/create-practice-session
 *   body: { avatarStyle: 'friendly' | 'neutral' | 'strict' }
 *
 * 認証済みユーザー自身を宛先にした interview_invitations を作成し、
 * 既存の /interview/$token ページ(3Dアバター・音声認識・音声合成)に
 * そのまま案内する。screening_data にはプロフィール情報を注入し、
 * practice_mode を設定することで interview-turn.ts / save-interview.ts が
 * 企業面接とは別の質問方針・総評フォーマットで動作する。
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey, verifyApiUser } from "@/lib/api-auth";
import {
  normalizeJobType,
  practiceRule,
  startOfMonthJst,
  startOfTodayJst,
  toIndividualPlan,
} from "@/lib/plan-rules";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/** 有効期限切れを外した、いまのプラン */
async function getActivePlan(supabase: SupabaseClient, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_mode, plan, plan_expires_at")
    .eq("id", userId)
    .maybeSingle();
  const isExpired = profile?.plan_expires_at
    ? new Date(profile.plan_expires_at).getTime() < Date.now()
    : false;
  const plan = profile?.plan && !isExpired ? (profile.plan as string) : "free";
  return { profile, plan };
}

/**
 * 今日・今月に実際に始めた練習（AIと1回でも話したもの）の数と、今月使った職種。
 * 開いただけで話していないものは数えない。
 */
async function getPracticeUsage(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("interview_invitations")
    .select("job_type, created_at")
    .eq("user_id", userId)
    .not("practice_mode", "is", null)
    .in("status", ["started", "completed", "abandoned"])
    .gte("created_at", startOfMonthJst())
    .limit(1000);
  const rows = (data ?? []) as { job_type: string | null; created_at: string }[];
  const todayStart = startOfTodayJst();
  const jobTypes = [...new Set(rows.map((r) => normalizeJobType(r.job_type)).filter(Boolean))];
  return {
    today: rows.filter((r) => r.created_at >= todayStart).length,
    month: rows.length,
    jobTypes,
  };
}

export const Route = createFileRoute("/api/create-practice-session")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      // 練習画面に「今日あと何回・今月の職種」を出すための残り回数
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Supabase config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);
        const { plan } = await getActivePlan(supabase, auth.userId);
        const usage = await getPracticeUsage(supabase, auth.userId);
        return json({ plan: toIndividualPlan(plan), rule: practiceRule(plan), usage });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Supabase config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);
        const userId = auth.userId;

        const body = (await request.json().catch(() => null)) as {
          avatarStyle?: string;
          interviewType?: string;
          preferences?: {
            desired_job_type?: string;
            desired_company_name?: string;
            desired_school?: string;
            desired_faculty?: string;
            custom_questions?: string;
            prioritize_profile?: boolean;
          };
          uploadedResumeText?: string;
        } | null;
        const avatarStyle = ["friendly", "neutral", "strict"].includes(body?.avatarStyle ?? "")
          ? (body!.avatarStyle as string)
          : "neutral";
        const interviewType = [
          "general",
          "self_pr",
          "entry_sheet",
          "resume",
          "work_history",
        ].includes(body?.interviewType ?? "")
          ? (body!.interviewType as string)
          : "general";
        const preferences = body?.preferences ?? {};

        const { profile, plan } = await getActivePlan(supabase, userId);
        const dbMode: "individual" | "student" =
          profile?.user_mode === "private_student" ? "student" : "individual";
        const isPro = plan === "individual_pro" || plan === "company_pro" || plan === "pro";
        const rule = practiceRule(plan);

        // 深掘り度は plan_practice_config テーブルで調整できる（行が無ければプランの既定値）。
        // 回数・時間・職種の上限は src/lib/plan-rules.ts で決める。
        const { data: practiceConfig } = await supabase
          .from("plan_practice_config")
          .select("depth")
          .eq("plan", plan)
          .maybeSingle();
        const tier = toIndividualPlan(plan);
        const depth: "basic" | "standard" | "deep" =
          (practiceConfig?.depth as "basic" | "standard" | "deep" | undefined) ??
          (tier === "individual_pro" ? "deep" : tier === "individual_light" ? "standard" : "basic");
        const maxMinutes = rule.maxMinutes;

        const usage = await getPracticeUsage(supabase, userId);
        const upgradeHint = tier === "individual_pro" ? "" : "プランを上げると回数が増えます。";
        if (rule.perDay != null && usage.today >= rule.perDay) {
          return json(
            {
              error: "daily_limit",
              message: `今日の練習は${rule.perDay}回までです。明日またどうぞ。${upgradeHint}`,
            },
            429,
          );
        }
        if (rule.perMonth != null && usage.month >= rule.perMonth) {
          return json(
            {
              error: "monthly_limit",
              message: `今月の練習は${rule.perMonth}回までです。来月1日にリセットされます。${upgradeHint}`,
            },
            429,
          );
        }

        const { data: careerProfile } = await supabase
          .from("user_career_profiles")
          .select("*")
          .eq("user_id", userId)
          .eq("mode", dbMode)
          .maybeSingle();

        const basicInfo = (careerProfile?.basic_info ?? {}) as Record<string, string>;
        const candidateName = basicInfo.name || "practice_user";

        // 職種（学校）の選択は全プラン。それ以外の任意設定（会社名・学部・聞いてほしい質問・プロフィール優先）はプロだけ
        if (!isPro) {
          preferences.desired_company_name = undefined;
          preferences.desired_faculty = undefined;
          preferences.custom_questions = undefined;
          preferences.prioritize_profile = false;
        }
        const prioritizeProfile = !!preferences.prioritize_profile;

        // 面接AIへの文脈として、プロフィール情報を丸ごと渡す
        const screeningData: Record<string, unknown> = careerProfile
          ? {
              self_pr: careerProfile.self_pr,
              skills: careerProfile.skills,
              education_history: careerProfile.education_history,
              certifications: careerProfile.certifications,
              work_history: careerProfile.work_history,
              extracurricular_activities: careerProfile.extracurricular_activities,
              desired_conditions: careerProfile.desired_conditions,
              desired_schools: careerProfile.desired_schools,
              mock_exam_results: careerProfile.mock_exam_results,
              custom_fields: careerProfile.custom_fields,
            }
          : {};

        // 「プロフィール優先」がOFFで、任意設定に入力があれば、それをscreening_dataに
        // 明示的に上乗せする(interview-turn.tsのプロンプトで優先的に扱われる)
        if (!prioritizeProfile) {
          if (dbMode === "individual") {
            if (preferences.desired_job_type)
              screeningData.practice_desired_job_type = preferences.desired_job_type;
            if (preferences.desired_company_name)
              screeningData.practice_desired_company_name = preferences.desired_company_name;
          } else {
            if (preferences.desired_school)
              screeningData.practice_desired_school = preferences.desired_school;
            if (preferences.desired_faculty)
              screeningData.practice_desired_faculty = preferences.desired_faculty;
          }
        }
        // 聞いてほしい質問は「プロフィール優先」の設定に関わらず常に反映する
        if (preferences.custom_questions?.trim()) {
          screeningData.practice_custom_questions = preferences.custom_questions.trim();
        }

        const jobType =
          !prioritizeProfile && dbMode === "individual" && preferences.desired_job_type
            ? preferences.desired_job_type
            : !prioritizeProfile && dbMode === "student" && preferences.desired_school
              ? preferences.desired_school
              : dbMode === "student"
                ? ((careerProfile?.desired_schools as any[])?.[0]?.school_name ?? "受験")
                : ((careerProfile?.desired_conditions as any)?.job_type ?? "模擬面接");

        // 職種の数の上限（今月すでに使った職種なら何回でも可。月が変われば入れ替えられる）
        const jobKey = normalizeJobType(jobType);
        if (
          rule.jobTypes != null &&
          jobKey &&
          !usage.jobTypes.includes(jobKey) &&
          usage.jobTypes.length >= rule.jobTypes
        ) {
          const label = dbMode === "student" ? "志望校" : "職種";
          return json(
            {
              error: "job_type_limit",
              message: `今月練習できる${label}は${rule.jobTypes}つまでです（今月：${usage.jobTypes.join("・")}）。来月から別の${label}にできます。${upgradeHint}`,
            },
            429,
          );
        }

        // まだ始めていない前の練習URLは使えなくする（URLをためて上限を超えないように）
        await supabase
          .from("interview_invitations")
          .update({ expires_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("status", "pending")
          .not("practice_mode", "is", null);

        // 書類アップロードはプロプラン限定機能(サーバー側でも念のため制限する)
        const uploadedResumeText =
          isPro && body?.uploadedResumeText ? body.uploadedResumeText.slice(0, 8000) : null;

        // 面接情報パネル表示用。company_name列を「個人=希望会社名」「受験生=希望学部・学科」として使う
        const companyNameForDisplay = !prioritizeProfile
          ? dbMode === "individual"
            ? preferences.desired_company_name || null
            : preferences.desired_faculty || null
          : null;

        const { data: created, error } = await supabase
          .from("interview_invitations")
          .insert({
            user_id: userId,
            candidate_name: candidateName,
            job_type: jobType,
            company_name: companyNameForDisplay,
            screening_data: screeningData,
            practice_mode: dbMode,
            avatar_style: avatarStyle,
            practice_max_minutes: maxMinutes,
            practice_depth: depth,
            practice_interview_type: interviewType,
            uploaded_resume_text: uploadedResumeText,
            status: "pending",
          })
          .select("token")
          .single();

        if (error || !created) {
          console.error("[create-practice-session] failed", error);
          return json({ error: "failed_to_create" }, 500);
        }

        return json({ token: created.token });
      },
    },
  },
});
