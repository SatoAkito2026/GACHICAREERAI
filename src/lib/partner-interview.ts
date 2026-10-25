/**
 * 提携先（POSPOS）のお店の、アルバイト・キャストの応募者向け AI 一次面接（サーバー専用）。
 *
 * ガチキャリAI の練習・企業の AI 面接・人材プロフィールとは完全に別物：
 * - 表は partner_interviews だけ（candidate_profiles・7つの力の評価・人材の公開・課金には一切つながない）
 * - 応募者は会員登録なしで URL を開くだけ。評価・点数は応募者に見せない
 * - 流れ：短い答えで済む質問は画面で選んでもらう（選ぶ質問・screening）→ AI と2〜3分だけ会話する
 * - AI の呼び出しは「会話の受け答え（3〜5回）」と「終わったあとのまとめ1回」だけ（原価をおさえる）
 * - 会話の録画（はじめから終わりまで・5分まで）と顔の写真3枚は非公開バケット partner-interviews に置き、
 *   お店には期限つき URL だけ渡す
 * - 90日たったら、録画・写真・会話・まとめを自動で消す（毎時の Cron）
 *
 * POSPOS のサーバーからの入口：/api/partner/pospos/interviews（認証は POSPOS_PARTNER_SECRET）
 * 応募者の画面：/partner-interview/<合言葉>（API は /api/partner-interview/*）
 */
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractJson, lastTextBlock } from "@/lib/ai-json";
import { INTERVIEWER_VOICE_STYLE, toSpeechText } from "@/lib/speech-text";

export const PARTNER_BUCKET = "partner-interviews";
/** 面接 URL の有効期限 */
export const PARTNER_EXPIRES_DAYS = 14;
/** 1店あたり、日本時間の1か月で作れる数 */
export const PARTNER_MONTHLY_LIMIT = 100;
/** 録画・写真・会話を残す日数 */
export const PARTNER_RETENTION_DAYS = 90;
/** 会話の長さ：この分数で締めてもらい、+1分で AI を呼ばずに終える */
export const PARTNER_MAX_MINUTES = 4;
/** 始めてからこの分数たっても終わっていない面接は「途中でやめた」扱い */
const PARTNER_STALE_MINUTES = 20;
/** 1回の面接で受け付ける答えの数の上限（AI の使いすぎを防ぐ） */
export const PARTNER_MAX_ANSWERS = 10;
/** 写真の枚数（はじめ・まん中・おわり） */
export const PARTNER_PHOTO_COUNT = 3;
/** 録画の長さの上限（秒）。会話のはじめから終わりまで撮る */
export const PARTNER_VIDEO_SECONDS = 300;

const DAY = 24 * 60 * 60 * 1000;
const JST = 9 * 60 * 60 * 1000;

export const PARTNER_JOB_TYPES = [
  "cast",
  "host",
  "staff",
  "driver",
  "hall",
  "kitchen",
  "manager",
  "other",
] as const;
export type PartnerJobType = (typeof PARTNER_JOB_TYPES)[number];
export type PartnerBusinessType = "night" | "restaurant";
export type PartnerStatus = "waiting" | "in_progress" | "done" | "expired";
export type TranscriptLine = { role: "interviewer" | "candidate"; text: string };
export type PartnerSummary = { impression: string; notes: string; availability: string };

export type PartnerInterviewRow = {
  id: string;
  partner: string;
  store_id: string;
  store_name: string;
  business_type: PartnerBusinessType;
  job_type: PartnerJobType;
  custom_questions: string[];
  candidate_name: string | null;
  token: string;
  status: PartnerStatus;
  answered_count: number;
  transcript: TranscriptLine[];
  summary: PartnerSummary | null;
  /** 選ぶ質問の答え（[{ key, label, value }]。いくつでも選ぶ質問は「、」でつなぐ） */
  screening: ScreeningAnswer[];
  photo_paths: string[];
  video_path: string | null;
  consent_agreed_at: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  expires_at: string;
  deleted_at: string | null;
  purged_at: string | null;
};

export const JOB_LABELS: Record<PartnerJobType, string> = {
  cast: "キャスト",
  host: "ホスト",
  staff: "黒服・ボーイ",
  driver: "送りのドライバー",
  hall: "ホール",
  kitchen: "キッチン",
  manager: "店長候補",
  other: "スタッフ",
};

// ---- 選ぶ質問（短い答えで済む質問は、声ではなく画面で選んでもらう） ----

export type ScreeningAnswer = { key: string; label: string; value: string };
export type ScreeningQuestion =
  | { key: string; label: string; kind: "one" | "many"; options: string[]; note?: string }
  /** 何時から何時まで（[から, まで] で答える。までは、からより後） */
  | { key: string; label: string; kind: "time"; from: string[]; to: string[] }
  /** チェックしないと進めない確認（夜のお店の18歳以上の確認） */
  | { key: string; label: string; kind: "check"; text: string; savedLabel: string };

/** 時刻の表し方（24時をこえたら「翌1時」）。「ラストまで」は閉店まで */
const LAST = "ラストまで";
function hourLabel(h: number): string {
  return h > 24 ? `翌${h - 24}時` : `${h}時`;
}
function hourRange(from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, i) => hourLabel(from + i));
}
/** 時刻を並べて比べるための数（「翌2時」→ 26、「ラストまで」→ いちばん後） */
function hourValue(label: string): number {
  if (label === LAST) return 99;
  const m = /^(翌)?(\d+)時$/.exec(label);
  return m ? Number(m[2]) + (m[1] ? 24 : 0) : NaN;
}

/**
 * その職種・お店の種類で出す選ぶ質問（この順に画面に出し、この順に保存する）。
 * 年齢・性別・家族・出身地・健康など、採用の判断に使ってはいけないことは入れない
 */
export function screeningQuestions(
  businessType: PartnerBusinessType,
  jobType: PartnerJobType,
): ScreeningQuestion[] {
  const night = businessType === "night";
  const qs: ScreeningQuestion[] = [];
  if (night)
    // 風営法で18歳未満は働けないため、お店に必要な確認。年齢・生年月日そのものは聞かない
    qs.push({
      key: "adult",
      label: "確認",
      kind: "check",
      text: "18歳以上で、高校生ではありません",
      savedLabel: "18歳以上・高校生ではない",
    });
  qs.push(
    {
      key: "days",
      label: "希望の出勤日数",
      kind: "one",
      options: ["週1日", "週2日", "週3日", "週4日", "週5日以上", "まだわからない"],
    },
    {
      key: "weekdays",
      label: "希望の曜日",
      kind: "many",
      options: ["月", "火", "水", "木", "金", "土", "日"],
    },
    {
      key: "hours",
      label: "希望の時間帯",
      kind: "time",
      // 夜のお店：17時〜24時から、21時〜翌5時・ラストまで ／ 飲食店：6時〜22時から、9時〜24時・ラストまで
      from: night ? hourRange(17, 24) : hourRange(6, 22),
      to: night ? [...hourRange(21, 29), LAST] : [...hourRange(9, 24), LAST],
    },
    {
      key: "start",
      label: "希望の勤務開始",
      kind: "one",
      options: ["すぐ", "1週間以内", "1か月以内", "相談したい"],
    },
    {
      key: "commute",
      label: "通勤手段",
      kind: "many",
      options: ["電車", "バス", "車", "バイク", "自転車", "徒歩", ...(night ? ["送りを希望"] : [])],
    },
    {
      key: "commuteTime",
      label: "通勤時間（片道）",
      kind: "one",
      options: ["15分以内", "30分以内", "45分以内", "1時間以内", "1時間以上"],
    },
    { key: "experience", label: "この仕事の経験", kind: "one", options: ["あり", "なし"] },
  );
  if (jobType === "cast" || jobType === "host")
    qs.push({
      key: "alcohol",
      label: "お酒は飲めますか",
      kind: "one",
      options: ["飲める", "少しなら", "飲めない"],
      note: "飲めなくても大丈夫です",
    });
  if (jobType === "staff")
    qs.push({
      key: "late",
      label: "夜おそくまで働けますか",
      kind: "one",
      options: ["閉店まで大丈夫", "終電まで"],
    });
  if (jobType === "driver")
    qs.push(
      {
        key: "license",
        label: "持っている運転免許",
        kind: "many",
        options: ["普通（AT限定）", "普通（MT）", "中型以上", "二種"],
      },
      { key: "car", label: "自分の車はありますか", kind: "one", options: ["ある", "ない"] },
    );
  if (jobType === "kitchen")
    qs.push({
      key: "cooking",
      label: "調理の経験",
      kind: "one",
      options: ["お店で作っていた", "家で作るくらい", "ほとんどない"],
    });
  if (jobType === "manager")
    qs.push({ key: "lead", label: "人をまとめた経験", kind: "one", options: ["ある", "ない"] });
  return qs;
}

/**
 * 画面から送られた答えを確かめて、保存する形にする。
 * その職種・お店の種類の質問だけを受け付け、答えが選べる答えの中にあるかを確かめる（ラベルはサーバーの文を使う）。
 * 足りない・おかしい答えがあれば null
 */
export function validateScreening(
  answers: Record<string, unknown>,
  businessType: PartnerBusinessType,
  jobType: PartnerJobType,
): ScreeningAnswer[] | null {
  const qs = screeningQuestions(businessType, jobType);
  const known = new Set(qs.map((q) => q.key));
  if (Object.keys(answers).some((k) => !known.has(k))) return null;
  const out: ScreeningAnswer[] = [];
  for (const q of qs) {
    const a = answers[q.key];
    if (q.kind === "check") {
      if (a !== true) return null;
      out.push({ key: q.key, label: q.savedLabel, value: "はい" });
    } else if (q.kind === "time") {
      if (!Array.isArray(a) || a.length !== 2) return null;
      const [from, to] = a as unknown[];
      if (typeof from !== "string" || typeof to !== "string") return null;
      if (!q.from.includes(from) || !q.to.includes(to)) return null;
      if (hourValue(to) <= hourValue(from)) return null;
      out.push({ key: q.key, label: q.label, value: `${from}〜${to}` });
    } else if (q.kind === "one") {
      if (typeof a !== "string" || !q.options.includes(a)) return null;
      out.push({ key: q.key, label: q.label, value: a });
    } else {
      if (!Array.isArray(a) || a.length === 0 || a.length > q.options.length) return null;
      if (a.some((v) => typeof v !== "string" || !q.options.includes(v))) return null;
      // 画面の順番にそろえ、重なりを除く
      const picked = q.options.filter((o) => a.includes(o));
      out.push({ key: q.key, label: q.label, value: picked.join("、") });
    }
  }
  return out;
}

/** 希望の日数・曜日・時間帯・勤務開始（選ぶ質問の答えをつないだもの。まとめの availability に入れる） */
export function availabilityText(screening: ScreeningAnswer[]): string {
  const v = (key: string) => screening.find((a) => a.key === key)?.value ?? "";
  const days = v("days");
  return [
    days && (days === "まだわからない" ? "日数はまだわからない" : days),
    v("weekdays"),
    v("hours"),
    v("start"),
  ]
    .filter(Boolean)
    .join("・");
}

/** 時間が一定の比べ方で、POSPOS からの呼び出しかを確かめる（Authorization: Bearer <POSPOS_PARTNER_SECRET>） */
export function verifyPartnerSecret(request: Request): boolean {
  const secret = process.env.POSPOS_PARTNER_SECRET ?? "";
  if (secret.length < 32) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  // 長さが違っても同じだけ比べる（長さの違いで時間が変わらないように）
  const len = Math.max(secret.length, given.length);
  let diff = secret.length ^ given.length;
  for (let i = 0; i < len; i++) {
    diff |= (secret.charCodeAt(i % secret.length) || 0) ^ (given.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** 推測できない長い合言葉（32バイトの乱数を URL で使える文字に） */
export function newPartnerToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function partnerAppUrl(): string {
  return (process.env.APP_URL || "https://gachicareer-ai.akitogroup.jp").replace(/\/$/, "");
}

/** 日本時間の今月のはじめ（UTC の ISO） */
export function jstMonthStartIso(): string {
  const j = new Date(Date.now() + JST);
  return new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), 1) - JST).toISOString();
}

/** 期限切れ・放置を反映した今の状態（DB の status が古いままでも正しく返す） */
export function effectiveStatus(
  row: Pick<PartnerInterviewRow, "status" | "expires_at" | "started_at">,
): PartnerStatus {
  if (row.status === "done" || row.status === "expired") return row.status;
  if (new Date(row.expires_at).getTime() < Date.now()) return "expired";
  if (
    row.status === "in_progress" &&
    row.started_at &&
    Date.now() - new Date(row.started_at).getTime() > PARTNER_STALE_MINUTES * 60 * 1000
  )
    return "expired";
  return row.status;
}

/** 一覧・中身で返す共通の項目 */
export function publicFields(row: PartnerInterviewRow) {
  return {
    interviewId: row.id,
    candidateName: row.candidate_name,
    jobType: row.job_type,
    status: effectiveStatus(row),
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    expiresAt: row.expires_at,
  };
}

/** 最初のあいさつ（決まった文。AI を呼ばない） */
export function partnerGreeting(row: Pick<PartnerInterviewRow, "store_name">): string {
  return `こんにちは。${row.store_name}の面接を担当するAIです。少しだけお話を聞かせてください。まず、かんたんに自己紹介をお願いします。`;
}

/** 面接の終わりに AI が必ず言う言葉（これで終わりを判定する） */
const END_PHRASE = "面接は以上です";

export function partnerSystemPrompt(row: PartnerInterviewRow, elapsedMin: number): string {
  const custom = (row.custom_questions ?? []).filter((q) => q.trim()).slice(0, 3);
  const place =
    row.business_type === "night" ? "夜のお店（キャバクラ・ラウンジ・バーなど）" : "飲食店";
  const steps = [
    "あいさつと自己紹介のお願い（もう済んでいます）",
    "「これまで、どんなお仕事やアルバイトをしてきましたか？」と職歴を聞く（していなければ、そのまま次へ）",
    "「このお仕事をやってみたいと思った理由を教えてください」と聞く",
    "「趣味や、最近はまっていることを教えてください」と聞く",
    ...custom.map((q) => `お店からの質問「${q}」を聞く`),
    `終わりのあいさつ：「${END_PHRASE}。おつかれさまでした。お店の担当者からの連絡をお待ちください。」と言う（この文を必ずそのまま入れる）`,
  ];
  let prompt = `あなたは「${row.store_name}」（${place}）の、${JOB_LABELS[row.job_type]}の応募者と話すAIの面接官です。
オンラインで、応募者と1対1で話しています。全部で2〜3分の短い会話です。やさしく、話しやすい雰囲気で進めてください。
（日数・曜日・時間帯・いつから・通勤・経験・お酒・免許などは、応募者がもう画面で選んで答えています）

【順番（この順に、1つずつ）】
${steps.map((t, i) => `${i + 1}. ${t}`).join("\n")}

【話し方のルール】
- 1回の返事は、相づちのひとことと次の質問だけ（短く）
- 深掘り・聞き直しはしない。答えが聞き取れなかった・空だったときだけ、1回だけ「もう一度お願いします」と言ってよい
- 画面で選んでもらったこと（日数・曜日・時間帯・いつから・通勤・経験・お酒・免許など）は聞かない
- 上の順番にない質問はしない

【絶対に言わない・聞かないこと】
- 合否・評価・感想（点数や合否につながることは言わない）
- 給料・時給・待遇の約束、お店の内部のこと
- 年齢・生年月日・性別・家族・結婚・恋人の有無・出身地・住んでいる場所の詳しいこと・宗教・支持政党・健康・病気・身長体重など、採用の判断に使ってはいけないこと
- 応募者からお店のこと（給料など）を聞かれたら、「お店の担当者から改めてお伝えします」とだけ答えて、次へ進む

日本語で話してください。`;
  if (elapsedMin >= PARTNER_MAX_MINUTES) {
    prompt += `\n\n【重要】時間になりました。今回の返事で、ひとことお礼を言ってから、終わりのあいさつ（「${END_PHRASE}。おつかれさまでした。お店の担当者からの連絡をお待ちください。」）を言って締めてください。新しい質問はしないでください。`;
  }
  return prompt;
}

export function isPartnerEnd(text: string): boolean {
  return text.includes(END_PHRASE) || text.includes("面接を終了");
}

export const PARTNER_TIME_UP_TEXT = `お時間になりましたので、ここまでとさせていただきます。${END_PHRASE}。おつかれさまでした。お店の担当者からの連絡をお待ちください。`;

/** 面接官の声（ガチキャリAI の面接官と同じ声。遅い・失敗したときは速い tts-1 に切り替える） */
export async function partnerSpeak(text: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const speak = async (model: "gpt-4o-mini-tts" | "tts-1", timeoutMs: number) => {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: toSpeechText(text),
        voice: "shimmer",
        ...(model === "gpt-4o-mini-tts" ? { instructions: INTERVIEWER_VOICE_STYLE } : {}),
        response_format: "pcm",
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`tts ${model} ${res.status}`);
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  };
  try {
    return await speak("gpt-4o-mini-tts", 12000);
  } catch (e) {
    console.error("[partner-interview] tts failed, falling back", e);
    try {
      return await speak("tts-1", 10000);
    } catch (e2) {
      console.error("[partner-interview] tts-1 failed", e2);
      return null;
    }
  }
}

/** 会話を、Claude に渡す形にする（最初は user から始める決まりなので「面接開始」を置く） */
export function toClaudeMessages(transcript: TranscriptLine[]) {
  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: "（面接開始）" },
  ];
  for (const line of transcript) {
    const role = line.role === "interviewer" ? "assistant" : "user";
    const last = messages[messages.length - 1];
    if (last.role === role) last.content += `\n${line.text}`;
    else messages.push({ role, content: line.text });
  }
  return messages;
}

/** 雰囲気のまとめを作る（点数はつけない・本人が話したことだけ）。AI を1回だけ呼ぶ */
export async function writePartnerSummary(row: PartnerInterviewRow): Promise<PartnerSummary> {
  // 入れる日・時間帯・いつからは、AI に書かせず、選ぶ質問の答えをそのまま入れる
  const availability = availabilityText(row.screening ?? []);
  const answered = row.transcript.some((l) => l.role === "candidate" && l.text.trim());
  if (!answered) return { impression: "応募者の回答はありませんでした。", notes: "", availability };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const convo = row.transcript
    .map((l) => `${l.role === "interviewer" ? "面接官" : "応募者"}：${l.text}`)
    .join("\n");
  const prompt = `次は、${row.store_name}の${JOB_LABELS[row.job_type]}の応募者とAI面接官の2〜3分の会話です（応募者の発言は音声の書き起こし）。
お店の採用担当者が、録画を見る前にざっと読むための「雰囲気のまとめ」を作ってください。

【ルール】
- 点数・合否・ランクはつけない。やさしい言葉で、事実に近い書き方にする
- 会話の文字から分かることだけを書く。本人が話していないことは書かない（推測しない）
- 見た目（顔・顔立ち・体型・服装など）・年齢・性別については、何も書かない・評価しない（見た目はお店の人が録画と写真で判断する）
- impression：話し方・声の感じ・受け答えの様子を2〜3文で（例：「はきはきと話し、質問にまっすぐ答えていた」「緊張している様子だったが、自分の言葉で理由を話していた」）
- notes：気になった受け答えがあれば1文（なければ空の文字）

【会話】
${convo}

次のJSONだけを返してください：
{"impression": "...", "notes": "..."}`;
  const anthropic = new Anthropic({ apiKey });
  const res = await anthropic.messages.create(
    { model: "claude-sonnet-4-6", max_tokens: 600, messages: [{ role: "user", content: prompt }] },
    { timeout: 40000, maxRetries: 1 },
  );
  const raw = extractJson(lastTextBlock(res.content)) as Partial<PartnerSummary> | null;
  return {
    impression: String(raw?.impression ?? "").slice(0, 600),
    notes: String(raw?.notes ?? "").slice(0, 300),
    availability,
  };
}

/** 録画・写真を Storage から消す */
async function removeMedia(supabase: SupabaseClient, row: PartnerInterviewRow) {
  const paths = [...(row.photo_paths ?? []), ...(row.video_path ? [row.video_path] : [])];
  // アップロード途中で記録されていないファイルも消せるよう、面接のフォルダの中身も消す
  const folder = mediaFolder(row);
  const { data: listed } = await supabase.storage.from(PARTNER_BUCKET).list(folder, { limit: 100 });
  for (const f of listed ?? []) paths.push(`${folder}/${f.name}`);
  const unique = [...new Set(paths)];
  if (unique.length) await supabase.storage.from(PARTNER_BUCKET).remove(unique);
}

/** 中身（録画・写真・会話・まとめ）をすべて消す。行は月の作成数に数えるため残す */
export async function wipePartnerInterview(
  supabase: SupabaseClient,
  row: PartnerInterviewRow,
  reason: "deleted" | "purged",
) {
  await removeMedia(supabase, row);
  const now = new Date().toISOString();
  await supabase
    .from("partner_interviews")
    .update({
      transcript: [],
      summary: null,
      screening: [],
      photo_paths: [],
      video_path: null,
      custom_questions: [],
      candidate_name: reason === "deleted" ? null : row.candidate_name,
      ...(reason === "deleted" ? { deleted_at: now } : { purged_at: now }),
      ...(row.status === "waiting" || row.status === "in_progress" ? { status: "expired" } : {}),
    })
    .eq("id", row.id);
}

/** Storage の中の置き場所（お店の id ごと） */
export function mediaFolder(row: Pick<PartnerInterviewRow, "partner" | "store_id" | "id">) {
  return `${row.partner}/${row.store_id}/${row.id}`;
}

/**
 * 毎時の Cron：
 * - 90日たった面接の中身を消す
 * - 期限切れ・放置された面接を expired にする
 * - 終わったのにまとめがない面接のまとめを作る（応募者が終わりの画面の前に閉じたとき）
 */
export async function runPartnerInterviewJob(): Promise<void> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const { getSupabaseUrl, getServiceRoleKey } = await import("@/lib/api-auth");
    const key = getServiceRoleKey();
    if (!key) return;
    const supabase = createClient(getSupabaseUrl(), key);

    const cutoff = new Date(Date.now() - PARTNER_RETENTION_DAYS * DAY).toISOString();
    const { data: old } = await supabase
      .from("partner_interviews")
      .select("*")
      .lt("created_at", cutoff)
      .is("purged_at", null)
      .is("deleted_at", null)
      .limit(200);
    for (const row of (old ?? []) as PartnerInterviewRow[]) {
      await wipePartnerInterview(supabase, row, "purged");
    }

    const nowIso = new Date().toISOString();
    await supabase
      .from("partner_interviews")
      .update({ status: "expired" })
      .in("status", ["waiting", "in_progress"])
      .lt("expires_at", nowIso);
    await supabase
      .from("partner_interviews")
      .update({ status: "expired" })
      .eq("status", "in_progress")
      .lt("started_at", new Date(Date.now() - PARTNER_STALE_MINUTES * 60 * 1000).toISOString());

    const { data: noSummary } = await supabase
      .from("partner_interviews")
      .select("*")
      .eq("status", "done")
      .is("summary", null)
      .is("deleted_at", null)
      .is("purged_at", null)
      .lt("finished_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .limit(20);
    for (const row of (noSummary ?? []) as PartnerInterviewRow[]) {
      try {
        const summary = await writePartnerSummary(row);
        await supabase.from("partner_interviews").update({ summary }).eq("id", row.id);
      } catch (e) {
        console.error("[partner-interview] summary failed", row.id, e);
      }
    }
  } catch (e) {
    console.error("[partner-interview] job failed", e);
  }
}
