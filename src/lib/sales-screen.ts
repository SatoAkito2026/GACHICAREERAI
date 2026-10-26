/**
 * 営業ロープレの資料から、社内だけの情報（販売会社・代理店の手数料・成果報酬・インセンティブ・利益など）を取り除く
 * - お客さんに関係する情報（商品の値段・月額・お客さんが払う手数料・キャンペーン・工事など）は残す
 * - 資料を入れたときに AI で確かめ、確かめ終わったもの（screened）だけをロープレの AI に渡す
 * - 確かめられなかったものは毎時の Cron（runSalesScreenJob）でやり直す
 * - 見分けは「お金を誰が誰に払うか」。会社ごとの「必ず残す言葉」「必ず消す言葉」（companies.sales_keep_terms /
 *   sales_remove_terms）を AI より優先する（消す言葉は AI によらず必ず消す）
 */
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractJson, lastTextBlock } from "@/lib/ai-json";
import { serviceClient } from "@/lib/talent";

export type ScreenResult = {
  /** 取り除いたあとの中身 */
  content: string;
  /** 取り除いた箇所の数 */
  removed: number;
  /** 資料のほとんどが社内の情報で、使わないほうがよい */
  internalOnly: boolean;
};

export type ScreenRules = {
  /** お客さんの費用として必ず残す言葉（例：契約事務手数料） */
  keep: string[];
  /** 社内の情報として必ず消す言葉（例：開通手数料・獲得単価） */
  remove: string[];
};

const PROMPT = `あなたは、営業研修用の資料から社内の機密情報を取り除く担当です。
この資料は、AI が「お客さん役」と「研修の先生役」を演じるために使います。お客さんに知られてはいけない情報が入っていると、情報漏えいになります。

【いちばん大事な見分け方：そのお金は「誰が」「誰に」払うか】
名前（「手数料」「単価」など）ではなく、お金の流れで決める。
- お客さん → 通信会社・販売会社 に払うお金・お客さんがもらうお金 ＝ お客さんに関係するので【残す】
- メーカー・通信会社・元請け → 販売会社・代理店・営業マン に入るお金 ＝ 社内の情報なので【取り除く】

例（光回線の場合）：
- 「契約事務手数料 3,300円（初回のご請求に含まれます）」→ お客さんが払う → 残す
- 「開通手数料：1件開通につき ◯◯円を弊社にお支払い」→ 弊社に入る → 取り除く
- 「キャッシュバック 4万円・受け取り条件（開通後◯か月のご利用、申請は◯月まで）」→ お客さんがもらう → 残す
- 「CB 原資のうち代理店負担 ◯円」「獲得単価 ◯円」「支払い条件（弊社への入金は開通月の翌々月）」→ 取り除く
- 書き方が「1件あたり」「獲得」「開通につき」「月◯件以上で」「バック」「支払い（弊社へ）」なら、名前が何であっても取り除く側を疑う

【取り除くもの（販売する側の会社の中だけの情報）】
- 販売会社・代理店・営業マンが受け取る手数料・成果報酬・インセンティブ・バック・報奨金・紹介料・コミッション・獲得単価
- 卸値・仕入れ値・原価・粗利・利益・マージン
- 代理店ごとの条件・ランク・目標件数・ノルマ・評価制度・給与
- 社員の個人情報、社内の連絡先、ID・パスワード

【残すもの（お客さんに関係する情報）】
- 商品・サービスの内容、お客さんが払う値段・月額・割引・違約金、お客さんがもらうキャッシュバック（CB）とその受け取り条件・キャンペーン
- お客さんが払う手数料（例：契約事務手数料・初期事務手数料・工事費）
- 工事・開通の流れ、支払い・請求のイメージ、よくある質問、トーク、注意事項（コンプライアンス）
- 迷うもの（お客さんが払うのか、会社に入るのか分からない金額）は取り除く（漏らすよりは安全）

【返し方】次のJSONだけを返す：
{"internal_only": 資料のほとんどが取り除くものなら true, "remove": ["取り除く部分を、資料の文字のとおりに書き写したもの", …]}
- remove の各項目は、資料の中の文字そのまま（1行・1文・表の1行など、取り除く最小のまとまり）
- 取り除くものがなければ "remove": []`;

function rulesText(rules: ScreenRules): string {
  const lines: string[] = [];
  if (rules.keep.length)
    lines.push(
      `【この会社のルール：お客さんの費用として必ず残す言葉】${rules.keep.join("、")}\n（この言葉の金額・条件は取り除かない。ただし同じ文に会社に入るお金があれば、その部分だけ取り除く）`,
    );
  if (rules.remove.length)
    lines.push(
      `【この会社のルール：社内の情報として必ず取り除く言葉】${rules.remove.join("、")}\n（この言葉が出てくる金額・条件は、すべて取り除く）`,
    );
  return lines.join("\n\n");
}

/** 必ず消す言葉は、AI の判断によらず消す（言葉から、句点・改行までの40文字ほど＝金額や条件まで） */
export function applyRemoveTerms(
  content: string,
  terms: string[],
): { content: string; removed: number } {
  let out = content;
  let removed = 0;
  for (const t of terms) {
    if (!t.trim()) continue;
    const re = new RegExp(`${escapeRe(t.trim())}[^。\n]{0,40}`, "g");
    out = out.replace(re, () => {
      removed++;
      return "［社内情報のため省略］";
    });
  }
  return { content: out, removed };
}

/** 会社の見分けルール */
export async function loadScreenRules(
  supabase: SupabaseClient,
  companyId: string,
): Promise<ScreenRules> {
  const { data } = await supabase
    .from("companies")
    .select("sales_keep_terms, sales_remove_terms")
    .eq("id", companyId)
    .maybeSingle();
  const d = data as {
    sales_keep_terms?: string[] | null;
    sales_remove_terms?: string[] | null;
  } | null;
  return { keep: d?.sales_keep_terms ?? [], remove: d?.sales_remove_terms ?? [] };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 書き写しの空白・改行の違いを許して、資料から取り除く */
export function removeSpan(content: string, span: string): { content: string; hit: boolean } {
  const chars = Array.from(span.replace(/\s+/g, ""));
  if (chars.length < 2) return { content, hit: false };
  const re = new RegExp(chars.map(escapeRe).join("\\s*"), "g");
  const next = content.replace(re, "［社内情報のため省略］");
  return { content: next, hit: next !== content };
}

export async function screenMaterial(
  title: string,
  content: string,
  rules: ScreenRules = { keep: [], remove: [] },
): Promise<ScreenResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const anthropic = new Anthropic({ apiKey });
  const res = await anthropic.messages.create(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: [PROMPT, rulesText(rules)].filter(Boolean).join("\n\n"),
      messages: [{ role: "user", content: `【資料の名前】${title}\n【資料の中身】\n${content}` }],
    },
    { timeout: 60000, maxRetries: 1 },
  );
  const raw = extractJson(lastTextBlock(res.content)) as {
    internal_only?: unknown;
    remove?: unknown[];
  };
  let out = content;
  let removed = 0;
  for (const span of Array.isArray(raw?.remove) ? raw.remove : []) {
    if (typeof span !== "string") continue;
    // 「必ず残す言葉」を含み、「必ず消す言葉」を含まない部分は消さない
    const keeps = rules.keep.some((k) => k && span.includes(k));
    const removes = rules.remove.some((k) => k && span.includes(k));
    if (keeps && !removes) continue;
    const r = removeSpan(out, span);
    out = r.content;
    if (r.hit) removed++;
  }
  const forced = applyRemoveTerms(out, rules.remove);
  return {
    content: forced.content,
    removed: removed + forced.removed,
    internalOnly: raw?.internal_only === true,
  };
}

/** 資料1件を確かめて保存する（社内の情報ばかりの資料は中身を空にして使わない） */
export async function screenAndSave(
  supabase: SupabaseClient,
  row: { id: string; company_id: string; title: string; content: string },
  rules?: ScreenRules,
): Promise<ScreenResult | null> {
  try {
    const r = await screenMaterial(
      row.title,
      row.content,
      rules ?? (await loadScreenRules(supabase, row.company_id)),
    );
    await supabase
      .from("sales_materials")
      .update({
        content: r.internalOnly ? "［社内の情報のみの資料のため、AI には使いません］" : r.content,
        screened: true,
        redacted: r.internalOnly ? -1 : r.removed,
      })
      .eq("id", row.id);
    return r;
  } catch (e) {
    console.error("[sales-screen] failed", row.id, e);
    return null;
  }
}

/** 毎時の Cron から：まだ確かめていない資料を確かめる（1回に20件まで） */
export async function runSalesScreenJob(): Promise<void> {
  const supabase = await serviceClient();
  if (!supabase || !process.env.ANTHROPIC_API_KEY) return;
  const { data } = await supabase
    .from("sales_materials")
    .select("id, company_id, title, content")
    .eq("screened", false)
    .order("created_at", { ascending: true })
    .limit(20);
  for (const row of data ?? []) await screenAndSave(supabase, row);
}
