/**
 * 企業のコインと、人材ごとの値段（画面とAPIの両方で使う）。
 * - 企業はコインをまとめ買いする（有効期限6か月）
 * - 人材の値段は「評価の平均（7つの評価・5点満点）」で決まり、たくさん見られている人ほど少し上がる
 * - 見られた本人には、使われたコインの円換算の1/4がポイントで入る（SQL の spend_coins_for_unlock）
 */

export const COIN_EXPIRY_MONTHS = 6;

/** 本人に入る割合 */
export const CANDIDATE_SHARE_RATE = 0.25;

export type CoinPack = { id: "s" | "m" | "l"; coins: number; priceJpy: number; bonus: string };

export const COIN_PACKS: CoinPack[] = [
  { id: "s", coins: 50, priceJpy: 5000, bonus: "" },
  { id: "m", coins: 110, priceJpy: 10000, bonus: "10%おまけ" },
  { id: "l", coins: 360, priceJpy: 30000, bonus: "20%おまけ" },
];

/** 評価の平均ごとの値段（コイン）。下限以上で一番上の行を使う */
export const PRICE_TIERS: { min: number; coins: number }[] = [
  { min: 4.5, coins: 220 },
  { min: 4.0, coins: 170 },
  { min: 3.5, coins: 130 },
  { min: 3.0, coins: 100 },
  { min: 2.5, coins: 70 },
  { min: 0, coins: 50 },
];

/** たくさん見られている人の上乗せ：3回見られるごとに +10%（最大 +50%） */
export const POPULARITY_STEP = 3;
export const POPULARITY_RATE = 0.1;
export const POPULARITY_MAX_STEPS = 5;

export function evaluationAverage(
  competencies: { score: number | null }[] | null | undefined,
): number | null {
  const scores = (competencies ?? [])
    .map((c) => c.score)
    .filter((n): n is number => typeof n === "number");
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

/** 人材1人分の値段（コイン）。paidViews はコインで見られた回数（応募で見られた分は数えない） */
export function priceCoins(average: number | null, paidViews: number): number {
  const base = PRICE_TIERS.find((t) => (average ?? 0) >= t.min)?.coins ?? 50;
  const steps = Math.min(
    POPULARITY_MAX_STEPS,
    Math.floor(Math.max(0, paidViews) / POPULARITY_STEP),
  );
  return Math.round((base * (1 + steps * POPULARITY_RATE)) / 10) * 10;
}

export function coinExpiryFrom(date: Date): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + COIN_EXPIRY_MONTHS);
  return d;
}
