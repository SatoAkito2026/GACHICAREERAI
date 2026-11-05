/**
 * 受験モード：志望校を AI がウェブで調べる（特色・教育方針・求める生徒像・面接の形式とよく聞かれること）
 * - 結果は学校（＋学部・学科）ごとに school_knowledge に保存して、ほかの生徒も使い回す（180日で調べ直す）
 * - 練習の面接官（interview-turn）とフィードバック（save-interview）に渡す
 * - 見つからなかった学校も「なし」として保存し、30日は調べ直さない（同じ学校で何度も費用がかからないように）
 */
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractJson, lastTextBlock } from "@/lib/ai-json";
import { EXAM_SCHOOL_TYPES, type ExamSchoolType } from "@/lib/exam-schools";

const FRESH_DAYS = 180;
const NOT_FOUND_RETRY_DAYS = 30;
/** 1人が1日に新しく調べられる学校の数（すでに調べてある学校は数えない） */
export const SCHOOL_RESEARCH_PER_DAY = 5;

export type SchoolInfo = {
  found: boolean;
  /** 面接官・評価に渡す文（見出しつき） */
  text: string;
  sources: string[];
  updatedAt: string;
};

/** 学校名と学部をそろえて、保存のキーにする */
export function schoolKey(name: string, faculty?: string | null): string {
  const n = (s: string) =>
    s
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[\s\u3000]/g, "")
      .toLowerCase();
  return `${n(name)}|${n(faculty ?? "")}`;
}

/** 保存してある情報（なければ・古ければ null） */
export async function getSchoolInfo(
  supabase: SupabaseClient,
  name: string,
  faculty?: string | null,
): Promise<SchoolInfo | null> {
  if (!name.trim()) return null;
  const { data } = await supabase
    .from("school_knowledge")
    .select("found, content, sources, updated_at")
    .eq("key", schoolKey(name, faculty))
    .maybeSingle();
  if (!data) return null;
  const age = (Date.now() - new Date(data.updated_at).getTime()) / 86400000;
  if (age > (data.found ? FRESH_DAYS : NOT_FOUND_RETRY_DAYS)) return null;
  return {
    found: data.found,
    text: data.content,
    sources: (data.sources as string[] | null) ?? [],
    updatedAt: data.updated_at,
  };
}

/** ウェブで調べて保存する（30〜90秒かかる） */
export async function researchSchool(
  supabase: SupabaseClient,
  args: { name: string; faculty?: string | null; type: ExamSchoolType },
): Promise<SchoolInfo> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const def = EXAM_SCHOOL_TYPES[args.type];
  const target = `${args.name}${args.faculty ? `（${args.faculty}）` : ""}`;
  const prompt = `受験生の面接練習のために、日本の「${target}」（種類：${def.label}）について、ウェブで公式サイトや信頼できる情報を調べてまとめてください。

【調べること】
1. 学校の特色・教育方針・建学の精神（学部・学科・コースが分かればその特色も）
2. 求める生徒（学生）像・アドミッションポリシー（公式の言葉があれば、その要点）
3. 入試の面接の形式（個人／集団・時間・面接官の人数など）と、よく聞かれる質問（受験生の体験談などで分かる範囲）
4. 面接で話題にしやすい、その学校ならではのこと（行事・部活動・実習・研究・地域とのつながり・採用の方針など）

【ルール】
- 調べて分かったことだけを書く。分からないことは「不明」とする。倍率・偏差値・数字は書かない
- 同じ名前の別の学校と混同しない。見つからなければ found を false にする
- 受験生に分かる、やさしい日本語で、各項目3〜6文

最後に、次のJSONだけを返してください：
{"found": true, "features": "1の内容", "wants": "2の内容", "interview": "3の内容", "topics": "4の内容", "sources": ["参考にしたURL", …]}`;

  const anthropic = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  let res: Anthropic.Message | null = null;
  // 検索が長いと途中で一度止まる（pause_turn）ので、続きを頼む（2回まで）
  for (let i = 0; i < 3; i++) {
    res = await anthropic.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
        messages,
      },
      { timeout: 120000, maxRetries: 1 },
    );
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  let raw: {
    found?: unknown;
    features?: unknown;
    wants?: unknown;
    interview?: unknown;
    topics?: unknown;
    sources?: unknown[];
  } | null = null;
  try {
    raw = res ? extractJson(lastTextBlock(res.content)) : null;
  } catch {
    raw = null;
  }
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 1200) : "");
  const sections = [
    ["学校の特色・教育方針", str(raw?.features)],
    ["求める生徒像・アドミッションポリシー", str(raw?.wants)],
    ["面接の形式・よく聞かれること", str(raw?.interview)],
    ["面接で話題にしやすいこと", str(raw?.topics)],
  ].filter(([, v]) => v && v !== "不明");
  const found = raw?.found !== false && sections.length >= 2;
  const text = found ? sections.map(([k, v]) => `■${k}\n${v}`).join("\n\n") : "";
  const sources = (Array.isArray(raw?.sources) ? raw.sources : [])
    .map((u) => String(u).slice(0, 300))
    .filter((u) => /^https?:\/\//.test(u))
    .slice(0, 8);
  const updatedAt = new Date().toISOString();
  await supabase.from("school_knowledge").upsert({
    key: schoolKey(args.name, args.faculty),
    school_name: args.name.slice(0, 100),
    faculty: (args.faculty ?? "").slice(0, 100),
    school_type: args.type,
    found,
    content: text.slice(0, 6000),
    sources,
    updated_at: updatedAt,
  });
  return { found, text, sources, updatedAt };
}
