/**
 * 企業向け：コインで人材の詳しい評価を見る
 *
 * POST /api/talent/unlock { code }
 *
 * 値段（コイン）はサーバーで、評価の平均と見られた回数から決める。
 * 使われたコインの円換算の1/4が、本人にポイントで入る（spend_coins_for_unlock が1回の処理で行う）。
 * 成功報酬ではなく、閲覧・連絡の権利に対する料金。採用の成否とは関係しない。
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { CANDIDATE_SHARE_RATE, evaluationAverage, priceCoins } from "@/lib/coins";
import {
  COMPANY_REQUIRED_MESSAGE,
  getCoinBalance,
  getCompanyProfile,
  getPaidViewCounts,
  jsonResponse,
  notifyUnlocked,
  serviceClient,
  type TalentSummary,
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
          expectedCoins?: unknown;
        };
        const code = typeof body.code === "string" ? body.code : "";
        const { data: p } = await supabase
          .from("candidate_profiles")
          .select("user_id, is_public, summary")
          .eq("public_code", code)
          .maybeSingle();
        if (!p || !p.is_public) {
          return jsonResponse({ error: "このプロフィールは公開されていません" }, 404);
        }
        if (p.user_id === auth.userId) {
          return jsonResponse({ error: "ご自身のプロフィールです" }, 400);
        }

        const views = (await getPaidViewCounts(supabase, [p.user_id])).get(p.user_id) ?? 0;
        const coins = priceCoins(
          evaluationAverage((p.summary as TalentSummary | null)?.competencies),
          views,
        );
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
