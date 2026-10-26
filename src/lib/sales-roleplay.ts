/**
 * 営業ロープレ（企業の社員研修・サーバー専用）。
 * 社員が AI のお客さん役を相手に、訪問販売・反響営業・テレアポ・法人営業（商談）を声で練習する。
 *
 * - 社員は自分のアカウントで会員登録し、会社の招待コード（companies.sales_join_code）で参加する（sales_memberships）
 * - 会社は資料（トークスクリプト・商品の説明・商談の議事録など）を入れておける（sales_materials）。AI はそれをもとにお客さんを演じ、
 *   先生（助言・評価）はスクリプトの流れと営業の知識（sales-knowledge.ts）を基準にする
 * - 進め方は「まずいところで止めて助言（coach）」か「最後までやる（full）」。助言のときは、まずい一言を言い直してもらう
 * - 終わったら営業用の評価（6つの観点を1〜5・根拠は本人の発言の引用・よかった点・直す点と言い換え例）
 * - 面接の練習・人材プロフィールとは別物（7つの力・人材検索にはつながない）。料金は当面なし（回数の上限だけ）
 */
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractJson, lastTextBlock } from "@/lib/ai-json";
import { quoteAppearsIn } from "@/lib/talent";
import { toSpeechText } from "@/lib/speech-text";
import { customerHints } from "@/lib/sales-knowledge";

export type SalesScenario = "door" | "inbound" | "teleapo" | "b2b";
export type SalesDifficulty = "easy" | "normal" | "hard";
export type SalesCoachMode = "coach" | "full";
export type SalesLine = {
  role: "seller" | "customer" | "coach";
  text: string;
  /** 助言を受けて言い直した、前の一言（お客さんには聞こえなかったことにする） */
  retracted?: boolean;
};
export type SalesPersona = {
  name: string;
  /** 立場・状況（例：共働きで小学生の子どもがいる、物流会社の総務課長） */
  profile: string;
  /** 本音・気にしていること（お客さん役だけが知っている） */
  concern: string;
  gender: "male" | "female";
};

/** 1人あたり1日にできる回数・1社あたり1か月にできる回数（当面は無料なので、使いすぎを防ぐ） */
export const SALES_PER_USER_DAY = 10;
export const SALES_PER_COMPANY_MONTH = 100;
/** 1回のロープレの上限（社員の発言の回数・分） */
export const SALES_MAX_TURNS = 40;
export const SALES_MAX_MINUTES = 20;
/** 資料をAIに渡すときの文字数の上限 */
const MATERIALS_MAX_CHARS = 20000;
const SCRIPT_MAX_CHARS = 12000;

export const SCENARIOS: Record<
  SalesScenario,
  { label: string; desc: string; goal: string; setting: string; opener: string; phone: boolean }
> = {
  door: {
    label: "訪問販売",
    desc: "アポなしでお宅を訪問。インターホン越しに話を聞いてもらうところから",
    goal: "話を聞いてもらい、商品のよさを伝えて、契約か次の約束（説明の続き・見積もり）をもらう",
    setting:
      "あなたは自宅にいるところに、知らない営業の人がアポなしで訪ねてきた。インターホン越しに対応している（話が進めば玄関先で話してもよい）",
    opener: "はい……どちらさまですか？",
    phone: false,
  },
  inbound: {
    label: "反響営業",
    desc: "資料請求・問い合わせをしたお客さんに電話。ニーズを聞いて提案する",
    goal: "困りごとや希望を聞き出し、合う提案をして、申し込みか次の商談の約束をもらう",
    setting:
      "あなたは少し前に、この会社の商品の資料請求（問い合わせ）をした。今その会社から電話がかかってきた。興味はあるが、まだ決めていない",
    opener: "はい、もしもし。",
    phone: true,
  },
  teleapo: {
    label: "テレアポ",
    desc: "面識のない会社に電話して、担当者との面談の約束（アポ）をとる",
    goal: "受付や担当者に切られずに話を聞いてもらい、面談・説明の日時の約束をもらう",
    setting:
      "あなたは会社の電話に出た。かけてきたのは知らない会社の営業。忙しい時間帯で、営業の電話は基本的に断るようにしている",
    opener: "はい、お電話ありがとうございます。",
    phone: true,
  },
  b2b: {
    label: "法人営業（商談）",
    desc: "会社の担当者と商談。課題を聞いて提案し、次のステップを決める",
    goal: "相手の会社の課題・決め方（誰が・いつまでに・予算）を聞き出し、合う提案をして、次のステップ（見積もり・上の人との打ち合わせ・試用）を決める",
    setting:
      "あなたは会社の担当者として、この営業の人と商談の場にいる（約束済み）。課題はあるが、ほかの会社とも比べていて、上の人の承認も必要",
    opener: "本日はお時間ありがとうございます。よろしくお願いします。",
    phone: false,
  },
};

export const DIFFICULTIES: Record<
  SalesDifficulty,
  { label: string; desc: string; prompt: string }
> = {
  easy: {
    label: "やさしい",
    desc: "話を聞いてくれるお客さん",
    prompt:
      "比較的、話を聞いてくれるお客さん。ただし理由なく買う・約束するのではなく、納得できる説明があれば前向きになる",
  },
  normal: {
    label: "ふつう",
    desc: "よくある断り文句を言うお客さん",
    prompt:
      "ふつうのお客さん。「今は大丈夫です」「高い」「考えます」など、よくある断り文句を自然に言う。営業の対応がよければ少しずつ心を開く",
  },
  hard: {
    label: "手ごわい",
    desc: "忙しい・疑い深い・すぐ切ろうとする",
    prompt:
      "手ごわいお客さん。忙しく、疑い深く、すぐに話を終わらせようとする。押しが強い・自分の話ばかり・質問に答えないなどがあると、はっきり断る。それでも、相手のことを考えた的確な対応には少しだけ耳を傾ける",
  },
};

/** 評価の観点（6つ・1〜5） */
export const SALES_SKILLS = [
  { key: "opening", label: "つかみ・第一印象" },
  { key: "hearing", label: "ヒアリング" },
  { key: "proposal", label: "提案・説明" },
  { key: "objection", label: "切り返し（断り文句への対応）" },
  { key: "closing", label: "クロージング" },
  { key: "manner", label: "話し方・言葉づかい" },
] as const;

export type SalesEvaluation = {
  /** 6つの観点の平均（1〜5、小数1けた） */
  average: number;
  skills: { key: string; label: string; score: number; comment: string; quote: string | null }[];
  good: string[];
  improvements: { point: string; example: string }[];
  summary: string;
  outcome: string;
};

// ---- お客さんの設定（AI を呼ばずに決める） ----

const PERSONAS: Record<SalesScenario, Omit<SalesPersona, "name">[]> = {
  door: [
    {
      profile: "共働きで、小学生の子どもが2人いる。平日の夕方で家事に追われている",
      concern: "お金のむだづかいはしたくない。家族に相談しないと決められない",
      gender: "female",
    },
    {
      profile: "在宅で仕事をしている会社員。仕事の合間に出てきた",
      concern: "時間をとられたくない。しつこい営業が苦手",
      gender: "male",
    },
    {
      profile: "定年退職して夫婦で暮らしている。時間はある",
      concern: "だまされないか心配。子どもに「訪問販売には気をつけて」と言われている",
      gender: "male",
    },
    {
      profile: "一人暮らしの若い社会人。休日で家にいた",
      concern: "毎月の支払いが増えるのは困る。必要性がよく分からない",
      gender: "female",
    },
  ],
  inbound: [
    {
      profile: "子育て中の会社員。ネットで見て、なんとなく資料請求した",
      concern: "本当に自分に合うのか、ほかの会社と比べてどうなのかが気になる",
      gender: "female",
    },
    {
      profile: "小さなお店を経営している。仕事の合間に電話に出た",
      concern: "費用に見合う効果があるか。手間が増えないか",
      gender: "male",
    },
    {
      profile: "引っ越しを考えている夫婦の夫。週末に資料をまとめて請求した",
      concern: "決めるのは妻と相談してから。予算はあまり多くない",
      gender: "male",
    },
  ],
  teleapo: [
    {
      profile: "中小企業の総務部の担当者。営業の電話はよくかかってくる",
      concern: "上司から「営業の電話はつながなくていい」と言われている",
      gender: "female",
    },
    {
      profile: "製造業の会社の部長。会議の合間に電話に出た",
      concern: "今のやり方に大きな不満はない。忙しい",
      gender: "male",
    },
    {
      profile: "IT企業の受付兼アシスタント。担当者につなぐかどうかを判断する",
      concern: "用件がはっきりしない電話はつながない",
      gender: "female",
    },
  ],
  b2b: [
    {
      profile: "物流会社の総務課長。紙とエクセルでの管理に限界を感じている",
      concern: "導入の手間と社内の反発。最終的には部長の承認が必要",
      gender: "male",
    },
    {
      profile: "飲食チェーンの本部の店舗運営担当。人手不足が課題",
      concern: "現場が使いこなせるか。費用対効果をどう上に説明するか",
      gender: "female",
    },
    {
      profile: "従業員100人ほどの会社の人事部長。採用と定着に悩んでいる",
      concern: "すでに他社のサービスも検討中。今期の予算に入るか",
      gender: "male",
    },
  ],
};
const NAMES = {
  male: ["田中", "佐藤", "鈴木", "高橋", "伊藤", "渡辺", "山本", "中村"],
  female: ["小林", "加藤", "吉田", "山田", "佐々木", "松本", "井上", "木村"],
};

export function makePersona(scenario: SalesScenario): SalesPersona {
  const list = PERSONAS[scenario];
  const p = list[Math.floor(Math.random() * list.length)];
  const names = NAMES[p.gender];
  return { ...p, name: names[Math.floor(Math.random() * names.length)] };
}

// ---- 会社・社員 ----

/** 企業アカウントなら、その会社の id と名前（招待コードも）を返す */
export async function getSalesCompany(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ id: string; name: string; joinCode: string | null } | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_mode, company_id")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.user_mode !== "business_company" || !profile.company_id) return null;
  const { data: c } = await supabase
    .from("companies")
    .select("id, name, sales_join_code")
    .eq("id", profile.company_id)
    .maybeSingle();
  return c ? { id: c.id, name: c.name, joinCode: c.sales_join_code ?? null } : null;
}

// 読み間違えやすい文字（0/O, 1/I/L）は使わない
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export async function issueSalesJoinCode(
  supabase: SupabaseClient,
  companyId: string,
): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(7));
    const code = Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
    const { error } = await supabase
      .from("companies")
      .update({ sales_join_code: code })
      .eq("id", companyId);
    if (!error) return code;
  }
  throw new Error("could not issue join code");
}

/** 1社あたりの資料の数の上限（運営の会社は上限なし） */
export const SALES_MATERIALS_MAX = 30;

/**
 * 運営（profiles.is_admin）が使うときは上限なし：本人が運営、または会社に運営のアカウントがある
 * （回数・資料の数・AIに渡す資料の量）
 */
export async function isSalesUnlimited(
  supabase: SupabaseClient,
  args: { userId?: string; companyId: string },
): Promise<boolean> {
  if (args.userId) {
    const { data } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", args.userId)
      .maybeSingle();
    if ((data as { is_admin?: boolean } | null)?.is_admin) return true;
  }
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("company_id", args.companyId)
    .eq("is_admin", true)
    .limit(1);
  return (data ?? []).length > 0;
}

/** 社員が参加している会社（1社だけ） */
export async function getSalesMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ companyId: string; companyName: string; displayName: string } | null> {
  const { data } = await supabase
    .from("sales_memberships")
    .select("company_id, display_name, companies(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const company = (data as unknown as { companies?: { name?: string } | null }).companies;
  return {
    companyId: data.company_id,
    companyName: company?.name ?? "（会社名未登録）",
    displayName: data.display_name,
  };
}

export type SalesMaterials = {
  /** トークスクリプト（先生がこの流れを基準に助言・評価する） */
  script: string;
  /** 商品・料金・議事録など */
  info: string;
};

/** 会社の資料（この場面用＋すべての場面用）。スクリプトとそれ以外に分け、それぞれ上限まで */
export async function loadMaterials(
  supabase: SupabaseClient,
  companyId: string,
  scenario: SalesScenario,
  unlimited = false,
): Promise<SalesMaterials> {
  // 運営の会社は資料を多く使えるようにする（AI に渡す量を増やす。キャッシュで使い回すので2回目からは安い）
  const infoMax = unlimited ? 150000 : MATERIALS_MAX_CHARS;
  const scriptMax = unlimited ? 60000 : SCRIPT_MAX_CHARS;
  const { data } = await supabase
    .from("sales_materials")
    .select("kind, scenario, title, content")
    .eq("company_id", companyId)
    .in("scenario", ["all", scenario])
    .order("created_at", { ascending: false })
    .limit(unlimited ? 500 : SALES_MATERIALS_MAX);
  const join = (rows: { title: string; content: string }[], max: number) => {
    let out = "";
    for (const m of rows) {
      const block = `■ ${m.title}\n${m.content}\n\n`;
      if (out.length + block.length > max) {
        out += block.slice(0, Math.max(0, max - out.length));
        break;
      }
      out += block;
    }
    return out.trim();
  };
  const rows = data ?? [];
  // この場面専用のものを先に
  const order = (a: { scenario: string }, b: { scenario: string }) =>
    (a.scenario === scenario ? 0 : 1) - (b.scenario === scenario ? 0 : 1);
  return {
    script: join(rows.filter((r) => r.kind === "script").sort(order), scriptMax),
    info: join(rows.filter((r) => r.kind !== "script").sort(order), infoMax),
  };
}

// ---- お客さん役の AI ----

const END_MARK = "【終了】";

function customerPrompt(args: {
  scenario: SalesScenario;
  difficulty: SalesDifficulty;
  coachMode: SalesCoachMode;
  persona: SalesPersona;
  companyName: string;
  materials: SalesMaterials;
  knowledge: string;
}): string {
  const s = SCENARIOS[args.scenario];
  const d = DIFFICULTIES[args.difficulty];
  const p = args.persona;
  return `あなたは営業ロープレ（研修）で「お客さん役」を演じるAIです。相手は「${args.companyName}」の社員で、営業の練習をしています。

【場面】${s.label}：${s.setting}
【あなた（お客さん）】${p.name}さん。${p.profile}
【本音・気にしていること（自分からは言わない。うまく聞かれたら少しずつ話す）】${p.concern}
【手ごわさ】${d.label}：${d.prompt}
【営業の人の目標（あなたは知らないふりをする）】${s.goal}

【営業の人が売っている商品・サービスの資料】
${args.materials.info || "（資料はありません。営業の人の説明だけを聞いて判断してください。商品の中身を自分から作り話しない）"}

【この場面でお客さんがよく言う断り文句（自然な流れで、手ごわさに合わせて使う）】
${customerHints(args.scenario)}

【演じ方のルール】
- 本物のお客さんとして、自然な話し言葉で、短く（1〜3文）答える。${s.phone ? "電話なので、相手の顔は見えない。" : ""}
- 営業の人の質問に答えるが、聞かれていない本音は言わない。説明がよく分からなければ、聞き返したり疑問を言ったりする
- 押しつけ・長すぎる説明・こちらの話を聞かないなどがあれば、気持ちが離れて断りに向かう。よい質問や共感があれば、少しずつ前向きになる
- 簡単には決めない。決めるときは、納得できる理由があったとき
- 研修だとは言わない。AI であることも言わない。お客さんとして話し続ける
- 会話が自然に終わるとき（契約・約束をした／はっきり断って電話を切る・ドアを閉める／時間切れ）は、最後のせりふのあとに「${END_MARK}」と書く
${
  args.coachMode === "coach"
    ? `【研修の先生としての役目（助言）】
営業の人の今の一言が、このままだと商談がだめになりそうな、はっきりしたまずさのとき（例：いきなり売り込む・失礼・相手の話を無視・うそや強引な約束・断られたのに押し続ける）だけ、お客さんとしての返事のかわりに、研修の先生として短い助言を出す。
- 助言は1〜2文で、何がまずいか＋どう言えばよいかの例（「〜のように言い直してみましょう」）
- 助言は次の「営業の知識」と、会社のトークスクリプト（あれば）を基準にする。スクリプトの大事な流れ（名乗り・質問・切り返しなど）から大きく外れてまずいときは、スクリプトの言い方を例に出す
- 細かいことでは止めない。助言は1回のロープレで3回まで（残りの回数は最後に書く）

【営業の知識（先生として使う。お客さんとしては知らないふりをする）】
${args.knowledge}

【会社のトークスクリプト】
${args.materials.script || "（なし）"}
`
    : ""
}
【返し方】次のJSONだけを返す：
{"coach": null または "助言の文", "reply": "お客さんとしてのせりふ（助言を出すときは空の文字）", "outcome": null または "結果（例：アポ獲得／契約／次回また説明／検討すると言われた／断られた）"}
outcome は会話が終わるとき（${END_MARK} を書くとき）だけ入れる。`;
}

/** その回だけ変わる指示（助言の残り・時間切れ） */
function turnNotes(coachMode: SalesCoachMode, coachUsed: number, elapsedMin: number): string {
  const notes: string[] = [];
  if (coachMode === "coach")
    notes.push(
      coachUsed >= 3
        ? "【助言の残り】0回。もう助言は出さず、お客さんとして返す（coach は null）"
        : `【助言の残り】あと${3 - coachUsed}回`,
    );
  if (elapsedMin >= SALES_MAX_MINUTES - 2)
    notes.push(
      `【重要】時間がないので、今回の返事で話を終わらせる（決める・断る・あとで連絡する など）。最後に「${END_MARK}」と書く`,
    );
  return notes.join("\n") || "（追加の指示なし）";
}

/** 最後の発言に使い回しの印をつける（次の回は、ここまでの会話を安く読める） */
function withHistoryCache(
  messages: { role: "user" | "assistant"; content: string }[],
): Anthropic.MessageParam[] {
  return messages.map((m, i) =>
    i === messages.length - 1
      ? {
          role: m.role,
          content: [{ type: "text", text: m.content, cache_control: { type: "ephemeral" } }],
        }
      : m,
  );
}

function toClaudeMessages(opener: string, transcript: SalesLine[]) {
  // お客さんが最初に話す（営業の人が訪ねてきた・電話をかけた）ので、その前に合図を置く
  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: "（ロープレ開始。お客さんとして最初のひとことを言ってください）" },
    { role: "assistant", content: JSON.stringify({ coach: null, reply: opener, outcome: null }) },
  ];
  for (const line of transcript.slice(1)) {
    if (line.role === "coach" || line.retracted) continue;
    if (line.role === "seller") {
      const last = messages[messages.length - 1];
      if (last.role === "user") last.content += `\n${line.text}`;
      else messages.push({ role: "user", content: line.text });
    } else {
      messages.push({
        role: "assistant",
        content: JSON.stringify({ coach: null, reply: line.text, outcome: null }),
      });
    }
  }
  return messages;
}

export async function customerTurn(args: {
  scenario: SalesScenario;
  difficulty: SalesDifficulty;
  coachMode: SalesCoachMode;
  persona: SalesPersona;
  companyName: string;
  materials: SalesMaterials;
  knowledge: string;
  transcript: SalesLine[];
  elapsedMin: number;
}): Promise<{ reply: string; coach: string | null; ended: boolean; outcome: string | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const coachUsed = args.transcript.filter((l) => l.role === "coach").length;
  const anthropic = new Anthropic({ apiKey });
  const res = await anthropic.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      // 資料・知識・スクリプトの入った長い指示は毎回同じなので、使い回し（キャッシュ）にする。
      // 回数・時間で変わるところだけを後ろの別の段に置く。会話の履歴も、前回までの分を使い回す
      system: [
        { type: "text", text: customerPrompt(args), cache_control: { type: "ephemeral" } },
        { type: "text", text: turnNotes(args.coachMode, coachUsed, args.elapsedMin) },
      ],
      messages: withHistoryCache(
        toClaudeMessages(SCENARIOS[args.scenario].opener, args.transcript),
      ),
    },
    { timeout: 25000, maxRetries: 1 },
  );
  const text = lastTextBlock(res.content);
  let raw: { coach?: unknown; reply?: unknown; outcome?: unknown } | null = null;
  try {
    raw = extractJson(text);
  } catch {
    raw = { reply: text };
  }
  const coachAllowed = args.coachMode === "coach" && coachUsed < 3;
  const coach =
    coachAllowed && typeof raw?.coach === "string" && raw.coach.trim()
      ? raw.coach.trim().slice(0, 300)
      : null;
  let reply = typeof raw?.reply === "string" ? raw.reply : "";
  const ended = reply.includes(END_MARK) || text.includes(END_MARK);
  reply = reply.replace(END_MARK, "").trim().slice(0, 400);
  if (!coach && !reply) reply = "……はい。";
  const outcome =
    ended && typeof raw?.outcome === "string" && raw.outcome.trim()
      ? raw.outcome.trim().slice(0, 40)
      : ended
        ? "話が終わった"
        : null;
  return { reply, coach, ended: ended && !coach, outcome };
}

/** お客さんの声（男女で声を変える。手ごわいほど素っ気なく） */
export async function customerSpeak(
  text: string,
  persona: SalesPersona,
  difficulty: SalesDifficulty,
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !text) return null;
  const voice = persona.gender === "male" ? "ash" : "coral";
  const mood =
    difficulty === "hard"
      ? "忙しくて少し面倒くさそうな、素っ気ない話し方"
      : difficulty === "easy"
        ? "おだやかで、話を聞いてくれる話し方"
        : "ふつうの、少し警戒している話し方";
  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        input: toSpeechText(text),
        voice,
        instructions: `日本人のお客さん。自然な日本語の話し言葉で、${mood}。`,
        response_format: "pcm",
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch (e) {
    console.error("[sales] tts failed", e);
    return null;
  }
}

// ---- 評価 ----

export async function evaluateRoleplay(args: {
  scenario: SalesScenario;
  difficulty: SalesDifficulty;
  persona: SalesPersona;
  companyName: string;
  materials: SalesMaterials;
  knowledge: string;
  transcript: SalesLine[];
  outcome: string | null;
}): Promise<SalesEvaluation> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const s = SCENARIOS[args.scenario];
  const said = args.transcript
    .filter((l) => l.role === "seller")
    .map((l) => l.text)
    .join("\n");
  const convo = args.transcript
    .map((l) =>
      l.role === "coach"
        ? `（先生の助言：${l.text}）`
        : `${l.role === "seller" ? "営業" : "お客さん"}${l.retracted ? "（助言を受けて言い直す前）" : ""}：${l.text}`,
    )
    .join("\n");
  const prompt = `あなたは営業研修のトレーナーです。次の営業ロープレを評価してください（営業の発言は音声の書き起こし）。

【場面】${s.label}（目標：${s.goal}）
【お客さん】${args.persona.name}さん。${args.persona.profile}（本音：${args.persona.concern}）／手ごわさ：${DIFFICULTIES[args.difficulty].label}
【会社のトークスクリプト（あれば、この流れに沿えているかも見る）】
${args.materials.script || "（なし）"}

【会社の資料（商品・料金・議事録など。説明が正しいかの参考にする）】
${args.materials.info ? args.materials.info.slice(0, 8000) : "（なし）"}

【営業の知識（評価の基準にする）】
${args.knowledge}

【会話】
${convo}

【評価のしかた】
- 観点ごとに1〜5（5がとてもよい）。根拠として、営業の発言をそのまま短く引用する（quote）。引用できる発言がない観点は quote を null にし、点数は低めにする
- 観点：${SALES_SKILLS.map((k) => `${k.key}=${k.label}`).join("、")}
- 手ごわさも考えて、公平に。うそ・強引な約束・失礼な言い方・法律に反するやり方（名乗らない・断られたのに勧誘を続ける等）は厳しく見る
- スクリプトがあるときは、スクリプトの流れ・言い回しをうまく使えたかもコメントに入れる
- improvements の example は、営業の知識やスクリプトにそった、そのまま使える言い方にする
- good：よかった点を2〜3個（具体的に）
- improvements：直す点を2〜3個。それぞれ、そのときに言えばよかった言い方の例（example）をつける
- summary：全体のひとこと（2文以内）
- outcome：お客さんが最後にどうなったか（例：アポ獲得／契約／次回また説明／検討すると言われた／断られた／途中で終わった）

次のJSONだけを返してください：
{"skills": [{"key": "opening", "score": 3, "comment": "1文", "quote": "引用 または null"}, …], "good": ["…"], "improvements": [{"point": "…", "example": "…"}], "summary": "…", "outcome": "…"}`;
  const anthropic = new Anthropic({ apiKey });
  const res = await anthropic.messages.create(
    { model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: prompt }] },
    { timeout: 60000, maxRetries: 1 },
  );
  let raw: {
    skills?: { key?: unknown; score?: unknown; comment?: unknown; quote?: unknown }[];
    good?: unknown[];
    improvements?: { point?: unknown; example?: unknown }[];
    summary?: unknown;
    outcome?: unknown;
  } | null = null;
  try {
    raw = extractJson(lastTextBlock(res.content));
  } catch {
    raw = null;
  }
  const skills = SALES_SKILLS.map((k) => {
    const f = (raw?.skills ?? []).find((x) => x?.key === k.key);
    const n = Math.round(Number(f?.score));
    let quote =
      typeof f?.quote === "string" && f.quote.trim() ? f.quote.trim().slice(0, 120) : null;
    // 引用が本人の発言に実際にないものは使わない（根拠のない評価をしない）
    if (quote && !quoteAppearsIn(quote, said)) quote = null;
    return {
      key: k.key,
      label: k.label,
      score: Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 1,
      comment: String(f?.comment ?? "").slice(0, 200),
      quote,
    };
  });
  const average = Math.round((skills.reduce((a, b) => a + b.score, 0) / skills.length) * 10) / 10;
  return {
    average,
    skills,
    good: (Array.isArray(raw?.good) ? raw.good : [])
      .map((g) => String(g).slice(0, 200))
      .filter(Boolean)
      .slice(0, 3),
    improvements: (Array.isArray(raw?.improvements) ? raw.improvements : [])
      .map((i) => ({
        point: String(i?.point ?? "").slice(0, 200),
        example: String(i?.example ?? "").slice(0, 300),
      }))
      .filter((i) => i.point)
      .slice(0, 3),
    summary: String(raw?.summary ?? "").slice(0, 300),
    outcome: String(raw?.outcome ?? args.outcome ?? "").slice(0, 40),
  };
}

const JST = 9 * 60 * 60 * 1000;
/** 日本時間の今日の0時・今月の1日（UTC の ISO） */
export function jstStarts() {
  const j = new Date(Date.now() + JST);
  const day = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate()) - JST;
  const month = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), 1) - JST;
  return { day: new Date(day).toISOString(), month: new Date(month).toISOString() };
}
