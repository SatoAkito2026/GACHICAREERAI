/**
 * 提携先（POSPOS）のお店の、アルバイト・キャストの応募者向け AI 一次面接（サーバー専用）。
 *
 * ガチキャリAI の練習・企業の AI 面接・人材プロフィールとは完全に別物：
 * - 表は partner_interviews だけ（candidate_profiles・7つの力の評価・人材の公開・課金には一切つながない）
 * - 応募者は会員登録なしで URL を開くだけ。評価・点数は応募者に見せない
 * - AI の呼び出しは「会話の受け答え」と「終わったあとのまとめ1回」だけ（原価をおさえる）
 * - 録画（はじめの60秒）と顔の写真3枚は非公開バケット partner-interviews に置き、お店には期限つき URL だけ渡す
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
/** 面接の長さ：この分数で締めてもらい、+3分で AI を呼ばずに終える */
export const PARTNER_MAX_MINUTES = 15;
/** 始めてからこの分数たっても終わっていない面接は「途中でやめた」扱い */
const PARTNER_STALE_MINUTES = 40;
/** 1回の面接で受け付ける答えの数の上限（AI の使いすぎを防ぐ） */
export const PARTNER_MAX_ANSWERS = 40;
/** 写真の枚数（はじめ・まん中・おわり） */
export const PARTNER_PHOTO_COUNT = 3;
/** 録画の長さ（秒） */
export const PARTNER_VIDEO_SECONDS = 60;

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

/** 職種ごとに必ず聞く質問（お店が質問を入れていなくても面接になるように） */
const COMMON_QUESTIONS = [
  "簡単な自己紹介",
  "週に何日くらい、どの曜日・時間帯に入れるか",
  "いつから働けるか",
  "お店までの通勤の方法",
  "これまでの仕事・アルバイトの経験",
];
const JOB_QUESTIONS: Record<PartnerJobType, string[]> = {
  cast: [
    "接客の経験",
    "お酒は飲めるか（飲めなくても大丈夫な聞き方で）",
    "お客さまと話すときに気をつけていること",
    "働くうえでの目標（稼ぎたい額など）",
  ],
  host: [
    "接客の経験",
    "お酒は飲めるか（飲めなくても大丈夫な聞き方で）",
    "お客さまと話すときに気をつけていること",
    "働くうえでの目標（稼ぎたい額など）",
  ],
  staff: ["夜おそくまで働けるか", "体力を使う仕事は大丈夫か", "接客・お店の運営の経験"],
  driver: ["運転免許の種類と運転歴", "夜おそくまで働けるか", "道に詳しい地域"],
  hall: ["飲食の接客の経験", "忙しいときにどう動くか"],
  kitchen: ["調理の経験", "得意な料理・作業"],
  manager: ["人をまとめた経験", "売上やシフトを管理した経験"],
  other: [],
};

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
export function partnerGreeting(row: Pick<PartnerInterviewRow, "store_name" | "job_type">): string {
  return `こんにちは。${row.store_name}の、${JOB_LABELS[row.job_type]}の面接を担当するAIです。今日はよろしくお願いします。リラックスして、思ったとおりに話してくださいね。それでは、まず簡単に自己紹介をお願いします。`;
}

/** 面接の終わりに AI が必ず言う言葉（これで終わりを判定する） */
const END_PHRASE = "面接は以上です";

export function partnerSystemPrompt(row: PartnerInterviewRow, elapsedMin: number): string {
  const jobQs = [...COMMON_QUESTIONS, ...JOB_QUESTIONS[row.job_type]];
  const custom = (row.custom_questions ?? []).filter((q) => q.trim());
  const place =
    row.business_type === "night" ? "夜のお店（キャバクラ・ラウンジ・バーなど）" : "飲食店";
  let prompt = `あなたは「${row.store_name}」（${place}）の、${JOB_LABELS[row.job_type]}の応募者に一次面接をするAIの面接官です。
オンラインで、応募者と1対1で話しています。やさしく、話しやすい雰囲気で進めてください。

【順番】
1. あいさつ（もう済んでいます。最初の質問「自己紹介」から続けてください）
2. 職種の質問（下の「必ず聞く質問」を、すべて1つずつ聞く）
3. お店からの質問（下の「お店からの質問」があれば、すべて聞く）
4. 「最後に、何か聞きたいことはありますか？」と聞く
5. 終わりのあいさつ：「${END_PHRASE}。おつかれさまでした。お店の担当者からの連絡をお待ちください。」と言う（この文を必ずそのまま入れる）

【必ず聞く質問】
${jobQs.map((q, i) => `${i + 1}. ${q}`).join("\n")}
${custom.length ? `\n【お店からの質問（すべて聞く）】\n${custom.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n` : ""}
【話し方のルール】
- 1回の返事は短く（1〜2文）。相づちを打ってから、次の質問を1つだけ聞く
- 返事がとても短いときだけ、軽く1つ聞き直してよい。深掘り・圧迫はしない
- すでに答えてもらったことは聞かない
- 全体で10〜15分ほどで終わるようにする

【絶対に言わない・聞かないこと】
- 合否・評価・感想（「いいですね」程度の相づちはよいが、点数や合否につながることは言わない）
- 給料・時給・待遇の約束、お店の内部のこと
- 年齢・生年月日・性別・家族・結婚・恋人の有無・出身地・本籍・住んでいる場所の詳しいこと・宗教・支持政党・健康・病気・持病・身長体重など、採用の判断に使ってはいけないこと
- 応募者からお店のこと（給料・時間・待遇など）を聞かれたら、「お店の担当者から改めてお伝えします」とだけ答えて、次へ進む

日本語で話してください。`;
  if (elapsedMin >= PARTNER_MAX_MINUTES) {
    prompt += `\n\n【重要】時間になりました。今回の返事で、答えにひとことお礼を言ってから、終わりのあいさつ（「${END_PHRASE}。おつかれさまでした。お店の担当者からの連絡をお待ちください。」）を言って締めてください。新しい質問はしないでください。`;
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
  const answered = row.transcript.some((l) => l.role === "candidate" && l.text.trim());
  if (!answered)
    return { impression: "応募者の回答はありませんでした。", notes: "", availability: "" };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const convo = row.transcript
    .map((l) => `${l.role === "interviewer" ? "面接官" : "応募者"}：${l.text}`)
    .join("\n");
  const prompt = `次は、${row.store_name}の${JOB_LABELS[row.job_type]}の応募者とAI面接官の一次面接の会話です（応募者の発言は音声の書き起こし）。
お店の採用担当者が、面接を見る前にざっと読むための「雰囲気のまとめ」を作ってください。

【ルール】
- 点数・合否・ランクはつけない。やさしい言葉で、事実に近い書き方にする
- 本人が話していないことは書かない（推測しない）
- 年齢・性別・見た目・顔立ちのよしあしは書かない
- impression：話し方・受け答え・印象を3行ほど（改行で区切る）
- notes：気になった点を1行（なければ空の文字）
- availability：入れる日・時間帯・いつから働けるか（本人が話した内容だけ。話していなければ「話していません」）

【会話】
${convo}

次のJSONだけを返してください：
{"impression": "...", "notes": "...", "availability": "..."}`;
  const anthropic = new Anthropic({ apiKey });
  const res = await anthropic.messages.create(
    { model: "claude-sonnet-4-6", max_tokens: 800, messages: [{ role: "user", content: prompt }] },
    { timeout: 40000, maxRetries: 1 },
  );
  const raw = extractJson(lastTextBlock(res.content)) as Partial<PartnerSummary> | null;
  return {
    impression: String(raw?.impression ?? "").slice(0, 600),
    notes: String(raw?.notes ?? "").slice(0, 300),
    availability: String(raw?.availability ?? "").slice(0, 300),
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
