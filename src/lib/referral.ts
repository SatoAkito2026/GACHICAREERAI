/**
 * 友だち紹介（サーバー専用）
 *
 * 紹介リンク（/login?ref=コード）から登録した人が「最初の練習」を終えたら、
 * 紹介した人・された人の両方に練習のボーナス回数をあげる（お金・ポイントは渡さない）。
 * ボーナスは、その日・その月の練習の上限を超えたときに1回ずつ使われる（create-practice-session）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** 1回の紹介でもらえる練習の追加回数（紹介した人・された人それぞれ） */
export const REFERRAL_BONUS = 3;
/** 紹介として受け付けるのは、登録からこの日数以内のアカウントだけ */
const CLAIM_WITHIN_DAYS = 7;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 見間違えやすい 0/O・1/I は使わない

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(7));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** その人の紹介コード（無ければ作る） */
export async function getOrCreateReferralCode(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("referral_codes")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.code) return data.code;
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    const { error } = await supabase.from("referral_codes").insert({ user_id: userId, code });
    if (!error) return code;
    if (error.code !== "23505") {
      console.error("[referral] code insert", error);
      return null;
    }
    // 同じ人が同時に作った場合は、そちらを使う
    const { data: again } = await supabase
      .from("referral_codes")
      .select("code")
      .eq("user_id", userId)
      .maybeSingle();
    if (again?.code) return again.code;
  }
  return null;
}

/** 練習のボーナスの残り */
export async function getBonusBalance(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from("practice_bonus_ledger")
    .select("amount")
    .eq("user_id", userId)
    .limit(5000);
  return Math.max(
    0,
    (data ?? []).reduce((a, r) => a + r.amount, 0),
  );
}

/** 紹介リンクから登録した人を、紹介した人に結びつける */
export async function claimReferral(
  supabase: SupabaseClient,
  userId: string,
  code: string,
): Promise<{ ok: boolean; reason?: string }> {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(clean)) return { ok: false, reason: "invalid" };
  const { data: owner } = await supabase
    .from("referral_codes")
    .select("user_id")
    .eq("code", clean)
    .maybeSingle();
  if (!owner || owner.user_id === userId) return { ok: false, reason: "invalid" };
  const { data: me } = await supabase
    .from("profiles")
    .select("created_at")
    .eq("id", userId)
    .maybeSingle();
  if (
    !me?.created_at ||
    Date.now() - new Date(me.created_at).getTime() > CLAIM_WITHIN_DAYS * 86400000
  ) {
    return { ok: false, reason: "too_late" };
  }
  const { error } = await supabase
    .from("referrals")
    .insert({ referrer_id: owner.user_id, referred_id: userId });
  if (error && error.code !== "23505") {
    console.error("[referral] claim", error);
    return { ok: false, reason: "error" };
  }
  return { ok: !error, reason: error ? "already" : undefined };
}

/** 紹介された人が練習を1回終えたら、両方にボーナスを渡す（1回だけ） */
export async function rewardReferralOnFirstPractice(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    // pending → rewarded の切り替えに成功した1回だけ渡す（同時に呼ばれても二重にならない）
    const { data: updated } = await supabase
      .from("referrals")
      .update({ status: "rewarded", rewarded_at: new Date().toISOString() })
      .eq("referred_id", userId)
      .eq("status", "pending")
      .select("id, referrer_id")
      .maybeSingle();
    if (!updated) return;
    await supabase.from("practice_bonus_ledger").insert([
      {
        user_id: updated.referrer_id,
        amount: REFERRAL_BONUS,
        reason: "referral_inviter",
        ref_id: updated.id,
      },
      { user_id: userId, amount: REFERRAL_BONUS, reason: "referral_invited", ref_id: updated.id },
    ]);
    const { notify } = await import("@/lib/notify");
    await notify(supabase, updated.referrer_id, {
      kind: "referral",
      title: `招待した友だちが練習を始めました（+${REFERRAL_BONUS}回）`,
      body: `練習のボーナスが${REFERRAL_BONUS}回ふえました。上限を超えたときに使われます。`,
      link: "/private/invite",
    });
  } catch (e) {
    console.error("[referral] reward", e);
  }
}
