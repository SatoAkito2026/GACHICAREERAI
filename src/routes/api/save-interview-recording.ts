/**
 * 面接録画の保存API
 *
 * POST /api/save-interview-recording (multipart/form-data)
 *   video: Blob (録画データ)
 *   token: string (面接招待トークン)
 *
 * whisper-transcribeと同じ方式で、有効な招待トークンが無ければ拒否する。
 * 企業の本番面接(practice_mode = null)の録画のみを対象とする
 * (個人/受験生の練習面接は録画しない)。
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// 300MB — 長時間面接の録画を許容しつつ、異常なファイルは弾く
const MAX_RECORDING_BYTES = 300 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/save-interview-recording")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        const formData = await request.formData();
        const videoFile = formData.get("video") as File | null;
        const token = formData.get("token");

        if (!token || typeof token !== "string") {
          return json({ error: "Missing token" }, 401);
        }
        if (!videoFile) {
          return json({ error: "No video file" }, 400);
        }
        if (videoFile.size > MAX_RECORDING_BYTES) {
          return json({ error: "Recording too large" }, 413);
        }

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Server config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);

        const { data: invitation } = await supabase
          .from("interview_invitations")
          .select("user_id, practice_mode, expires_at")
          .eq("token", token)
          .maybeSingle();

        if (!invitation) return json({ error: "Invalid token" }, 403);
        // 企業の本番面接のみ録画を保存する(個人/受験生の練習は対象外)
        if (invitation.practice_mode) return json({ ok: true, skipped: "practice_mode" });

        // このトークンに紐づく直近のinterviewsレコードを探す
        const { data: interview } = await supabase
          .from("interviews")
          .select("id")
          .eq("user_id", invitation.user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!interview) return json({ error: "Interview record not found" }, 404);

        const path = `${interview.id}/recording.webm`;
        const arrayBuffer = await videoFile.arrayBuffer();
        const { error: uploadError } = await supabase.storage
          .from("interview-recordings")
          .upload(path, arrayBuffer, { contentType: videoFile.type || "video/webm", upsert: true });

        if (uploadError) {
          console.error("[save-interview-recording] upload failed", uploadError);
          return json({ error: "Upload failed" }, 500);
        }

        await supabase.from("interviews").update({ recording_path: path }).eq("id", interview.id);

        return json({ ok: true });
      },
    },
  },
});
