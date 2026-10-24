/**
 * 話し方の数字（AIを使わず、本人の発言の文字から数える）。練習の評価に「話し方」として出す
 * - 1回の答えの長さ（文字数）。目安は150〜300文字（30〜60秒くらい）
 * - 言いよどみ（えー・えっと・あの・まあ など）の回数
 */
export type SpeechStats = {
  answers: number;
  avgChars: number;
  fillers: number;
  fillersPerAnswer: number;
  /** 長すぎる答え（400文字より長い）の数 */
  longAnswers: number;
  /** 短すぎる答え（40文字より短い）の数 */
  shortAnswers: number;
};

const FILLER =
  /(えーっと|えっと|えーと|えー|ええと|あのー|あの、|あのう|うーん|まあ、|まぁ、|なんか、|そのー)/g;

export function speechStats(answers: string[]): SpeechStats | null {
  const list = answers.map((a) => a.trim()).filter(Boolean);
  if (list.length === 0) return null;
  const chars = list.map((a) => a.replace(/\s/g, "").length);
  const fillers = list.reduce((n, a) => n + (a.match(FILLER)?.length ?? 0), 0);
  return {
    answers: list.length,
    avgChars: Math.round(chars.reduce((a, b) => a + b, 0) / list.length),
    fillers,
    fillersPerAnswer: Math.round((fillers / list.length) * 10) / 10,
    longAnswers: chars.filter((c) => c > 400).length,
    shortAnswers: chars.filter((c) => c < 40).length,
  };
}

/** 数字に合わせたひとことアドバイス */
export function speechAdvice(s: SpeechStats): string[] {
  const tips: string[] = [];
  if (s.avgChars < 100)
    tips.push("答えが短めです。結論のあとに、理由と具体的なエピソードを1つ足しましょう。");
  else if (s.avgChars > 350)
    tips.push("答えが長めです。最初に結論を言い、話は1分以内にまとめましょう。");
  else tips.push("答えの長さはちょうど良いです（30〜60秒くらい）。");
  if (s.fillersPerAnswer >= 2)
    tips.push("「えー」「あの」が多めです。話し始める前に一呼吸おくと減らせます。");
  return tips;
}
