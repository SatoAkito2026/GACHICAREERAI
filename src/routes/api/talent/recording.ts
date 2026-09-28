/**
 * 練習面接（個人モード）の録画。本人がプロフィールで「録画を残す」を選んだときだけ使う。
 *
 * GET  /api/talent/recording?token=               → この面接を録画するか { record }
 * POST /api/talent/recording { token, interviewId } → Supabase Storage へ直接アップロードするための署名付きURL
 *
 * 動画は Worker を通さずブラウザから Storage へ直接送る（Worker のリクエストサイズ上限を避けるため）。
 * 容量を守るため、1人あたり新しいものから RECORDINGS_PER_USER 本だけ残す。
 */
import { createFileRoute } from "@tanstack/react-router";
import { RECORDING_BUCKET, RECORDINGS_PER_USER, jsonResponse, serviceClient } from "@/lib/talent";

async function loadInvitation(supabase: any, token: string) {
  if (!token) return null;
  const { data } = await supabase
    .from("interview_invitations")
    .select("user_id, practice_mode")
    .eq("token", token)
    .maybeSingle();
  if (!data?.user_id || data.practice_mode !== "individual") return null;
  const { data: p } = await supabase
    .from("candidate_profiles")
    .select("record_practice")
    .eq("user_id", data.user_id)
    .maybeSingle();
  return { userId: data.user_id as string, record: !!p?.record_practice };
}

export const Route = createFileRoute("/api/talent/recording")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ record: false });
        const inv = await loadInvitation(
          supabase,
          new URL(request.url).searchParams.get("token") ?? "",
        );
        return jsonResponse({ record: !!inv?.record });
      },

      POST: async ({ request }) => {
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        let body: { token?: unknown; interviewId?: unknown };
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }
        const inv = await loadInvitation(supabase, String(body.token ?? ""));
        if (!inv) return jsonResponse({ error: "Invalid token" }, 403);
        if (!inv.record) return jsonResponse({ skipped: true });

        const { data: interview } = await supabase
          .from("interviews")
          .select("id, user_id, mode, created_at")
          .eq("id", String(body.interviewId ?? ""))
          .maybeSingle();
        if (
          !interview ||
          interview.user_id !== inv.userId ||
          interview.mode !== "individual" ||
          Date.now() - new Date(interview.created_at).getTime() > 3 * 60 * 60 * 1000
        ) {
          return jsonResponse({ error: "Interview not found" }, 404);
        }

        // 古い録画を消す（今回の分を含めて RECORDINGS_PER_USER 本まで）
        const { data: olds } = await supabase
          .from("interviews")
          .select("id, recording_path")
          .eq("user_id", inv.userId)
          .eq("mode", "individual")
          .not("recording_path", "is", null)
          .neq("id", interview.id)
          .order("created_at", { ascending: false });
        const remove = (olds ?? []).slice(RECORDINGS_PER_USER - 1);
        if (remove.length) {
          await supabase.storage
            .from(RECORDING_BUCKET)
            .remove(remove.map((o) => o.recording_path as string));
          await supabase
            .from("interviews")
            .update({ recording_path: null })
            .in(
              "id",
              remove.map((o) => o.id),
            );
        }

        const path = `practice/${inv.userId}/${interview.id}.webm`;
        const { data: signed, error } = await supabase.storage
          .from(RECORDING_BUCKET)
          .createSignedUploadUrl(path, { upsert: true });
        if (error || !signed) {
          console.error("[talent/recording] signed url failed", error);
          return jsonResponse({ error: "Upload URL failed" }, 500);
        }
        await supabase.from("interviews").update({ recording_path: path }).eq("id", interview.id);
        return jsonResponse({ path, uploadToken: signed.token });
      },
    },
  },
});
