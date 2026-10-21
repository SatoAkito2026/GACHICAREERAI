/**
 * 本人：企業に見せる面接の結果を選ぶ
 *
 * GET  /api/talent/my-interviews → 面接ごとの結果（新しい順・最大30件、shown＝公開中）と公開の上限
 * POST /api/talent/my-interviews { action: "show" | "hide", id } → 企業への公開に入れる・外す
 * POST /api/talent/my-interviews { action: "delete", id }        → 面接を削除（録画も消す）
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import {
  countShownInterviews,
  jsonResponse,
  loadCompanyInterviews,
  RECORDING_BUCKET,
  serviceClient,
  shownInterviewLimit,
} from "@/lib/talent";

export const Route = createFileRoute("/api/talent/my-interviews")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const [interviews, limit] = await Promise.all([
          loadCompanyInterviews(supabase, auth.userId, true, { onlyShown: false }),
          shownInterviewLimit(supabase, auth.userId),
        ]);
        return jsonResponse({ interviews, limit });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const body = (await request.json().catch(() => ({}))) as { action?: unknown; id?: unknown };
        if (
          (body.action !== "delete" && body.action !== "show" && body.action !== "hide") ||
          typeof body.id !== "string"
        ) {
          return jsonResponse({ error: "不正なリクエストです" }, 400);
        }
        const { data: iv } = await supabase
          .from("interviews")
          .select("id, user_id, mode, impression, recording_path")
          .eq("id", body.id)
          .maybeSingle();
        if (!iv || iv.user_id !== auth.userId) {
          return jsonResponse({ error: "面接が見つかりません" }, 404);
        }

        if (body.action === "show") {
          if (iv.mode !== "individual" || iv.impression === "途中退出") {
            return jsonResponse({ error: "この面接は公開できません" }, 400);
          }
          const [limit, shown] = await Promise.all([
            shownInterviewLimit(supabase, auth.userId),
            countShownInterviews(supabase, auth.userId),
          ]);
          if (limit !== null && shown >= limit) {
            return jsonResponse(
              {
                error: `公開できるのは${limit}件までです。ほかの結果を外すか、プランを上げてください`,
              },
              409,
            );
          }
        }

        if (body.action === "delete") {
          if (iv.recording_path) {
            await supabase.storage.from(RECORDING_BUCKET).remove([iv.recording_path]);
          }
          // 評価・会話（interview_summaries / interview_turns）は一緒に消える
          const { error } = await supabase.from("interviews").delete().eq("id", iv.id);
          if (error) {
            console.error("[talent/my-interviews] delete failed", error);
            return jsonResponse({ error: "削除に失敗しました" }, 500);
          }
        } else {
          const { error } = await supabase
            .from("interviews")
            .update({ shown_to_companies: body.action === "show" })
            .eq("id", iv.id);
          if (error) {
            console.error("[talent/my-interviews] update failed", error);
            return jsonResponse({ error: "保存に失敗しました" }, 500);
          }
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
