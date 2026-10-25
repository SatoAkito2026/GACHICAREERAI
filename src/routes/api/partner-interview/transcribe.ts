/**
 * 提携先（POSPOS）の AI 一次面接：応募者の答えの音声を文字にする（Whisper）。
 * 面接 URL の合言葉が、受けている途中の面接のものであるときだけ使える（ほかの用途に使われないように）。
 */
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, serviceClient } from "@/lib/talent";
import { effectiveStatus, type PartnerInterviewRow } from "@/lib/partner-interview";
import { removeHallucinations } from "@/lib/whisper";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export const Route = createFileRoute("/api/partner-interview/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) return jsonResponse({ error: "server config missing" }, 500);
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return jsonResponse({ error: "invalid form" }, 400);
        }
        const audio = form.get("audio");
        const token = form.get("token");
        if (!(audio instanceof File) || typeof token !== "string" || token.length > 100)
          return jsonResponse({ error: "invalid input" }, 400);
        if (audio.size > MAX_AUDIO_BYTES) return jsonResponse({ error: "too large" }, 413);
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "server config missing" }, 500);
        const { data } = await supabase
          .from("partner_interviews")
          .select("status, expires_at, started_at")
          .eq("token", token)
          .is("deleted_at", null)
          .maybeSingle();
        if (!data || effectiveStatus(data as PartnerInterviewRow) !== "in_progress")
          return jsonResponse({ error: "invalid token" }, 403);

        const whisperForm = new FormData();
        whisperForm.append("file", audio, audio.name || "audio.webm");
        whisperForm.append("model", "whisper-1");
        whisperForm.append("language", "ja");
        whisperForm.append("prompt", "えーと、アルバイトの面接での、受け答えです。");
        const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}` },
          body: whisperForm,
        });
        if (!res.ok) {
          console.error("[partner-interview] whisper failed", await res.text());
          return jsonResponse({ error: "transcribe failed" }, 500);
        }
        const { text } = (await res.json()) as { text?: string };
        return jsonResponse({ text: removeHallucinations(text ?? "") });
      },
    },
  },
});
