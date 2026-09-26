/**
 * 代理店ダッシュボードAPI
 *
 * GET /api/agency-dashboard-data
 * profiles.is_agency = true のユーザーのみアクセス可能。
 * 自分が紹介した企業の一覧と、今月発生する報酬の見込みを返す。
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey, verifyApiUser } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/agency-dashboard-data")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Server config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);
        const userId = auth.userId;

        const { data: agency } = await supabase
          .from("agencies")
          .select("id, name, referral_code, commission_light, commission_pro")
          .eq("id", userId)
          .maybeSingle();
        if (!agency) return json({ error: "forbidden" }, 403);

        const { data: referredProfiles } = await supabase
          .from("profiles")
          .select("id, plan, plan_expires_at, company_name, created_at")
          .eq("referred_by_agency_id", agency.id);

        const now = Date.now();
        const rows = (referredProfiles ?? []).map((p: any) => {
          const isExpired = p.plan_expires_at ? new Date(p.plan_expires_at).getTime() < now : false;
          const activePlan = isExpired ? "free" : p.plan;
          const commission =
            activePlan === "company_light"
              ? agency.commission_light
              : activePlan === "company_pro"
                ? agency.commission_pro
                : 0;
          return {
            companyName: p.company_name || "(未設定)",
            plan: activePlan,
            active: !isExpired && (activePlan === "company_light" || activePlan === "company_pro"),
            commission,
            joinedAt: p.created_at,
          };
        });

        const totalMonthlyCommission = rows.reduce((sum, r) => sum + r.commission, 0);
        const activeCount = rows.filter((r) => r.active).length;

        return json({
          agencyName: agency.name,
          referralCode: agency.referral_code,
          referralUrl: `https://interview-copilot-ai.akitogroup.jp/login?ref=${agency.referral_code}`,
          commissionLight: agency.commission_light,
          commissionPro: agency.commission_pro,
          referredCompanies: rows,
          activeCount,
          totalMonthlyCommission,
        });
      },
    },
  },
});
