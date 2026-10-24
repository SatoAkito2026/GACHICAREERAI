/**
 * 本人のポイント（企業に見られたときに入る。1ポイント＝1円）を、ライト・プロの月額の支払いに使う。サーバー専用。
 * Stripe の「顧客の残高（クレジット）」に入れると、次の請求から自動で差し引かれる。
 * 現金・ギフトカードとの交換は、労働局の確認が取れるまで行わない。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getPointBalance } from "@/lib/talent";

/** ポイントを最大 maxYen 円分、Stripe の残高に入れる。使ったポイント数を返す */
export async function applyPointsToStripe(
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string,
  customerId: string,
  maxYen: number,
): Promise<number> {
  const amount = Math.min(await getPointBalance(supabase, userId), Math.floor(maxYen));
  if (amount <= 0) return 0;
  const ref = `plan:${Date.now()}`;
  const { error } = await supabase.rpc("spend_points", {
    p_user: userId,
    p_points: amount,
    p_reason: "plan_payment",
    p_ref: ref,
  });
  if (error) {
    console.error("[points] spend failed", error);
    return 0;
  }
  try {
    await stripe.customers.createBalanceTransaction(customerId, {
      amount: -amount,
      currency: "jpy",
      description: `ガチキャリポイント ${amount}pt を月額の支払いに使用`,
      metadata: { supabase_user_id: userId, ref },
    });
    return amount;
  } catch (e) {
    console.error("[points] stripe credit failed", e);
    // Stripe に入れられなかったら、ポイントを戻す
    await supabase
      .from("point_ledger")
      .insert({ user_id: userId, points: amount, reason: "refund", ref_id: ref });
    return 0;
  }
}
