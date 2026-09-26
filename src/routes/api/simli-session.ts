/**
 * Simli アバターのセッショントークンと ICE サーバーを発行する。
 * SIMLI_API_KEY をブラウザに出さないため、トークン生成はサーバー側で行う。
 *
 *   body: { token }  … 面接招待トークン（interview_invitations.token）
 *   → { session_token, iceServers }
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey } from "@/lib/api-auth";

const SIMLI_API_URL = "https://api.simli.ai";
const SIMLI_FACE_ID = "cace3ef7-a4c4-425d-a8cf-a5358eb0c427";
const FALLBACK_ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302"] }];

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

export const Route = createFileRoute("/api/simli-session")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as { token?: unknown };
          if (!body.token || typeof body.token !== "string") {
            return json({ error: "Missing token" }, 401);
          }

          const simliKey = process.env.SIMLI_API_KEY;
          const serviceKey = getServiceRoleKey();
          if (!simliKey || !serviceKey) {
            return json({ error: "Server config missing" }, 500);
          }

          // 有効な（未期限切れの）招待に紐づくリクエストだけ許可し、Simli の無料プロキシ化を防ぐ
          const supabase = createClient(getSupabaseUrl(), serviceKey);
          const { data: inv } = await supabase
            .from("interview_invitations")
            .select("expires_at")
            .eq("token", body.token)
            .maybeSingle();
          if (
            !inv ||
            (inv.expires_at && new Date(inv.expires_at as string).getTime() < Date.now())
          ) {
            return json({ error: "Invalid or expired token" }, 403);
          }

          const headers = { "Content-Type": "application/json", "x-simli-api-key": simliKey };

          const tokenRes = await fetch(`${SIMLI_API_URL}/compose/token`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              faceId: SIMLI_FACE_ID,
              handleSilence: true,
              maxSessionLength: 3600,
              maxIdleTime: 600,
            }),
          });
          if (!tokenRes.ok) {
            console.error("Simli token error:", tokenRes.status, await tokenRes.text());
            return json({ error: "Failed to create Simli session" }, 502);
          }
          const { session_token } = (await tokenRes.json()) as { session_token: string };

          let iceServers: unknown = FALLBACK_ICE_SERVERS;
          try {
            const iceRes = await fetch(`${SIMLI_API_URL}/compose/ice`, { headers });
            const ice = iceRes.ok ? await iceRes.json() : null;
            if (Array.isArray(ice) && ice.length > 0) iceServers = ice;
          } catch {
            // STUN のフォールバックで続行
          }

          return json({ session_token, iceServers });
        } catch (e) {
          console.error("simli-session error:", e);
          return json({ error: "Internal error" }, 500);
        }
      },
    },
  },
});
