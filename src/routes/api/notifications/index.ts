/**
 * お知らせ（ベル）とプッシュ通知の登録
 *
 * GET  /api/notifications                         → 新しい順に30件と未読の数
 * POST /api/notifications { action: "read_all" }  → すべて既読にする
 * POST /api/notifications { action: "subscribe", subscription }   → この端末にプッシュ通知を送るよう登録
 * POST /api/notifications { action: "unsubscribe", endpoint }     → この端末への通知をやめる
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, serviceClient } from "@/lib/talent";

export const Route = createFileRoute("/api/notifications/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const [{ data: items }, { count: unread }] = await Promise.all([
          supabase
            .from("notifications")
            .select("id, kind, title, body, link, read_at, created_at")
            .eq("user_id", auth.userId)
            .order("created_at", { ascending: false })
            .limit(30),
          supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", auth.userId)
            .is("read_at", null),
        ]);
        return jsonResponse({ items: items ?? [], unread: unread ?? 0 });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const body = (await request.json().catch(() => ({}))) as {
          action?: unknown;
          endpoint?: unknown;
          subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
        };

        if (body.action === "read_all") {
          await supabase
            .from("notifications")
            .update({ read_at: new Date().toISOString() })
            .eq("user_id", auth.userId)
            .is("read_at", null);
          return jsonResponse({ ok: true });
        }

        if (body.action === "subscribe") {
          const endpoint = String(body.subscription?.endpoint ?? "");
          if (!endpoint.startsWith("https://")) {
            return jsonResponse({ error: "不正な登録です" }, 400);
          }
          const { error } = await supabase.from("push_subscriptions").upsert(
            {
              user_id: auth.userId,
              endpoint,
              p256dh: String(body.subscription?.keys?.p256dh ?? "") || null,
              auth: String(body.subscription?.keys?.auth ?? "") || null,
              user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300),
            },
            { onConflict: "endpoint" },
          );
          if (error) {
            console.error("[notifications] subscribe", error);
            return jsonResponse({ error: "登録に失敗しました" }, 500);
          }
          return jsonResponse({ ok: true });
        }

        if (body.action === "unsubscribe") {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("user_id", auth.userId)
            .eq("endpoint", String(body.endpoint ?? ""));
          return jsonResponse({ ok: true });
        }

        return jsonResponse({ error: "不正なリクエストです" }, 400);
      },
    },
  },
});
