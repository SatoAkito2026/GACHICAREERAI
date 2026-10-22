/**
 * TikTok 動画づくり：台本と音声を作る（GitHub Actions だけが呼ぶ。合言葉 STUDIO_SECRET）
 *
 * POST /api/studio/job → { id, title, lines, result, audio[], sampleRate, interviewerRate, ... }
 */
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, serviceClient } from "@/lib/talent";
import {
  INTERVIEWER_RATE,
  STUDIO_SAMPLE_RATE,
  isStudioRequest,
  speakLines,
  writeScript,
} from "@/lib/studio";

export const Route = createFileRoute("/api/studio/job")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isStudioRequest(request)) return jsonResponse({ error: "forbidden" }, 403);
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);

        // これまでの動画（テーマ・タイトル・再生数）から、伸びたものを真似し、続けて同じテーマにしない
        const { data: history } = await supabase
          .from("tiktok_videos")
          .select("theme, title, views, likes")
          .neq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(40);
        try {
          const script = await writeScript(history ?? []);
          // 最後の音声は、オファーを見た受験者のひとこと
          const audio = await speakLines([
            ...script.lines,
            { speaker: "candidate", text: script.offer.reaction },
          ]);
          const { data: row, error } = await supabase
            .from("tiktok_videos")
            .insert({
              theme: script.theme,
              title: script.title,
              caption: script.caption,
              script: script as never,
              status: "rendering",
            })
            .select("id")
            .single();
          if (error || !row) throw error ?? new Error("insert failed");
          return jsonResponse({
            id: row.id,
            ...script,
            audio,
            sampleRate: STUDIO_SAMPLE_RATE,
            interviewerRate: INTERVIEWER_RATE,
          });
        } catch (e) {
          console.error("[studio/job]", e);
          return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500);
        }
      },
    },
  },
});
