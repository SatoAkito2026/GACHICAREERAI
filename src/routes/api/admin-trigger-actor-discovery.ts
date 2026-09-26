/**
 * 役者データベース自動発見バッチ、手動実行(管理者専用・デバッグ用)
 *
 * POST /api/admin-trigger-actor-discovery
 * profiles.is_admin = true のユーザーのみ実行可能。
 * 通常は毎朝4時に自動実行されるが、動作確認のため即座に1回実行し、
 * 結果(またはエラー内容)をそのままレスポンスで返す。
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey, verifyApiUser } from "@/lib/api-auth";
import { runActorDiscoveryJob } from "@/lib/actor-discovery";

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

export const Route = createFileRoute("/api/admin-trigger-actor-discovery")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Supabase config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);

        const { data: requester } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", auth.userId)
          .maybeSingle();
        if (!requester?.is_admin) return json({ error: "forbidden" }, 403);

        try {
          const result = await runActorDiscoveryJob();
          return json({ ok: true, ...result });
        } catch (e) {
          console.error("[admin-trigger-actor-discovery] failed", e);
          return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
        }
      },
    },
  },
});
