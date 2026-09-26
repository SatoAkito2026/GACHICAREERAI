import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser, getVerifiedPlan, checkInterviewQuota } from "@/lib/api-auth";
import Anthropic from "@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      OPTIONS: async () => {
        return new Response(null, { status: 204, headers: corsHeaders });
      },
      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        // サーバー側で月間クォータを検証（直接 API 呼び出しによる超過を防ぐ）
        const quota = await checkInterviewQuota(auth.token, auth.userId);
        if ("error" in quota) return quota.error;
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) {
          return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        let body: { system?: unknown; user?: unknown };
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        const system = typeof body.system === "string" ? body.system : "";
        const user = typeof body.user === "string" ? body.user : "";
        if (!system || !user) {
          return new Response(JSON.stringify({ error: "Both system and user are required" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        // 巨大なペイロードによるトークンコスト乱用を防ぐためのサーバー側の上限
        const MAX_INPUT_LENGTH = 32_768;
        if (system.length > MAX_INPUT_LENGTH || user.length > MAX_INPUT_LENGTH) {
          return new Response(
            JSON.stringify({
              error: `system and user must each be at most ${MAX_INPUT_LENGTH} characters`,
            }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
        // プランはクライアント入力を信用せず、検証済みトークンで DB から取得する
        const plan = await getVerifiedPlan(auth.token, auth.userId);
        // プランに応じてモデルを切り替え（有料プランは pro に正規化済み）
        const model = plan === "pro" ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
        const anthropic = new Anthropic({ apiKey: anthropicKey });
        let text = "";
        try {
          const aiResponse = await anthropic.messages.create({
            model,
            max_tokens: 4000,
            system,
            messages: [{ role: "user", content: user }],
          });
          text = aiResponse.content[0]?.type === "text" ? aiResponse.content[0].text : "";
        } catch (e) {
          console.error("[chat] Anthropic request failed:", e);
          return new Response(JSON.stringify({ error: "AI request failed" }), {
            status: 502,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        // 既存クライアントは choices[0].message.content を参照するため、その形式で返す
        return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      },
    },
  },
});
