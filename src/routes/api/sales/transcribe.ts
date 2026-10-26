/**
 * 営業ロープレ：営業の一言の音声を文字にする（Whisper）
 * 自分の、進行中のロープレがあるときだけ使える（ほかの用途に使われないように）
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, serviceClient } from "@/lib/talent";
import { removeHallucinations } from "@/lib/whisper";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export const Route = createFileRoute("/api/sales/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) return jsonResponse({ error: "Server config missing" }, 500);
        const form = await request.formData().catch(() => null);
        const audio = form?.get("audio");
        const id = form?.get("id");
        if (!(audio instanceof File) || typeof id !== "string")
          return jsonResponse({ error: "invalid input" }, 400);
        if (audio.size > MAX_AUDIO_BYTES) return jsonResponse({ error: "too large" }, 413);
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const { data } = await supabase
          .from("sales_roleplays")
          .select("id")
          .eq("id", id)
          .eq("user_id", auth.userId)
          .eq("status", "in_progress")
          .maybeSingle();
        if (!data) return jsonResponse({ error: "forbidden" }, 403);
        const whisperForm = new FormData();
        whisperForm.append("file", audio, audio.name || "audio.webm");
        whisperForm.append("model", "whisper-1");
        whisperForm.append("language", "ja");
        whisperForm.append("prompt", "えーと、営業の、あの、お客様との会話です。");
        const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}` },
          body: whisperForm,
        });
        if (!res.ok) {
          console.error("[sales] whisper failed", await res.text());
          return jsonResponse({ error: "transcribe failed" }, 500);
        }
        const { text } = (await res.json()) as { text?: string };
        return jsonResponse({ text: removeHallucinations(text ?? "") });
      },
    },
  },
});
