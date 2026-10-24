/**
 * 読み間違えやすい言葉を、声にするときだけひらがなにする（字幕は漢字のまま）。
 * 例：御社を「ごしゃ」と読んでしまうので「おんしゃ」にする
 */
const READINGS: [RegExp, string][] = [
  [/御社/g, "おんしゃ"],
  [/貴社/g, "きしゃ"],
  [/弊社/g, "へいしゃ"],
  [/御校/g, "おんこう"],
  [/貴校/g, "きこう"],
  [/面接官/g, "めんせつかん"],
  [/ガクチカ/g, "がくちか"],
  [/逆質問/g, "ぎゃくしつもん"],
  [/一期一会/g, "いちごいちえ"],
];
export function toSpeechText(text: string): string {
  return READINGS.reduce((t, [re, to]) => t.replace(re, to), text);
}

/** AI面接官の声の話し方（OpenAI の gpt-4o-mini-tts に渡す） */
export const INTERVIEWER_VOICE_STYLE =
  "日本の企業の若い女性の面接官。明るくやわらかい、かわいらしい声で、にこやかに親しみやすく話す。丁寧な標準語で、一語ずつはっきり、なめらかに話す。";
