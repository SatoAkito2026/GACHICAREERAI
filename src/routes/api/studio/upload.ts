/**
 * TikTok 動画づくり：できた動画を受け取る（GitHub Actions だけが呼ぶ。合言葉 STUDIO_SECRET）
 *
 * POST /api/studio/upload?id=<動画のID>&duration=<秒>   本文：mp4
 * POST /api/studio/upload?id=<動画のID>&failed=1        本文：エラーの文（作るのに失敗したとき）
 */
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, serviceClient } from "@/lib/talent";
import { STUDIO_BUCKET, isStudioRequest } from "@/lib/studio";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/api/studio/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isStudioRequest(request)) return jsonResponse({ error: "forbidden" }, 403);
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const url = new URL(request.url);
        const id = url.searchParams.get("id") ?? "";
        const { data: video } = await supabase
          .from("tiktok_videos")
          .select("id, title")
          .eq("id", id)
          .maybeSingle();
        if (!video) return jsonResponse({ error: "not found" }, 404);

        if (url.searchParams.get("failed")) {
          await supabase
            .from("tiktok_videos")
            .update({ status: "failed", error: (await request.text()).slice(0, 2000) })
            .eq("id", id);
          return jsonResponse({ ok: true });
        }

        const body = await request.arrayBuffer();
        if (body.byteLength < 1000) return jsonResponse({ error: "empty" }, 400);
        const path = `${id}.mp4`;
        const { error } = await supabase.storage
          .from(STUDIO_BUCKET)
          .upload(path, body, { contentType: "video/mp4", upsert: true });
        if (error) {
          console.error("[studio/upload]", error);
          return jsonResponse({ error: "upload failed" }, 500);
        }
        await supabase
          .from("tiktok_videos")
          .update({
            status: "ready",
            storage_path: path,
            size_bytes: body.byteLength,
            duration_sec: Number(url.searchParams.get("duration")) || null,
          })
          .eq("id", id);

        // 管理者に「今日の動画ができた」と知らせる
        const { data: admins } = await supabase.from("profiles").select("id").eq("is_admin", true);
        for (const a of admins ?? []) {
          await notify(supabase, a.id, {
            kind: "studio",
            title: "今日のTikTok動画ができました",
            body: video.title,
            link: "/private/admin#sns",
          });
        }
        return jsonResponse({ ok: true });
      },
    },
  },
});
