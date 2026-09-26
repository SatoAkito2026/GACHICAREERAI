/**
 * 紹介コードの記録API
 *
 * POST /api/record-referral
 *   body: { referralCode: string }
 *
 * 新規登録直後に呼ばれる。referralCodeに一致する代理店があれば、
 * profiles.referred_by_agency_id をservice role経由で設定する
 * (このカラムはトリガーで保護されており、クライアントから直接は書き換えられない)。
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey, verifyApiUser } from "@/lib/api-auth";

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

export const Route = createFileRoute("/api/record-referral")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Server config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);

        const body = (await request.json().catch(() => null)) as { referralCode?: string } | null;
        const referralCode = body?.referralCode?.trim();
        if (!referralCode) return json({ error: "referralCode is required" }, 400);

        const { data: agency } = await supabase
          .from("agencies")
          .select("id")
          .eq("referral_code", referralCode)
          .maybeSingle();
        if (!agency?.id) return json({ error: "invalid_referral_code" }, 404);

        // 既に別の代理店が紐付いている場合は上書きしない(最初の紐付けを優先)
        const { data: existing } = await supabase
          .from("profiles")
          .select("referred_by_agency_id")
          .eq("id", auth.userId)
          .maybeSingle();
        if (existing?.referred_by_agency_id) {
          return json({ ok: true, note: "already_attributed" });
        }

        const { error } = await supabase
          .from("profiles")
          .update({ referred_by_agency_id: agency.id })
          .eq("id", auth.userId);
        if (error) return json({ error: "update_failed" }, 500);

        return json({ ok: true });
      },
    },
  },
});
