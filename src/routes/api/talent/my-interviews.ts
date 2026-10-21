/**
 * 本人：企業に見える面接の結果（企業の「面接ごとの評価」と同じ内容）
 *
 * GET  /api/talent/my-interviews                    → 面接ごとの結果（新しい順・最大30件）
 * POST /api/talent/my-interviews { action: "delete", id } → 面接を削除（録画も消し、人物まとめを作り直す）
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, loadCompanyInterviews, RECORDING_BUCKET, serviceClient } from "@/lib/talent";

export const Route = createFileRoute("/api/talent/my-interviews")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        return jsonResponse({
          interviews: await loadCompanyInterviews(supabase, auth.userId, true, 30),
        });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const body = (await request.json().catch(() => ({}))) as { action?: unknown; id?: unknown };
        if (body.action !== "delete" || typeof body.id !== "string") {
          return jsonResponse({ error: "不正なリクエストです" }, 400);
        }
        const { data: iv } = await supabase
          .from("interviews")
          .select("id, user_id, recording_path")
          .eq("id", body.id)
          .maybeSingle();
        if (!iv || iv.user_id !== auth.userId) {
          return jsonResponse({ error: "面接が見つかりません" }, 404);
        }
        if (iv.recording_path) {
          await supabase.storage.from(RECORDING_BUCKET).remove([iv.recording_path]);
        }
        // 評価・会話（interview_summaries / interview_turns）は一緒に消える
        const { error } = await supabase.from("interviews").delete().eq("id", iv.id);
        if (error) {
          console.error("[talent/my-interviews] delete failed", error);
          return jsonResponse({ error: "削除に失敗しました" }, 500);
        }
        // 人物まとめ・面接の回数を作り直す（毎時の自動更新で反映）
        await supabase
          .from("candidate_profiles")
          .update({ summary_stale: true })
          .eq("user_id", auth.userId);
        return jsonResponse({ ok: true });
      },
    },
  },
});
