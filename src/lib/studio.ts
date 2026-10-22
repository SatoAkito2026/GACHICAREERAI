/**
 * TikTok 用の「ガチキャリAIを使ってみた」動画の台本と音声を作る（サーバー専用）。
 *
 * 流れ：GitHub Actions（.github/workflows/tiktok-video.yml）が毎日
 *   1. POST /api/studio/job      … ここで台本（AI）と音声（OpenAI TTS）を作って返す
 *   2. /studio/tiktok を開いて1コマずつ撮り、ffmpeg で動画にする（scripts/tiktok/render.mjs）
 *   3. POST /api/studio/upload   … できた動画を Storage に置き、管理画面に出す
 * 呼べるのは合言葉（STUDIO_SECRET）を知っている GitHub Actions だけ。
 * 出てくる人はすべてAIの演技（実在の利用者の面接は使わない）。
 */
import Anthropic from "@anthropic-ai/sdk";
import { extractJson, lastTextBlock } from "@/lib/ai-json";

export const STUDIO_BUCKET = "tiktok-videos";

/** アプリの面接官の声と同じ（PCM 24kHz を少し速く・高く再生している） */
export const INTERVIEWER_RATE = 16000 / 14700;
const SAMPLE_RATE = 24000;

const LABELS = [
  "伝える力",
  "論理的に考える力",
  "主体性",
  "協調性",
  "粘り強さ",
  "誠実さ",
  "学ぶ姿勢",
];

/** 毎回ちがう雰囲気にするためのテーマ（おふざけと真面目を混ぜる） */
const THEMES = [
  {
    key: "funny",
    label: "おふざけ",
    brief: "受験者がボケ倒す。でも最後に少しだけ良いことを言う。面接官は冷静にツッコむ",
  },
  {
    key: "aruaru",
    label: "面接あるある",
    brief: "緊張して話が長くなる・噛む・結論がない など、誰もが共感するあるある",
  },
  {
    key: "kami",
    label: "神回答",
    brief: "定番の質問に、具体例と数字で答える見本のような回答。見た人が真似したくなる",
  },
  {
    key: "ishiki",
    label: "意識高すぎ",
    brief: "カタカナ語と大きすぎる夢を語りすぎる受験者。面接官が中身を深掘りする",
  },
  {
    key: "gyaku",
    label: "逆質問",
    brief: "最後の「何か質問はありますか？」で、良い逆質問と微妙な逆質問の差が分かる",
  },
  {
    key: "honest",
    label: "正直すぎ",
    brief: "志望動機を正直すぎる言い方で答えてしまう。面接官が上手な言い換えを引き出す",
  },
  {
    key: "student",
    label: "受験生",
    brief: "高校・大学入試の面接。志望理由や高校生活の質問に、受験生らしく答える",
  },
] as const;

export type StudioLine = { speaker: "interviewer" | "candidate"; text: string };
export type StudioScript = {
  theme: string;
  themeLabel: string;
  title: string;
  caption: string;
  jobType: string;
  lines: StudioLine[];
  result: { score: number; competencies: { label: string; score: number }[]; comment: string };
};

export type StudioJob = StudioScript & {
  id: string;
  sampleRate: number;
  interviewerRate: number;
  /** 行ごとの音声（PCM 16bit mono、base64） */
  audio: string[];
};

function pickTheme(recent: string[]) {
  const fresh = THEMES.filter((t) => !recent.includes(t.key));
  const pool = fresh.length ? fresh : THEMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function writeScript(recentThemes: string[]): Promise<StudioScript> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const theme = pickTheme(recentThemes);
  const prompt = `あなたはTikTokのショート動画の構成作家です。
「ガチキャリAI」というAI模擬面接アプリを、実際に使っている様子の動画（縦・30〜40秒）の台本を作ってください。
画面にはAIの面接官（女性のアバター）が出て、受験者（AIが演じる架空の人物）と短く会話し、最後にアプリが7つの評価で採点します。

【今回のテーマ】${theme.label}：${theme.brief}

【ルール】
- 会話は面接官→受験者の順で交互に、合計6〜8行。1行は40文字以内の話し言葉
- 面接官は丁寧で落ち着いた口調。最初の行は面接の質問から始める（あいさつは短く）
- 実在の人物・会社・学校・商品の名前は出さない。下品・差別・政治・宗教の話はしない
- 最初の1秒で見る人の手が止まる、短いタイトル（20文字以内、例「AI面接官に正直すぎる志望動機を言った結果」）
- 評価は台本の内容に合った点数にする（おふざけなら低め、神回答なら高め）。7つの評価は1.0〜5.0（0.5刻み）
- 投稿の文（caption）は100文字以内＋ハッシュタグ4〜6個（#ガチキャリAI を必ず入れる）

次のJSONだけを返してください：
{
  "title": "動画の最初に大きく出すタイトル",
  "caption": "TikTokの投稿の文（ハッシュタグ込み）",
  "jobType": "面接の職種や種類（例：営業、事務、大学入試）",
  "lines": [{"speaker": "interviewer" または "candidate", "text": "せりふ"}],
  "result": {
    "score": 0〜100の総合点,
    "competencies": [${LABELS.map((l) => `{"label": "${l}", "score": 数字}`).join(", ")}],
    "comment": "AIの講評（40文字以内）"
  }
}`;
  const anthropic = new Anthropic({ apiKey });
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = extractJson(lastTextBlock(res.content)) as Partial<StudioScript> | null;
  if (!raw || !Array.isArray(raw.lines)) throw new Error("script parse failed");
  const lines = raw.lines
    .filter((l) => l && (l.speaker === "interviewer" || l.speaker === "candidate") && l.text)
    .map((l) => ({ speaker: l.speaker, text: String(l.text).slice(0, 60) }))
    .slice(0, 9);
  if (lines.length < 4) throw new Error("script too short");
  const comps = LABELS.map((label) => {
    const found = raw.result?.competencies?.find((c) => c?.label === label);
    const n = Number(found?.score);
    return {
      label,
      score: Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n * 2) / 2)) : 3,
    };
  });
  const score = Math.min(100, Math.max(0, Math.round(Number(raw.result?.score) || 60)));
  let caption = String(raw.caption ?? "").slice(0, 300);
  if (!caption.includes("#ガチキャリAI")) caption += " #ガチキャリAI";
  return {
    theme: theme.key,
    themeLabel: theme.label,
    title: String(raw.title ?? "AI面接官と面接してみた").slice(0, 30),
    caption,
    jobType: String(raw.jobType ?? "模擬面接").slice(0, 20),
    lines,
    result: { score, competencies: comps, comment: String(raw.result?.comment ?? "").slice(0, 60) },
  };
}

const CANDIDATE_VOICES = ["echo", "onyx", "nova", "alloy", "fable"];

/** せりふごとに音声を作る（PCM 24kHz 16bit mono） */
export async function speakLines(lines: StudioLine[]): Promise<string[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const candidateVoice = CANDIDATE_VOICES[Math.floor(Math.random() * CANDIDATE_VOICES.length)];
  return Promise.all(
    lines.map(async (line) => {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "tts-1",
          input: line.text,
          // 面接官はアプリと同じ声・速さ
          voice: line.speaker === "interviewer" ? "shimmer" : candidateVoice,
          response_format: "pcm",
          speed: line.speaker === "interviewer" ? 1.3 : 1.15,
        }),
      });
      if (!res.ok) throw new Error(`tts ${res.status}: ${await res.text()}`);
      return Buffer.from(await res.arrayBuffer()).toString("base64");
    }),
  );
}

export const STUDIO_SAMPLE_RATE = SAMPLE_RATE;

/** GitHub Actions からの呼び出しかどうか（合言葉を照らし合わせる） */
export function isStudioRequest(request: Request): boolean {
  const secret = process.env.STUDIO_SECRET;
  const given = request.headers.get("x-studio-secret") ?? "";
  if (!secret || given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
