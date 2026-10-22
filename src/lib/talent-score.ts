/**
 * 企業に見せる「評価の平均（5点満点）」。サーバーと画面の両方で使う。
 * 公開中の面接ごとの平均（7つの評価の平均）を、さらに平均したもの。
 * 本人の公開ページの面接カードの数字と合うようにしている。
 */
type ScoredCompetency = { score: number | null };

/** 面接1回分の評価の平均 */
export function interviewAverage(competencies: ScoredCompetency[] | undefined): number | null {
  const scores = (competencies ?? [])
    .map((c) => c.score)
    .filter((n): n is number => typeof n === "number");
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** 人物まとめから、企業に見せる評価の平均（小数1桁） */
export function summaryAverage(
  summary: { competencies?: ScoredCompetency[]; overall_average?: number | null } | null,
): number | null {
  if (!summary) return null;
  // 古いまとめ（overall_average が無い）は、能力ごとの点数の平均で代わりにする
  const avg =
    typeof summary.overall_average === "number"
      ? summary.overall_average
      : interviewAverage(summary.competencies);
  return avg === null ? null : Math.round(avg * 10) / 10;
}
