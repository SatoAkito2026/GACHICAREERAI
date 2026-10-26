/**
 * 営業ロープレの資料から、社内だけの情報（販売会社・代理店の手数料・成果報酬・インセンティブ・利益など）を取り除く
 * - お客さんに関係する情報（商品の値段・月額・お客さんが払う手数料・キャンペーン・工事など）は残す
 * - 資料を入れたときに AI で確かめ、確かめ終わったもの（screened）だけをロープレの AI に渡す
 * - 確かめられなかったものは毎時の Cron（runSalesScreenJob）でやり直す
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

const PROMPT = `あなたは、営業研修用の資料から社内の機密情報を取り除く担当です。
この資料は、AI が「お客さん役」と「研修の先生役」を演じるために使います。お客さんに知られてはいけない情報が入っていると、情報漏えいになります。

【取り除くもの（販売する側の会社の中だけの情報）】
- 販売会社・代理店・営業マンが受け取る手数料・成果報酬・インセンティブ・バック・報奨金・紹介料・コミッション
- 卸値・仕入れ値・原価・粗利・利益・マージン・単価表のうち「会社が受け取る金額」のもの
- 代理店ごとの条件・ランク・目標件数・ノルマ・評価制度・給与
- 社員の個人情報、社内の連絡先、ID・パスワード

【残すもの（お客さんに関係する情報）】
- 商品・サービスの内容、お客さんが払う値段・月額・割引・キャッシュバック（CB）・キャンペーン・違約金
- お客さんが払う手数料（例：初期事務手数料・工事費・契約事務手数料）は残す
- 工事・開通の流れ、支払い・請求のイメージ、よくある質問、トーク、注意事項（コンプライアンス）

【返し方】次のJSONだけを返す：
{"internal_only": 資料のほとんどが取り除くものなら true, "remove": ["取り除く部分を、資料の文字のとおりに書き写したもの", …]}
- remove の各項目は、資料の中の文字そのまま（1行・1文・表の1行など、取り除く最小のまとまり）
- 取り除くものがなければ "remove": []`;

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

export async function screenMaterial(title: string, content: string): Promise<ScreenResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const anthropic = new Anthropic({ apiKey });
  const res = await anthropic.messages.create(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: PROMPT,
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
    const r = removeSpan(out, span);
    out = r.content;
    if (r.hit) removed++;
  }
  return { content: out, removed, internalOnly: raw?.internal_only === true };
}

/** 資料1件を確かめて保存する（社内の情報ばかりの資料は中身を空にして使わない） */
export async function screenAndSave(
  supabase: SupabaseClient,
  row: { id: string; title: string; content: string },
): Promise<ScreenResult | null> {
  try {
    const r = await screenMaterial(row.title, row.content);
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
    .select("id, title, content")
    .eq("screened", false)
    .order("created_at", { ascending: true })
    .limit(20);
  for (const row of data ?? []) await screenAndSave(supabase, row);
}
