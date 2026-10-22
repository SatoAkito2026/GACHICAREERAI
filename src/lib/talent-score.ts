/**
 * 企業に見せる「評価の平均（5点満点）」＝面接1回分の7つの評価の平均。サーバーと画面の両方で使う。
 * 面接の結果は1つずつ別物として扱い、複数の結果をまとめて平均することはしない。
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
