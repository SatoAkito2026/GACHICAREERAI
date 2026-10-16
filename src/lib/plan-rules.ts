/**
 * 個人・受験生プランの練習まわりの上限（画面とAPIの両方で使う）。
 * null は「無制限」。評価の中身はどのプランでも同じで、変わるのは回数・時間・職種・結果の数だけ。
 */
export type IndividualPlanKey = "free" | "individual_light" | "individual_pro";

export interface PracticeRule {
  /** 月額（税込・円） */
  priceJpy: number;
  /** 1日に始められる練習の回数 */
  perDay: number | null;
  /** 1か月に始められる練習の回数 */
  perMonth: number | null;
  /** 1回の練習の長さ（分） */
  maxMinutes: number | null;
  /** 1か月に練習できる職種の数（月が変われば入れ替えられる） */
  jobTypes: number | null;
  /** 見られる結果の数（新しいものから。古いものは消さずに隠すだけ） */
  results: number | null;
}

export const PRACTICE_RULES: Record<IndividualPlanKey, PracticeRule> = {
  free: { priceJpy: 0, perDay: 1, perMonth: 5, maxMinutes: 10, jobTypes: 2, results: 5 },
  individual_light: {
    priceJpy: 980,
    perDay: 2,
    perMonth: 15,
    maxMinutes: 15,
    jobTypes: 5,
    results: 10,
  },
  individual_pro: {
    priceJpy: 2980,
    perDay: 3,
    perMonth: 30,
    maxMinutes: 30,
    jobTypes: null,
    results: null,
  },
};

/** DB の plan の値を個人プランに読み替える（企業プランなどは一番近いものに寄せる） */
export function toIndividualPlan(plan: string | null | undefined): IndividualPlanKey {
  if (plan === "individual_pro" || plan === "pro" || plan === "company_pro")
    return "individual_pro";
  if (plan === "individual_light" || plan === "standard" || plan === "company_light")
    return "individual_light";
  return "free";
}

export function practiceRule(plan: string | null | undefined): PracticeRule {
  return PRACTICE_RULES[toIndividualPlan(plan)];
}

/** 「無制限」も含めて上限を文字にする */
export function limitText(n: number | null, unit: string): string {
  return n == null ? "無制限" : `${n}${unit}`;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本時間の今日の0時（UTC の ISO 文字列） */
export function startOfTodayJst(now = new Date()): string {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  jst.setUTCHours(0, 0, 0, 0);
  return new Date(jst.getTime() - JST_OFFSET_MS).toISOString();
}

/** 日本時間の今月1日の0時（UTC の ISO 文字列） */
export function startOfMonthJst(now = new Date()): string {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  jst.setUTCDate(1);
  jst.setUTCHours(0, 0, 0, 0);
  return new Date(jst.getTime() - JST_OFFSET_MS).toISOString();
}

export function normalizeJobType(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/**
 * 企業のAI面接（URLを発行して候補者に受けてもらう）の料金。従量課金で、候補者が面接を始めた回だけ数える。
 * 実際の請求額は Stripe の従量課金の Price（create-subscription.ts の PRICE_IDS.company_metered）で決まる。ここは表示用。
 */
export const COMPANY_INTERVIEW_PRICE_JPY = 2200;
