/**
 * チャットで書類を添削するAPI
 *
 * POST /api/refine-document
 *   body: { docType: string, currentContent: object, instruction: string, chatHistory?: {role,content}[] }
 *
 * 現在の書類データ(JSON)とユーザーの指示をもとに、AIが必要な部分だけ書き換えた
 * 同じ構造のJSONを返す。会話形式で繰り返し呼び出すことで、リアルタイムに添削できる。
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

export const Route = createFileRoute("/api/refine-document")({
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
          currentContent?: unknown;
          instruction?: string;
          chatHistory?: { role: "user" | "assistant"; content: string }[];
        } | null;

        if (!body?.currentContent || !body?.instruction) {
          return json({ error: "currentContent and instruction are required" }, 400);
        }
        if (body.instruction.length > 2000) return json({ error: "instruction too long" }, 400);

        const historyText = (body.chatHistory ?? [])
          .slice(-6)
          .map((m) => `${m.role === "user" ? "ユーザー" : "AI"}: ${m.content}`)
          .join("\n");

        const systemPrompt = `あなたは就職・転職書類の添削アシスタントです。
以下は現在の書類データ(JSON)です。ユーザーからの指示に従って、指示された箇所だけを書き換えてください。
指示されていない項目は絶対に変更しないこと。JSONの構造(キー)は絶対に変えないこと。

【現在の書類データ】
${JSON.stringify(body.currentContent, null, 2)}

${historyText ? `【これまでの会話】\n${historyText}\n` : ""}

必ず次のJSON形式のみで出力してください。前置きや説明・マークダウンは不要。
{
  "updatedContent": (書き換え後の書類データ。元と同じキー構造のJSONオブジェクト),
  "replyMessage": "ユーザーへの短い返答(1〜2文。何を直したか、または追加で確認したいことがあれば)"
}`;

        try {
          const anthropic = new Anthropic({ apiKey: anthropicKey });
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 3000,
            system: systemPrompt,
            messages: [{ role: "user", content: body.instruction }],
          });
          const parsed = extractJson(lastTextBlock(response.content as any)) as any;
          if (!parsed.updatedContent) return json({ error: "添削に失敗しました" }, 500);

          return json({
            ok: true,
            updatedContent: parsed.updatedContent,
            replyMessage: parsed.replyMessage ?? "反映しました。",
          });
        } catch (e) {
          console.error("[refine-document] failed", e);
          return json({ error: "添削に失敗しました。もう一度お試しください" }, 500);
        }
      },
    },
  },
});
