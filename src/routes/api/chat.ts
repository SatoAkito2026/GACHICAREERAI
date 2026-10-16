import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { verifyApiUser, getServiceRoleKey, getSupabaseUrl } from "@/lib/api-auth";
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
        // 書類選考AI（このAPIの唯一の利用元）は、求人を掲載中の企業だけが使える
        const serviceKey = getServiceRoleKey();
        if (!serviceKey) {
          return new Response(JSON.stringify({ error: "Server config missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        const { count: openJobs } = await createClient(getSupabaseUrl(), serviceKey)
          .from("job_postings")
          .select("id", { count: "exact", head: true })
          .eq("company_user_id", auth.userId)
          .eq("status", "open");
        if (!openJobs) {
          return new Response(
            JSON.stringify({
              error:
                "書類選考AIは、求人を掲載中の企業だけが使えます。先に「求人掲載」から求人を公開してください。",
              needsJobPosting: true,
            }),
            { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
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
        const model = "claude-haiku-4-5-20251001";
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
