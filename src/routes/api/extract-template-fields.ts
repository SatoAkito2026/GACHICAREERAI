/**
 * 自分専用テンプレートから、項目構成をAIが読み取る
 *
 * POST /api/extract-template-fields
 *   body: { docType: 'resume'|'work_history_resume'|'entry_sheet', templateText: string }
 */
import { createFileRoute } from "@tanstack/react-router";
import Anthropic from "@anthropic-ai/sdk";
import { verifyApiUser } from "@/lib/api-auth";
import { extractJson, lastTextBlock } from "@/lib/ai-json";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/extract-template-fields")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) return json({ error: "Server config missing" }, 500);

        const body = (await request.json().catch(() => null)) as {
          docType?: string;
          templateText?: string;
        } | null;
        const docType = body?.docType;
        const templateText = body?.templateText?.trim();
        if (!docType || !templateText)
          return json({ error: "docType and templateText are required" }, 400);

        const systemPrompt = `以下は、ユーザーが自分専用にアップロードした書類テンプレート（${docType}）から
抽出したテキストです。このテンプレートにどんな入力項目・見出しがあるかを読み取ってください。
氏名・住所・電話番号・メールアドレス・写真など、本人しか埋められない項目は除外し、
AIが会話から内容を埋められそうな項目（自己PR・志望動機・職務経歴・強み・resumeの経歴欄等）だけを抽出すること。

必ず次のJSON形式のみで出力してください。前置きや説明は不要。
{
  "fields": [
    { "key": "motivation", "label": "志望動機", "type": "long_text" },
    { "key": "strengths", "label": "強み・特技", "type": "long_text" }
  ]
}
typeは "long_text"(数百字の文章) または "short_text"(短い一行) のいずれか。
項目は多くても8個程度にまとめること。`;

        try {
          const anthropic = new Anthropic({ apiKey: anthropicKey });
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 1500,
            system: systemPrompt,
            messages: [{ role: "user", content: templateText.slice(0, 8000) }],
          });
          const parsed = extractJson(lastTextBlock(response.content as any)) as any;
          const fields = Array.isArray(parsed.fields) ? parsed.fields.slice(0, 8) : [];
          return json({ ok: true, fields });
        } catch (e) {
          console.error("[extract-template-fields] failed", e);
          return json({ error: "抽出に失敗しました。もう一度お試しください" }, 500);
        }
      },
    },
  },
});
