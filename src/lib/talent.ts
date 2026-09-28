/**
 * 人材プロフィール（ユーザーが公開し、企業がチケットで閲覧する）に関する共通処理。サーバー専用。
 *
 * - 評価は面接での本人の発言（引用）を根拠にする。引用は実際の発言に含まれるものだけを残す
 * - 企業に見せる評価に、年齢・性別・出身地など選考に使うべきでない情報は含めない
 */
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractJson, lastTextBlock } from "@/lib/ai-json";

export const COMPETENCIES = [
  { key: "communication", label: "伝える力" },
  { key: "logic", label: "論理的に考える力" },
  { key: "initiative", label: "主体性" },
  { key: "teamwork", label: "協調性" },
  { key: "resilience", label: "粘り強さ" },
  { key: "sincerity", label: "誠実さ" },
  { key: "learning", label: "学ぶ姿勢" },
] as const;

export type CompetencyKey = (typeof COMPETENCIES)[number]["key"];

export const CAREER_STAGES: Record<string, string> = {
  student: "学生（就職活動中）",
  job_seeker: "求職中",
  employed: "在職中（転職を検討）",
  career_change: "異業種への転職を検討",
  senior: "シニア・定年後の再就職",
  other: "その他",
};

/** 面接1回ごとの能力評価（practice_feedback.competencies） */
export type InterviewCompetency = {
  key: CompetencyKey;
  label: string;
  /** 1〜5。根拠となる発言がなければ null（評価しない） */
  score: number | null;
  reason: string;
  evidence: string[];
};

/** 人物まとめ（candidate_profiles.summary） */
export type TalentSummary = {
  overview: string;
  strengths: { title: string; description: string; evidence: { quote: string; date: string }[] }[];
  growth_areas: string[];
  work_style: string;
  competencies: {
    key: CompetencyKey;
    label: string;
    score: number | null;
    evidence_count: number;
    interviews: number;
  }[];
  score_trend: { date: string; score: number }[];
  interview_count: number;
  generated_at: string;
};

export const SUMMARY_MODEL = "claude-sonnet-4-6";

// ---- 引用の確認 --------------------------------------------------------------

function normalize(s: string): string {
  return s.replace(/[\s\u3000、。，．,.!！?？「」『』（）()・…ー〜~"'“”]/g, "");
}

/**
 * 引用が本人の発言の中に実際にあるかを確かめる。
 * 固有名詞を伏せた「○○」の部分は何が入っていてもよいとみなす。
 */
export function quoteAppearsIn(quote: string, spoken: string): boolean {
  const parts = normalize(quote)
    .split(/[○〇●◯＊*]+/)
    .filter((p) => p.length > 0);
  const total = parts.reduce((n, p) => n + p.length, 0);
  if (total < 6) return false;
  const text = normalize(spoken);
  let from = 0;
  for (const p of parts) {
    const i = text.indexOf(p, from);
    if (i < 0) return false;
    from = i + p.length;
  }
  return true;
}

/** AIが返した能力評価を検証する。根拠の引用が本人の発言にないものは捨て、根拠ゼロなら評価しない */
export function sanitizeCompetencies(raw: unknown, spoken: string): InterviewCompetency[] {
  const list = Array.isArray(raw) ? raw : [];
  return COMPETENCIES.map(({ key, label }) => {
    const item = list.find((c: any) => c && c.key === key) as any;
    const evidence = (Array.isArray(item?.evidence) ? item.evidence : [])
      .filter((q: unknown): q is string => typeof q === "string")
      .map((q: string) => q.trim().slice(0, 200))
      .filter((q: string) => quoteAppearsIn(q, spoken))
      .slice(0, 3);
    const n = Number(item?.score);
    const score = evidence.length > 0 && n >= 1 && n <= 5 ? Math.round(n) : null;
    return {
      key,
      label,
      score,
      reason: score === null ? "" : String(item?.reason ?? "").slice(0, 200),
      evidence: score === null ? [] : evidence,
    };
  });
}

/** 面接ごとの評価プロンプトに足す指示（save-interview.ts で使う） */
export const COMPETENCY_PROMPT = `
【能力の評価（根拠つき）】
次の7つの力を、受験者本人の発言だけを根拠に1〜5で評価し、"competencies" に入れてください。
${COMPETENCIES.map((c) => `- ${c.key}: ${c.label}`).join("\n")}
ルール:
- evidence には、その評価の根拠になった受験者の発言を、会話記録からそのまま抜き出して入れる（1〜3個、各60文字以内。言い換え・要約は禁止）
- 人名・会社名・学校名・地名などの固有名詞は「○○」に置き換える（それ以外は一字一句そのまま）
- 根拠になる発言がない力は score を null、evidence を [] にする（推測で点をつけない）
- 年齢・性別・国籍・出身地・家族・健康・容姿など、本人の能力と関係ないことは評価に使わない
形式: "competencies": [{"key": "communication", "score": 4, "reason": "評価の理由（1文）", "evidence": ["発言の引用"]}]`;

// ---- 人物まとめの作成 --------------------------------------------------------

type FeedbackRow = {
  created_at: string;
  job_type: string | null;
  feedback: any;
};

async function loadPracticeFeedback(
  supabase: SupabaseClient,
  userId: string,
): Promise<FeedbackRow[]> {
  const { data: interviews } = await supabase
    .from("interviews")
    .select("id, created_at, job_type, impression")
    .eq("user_id", userId)
    .eq("mode", "individual")
    .neq("impression", "途中退出")
    .order("created_at", { ascending: false })
    .limit(20);
  const ids = (interviews ?? []).map((i) => i.id);
  if (ids.length === 0) return [];
  const { data: summaries } = await supabase
    .from("interview_summaries")
    .select("interview_id, practice_feedback")
    .in("interview_id", ids);
  const byId = new Map((summaries ?? []).map((s: any) => [s.interview_id, s.practice_feedback]));
  return (interviews ?? [])
    .map((i) => ({ created_at: i.created_at, job_type: i.job_type, feedback: byId.get(i.id) }))
    .filter((r) => r.feedback && typeof r.feedback === "object");
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 面接ごとの点数を平均して、能力ごとの点数を出す（AIに任せず計算する） */
function aggregateCompetencies(rows: FeedbackRow[]): TalentSummary["competencies"] {
  return COMPETENCIES.map(({ key, label }) => {
    const scores: number[] = [];
    let evidenceCount = 0;
    for (const r of rows) {
      const c = (r.feedback.competencies as InterviewCompetency[] | undefined)?.find(
        (x) => x.key === key,
      );
      if (c && typeof c.score === "number") {
        scores.push(c.score);
        evidenceCount += c.evidence?.length ?? 0;
      }
    }
    const score = scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null;
    return { key, label, score, evidence_count: evidenceCount, interviews: scores.length };
  });
}

/**
 * ユーザーの模擬面接（個人モード）の結果をまとめて、企業に見せる人物まとめを作り直す。
 * 面接の結果がなければ summary は null のまま。
 */
export async function refreshCandidateSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<TalentSummary | null> {
  const rows = await loadPracticeFeedback(supabase, userId);
  const now = new Date().toISOString();

  if (rows.length === 0) {
    await supabase
      .from("candidate_profiles")
      .update({
        summary: null,
        summary_stale: false,
        summary_updated_at: now,
        interview_count: 0,
        average_score: null,
      })
      .eq("user_id", userId);
    return null;
  }

  const scoreTrend = rows
    .filter((r) => typeof r.feedback.readiness_score === "number")
    .map((r) => ({ date: dateLabel(r.created_at), score: r.feedback.readiness_score as number }))
    .reverse();
  const recent = scoreTrend.slice(-5);
  const averageScore = recent.length
    ? Math.round(recent.reduce((a, b) => a + b.score, 0) / recent.length)
    : null;
  const competencies = aggregateCompetencies(rows);

  // AIに渡すのは、検証済みの引用と面接ごとの所見だけ
  const quotes: { quote: string; date: string }[] = [];
  const material = rows
    .slice(0, 10)
    .map((r) => {
      const comps = ((r.feedback.competencies as InterviewCompetency[] | undefined) ?? [])
        .filter((c) => c.score !== null)
        .map((c) => {
          for (const q of c.evidence) quotes.push({ quote: q, date: dateLabel(r.created_at) });
          return `  - ${c.label} ${c.score}/5：${c.reason} 根拠「${c.evidence.join("」「")}」`;
        })
        .join("\n");
      return `■ ${dateLabel(r.created_at)}（${r.job_type || "職種指定なし"}） 総合${r.feedback.readiness_score ?? "-"}点
良かった点: ${(r.feedback.good_points ?? []).join(" / ")}
改善点: ${(r.feedback.improvement_points ?? []).join(" / ")}
${comps}`;
    })
    .join("\n\n");

  let ai: Partial<TalentSummary> = {};
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && quotes.length + rows.length > 0) {
    const prompt = `以下は、ある人が受けたAI模擬面接（複数回）の評価記録です。
これをもとに、企業の採用担当者が読む「人物まとめ」を作ってください。

【評価記録】
${material}

【ルール】
- 書いてよいのは評価記録から言えることだけ。記録にないことを想像で足さない
- strengths の evidence には、評価記録の「根拠「…」」の中の引用を一字一句そのまま使う（新しい引用を作らない）
- 名前・会社名・学校名・地名などの固有名詞は書かない（本人が特定されないようにする）
- 年齢・性別・国籍・出身地・家族・健康・容姿には触れない
- 前向きで公平な書き方にする。改善点は「伸びしろ」として具体的に書く

次のJSONだけを返してください：
{
  "overview": "人物像のまとめ（200文字程度）",
  "strengths": [{"title": "強み（10文字程度）", "description": "説明（1〜2文）", "evidence": [{"quote": "根拠の引用", "date": "面接日（例 2026/9/1）"}]}],
  "growth_areas": ["伸びしろ1", "伸びしろ2"],
  "work_style": "発言から読み取れる、力を発揮しやすそうな働き方（1〜2文）"
}
strengthsは2〜3個。`;
    try {
      const anthropic = new Anthropic({ apiKey });
      const res = await anthropic.messages.create({
        model: SUMMARY_MODEL,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      });
      ai = extractJson(lastTextBlock(res.content)) ?? {};
    } catch (e) {
      console.error("[talent] summary generation failed", e);
    }
  }

  // 強みの根拠は、検証済みの引用の中にあるものだけ残す
  const known = new Map(quotes.map((q) => [normalize(q.quote), q]));
  const strengths = (Array.isArray(ai.strengths) ? ai.strengths : [])
    .slice(0, 3)
    .map((s: any) => ({
      title: String(s?.title ?? "").slice(0, 40),
      description: String(s?.description ?? "").slice(0, 300),
      evidence: (Array.isArray(s?.evidence) ? s.evidence : [])
        .map((e: any) => known.get(normalize(String(e?.quote ?? ""))))
        .filter(
          (e: { quote: string; date: string } | undefined): e is { quote: string; date: string } =>
            !!e,
        )
        .slice(0, 3),
    }))
    .filter((s) => s.title);

  const summary: TalentSummary = {
    overview: String(ai.overview ?? "").slice(0, 600),
    strengths,
    growth_areas: (Array.isArray(ai.growth_areas) ? ai.growth_areas : [])
      .map((g) => String(g).slice(0, 200))
      .slice(0, 4),
    work_style: String(ai.work_style ?? "").slice(0, 300),
    competencies,
    score_trend: scoreTrend.slice(-12),
    interview_count: rows.length,
    generated_at: now,
  };

  await supabase
    .from("candidate_profiles")
    .update({
      summary,
      summary_stale: false,
      summary_updated_at: now,
      interview_count: rows.length,
      average_score: averageScore,
    })
    .eq("user_id", userId);

  return summary;
}

/** まとめが古くなった公開プロフィールを作り直す（毎時の Cron から呼ぶ） */
export async function runTalentSummaryJob(): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js");
  const { getSupabaseUrl, getServiceRoleKey } = await import("@/lib/api-auth");
  const key = getServiceRoleKey();
  if (!key) return;
  const supabase = createClient(getSupabaseUrl(), key);
  const { data } = await supabase
    .from("candidate_profiles")
    .select("user_id")
    .eq("summary_stale", true)
    .order("updated_at", { ascending: true })
    .limit(10);
  for (const row of data ?? []) {
    try {
      await refreshCandidateSummary(supabase, row.user_id);
    } catch (e) {
      console.error("[talent] refresh failed", row.user_id, e);
    }
  }
}

// ---- チケット・メール -------------------------------------------------------

/** 企業が1人分のプロフィール（録画・名前・詳しい評価）を見るためのチケットの値段（円・税込） */
export function getTicketPrice(): number {
  const n = Number(process.env.TALENT_TICKET_PRICE_JPY);
  return Number.isFinite(n) && n >= 100 ? Math.round(n) : 10000;
}

export function appUrl(): string {
  return process.env.APP_URL || "https://interview-copilot-ai.akitogroup.jp";
}

export async function getUserEmail(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** お知らせメールを送る。失敗しても処理は止めない */
export async function sendNotice(
  to: string | null,
  subject: string,
  lines: string[],
  link: { label: string; path: string },
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const body = lines.map((l) => `<p style="margin:0 0 12px">${escapeHtml(l)}</p>`).join("");
  const html = `<!doctype html><html><body style="font-family:sans-serif;background:#f5f5f5;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;color:#222;font-size:14px;line-height:1.7">
<p style="font-weight:bold;font-size:16px;margin:0 0 16px">${escapeHtml(subject)}</p>
${body}
<p style="margin:24px 0"><a href="${appUrl()}${link.path}" style="background:#111;color:#C8FF00;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(link.label)}</a></p>
<p style="color:#888;font-size:12px;margin:0">このメールはガチキャリAIから自動で送信しています。</p>
</div></body></html>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "ガチキャリAI <info@akitogroup.jp>", to: [to], subject, html }),
    });
    if (!res.ok) console.error("[talent] mail failed", await res.text());
  } catch (e) {
    console.error("[talent] mail failed", e);
  }
}

// ---- API共通 ---------------------------------------------------------------

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function serviceClient(): Promise<SupabaseClient | null> {
  const { createClient } = await import("@supabase/supabase-js");
  const { getSupabaseUrl, getServiceRoleKey } = await import("@/lib/api-auth");
  const key = getServiceRoleKey();
  return key ? createClient(getSupabaseUrl(), key) : null;
}

export const RECORDING_BUCKET = "interview-recordings";
/** 1人あたり残しておく練習の録画の数（無料枠の容量を守るため、古いものから消す） */
export const RECORDINGS_PER_USER = 3;

/** 企業としての利用に必要な会社情報（会社名）が登録されているか */
export async function getCompanyProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ company_name: string } | null> {
  const { data } = await supabase
    .from("profiles")
    .select("company_name, company_id, user_mode")
    .eq("id", userId)
    .maybeSingle();
  if (!data || !String(data.user_mode ?? "").startsWith("business")) return null;
  let name = data.company_name?.trim();
  // 登録時の会社名は companies テーブルに入っている
  if (!name && data.company_id) {
    const { data: c } = await supabase
      .from("companies")
      .select("name")
      .eq("id", data.company_id)
      .maybeSingle();
    name = c?.name?.trim();
  }
  return name ? { company_name: name } : null;
}

export const COMPANY_REQUIRED_MESSAGE =
  "企業アカウントでログインし、設定画面で会社名を登録してください";

/**
 * 支払い済みの PaymentIntent から閲覧権を記録する（確認APIと Stripe Webhook の両方から呼ぶ。二重に呼ばれても1件）
 * 戻り値: 記録できたら候補者の user_id
 */
export async function recordUnlockFromPaymentIntent(
  supabase: SupabaseClient,
  pi: {
    id: string;
    status: string;
    amount_received?: number | null;
    metadata?: Record<string, string> | null;
  },
): Promise<{ candidateUserId: string; companyUserId: string; isNew: boolean } | null> {
  const m = pi.metadata ?? {};
  if (pi.status !== "succeeded" || m.kind !== "profile_unlock") return null;
  if (!m.company_user_id || !m.candidate_user_id) return null;
  const { data: before } = await supabase
    .from("profile_unlocks")
    .select("id")
    .eq("company_user_id", m.company_user_id)
    .eq("candidate_user_id", m.candidate_user_id)
    .maybeSingle();
  if (before)
    return { candidateUserId: m.candidate_user_id, companyUserId: m.company_user_id, isNew: false };
  const { error } = await supabase.from("profile_unlocks").insert({
    company_user_id: m.company_user_id,
    candidate_user_id: m.candidate_user_id,
    stripe_payment_intent_id: pi.id,
    amount: pi.amount_received ?? 0,
  });
  // 同時に記録された場合（unique違反）は、記録済みとして扱う
  if (error && error.code !== "23505") {
    console.error("[talent] unlock insert failed", error);
    return null;
  }
  return { candidateUserId: m.candidate_user_id, companyUserId: m.company_user_id, isNew: !error };
}

/** 企業がチケットを使ったことを本人に知らせる */
export async function notifyUnlocked(
  supabase: SupabaseClient,
  candidateUserId: string,
  companyUserId: string,
): Promise<void> {
  const company = await getCompanyProfile(supabase, companyUserId);
  await sendNotice(
    await getUserEmail(supabase, candidateUserId),
    "企業があなたのプロフィールを詳しく見ています",
    [
      `${company?.company_name ?? "企業"} が、あなたの公開プロフィール（詳しい評価など）を閲覧しました。`,
      "面談の申し込みが届いたら、承諾するか辞退するかを選べます。",
    ],
    { label: "オファーを確認する", path: "/private/individual/offers" },
  );
}
