/**
 * 端末（public/sw.js）がプッシュを受けたときに、表示するお知らせを取りに来る
 *
 * GET /api/notifications/peek?endpoint=<この端末のプッシュの宛先>
 *
 * 宛先のURLは端末とプッシュの配信元しか知らない長い文字列なので、それで本人を確かめる。
 * 返すのは、その人のいちばん新しい未読のお知らせ（10分以内）の見出しと本文と移動先だけ。
 */
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, serviceClient } from "@/lib/talent";

export const Route = createFileRoute("/api/notifications/peek")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const endpoint = new URL(request.url).searchParams.get("endpoint") ?? "";
        const fallback = { title: "ガチキャリAI", body: "新しいお知らせがあります", link: "/" };
        const supabase = await serviceClient();
        if (!supabase || !endpoint) return jsonResponse(fallback);
        const { data: sub } = await supabase
          .from("push_subscriptions")
          .select("user_id")
          .eq("endpoint", endpoint)
          .maybeSingle();
        if (!sub) return jsonResponse(fallback);
        const { data: n } = await supabase
          .from("notifications")
          .select("title, body, link")
          .eq("user_id", sub.user_id)
          .is("read_at", null)
          .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return jsonResponse(n ? { title: n.title, body: n.body, link: n.link || "/" } : fallback);
      },
    },
  },
});
