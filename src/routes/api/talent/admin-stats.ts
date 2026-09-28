/**
 * 運営向け：人材プロフィール・チケットの集計（profiles.is_admin = true のユーザーだけ）
 *
 * GET /api/talent/admin-stats
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { getCompanyProfile, jsonResponse, serviceClient } from "@/lib/talent";

export const Route = createFileRoute("/api/talent/admin-stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const { data: me } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", auth.userId)
          .maybeSingle();
        if (!(me as { is_admin?: boolean } | null)?.is_admin) {
          return jsonResponse({ error: "forbidden" }, 403);
        }

        const count = async (table: string, filter?: (q: any) => any) => {
          let q = supabase.from(table).select("*", { count: "exact", head: true });
          if (filter) q = filter(q);
          const { count: n } = await q;
          return n ?? 0;
        };

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const { data: unlocks } = await supabase
          .from("profile_unlocks")
          .select("company_user_id, amount, created_at")
          .order("created_at", { ascending: false })
          .limit(5000);
        const all = unlocks ?? [];
        const thisMonth = all.filter((u) => new Date(u.created_at) >= monthStart);
        const byCompany = new Map<string, { count: number; amount: number }>();
        for (const u of all) {
          const v = byCompany.get(u.company_user_id) ?? { count: 0, amount: 0 };
          v.count++;
          v.amount += u.amount;
          byCompany.set(u.company_user_id, v);
        }
        const topCompanies = [];
        for (const [id, v] of [...byCompany.entries()]
          .sort((a, b) => b[1].amount - a[1].amount)
          .slice(0, 10)) {
          topCompanies.push({
            name: (await getCompanyProfile(supabase, id))?.company_name ?? "（不明）",
            ...v,
          });
        }

        return jsonResponse({
          profiles: {
            total: await count("candidate_profiles"),
            public: await count("candidate_profiles", (q) => q.eq("is_public", true)),
            withRecording: await count("candidate_profiles", (q) =>
              q.eq("is_public", true).eq("show_recording", true),
            ),
          },
          tickets: {
            total: all.length,
            revenue: all.reduce((a, u) => a + u.amount, 0),
            monthCount: thisMonth.length,
            monthRevenue: thisMonth.reduce((a, u) => a + u.amount, 0),
            buyingCompanies: byCompany.size,
          },
          contacts: {
            total: await count("contact_requests", (q) => q.neq("status", "withdrawn")),
            accepted: await count("contact_requests", (q) => q.eq("status", "accepted")),
            declined: await count("contact_requests", (q) => q.eq("status", "declined")),
            pending: await count("contact_requests", (q) => q.eq("status", "pending")),
          },
          messages: await count("contact_messages"),
          topCompanies,
        });
      },
    },
  },
});
