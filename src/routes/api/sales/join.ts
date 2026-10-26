/**
 * 営業ロープレ：社員が会社とつながる
 *
 * GET  /api/sales/join                   → 参加している会社（なければ null）
 * POST /api/sales/join { code, name }    → 会社の招待コードで参加（1社だけ。別の会社に入ると前の会社からは抜ける）
 * POST /api/sales/join { action: "leave" } → 抜ける（会社から結果が見えなくなる）
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, serviceClient } from "@/lib/talent";
import { getSalesMembership } from "@/lib/sales-roleplay";

export const Route = createFileRoute("/api/sales/join")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        return jsonResponse({ membership: await getSalesMembership(supabase, auth.userId) });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const body = (await request.json().catch(() => null)) as {
          action?: string;
          code?: string;
          name?: string;
        } | null;

        if (body?.action === "leave") {
          await supabase.from("sales_memberships").delete().eq("user_id", auth.userId);
          return jsonResponse({ ok: true });
        }

        const code = String(body?.code ?? "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
        const name = String(body?.name ?? "")
          .trim()
          .slice(0, 50);
        if (!code) return jsonResponse({ error: "招待コードを入力してください" }, 400);
        if (!name) return jsonResponse({ error: "お名前を入力してください" }, 400);
        const { data: company } = await supabase
          .from("companies")
          .select("id, name")
          .eq("sales_join_code", code)
          .maybeSingle();
        if (!company) return jsonResponse({ error: "招待コードが見つかりません" }, 404);

        // 参加できる会社は1社だけ（前の会社からは抜ける）
        await supabase
          .from("sales_memberships")
          .delete()
          .eq("user_id", auth.userId)
          .neq("company_id", company.id);
        const { error } = await supabase
          .from("sales_memberships")
          .upsert(
            { company_id: company.id, user_id: auth.userId, display_name: name },
            { onConflict: "company_id,user_id" },
          );
        if (error) {
          console.error("[sales/join]", error);
          return jsonResponse({ error: "参加に失敗しました" }, 500);
        }
        return jsonResponse({ ok: true, companyName: company.name });
      },
    },
  },
});
