/**
 * 書類生成API(履歴書・志望理由書・志望動機・自己PR・ES添削・小論文添削)
 *
 * POST /api/generate-document
 *   body: { docType, targetName?, extraNotes?, reviewText? }
 *   - docType: 'resume' | 'statement_of_purpose' | 'motivation_letter'
 *              | 'self_pr' | 'es_review' | 'essay_review'
 *   - targetName: 応募先企業名 / 志望校名(任意)
 *   - extraNotes: 追加で伝えたいこと(任意)
 *   - reviewText: es_review/essay_review の場合、添削対象の原文(必須)
 *
 * プラン別アクセス制御は checkAndConsumeDocumentQuota に集約:
 *   resume/statement_of_purpose = free/light 1日1回、pro無制限
 *   それ以外 = プロ限定機能
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  getSupabaseUrl,
  getServiceRoleKey,
  verifyApiUser,
  checkAndConsumeDocumentQuota,
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

const DOC_TITLES: Record<string, string> = {
  resume: "履歴書",
  work_history_resume: "職務経歴書",
  resume_review: "履歴書添削完成版",
  work_history_review: "職務経歴書添削完成版",
  statement_of_purpose: "志望理由書",
  motivation_letter: "志望動機書",
  self_pr: "自己PR",
  es_review: "ES完成版",
  essay_review: "小論文完成版",
};

export const Route = createFileRoute("/api/generate-document")({
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
          docType?: string;
          targetName?: string;
          extraNotes?: string;
          reviewText?: string;
        } | null;
        const docType = body?.docType;
        if (!docType || !DOC_TITLES[docType]) return json({ error: "invalid docType" }, 400);
        if (
          ["es_review", "essay_review", "resume_review", "work_history_review"].includes(docType) &&
          !body?.reviewText?.trim()
        ) {
          return json({ error: "reviewText is required for review types" }, 400);
        }

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
        // パーソナライズ用の文脈
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

        const targetLine = body?.targetName ? `対象: ${body.targetName}\n` : "";
        const notesLine = body?.extraNotes ? `追加の要望: ${body.extraNotes}\n` : "";

        let instruction = "";
        switch (docType) {
          case "resume":
            instruction =
              "このプロフィール情報を元に、履歴書の自己PR欄に書く文章だけを作成してください。学歴・職歴・資格の一覧は別途システム側で自動生成するので、ここでは自己PR文章のみを出力してください（見出しや箇条書きは不要、自然な文章で300〜400字程度）。";
            break;
          case "work_history_resume":
            instruction =
              "このプロフィール情報(特に職歴・スキル・自己PR)を元に、職務経歴書を作成してください。各職歴について、担当業務・工夫した点・実績を具体的に、日本の一般的な職務経歴書の書式（職務要約→職務経歴詳細→活かせるスキル→自己PR）に沿って作成してください。";
            break;
          case "statement_of_purpose":
            instruction =
              "このプロフィール情報を元に、志望理由書を作成してください。志望校・志望学部への熱意が伝わる、具体的で説得力のある文章にしてください。";
            break;
          case "motivation_letter":
            instruction = "このプロフィール情報を元に、転職・就職の志望動機書を作成してください。";
            break;
          case "self_pr":
            instruction =
              "このプロフィール情報を元に、面接や書類選考で使える自己PR文章を作成してください。";
            break;
          case "resume_review":
            instruction = `以下の履歴書の文章（自己PR欄等）について、添削解説と、実際に提出できる完成版の両方を作成してください。

必ず次のJSON形式のみで出力してください。前置きや説明、マークダウンのコードブロックは一切付けないこと。
{
  "critique": "良い点・改善点を具体的に指摘する添削解説(見出しや表を使って詳しく)",
  "final_draft": "抽象的な表現を具体化し、数字や固有名詞を補って書き直した、そのまま提出できる完成版の本文(添削コメントは含めない)"
}

# 元の文章
${body?.reviewText}`;
            break;
          case "work_history_review":
            instruction = `以下の職務経歴書の文章について、添削解説と、実際に提出できる完成版の両方を作成してください。

必ず次のJSON形式のみで出力してください。前置きや説明、マークダウンのコードブロックは一切付けないこと。
{
  "critique": "良い点・改善点を具体的に指摘する添削解説(実績の数値化・具体性等の観点。見出しや表を使って詳しく)",
  "final_draft": "実績を数字で示し、担当業務・工夫点を具体化して書き直した、そのまま提出できる完成版の本文(添削コメントは含めない)"
}

# 元の文章
${body?.reviewText}`;
            break;
          case "es_review":
            instruction = `以下のエントリーシートの文章について、添削解説と、実際に提出できる完成版の両方を作成してください。

必ず次のJSON形式のみで出力してください。前置きや説明、マークダウンのコードブロックは一切付けないこと。
{
  "critique": "良い点・改善点を具体的に指摘する添削解説(見出しや表を使って詳しく)",
  "final_draft": "元のエピソード・主張の方向性を活かしつつ、抽象的な表現を具体化し、数字や固有名詞を補って書き直した、そのまま提出できる完成版の本文(元の設問構成を保つ。添削コメントは含めない)"
}

# 元の文章
${body?.reviewText}`;
            break;
          case "essay_review":
            instruction = `以下の小論文について、添削解説と、実際に提出できる完成版の両方を作成してください。

必ず次のJSON形式のみで出力してください。前置きや説明、マークダウンのコードブロックは一切付けないこと。
{
  "critique": "論理構成・説得力・表現の観点での添削解説(見出しや表を使って詳しく)",
  "final_draft": "論理構成・説得力・表現を改善し、具体的な根拠や事例を補いながら、元の主張の方向性を尊重して書き直した、そのまま提出できる完成版の本文(元の字数指定があれば近い分量で。添削コメントは含めない)"
}

# 元の文章
${body?.reviewText}`;
            break;
        }

        const systemPrompt = `あなたは${dbMode === "student" ? "受験生" : "就活・転職者"}向けの書類作成AIです。
ユーザーのプロフィール情報を最大限活用し、その人らしさが伝わる質の高い文章を作成してください。

# プロフィール
${profileSummary}

# 登録時の回答
${onboarding?.answers ? JSON.stringify(onboarding.answers) : "(なし)"}

${targetLine}${notesLine}
出力は本文のみ。前置きや説明は不要です。`;

        const isReviewType = [
          "es_review",
          "essay_review",
          "resume_review",
          "work_history_review",
        ].includes(docType);

        const anthropic = new Anthropic({ apiKey: anthropicKey });
        let generatedContent = "";
        let finalDraft: string | null = null;
        try {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 3000,
            system: systemPrompt,
            messages: [{ role: "user", content: instruction }],
          });
          const rawText = response.content[0]?.type === "text" ? response.content[0].text : "";

          if (isReviewType) {
            try {
              const cleaned = rawText.replace(/```json|```/g, "").trim();
              const parsed = JSON.parse(cleaned);
              generatedContent = typeof parsed.critique === "string" ? parsed.critique : rawText;
              finalDraft = typeof parsed.final_draft === "string" ? parsed.final_draft : null;
            } catch (parseErr) {
              console.error(
                "[generate-document] JSON parse failed, falling back to raw text",
                parseErr,
              );
              generatedContent = rawText;
            }
          } else {
            generatedContent = rawText;
          }
        } catch (e) {
          console.error("[generate-document] anthropic call failed", e);
          return json({ error: "ai_call_failed" }, 502);
        }

        const title = `${DOC_TITLES[docType]}${body?.targetName ? `（${body.targetName}）` : ""}`;
        const { data: saved, error: saveError } = await supabase
          .from("generated_documents")
          .insert({
            user_id: userId,
            mode: dbMode,
            doc_type: docType,
            title,
            input_data: {
              targetName: body?.targetName,
              extraNotes: body?.extraNotes,
              reviewText: body?.reviewText,
            },
            generated_content: generatedContent,
            final_draft: finalDraft,
          })
          .select("id")
          .single();
        if (saveError) return json({ error: "save_failed" }, 500);

        return json({ id: saved?.id, title, content: generatedContent, finalDraft });
      },
    },
  },
});
