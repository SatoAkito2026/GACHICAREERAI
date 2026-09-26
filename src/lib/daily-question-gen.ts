/**
 * その人の回答履歴・プロフィールを踏まえて、次の質問をAIに生成させる。
 * daily_question_bank(全員共通)が枯渇してきた/使い切った場合の
 * 「無限に深掘りし続ける」質問ソース。
 * 生成した質問は user_generated_questions に保存し、以後
 * daily_question_bank と同様に出題候補として扱われる。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export interface GeneratedQuestion {
  id: string;
  category: string;
  question_text: string;
}

export async function generatePersonalizedQuestions(
  supabase: SupabaseClient,
  anthropicApiKey: string,
  userId: string,
  dbMode: "individual" | "student",
  count: number,
): Promise<GeneratedQuestion[]> {
  // 材料集め: プロフィール・オンボーディング回答・これまでのQ&A履歴
  const [{ data: profile }, { data: onboarding }, { data: pastResponses }] = await Promise.all([
    supabase
      .from("user_career_profiles")
      .select("*")
      .eq("user_id", userId)
      .eq("mode", dbMode)
      .maybeSingle(),
    supabase
      .from("onboarding_answers")
      .select("answers")
      .eq("user_id", userId)
      .eq("mode", dbMode)
      .maybeSingle(),
    supabase
      .from("daily_question_responses")
      .select("question_text, category, answer_text")
      .eq("user_id", userId)
      .eq("mode", dbMode)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const profileSummary = profile
    ? JSON.stringify({
        basic_info: profile.basic_info,
        self_pr: profile.self_pr,
        skills: profile.skills,
        desired_conditions: profile.desired_conditions,
        desired_schools: profile.desired_schools,
        education_history: profile.education_history,
      })
    : "(まだプロフィール未入力)";

  const qaHistory = (pastResponses ?? [])
    .filter((r) => r.question_text)
    .map((r) => `Q(${r.category ?? "未分類"}): ${r.question_text}\nA: ${r.answer_text}`)
    .join("\n\n");

  const modeLabel = dbMode === "student" ? "受験生（入試対策）" : "社会人（就活・転職）";

  const systemPrompt = `あなたは${modeLabel}向けのキャリアコーチAIです。
ユーザーのプロフィールとこれまでの回答履歴を踏まえ、そのユーザーへの理解をさらに深めるための
「今日の質問」を新しく${count}問作成してください。

ルール:
- 過去に聞いた質問と同じ切り口・テーマの焼き直しは避け、まだ聞けていない側面を掘り下げること
- 1問は日本語で1文、40文字程度まで。答えやすい具体的な質問にすること
- category は次のいずれかから選ぶ: strengths, weaknesses, values, episode, motivation, reflection
- 出力は必ず次のJSON配列形式のみ。前置きや説明文、マークダウンのコードブロックは一切付けないこと
  [{"category": "strengths", "question_text": "..."}, ...]`;

  const userPrompt = `# プロフィール
${profileSummary}

# オンボーディング時の回答
${onboarding?.answers ? JSON.stringify(onboarding.answers) : "(なし)"}

# これまでのQ&A履歴
${qaHistory || "(まだ回答履歴なし)"}

上記を踏まえて、新しい質問を${count}問、指定のJSON配列形式で出力してください。`;

  const anthropic = new Anthropic({ apiKey: anthropicApiKey });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "[]";

  let parsed: { category: string; question_text: string }[] = [];
  try {
    // 万一コードブロックで返ってきた場合に備えて除去してからパースする
    const cleaned = text.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) parsed = [];
  } catch (e) {
    console.error("[daily-question-gen] JSON parse failed", e, text);
    parsed = [];
  }

  const validCategories = new Set([
    "strengths",
    "weaknesses",
    "values",
    "episode",
    "motivation",
    "reflection",
  ]);
  const rows = parsed
    .filter((q) => q?.question_text && typeof q.question_text === "string")
    .slice(0, count)
    .map((q) => ({
      user_id: userId,
      category: validCategories.has(q.category) ? q.category : "reflection",
      question_text: q.question_text,
      mode: dbMode,
      is_active: true,
    }));

  if (rows.length === 0) return [];

  const { data: inserted, error } = await supabase
    .from("user_generated_questions")
    .insert(rows)
    .select("id, category, question_text");

  if (error) {
    console.error("[daily-question-gen] insert failed", error);
    return [];
  }

  return (inserted ?? []) as GeneratedQuestion[];
}
