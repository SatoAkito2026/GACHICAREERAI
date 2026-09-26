/**
 * 自己分析レポート生成API
 *
 * POST /api/generate-self-analysis
 *   body: { reportType: 'basic' | 'detailed' }
 *   - basic: free/lightは月3回まで、pro無制限
 *   - detailed: プロ限定機能
 *
 * プロフィール・オンボーディング回答・「今日の質問」の回答を全て文脈として
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
  checkAndConsumeSelfAnalysisQuota,
} from "@/lib/api-auth";

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

        const { data: profile } = await supabase
          .from("profiles")
          .select("user_mode, plan, plan_expires_at")
          .eq("id", userId)
          .maybeSingle();
        const dbMode: "individual" | "student" =
          profile?.user_mode === "private_student" ? "student" : "individual";
        const isExpired = profile?.plan_expires_at
          ? new Date(profile.plan_expires_at).getTime() < Date.now()
          : false;
        const plan = profile?.plan && !isExpired ? (profile.plan as string) : "free";

        // 個人・受験生プランの回数制限は一時的に撤廃
        // 文脈: プロフィール全項目・登録回答・毎日の質問回答(全件)
        const [{ data: careerProfile }, { data: onboarding }, { data: dailyAnswers }] =
          await Promise.all([
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
            supabase
              .from("daily_question_responses")
              .select("question_text, category, answer_text")
              .eq("user_id", userId)
              .eq("mode", dbMode)
              .order("created_at", { ascending: false })
              .limit(100),
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

        const qaHistory = (dailyAnswers ?? [])
          .map((r: any) => `Q(${r.category ?? "未分類"}): ${r.question_text}\nA: ${r.answer_text}`)
          .join("\n\n");

        const modeLabel = dbMode === "student" ? "受験生（入試対策）" : "社会人（就活・転職）";
        const depthHint =
          reportType === "detailed"
            ? "詳細版として、根拠となる具体的な発言・エピソードを引用しながら深く分析すること。suited_jobsは5件程度、strengths/weaknesses/appeal_pointsは各4〜6件出すこと。"
            : "基本版として、要点を絞って簡潔にまとめること。suited_jobsは3件程度、strengths/weaknesses/appeal_pointsは各2〜3件に絞ること。";

        const targetLabel =
          dbMode === "student" ? "向いている学校・学部の傾向" : "向いている職業・業界";

        const systemPrompt = `あなたは${modeLabel}向けの自己分析専門のキャリアコーチAIです。
以下のプロフィール・回答内容を分析し、この人の自己分析レポートを作成してください。
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

# プロフィール(全項目)
${profileSummary}

# 登録時の回答
${onboarding?.answers ? JSON.stringify(onboarding.answers) : "(なし)"}

# これまでの「今日の質問」への回答(全件)
${qaHistory || "(まだ回答なし)"}`;

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
