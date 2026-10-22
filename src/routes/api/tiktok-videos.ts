/**
 * 管理者：TikTok 用に作った動画の一覧（profiles.is_admin = true のユーザーだけ）
 *
 * GET  /api/tiktok-videos                         → 新しい順に20本（見る・保存する用の期限つきURLつき）
 * POST /api/tiktok-videos { action: "posted", id } → 投稿済みにする
 * POST /api/tiktok-videos { action: "delete", id } → 消す
 * POST /api/tiktok-videos { action: "metrics", id, views, likes } → 再生数・いいねを入れる（次の台本づくりで参考にする）
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, serviceClient } from "@/lib/talent";
import { STUDIO_BUCKET } from "@/lib/studio";

async function adminClient(request: Request) {
  const auth = await verifyApiUser(request);
  if ("error" in auth) return { error: auth.error };
  const supabase = await serviceClient();
  if (!supabase) return { error: jsonResponse({ error: "Server config missing" }, 500) };
  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", auth.userId)
    .maybeSingle();
  if (!(me as { is_admin?: boolean } | null)?.is_admin) {
    return { error: jsonResponse({ error: "forbidden" }, 403) };
  }
  return { supabase };
}

export const Route = createFileRoute("/api/tiktok-videos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const r = await adminClient(request);
        if ("error" in r) return r.error;
        const { data } = await r.supabase
          .from("tiktok_videos")
          .select(
            "id, theme, title, caption, status, storage_path, duration_sec, error, created_at, posted_at, script, views, likes",
          )
          .order("created_at", { ascending: false })
          .limit(20);
        const videos = [];
        for (const v of data ?? []) {
          let url: string | null = null;
          if (v.storage_path) {
            const { data: signed } = await r.supabase.storage
              .from(STUDIO_BUCKET)
              .createSignedUrl(v.storage_path, 60 * 60, { download: false });
            url = signed?.signedUrl ?? null;
          }
          const script = v.script as { themeLabel?: string } | null;
          videos.push({
            id: v.id,
            themeLabel: script?.themeLabel ?? v.theme,
            title: v.title,
            caption: v.caption,
            status: v.status,
            durationSec: v.duration_sec,
            error: v.error,
            createdAt: v.created_at,
            postedAt: v.posted_at,
            views: v.views,
            likes: v.likes,
            url,
          });
        }
        return jsonResponse({ videos });
      },

      POST: async ({ request }) => {
        const r = await adminClient(request);
        if ("error" in r) return r.error;
        const body = (await request.json().catch(() => ({}))) as {
          action?: unknown;
          id?: unknown;
          views?: unknown;
          likes?: unknown;
        };
        const id = typeof body.id === "string" ? body.id : "";
        if (body.action === "posted") {
          await r.supabase
            .from("tiktok_videos")
            .update({ status: "posted", posted_at: new Date().toISOString() })
            .eq("id", id);
          return jsonResponse({ ok: true });
        }
        if (body.action === "metrics") {
          const n = (v: unknown) =>
            v === "" || v === null || v === undefined
              ? null
              : Math.max(0, Math.round(Number(v)) || 0);
          await r.supabase
            .from("tiktok_videos")
            .update({ views: n(body.views), likes: n(body.likes) })
            .eq("id", id);
          return jsonResponse({ ok: true });
        }
        if (body.action === "delete") {
          const { data: v } = await r.supabase
            .from("tiktok_videos")
            .select("storage_path")
            .eq("id", id)
            .maybeSingle();
          if (v?.storage_path)
            await r.supabase.storage.from(STUDIO_BUCKET).remove([v.storage_path]);
          await r.supabase.from("tiktok_videos").delete().eq("id", id);
          return jsonResponse({ ok: true });
        }
        return jsonResponse({ error: "不正なリクエストです" }, 400);
      },
    },
  },
});
