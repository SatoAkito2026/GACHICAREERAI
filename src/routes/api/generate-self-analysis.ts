/**
 * 自己分析レポート生成API
 *
 * POST /api/generate-self-analysis
 *   body: { reportType: 'basic' | 'detailed' }
 *   - 回数は SELF_ANALYSIS_PER_MONTH（無料 月1／ライト 月3／プロ 月10。基本と詳細の合計）
 *   - detailed: プロだけ
 * GET /api/generate-self-analysis → 今月使った回数と上限
 *
 * 模擬面接の結果（7つの評価と根拠の発言・良かった点・伸びしろ）と、プロフィール・オンボーディング回答を文脈として
 * 渡し、強み・弱み・懸念点・アピールポイント・向いている職業/学校傾向を
 * 構造化データとして生成する。
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  getSupabaseUrl,
  getServiceRoleKey,
  verifyApiUser,
  getFeatureUsage,
  addFeatureUsage,
} from "@/lib/api-auth";
import { SELF_ANALYSIS_PER_MONTH, toIndividualPlan } from "@/lib/plan-rules";

const USAGE_KEY = "self_analysis";

async function activePlan(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_mode, plan, plan_expires_at")
    .eq("id", userId)
    .maybeSingle();
  const isExpired = profile?.plan_expires_at
    ? new Date(profile.plan_expires_at).getTime() < Date.now()
    : false;
  return {
    profile,
    plan: profile?.plan && !isExpired ? (profile.plan as string) : "free",
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/generate-self-analysis")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Supabase config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);
        const { plan } = await activePlan(supabase, auth.userId);
        const tier = toIndividualPlan(plan);
        return json({
          perMonth: SELF_ANALYSIS_PER_MONTH[tier],
          detailedAllowed: tier === "individual_pro",
          usedThisMonth: (await getFeatureUsage(supabase, auth.userId, USAGE_KEY)).month,
        });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) return json({ error: "API key missing" }, 500);

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Supabase config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);
        const userId = auth.userId;

        const body = (await request.json().catch(() => null)) as {
          reportType?: "basic" | "detailed";
        } | null;
        const reportType = body?.reportType === "detailed" ? "detailed" : "basic";

        const { profile, plan } = await activePlan(supabase, userId);
        const dbMode: "individual" | "student" =
          profile?.user_mode === "private_student" ? "student" : "individual";

        // 回数の上限（日本時間の今月。基本と詳細の合計）。詳細はプロだけ
        const tier = toIndividualPlan(plan);
        if (reportType === "detailed" && tier !== "individual_pro") {
          return json({ error: "pro_only", message: "詳細分析はプロプランで使えます。" }, 403);
        }
        const perMonth = SELF_ANALYSIS_PER_MONTH[tier];
        const used = (await getFeatureUsage(supabase, userId, USAGE_KEY)).month;
        if (used >= perMonth) {
          return json(
            {
              error: "monthly_limit",
              message: `自己分析は月${perMonth}回までです。来月1日にリセットされます。${tier === "individual_pro" ? "" : "プランを上げると回数が増えます。"}`,
            },
            429,
          );
        }

        // 模擬面接の結果（新しい順。詳細分析はより多く見る）
        const { data: interviews } = await supabase
          .from("interviews")
          .select("id, created_at, job_type")
          .eq("user_id", userId)
          .eq("mode", dbMode)
          .neq("impression", "途中退出")
          .order("created_at", { ascending: false })
          .limit(reportType === "detailed" ? 15 : 8);
        const interviewIds = (interviews ?? []).map((i: any) => i.id);
        const { data: summaries } = interviewIds.length
          ? await supabase
              .from("interview_summaries")
              .select("interview_id, practice_feedback")
              .in("interview_id", interviewIds)
          : { data: [] };
        const feedbackBy = new Map(
          (summaries ?? []).map((s: any) => [s.interview_id, s.practice_feedback ?? {}]),
        );
        const interviewText = (interviews ?? [])
          .map((iv: any) => {
            const f = feedbackBy.get(iv.id) ?? {};
            const comps = ((f.competencies ?? []) as any[])
              .filter((c) => c.score != null)
              .map(
                (c) =>
                  `  - ${c.label} ${c.score}/5：${c.reason ?? ""}${(c.evidence ?? []).length ? `（発言：「${(c.evidence as string[]).join("」「")}」）` : ""}`,
              )
              .join("\n");
            return [
              `■ ${String(iv.created_at).slice(0, 10)}（${iv.job_type || "職種指定なし"}）${f.readiness_score != null ? ` 総合${f.readiness_score}点` : ""}`,
              f.overall_impression ? `総評：${f.overall_impression}` : "",
              comps ? `評価：\n${comps}` : "",
              (f.good_points ?? []).length
                ? `良かった点：${(f.good_points as string[]).join("／")}`
                : "",
              (f.improvement_points ?? []).length
                ? `伸びしろ：${(f.improvement_points as string[]).join("／")}`
                : "",
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n");

        // 文脈: 模擬面接の結果・プロフィール全項目・登録回答
        const [{ data: careerProfile }, { data: onboarding }] = await Promise.all([
          supabase
            .from("user_career_profiles")
            .select("*")
            .eq("user_id", userId)
            .eq("mode", dbMode)
            .maybeSingle(),
          supabase
            .from("onboarding_answers")
            .select("answers")
            .eq("user_id", userId)
            .eq("mode", dbMode)
            .maybeSingle(),
        ]);

        const profileSummary = careerProfile
          ? JSON.stringify({
              basic_info: careerProfile.basic_info,
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
            })
          : "(プロフィール未入力)";

        const modeLabel = dbMode === "student" ? "受験生（入試対策）" : "社会人（就活・転職）";
        const depthHint =
          reportType === "detailed"
            ? "詳細版として、根拠となる具体的な発言・エピソードを引用しながら深く分析すること。suited_jobsは5件程度、strengths/weaknesses/appeal_pointsは各4〜6件出すこと。"
            : "基本版として、要点を絞って簡潔にまとめること。suited_jobsは3件程度、strengths/weaknesses/appeal_pointsは各2〜3件に絞ること。";

        const targetLabel =
          dbMode === "student" ? "向いている学校・学部の傾向" : "向いている職業・業界";

        const systemPrompt = `あなたは${modeLabel}向けの自己分析専門のキャリアコーチAIです。
以下の模擬面接の結果（AIの評価と、根拠になった本人の発言）とプロフィールを分析し、この人の自己分析レポートを作成してください。
模擬面接の結果を一番の材料にし、強み・弱みには面接での発言やエピソードを根拠として示すこと。面接の記録が少ない場合は、プロフィールから分かる範囲でまとめること。
${depthHint}

必ず次のJSON形式のみで出力してください。前置きや説明、マークダウンのコードブロックは一切付けないこと。
{
  "summary": "この人物像の要約(3〜4文)",
  "strengths": ["強み1", "強み2"],
  "weaknesses": ["弱み・課題1", "弱み・課題2"],
  "concerns": "面接/選考で懸念されうる点とその対策(1〜2文)",
  "appeal_points": ["アピールすべきポイント1", "アピールすべきポイント2"],
  "suited_jobs": [{"name": "${targetLabel}の候補名", "reason": "その理由"}]
}

# 模擬面接の結果（新しい順）
${interviewText || "(まだ模擬面接の記録がありません)"}

# プロフィール(全項目)
${profileSummary}

# 登録時の回答
${onboarding?.answers ? JSON.stringify(onboarding.answers) : "(なし)"}`;

        const anthropic = new Anthropic({ apiKey: anthropicKey });
        let parsed: {
          summary?: string;
          strengths?: string[];
          weaknesses?: string[];
          concerns?: string;
          appeal_points?: string[];
          suited_jobs?: { name: string; reason: string }[];
        } = {};
        let rawText = "";
        try {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4000,
            system: systemPrompt,
            messages: [
              {
                role: "user",
                content: "上記の情報をもとに自己分析レポートをJSON形式で生成してください。",
              },
            ],
          });
          rawText = response.content[0]?.type === "text" ? response.content[0].text : "{}";
        } catch (e) {
          console.error("[generate-self-analysis] anthropic call failed", e);
          return json(
            {
              error: "ai_call_failed",
              message: "AIの呼び出しに失敗しました。もう一度お試しください",
            },
            500,
          );
        }

        try {
          let cleaned = rawText.replace(/```json|```/g, "").trim();
          // 万一前後に余計な文章が付いていた場合に備え、最初の{から最後の}までを抜き出す
          const firstBrace = cleaned.indexOf("{");
          const lastBrace = cleaned.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.slice(firstBrace, lastBrace + 1);
          }
          parsed = JSON.parse(cleaned);
        } catch (e) {
          // レスポンスがJSONとして壊れている場合(max_tokens到達による途中切れ等)。
          // デバッグ用に生のレスポンスをログに残す。
          console.error("[generate-self-analysis] JSON parse failed", e, rawText.slice(0, 500));
          return json(
            {
              error: "parse_failed",
              message: "レポートの生成中にエラーが発生しました。もう一度お試しください",
            },
            500,
          );
        }

        let saved: { id: string; created_at: string } | null = null;
        try {
          const { data, error: saveError } = await supabase
            .from("self_analysis_reports")
            .insert({
              user_id: userId,
              mode: dbMode,
              report_type: reportType,
              strengths: parsed.strengths ?? [],
              weaknesses: parsed.weaknesses ?? [],
              concerns: parsed.concerns ?? "",
              appeal_points: parsed.appeal_points ?? [],
              suited_jobs: parsed.suited_jobs ?? [],
              raw_content: parsed,
            })
            .select("id, created_at")
            .single();
          if (saveError) throw saveError;
          saved = data;
        } catch (e) {
          console.error("[generate-self-analysis] save failed", e);
          return json({ error: "save_failed" }, 500);
        }
        await addFeatureUsage(supabase, userId, USAGE_KEY);

        return json({
          id: saved?.id,
          createdAt: saved?.created_at,
          reportType,
          summary: parsed.summary ?? "",
          strengths: parsed.strengths ?? [],
          weaknesses: parsed.weaknesses ?? [],
          concerns: parsed.concerns ?? "",
          appealPoints: parsed.appeal_points ?? [],
          suitedJobs: parsed.suited_jobs ?? [],
        });
      },
    },
  },
});
