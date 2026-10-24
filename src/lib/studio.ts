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
import { INTERVIEWER_VOICE_STYLE, toSpeechText } from "@/lib/speech-text";

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

/** narrator は最初の引き・オファーの紹介などのナレーション（アバターの口は動かさない） */
export type StudioLine = { speaker: "interviewer" | "candidate" | "narrator"; text: string };
export type StudioScript = {
  theme: string;
  themeLabel: string;
  title: string;
  caption: string;
  jobType: string;
  lines: StudioLine[];
  result: { score: number; competencies: { label: string; score: number }[]; comment: string };
  /** 最後の演出：プロフィールを公開すると、企業から面談の申し込みが届く */
  offer: { companyType: string; count: number; message: string; reaction: string };
};

/** これまでに作った動画と、管理画面で入れた再生数など（伸びたものを真似し、伸びなかったものを避ける） */
export type StudioHistory = {
  theme: string;
  title: string;
  views: number | null;
  likes: number | null;
};

export type StudioJob = StudioScript & {
  id: string;
  sampleRate: number;
  interviewerRate: number;
  /** 行ごとの音声（PCM 16bit mono、base64） */
  audio: string[];
};

/**
 * テーマを選ぶ。再生数が分かっている動画があれば、7割は伸びたテーマから、3割はほかのテーマを試す。
 * 直近2本と同じテーマは避ける
 */
function pickTheme(history: StudioHistory[]) {
  const recent = history.slice(0, 2).map((h) => h.theme);
  const fresh = THEMES.filter((t) => !recent.includes(t.key));
  const pool = fresh.length ? fresh : [...THEMES];
  const measured = history.filter((h) => typeof h.views === "number");
  if (measured.length >= 3 && Math.random() < 0.7) {
    const avg = (key: string) => {
      const v = measured.filter((h) => h.theme === key).map((h) => h.views ?? 0);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : -1;
    };
    const best = [...pool].sort((a, b) => avg(b.key) - avg(a.key)).filter((t) => avg(t.key) >= 0);
    if (best.length) return best[Math.floor(Math.random() * Math.min(2, best.length))];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 伸びた動画・伸びなかった動画を、台本づくりの参考として渡す */
function learnedExamples(history: StudioHistory[]): string {
  const measured = history
    .filter((h) => typeof h.views === "number")
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  if (measured.length < 2) return "";
  const fmt = (h: StudioHistory) =>
    `- 「${h.title}」（${THEMES.find((t) => t.key === h.theme)?.label ?? h.theme}）再生${h.views}・いいね${h.likes ?? "-"}`;
  const top = measured.slice(0, 3).map(fmt).join("\n");
  const bottom = measured
    .slice(-2)
    .filter((h) => !measured.slice(0, 3).includes(h))
    .map(fmt)
    .join("\n");
  return `
【これまでの動画の結果（このアカウントで実際に伸びたもの・伸びなかったもの）】
伸びた：
${top}${bottom ? `\n伸びなかった：\n${bottom}` : ""}
→ 伸びたタイトルの言い回し・切り口を参考にし、伸びなかったものに似せない（そのまま同じにはしない）
`;
}

export async function writeScript(history: StudioHistory[]): Promise<StudioScript> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const theme = pickTheme(history);
  const prompt = `あなたはTikTokのショート動画の構成作家です。
「ガチキャリAI」というAI模擬面接アプリを、実際に使っている様子の動画（縦・30〜40秒）の台本を作ってください。
画面にはAIの面接官（女性のアバター）が出て、受験者（AIが演じる架空の人物）と短く会話し、アプリが7つの評価で採点します。
最後に、受験者がプロフィールを企業に公開して、企業から面談の申し込み（オファー）が届く演出が入ります。

【今回のテーマ】${theme.label}：${theme.brief}

【伸びるショート動画の型（必ず守る）】
- 最初の1秒：タイトルで「え、どうなるの？」と思わせる（意外さ・共感・対立。例「〜した結果」「〜はアウト？」「9割が言いがちな〜」）
- 1行目の質問は、誰もが面接で聞かれる定番（志望動機・長所短所・ガクチカ・逆質問など）にして、見る人が自分ごとにできるようにする
- 受験者の答えにツッコミどころか「それ分かる！」を入れ、面接官の返しで一段落ちをつける
- 中だるみさせない：1行は短く、同じ内容をくり返さない
- オチ（採点とオファー）がテーマに合っていて、最後まで見たくなる
- 投稿の文は「あなたならどう答える？」のように、コメントしたくなる問いかけで終える
${learnedExamples(history)}
【ルール】
- 会話は面接官→受験者の順で交互に、合計6〜8行。1行は40文字以内の話し言葉
- 面接官は丁寧で落ち着いた口調。最初の行は面接の質問から始める（あいさつは短く）
- 実在の人物・会社・学校・商品の名前は出さない。下品・差別・政治・宗教の話はしない
- 最初の1秒で見る人の手が止まる、短いタイトル（20文字以内、例「AI面接官に正直すぎる志望動機を言った結果」）
- 評価は台本の内容に合った点数にする（おふざけなら低め、神回答なら高め）。7つの評価は1.0〜5.0（0.5刻み）
- 投稿の文（caption）は100文字以内＋ハッシュタグ4〜6個（#ガチキャリAI を必ず入れる）
- オファーの演出もテーマに合わせる。おふざけ回なら「なぜかその答えがハマる、ちょっと意外な業界の架空の会社」から笑える申し込み、真面目回なら評価に合った業界の架空の会社から誠実な申し込み。会社名は出さず「IT企業」「老舗の和菓子店」のような種類だけ

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
  },
  "offer": {
    "companyType": "申し込んできた架空の会社の種類（15文字以内）",
    "count": 届いた申し込みの数（1〜5）,
    "message": "企業からの申し込みのメッセージ（40文字以内）",
    "reaction": "それを見た受験者のひとこと（20文字以内）"
  }
}`;
  const anthropic = new Anthropic({ apiKey });
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = extractJson(lastTextBlock(res.content)) as
    (Partial<Omit<StudioScript, "offer">> & { offer?: Partial<StudioScript["offer"]> }) | null;
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
    offer: {
      companyType: String(raw.offer?.companyType ?? "企業").slice(0, 20),
      count: Math.min(5, Math.max(1, Math.round(Number(raw.offer?.count) || 1))),
      message: String(raw.offer?.message ?? "ぜひ一度お話ししませんか？").slice(0, 60),
      reaction: String(raw.offer?.reaction ?? "えっ、ほんとに！？").slice(0, 30),
    },
  };
}

// 受験者の声。gpt-4o-mini-tts は話し方を指示できるので、就活生らしくスラスラ話させる
const CANDIDATE_VOICES = ["coral", "sage", "verse", "ballad", "echo"];
// ナレーション：面接官とはっきり違う声と話し方で、最初の1秒で引きつける
const NARRATOR_VOICE = "ash";
const NARRATOR_STYLE =
  "テンション高めの人気TikTokナレーター。明るく元気いっぱい、声を張ってワクワクした感じで。最初の一言で視聴者の手を止める。早口で畳みかけるように、強く短く言い切る。間を空けない。語尾まで勢いよく。";
const CANDIDATE_STYLE =
  "日本の就職活動の面接を受けている20代の受験者。自然な日本語で、よどみなくスラスラと、はきはき話す。間延びさせず、少し速めのテンポで。おふざけのせりふは明るく、真面目なせりふは落ち着いて。";

/** せりふごとに音声を作る（PCM 24kHz 16bit mono） */
/** 声の前後の無音を切る（せりふの間が空きすぎないように）。16bit・1チャンネルの PCM */
function trimSilence(pcm: Buffer): Buffer {
  const n = Math.floor(pcm.length / 2);
  const loud = (i: number) => Math.abs(pcm.readInt16LE(i * 2)) > 500;
  let a = 0;
  while (a < n && !loud(a)) a++;
  let b = n - 1;
  while (b > a && !loud(b)) b--;
  if (a >= b) return pcm;
  const margin = Math.round(STUDIO_SAMPLE_RATE * 0.04);
  return pcm.subarray(Math.max(0, a - margin) * 2, Math.min(n, b + margin + 1) * 2);
}

export async function speakLines(
  lines: StudioLine[],
  /** 受験者のせりふごとの話し方（言い換え型の NG は自信なさげに、OK ははきはき） */
  styles?: (string | null)[],
  /** 広告用：面接官も聞き取りやすい声（速くしない・はっきり話す）にする */
  { clearInterviewer = false }: { clearInterviewer?: boolean } = {},
): Promise<string[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const candidateVoice = CANDIDATE_VOICES[Math.floor(Math.random() * CANDIDATE_VOICES.length)];
  return Promise.all(
    lines.map(async (line, i) => {
      const interviewer = line.speaker === "interviewer";
      const narrator = line.speaker === "narrator";
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          interviewer && clearInterviewer
            ? {
                model: "gpt-4o-mini-tts",
                input: toSpeechText(line.text),
                voice: "shimmer",
                instructions: INTERVIEWER_VOICE_STYLE,
                response_format: "pcm",
              }
            : interviewer
              ? {
                  // 面接官はアプリと同じ声・速さ
                  model: "tts-1",
                  input: toSpeechText(line.text),
                  voice: "shimmer",
                  response_format: "pcm",
                  speed: 1.3,
                }
              : {
                  model: "gpt-4o-mini-tts",
                  input: toSpeechText(line.text),
                  voice: narrator ? NARRATOR_VOICE : candidateVoice,
                  instructions: narrator ? NARRATOR_STYLE : (styles?.[i] ?? CANDIDATE_STYLE),
                  response_format: "pcm",
                },
        ),
      });
      if (!res.ok) throw new Error(`tts ${res.status}: ${await res.text()}`);
      return trimSilence(Buffer.from(await res.arrayBuffer())).toString("base64");
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

// ---- 言い換え型：「◯◯と聞かれた時の最高な答え方」 --------------------------------
// 伸びている面接動画（NG の言い方 → OK の言い方、受かる／落ちる、保存してね）を参考にした型。
// AI面接官の点数が、言い換えで上がるところを目玉にする

/** 面接でよく聞かれて、言い方しだいで印象が大きく変わる質問 */
const REWRITE_TOPICS = [
  {
    key: "taishoku",
    q: "前の会社を辞めた理由を教えてください",
    short: "なぜ前の会社を辞めたの？",
    who: "転職",
  },
  {
    key: "shibou",
    q: "当社を志望した理由を教えてください",
    short: "志望動機は？",
    who: "就活・転職",
  },
  {
    key: "tansho",
    q: "あなたの短所を教えてください",
    short: "あなたの短所は？",
    who: "就活・転職",
  },
  { key: "gakuchika", q: "学生時代に力を入れたことは何ですか", short: "ガクチカは？", who: "就活" },
  {
    key: "zangyo",
    q: "残業についてどう考えていますか",
    short: "残業は大丈夫？",
    who: "就活・転職",
  },
  {
    key: "tasha",
    q: "他社の選考状況を教えてください",
    short: "他社の選考状況は？",
    who: "就活・転職",
  },
  {
    key: "blank",
    q: "職歴にブランクがありますが、その間は何をしていましたか",
    short: "ブランク期間は何を？",
    who: "転職",
  },
  {
    key: "shippai",
    q: "これまでで一番の失敗を教えてください",
    short: "一番の失敗は？",
    who: "就活・転職",
  },
  {
    key: "gyaku",
    q: "最後に、何か質問はありますか",
    short: "何か質問はありますか？",
    who: "就活・転職",
  },
  {
    key: "5nen",
    q: "5年後、どうなっていたいですか",
    short: "5年後どうなりたい？",
    who: "就活・転職",
  },
  {
    key: "nigate",
    q: "苦手な人とはどう接していますか",
    short: "苦手な人とはどう接する？",
    who: "就活・転職",
  },
  {
    key: "kaisu",
    q: "転職の回数が多いようですが、理由を教えてください",
    short: "転職回数が多いのはなぜ？",
    who: "転職",
  },
] as const;

/** オファーの演出で、ナレーターが言うひとこと（約束にならない言い方にする） */
const OFFER_NARRATION = "しかも練習するだけで、企業から申し込みが届くことも！";

/** せりふごとの再生の速さ（ナレーションと受験者は少し速く。面接官はアプリと同じ） */
/** 動画の話す速さ（全員同じ。声の高さは変えずに速くする） */
const VIDEO_TEMPO = 1.75;

export function lineTempo(_speaker: StudioLine["speaker"]): number {
  return VIDEO_TEMPO;
}

export type RewriteItem = {
  label: string;
  ng: string;
  ngScore: number;
  ok: string;
  okScore: number;
  point: string;
};

export type RewriteScript = {
  format: "rewrite";
  theme: string;
  themeLabel: string;
  title: string;
  hook: string;
  question: string;
  items: RewriteItem[];
  cta: string;
  caption: string;
  /** 声にする順番（面接官の前ふり → 質問 → 各パターンの NG・OK・ポイント → 締め） */
  lines: StudioLine[];
  /** lines のそれぞれが何か（画面の出し分けに使う） */
  roles: ("hook" | "question" | "label" | "ng" | "ok" | "point" | "offer" | "cta")[];
  /** 最後の演出：練習の結果を公開しておくと、企業から面談の申し込みが届く（架空の会社） */
  offer: { companyType: string; message: string };
  /** lines のそれぞれが、何番目のパターンのものか（なければ -1） */
  itemIndex: number[];
};

const ITEM_ORDINALS = ["1つ目", "2つ目", "3つ目"];

export async function writeRewriteScript(history: StudioHistory[]): Promise<RewriteScript> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const used = new Set(history.slice(0, 6).map((h) => h.theme));
  const pool = REWRITE_TOPICS.filter((t) => !used.has(`rewrite:${t.key}`));
  const topic = (pool.length ? pool : REWRITE_TOPICS)[
    Math.floor(Math.random() * (pool.length || REWRITE_TOPICS.length))
  ];

  const prompt = `あなたはTikTokで就活・転職の面接対策動画を作る構成作家です。
再生数の多い面接動画（「なぜ前の会社を辞めたんですかと聞かれた時の最高な答え方」440万回再生、「面接でよく間違える敬語 受かる／落ちる」など）の型で、
「ガチキャリAI」（AI模擬面接アプリ）の動画の台本を作ってください。

【今回の質問】「${topic.q}」（対象：${topic.who}）

【型（必ず守る）】
- タイトル：「『◯◯』と聞かれた時の最高な答え方」のように、一目で何の動画か分かる（28文字以内）
- 前ふり（hook）：ナレーターが言う、見る人の手を止める強い一言。不安・危機感を突き、言い切る。例「これ言ったら即落ち」「9割がやるNG回答」（15文字以内）
- よくある本音・状況を3パターン（label：例「給料が少なかった」15文字以内）
- それぞれ、落ちる言い方（ng：ありがちな本音のまま、25文字以内）と、受かる言い方（ok：同じ事実を前向きに言い換えた、具体的で自然な話し言葉。40文字以内）
- AI面接官の点数：ng は15〜45点、ok は78〜95点（100点満点）
- 言い換えのポイント（point：20文字以内。例「不満ではなく、これからやりたいことを話す」）
- オファーの演出（offer）：最後に「練習した結果を公開しておくと、企業から面談の申し込みが届く」ことを見せる。申し込んできた架空の会社の種類（companyType：例「IT企業」15文字以内）と、企業からのひとこと（message：30文字以内。この質問への受かる言い方を評価した内容）
- 締め（cta）：保存をうながす一言（25文字以内。例「保存して、面接の前に見返してね」）
- 投稿の文：中身が分かる1文＋「あなたならどう答える？コメントで教えて」＋ハッシュタグ4〜6個（#ガチキャリAI #面接対策 を必ず入れる）

【ルール】
- 実在の会社・人物の名前は出さない。嘘をつかせる言い換えにしない（事実は変えず、伝え方を変える）
- ふざけない。実際の面接でそのまま使える内容にする
${learnedExamples(history)}
次のJSONだけを返してください：
{
  "title": "...",
  "hook": "...",
  "items": [{"label": "...", "ng": "...", "ngScore": 数字, "ok": "...", "okScore": 数字, "point": "..."}],
  "offer": {"companyType": "...", "message": "..."},
  "cta": "...",
  "caption": "..."
}`;
  const anthropic = new Anthropic({ apiKey });
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = extractJson(lastTextBlock(res.content)) as Partial<RewriteScript> | null;
  const items = (Array.isArray(raw?.items) ? raw.items : [])
    .filter((it) => it && it.ng && it.ok)
    .slice(0, 3)
    .map((it) => ({
      label: String(it.label ?? "").slice(0, 20),
      ng: String(it.ng).slice(0, 40),
      ngScore: Math.min(50, Math.max(5, Math.round(Number(it.ngScore) || 30))),
      ok: String(it.ok).slice(0, 60),
      okScore: Math.min(98, Math.max(70, Math.round(Number(it.okScore) || 85))),
      point: String(it.point ?? "").slice(0, 30),
    }));
  if (items.length < 2) throw new Error("rewrite script parse failed");
  const hook = String(raw?.hook ?? "これ言ったら即落ち").slice(0, 20);
  const rawOffer = (raw as { offer?: { companyType?: unknown; message?: unknown } } | null)?.offer;
  const offer = {
    companyType: String(rawOffer?.companyType ?? "IT企業").slice(0, 20),
    message: String(
      rawOffer?.message ?? "あなたの考え方に共感しました。ぜひ一度お話ししませんか？",
    ).slice(0, 50),
  };
  const cta = String(raw?.cta ?? "保存して、面接の前に見返してね").slice(0, 30);
  let caption = String(raw?.caption ?? "").slice(0, 300);
  for (const tag of ["#ガチキャリAI", "#面接対策"])
    if (!caption.includes(tag)) caption += ` ${tag}`;

  const lines: StudioLine[] = [];
  const roles: RewriteScript["roles"] = [];
  const itemIndex: number[] = [];
  const push = (
    speaker: StudioLine["speaker"],
    text: string,
    role: RewriteScript["roles"][number],
    i = -1,
  ) => {
    lines.push({ speaker, text });
    roles.push(role);
    itemIndex.push(i);
  };
  push("narrator", hook, "hook");
  push("interviewer", topic.q, "question");
  items.forEach((it, i) => {
    // 「①〜」の見出しもナレーターが読み上げる
    if (it.label) push("narrator", `${ITEM_ORDINALS[i]}、${it.label}`, "label", i);
    push("candidate", it.ng, "ng", i);
    push("candidate", it.ok, "ok", i);
    if (it.point) push("interviewer", it.point, "point", i);
  });
  push("narrator", OFFER_NARRATION, "offer");
  push("interviewer", cta, "cta");

  return {
    format: "rewrite",
    theme: `rewrite:${topic.key}`,
    themeLabel: "言い換え型",
    // 見出しはAIに任せず形を固定する（言葉の崩れを防ぐ）
    title: `「${topic.short}」と聞かれた時の最高な答え方`,
    hook,
    question: topic.q,
    items,
    offer,
    cta,
    caption,
    lines,
    roles,
    itemIndex,
  };
}

// ---- 広告（決まった台本。AIで台本を作らないので、毎回同じ内容になる） ----

export type AdRole = "hook" | "ask" | "score" | "eval" | "delivery" | "offer" | "cta";

export type AdPlatform = "tiktok" | "instagram";

export type AdScript = {
  format: "ad";
  platform: AdPlatform;
  /** TikTok・リールは 9:16、Instagram のフィード・広告は 4:5 */
  aspect: "9x16" | "4x5";
  theme: "ad";
  themeLabel: string;
  title: string;
  caption: string;
  lines: StudioLine[];
  roles: AdRole[];
};

export function adScript(platform: AdPlatform = "tiktok"): AdScript {
  const parts: [StudioLine["speaker"], string, AdRole][] = [
    ["narrator", "面接、ぶっつけ本番で行くの？", "hook"],
    ["interviewer", "では、あなたの強みを教えてください。", "ask"],
    ["narrator", "話すだけで、AIの面接官が本番さながらに採点。", "score"],
    ["narrator", "あなたの発言を根拠に、強みと直し方まで分かる。", "eval"],
    ["narrator", "間の取り方、声の強弱、目線までチェック。", "delivery"],
    ["narrator", "評価が上がれば、企業から面談の申し込みも。", "offer"],
    ["narrator", "ガチキャリAI。まずは無料で練習しよう。", "cta"],
  ];
  const instagram = platform === "instagram";
  return {
    format: "ad",
    platform,
    aspect: instagram ? "4x5" : "9x16",
    theme: "ad",
    themeLabel: instagram ? "広告（Instagram 4:5）" : "広告（TikTok 9:16）",
    title: "ガチキャリAI｜AIの面接官と本番さながらに練習",
    // Instagram は検索で探す人が多いので、本文にも言葉を入れ、ハッシュタグは5個までにする
    caption: instagram
      ? "面接、ぶっつけ本番で行く？\nAI面接で面接対策。自己PRや志望動機の答え方を、AIの面接官が点数で採点。話し方・間・目線までチェックできます。\n無料で練習できます👉プロフィールのリンクから\n#面接対策 #AI面接 #就活 #転職 #ガチキャリAI"
      : "面接、ぶっつけ本番で行く？AIの面接官と練習して、点数・話し方・目線までチェック。無料で練習できます👉プロフィールのリンクから #ガチキャリAI #面接対策 #就活 #転職 #AI面接",
    lines: parts.map(([speaker, text]) => ({ speaker, text })),
    roles: parts.map(([, , role]) => role),
  };
}
