/**
 * TikTok のプロフィールに貼るリンク。押された回数を数えてトップページへ転送する
 * GET /tiktok → link_clicks に1件記録 → /
 */
import { createFileRoute } from "@tanstack/react-router";
import { serviceClient } from "@/lib/talent";

const BOT = /bot|crawler|spider|preview|facebookexternalhit|bytespider/i;

export const Route = createFileRoute("/tiktok")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // リンクの下見（プレビュー用の取得）は数えない
        if (!BOT.test(request.headers.get("user-agent") ?? "")) {
          try {
            const supabase = await serviceClient();
            await supabase?.from("link_clicks").insert({ source: "tiktok" });
          } catch (e) {
            console.error("[tiktok link] failed", e);
          }
        }
        return new Response(null, {
          status: 302,
          headers: { Location: "/?from=tiktok", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
