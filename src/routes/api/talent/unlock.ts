/**
 * 企業向け：コインで面接の結果を1つ買う（詳しい評価・会話・録画が見られ、名前・面談の申し込みも開く）
 *
 * POST /api/talent/unlock { code, interviewId, expectedCoins }
 *
 * 値段（コイン）はサーバーで、その結果の評価の平均と、その人が見られた回数から決める。
 * 使われたコインの円換算の1/4が、本人にポイントで入る（spend_coins_for_unlock が1回の処理で行う）。
 * 成功報酬ではなく、閲覧・連絡の権利に対する料金。採用の成否とは関係しない。
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { CANDIDATE_SHARE_RATE, priceCoins } from "@/lib/coins";
import {
  COMPANY_REQUIRED_MESSAGE,
  getCoinBalance,
  getCompanyProfile,
  getPaidViewCounts,
  jsonResponse,
  loadShownResults,
  notifyUnlocked,
  serviceClient,
} from "@/lib/talent";

export const Route = createFileRoute("/api/talent/unlock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        if (!(await getCompanyProfile(supabase, auth.userId))) {
          return jsonResponse({ error: COMPANY_REQUIRED_MESSAGE, needsCompany: true }, 403);
        }
        const body = (await request.json().catch(() => ({}))) as {
          code?: unknown;
          interviewId?: unknown;
          expectedCoins?: unknown;
        };
        const code = typeof body.code === "string" ? body.code : "";
        const interviewId = typeof body.interviewId === "string" ? body.interviewId : "";
        const { data: p } = await supabase
          .from("candidate_profiles")
          .select("user_id, is_public")
          .eq("public_code", code)
          .maybeSingle();
        if (!p || !p.is_public) {
          return jsonResponse({ error: "このプロフィールは公開されていません" }, 404);
        }
        if (p.user_id === auth.userId) {
          return jsonResponse({ error: "ご自身のプロフィールです" }, 400);
        }

        // 買えるのは、本人がいま公開している結果だけ
        const result = (await loadShownResults(supabase, [p.user_id], 100)).find(
          (r) => r.id === interviewId,
        );
        if (!result) {
          return jsonResponse({ error: "この結果は公開されていません" }, 404);
        }

        const views = (await getPaidViewCounts(supabase, [p.user_id])).get(p.user_id) ?? 0;
        const coins = priceCoins(result.average, views);
        // 画面で見た値段より上がっていたら、使わずに知らせる（ほかの企業が見て人気の上乗せが増えた場合など）
        if (typeof body.expectedCoins === "number" && coins > body.expectedCoins) {
          return jsonResponse(
            {
              error: `値段が ${coins}コイン に変わりました。もう一度お試しください。`,
              priceCoins: coins,
            },
            409,
          );
        }
        const { error } = await supabase.rpc("spend_coins_for_unlock", {
          p_company: auth.userId,
          p_candidate: p.user_id,
          p_interview: result.id,
          p_coins: coins,
          p_share_rate: CANDIDATE_SHARE_RATE,
        });
        if (error) {
          if (error.message.includes("already_unlocked")) return jsonResponse({ ok: true });
          if (error.message.includes("insufficient_coins")) {
            return jsonResponse(
              {
                error: `コインが足りません（必要：${coins}コイン）`,
                needCoins: coins,
                ...(await getCoinBalance(supabase, auth.userId)),
              },
              402,
            );
          }
          console.error("[talent/unlock]", error);
          return jsonResponse({ error: "閲覧の記録に失敗しました" }, 500);
        }
        await notifyUnlocked(supabase, p.user_id, auth.userId);
        return jsonResponse({ ok: true, coins, ...(await getCoinBalance(supabase, auth.userId)) });
      },
    },
  },
});
