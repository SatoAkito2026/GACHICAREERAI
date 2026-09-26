/**
 * 毎日の質問API
 *
 * GET /api/daily-question
 *   今日分の核となる5問を返す(初回はここで選んで daily_question_assignments に固定化)。
 *
 * GET /api/daily-question?extra=1
 *   「もっと答えたい」ユーザー向けの追加ラウンド。今日の割り当てとは別に、
 *   その場でまだ答えていない質問を選んで返す(固定化はしない)。
 *
 * 候補プールは daily_question_bank(全員共通) と
 * user_generated_questions(その人専用、AI生成分) の両方から集める。
 * 候補が不足してきたら、その人の回答履歴を踏まえてAIに新しい質問を
 * 生成させ、user_generated_questions に追加してから選ぶ
 * (＝60問で打ち止めにせず、無限に深掘りし続ける仕組み)。
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseUrl,
  getServiceRoleKey,
  verifyApiUser,
  checkAndConsumeDailyQuestionGenQuota,
} from "@/lib/api-auth";
import { generatePersonalizedQuestions } from "@/lib/daily-question-gen";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/** JST基準の"today"をYYYY-MM-DDで返す */
function todayJst(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

type Candidate = {
  id: string;
  category: string;
  question_text: string;
  source: "bank" | "generated";
};

/**
 * このユーザー向けの「まだ答えていない」候補を集める。
 * 不足していればAIで生成して補充する。
 */
async function collectUnansweredCandidates(
  supabase: ReturnType<typeof createClient<any, "public", any>>,
  userId: string,
  dbMode: "individual" | "student",
  needed: number,
  plan: string,
): Promise<Candidate[]> {
  const { data: answered } = await supabase
    .from("daily_question_responses")
    .select("question_id")
    .eq("user_id", userId);
  const answeredIds = new Set((answered ?? []).map((r: any) => r.question_id as string));

  const { data: bankRows } = await supabase
    .from("daily_question_bank")
    .select("id, category, question_text")
    .in("mode", [dbMode, "both"])
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });

  const { data: generatedRows } = await supabase
    .from("user_generated_questions")
    .select("id, category, question_text")
    .eq("user_id", userId)
    .eq("mode", dbMode)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  let candidates: Candidate[] = [
    ...((bankRows ?? []) as any[]).map((q) => ({ ...q, source: "bank" as const })),
    ...((generatedRows ?? []) as any[]).map((q) => ({ ...q, source: "generated" as const })),
  ].filter((q) => !answeredIds.has(q.id));

  // 不足していればAIで生成して補充する(1日あたりの生成回数に上限あり。
  // 上限に達している場合は生成せず、今ある候補だけで返す)
  if (candidates.length < needed) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      const quota = await checkAndConsumeDailyQuestionGenQuota(supabase, userId, plan);
      if (!quota.ok) {
        console.log("[daily-question] AI generation quota exceeded for today, skipping");
      } else {
        const shortfall = needed - candidates.length;
        // 一度に生成しすぎないよう、最低5問・最大10問程度にまとめて生成しておく
        const genCount = Math.max(5, Math.min(10, shortfall));
        try {
          const newlyGenerated = await generatePersonalizedQuestions(
            supabase as any,
            anthropicKey,
            userId,
            dbMode,
            genCount,
          );
          candidates = candidates.concat(
            newlyGenerated.map((q) => ({ ...q, source: "generated" as const })),
          );
        } catch (e) {
          console.error("[daily-question] generation failed", e);
        }
      }
    }
  }

  return candidates;
}

/** カテゴリで偏らないよう、ラウンドロビンでN件選ぶ */
function pickRoundRobin(candidates: Candidate[], count: number): Candidate[] {
  const byCategory = new Map<string, Candidate[]>();
  for (const q of candidates) {
    const list = byCategory.get(q.category) ?? [];
    list.push(q);
    byCategory.set(q.category, list);
  }
  const queues = Array.from(byCategory.values());
  const picked: Candidate[] = [];
  let i = 0;
  while (picked.length < count && queues.some((q) => q.length > 0)) {
    const queue = queues[i % queues.length];
    if (queue.length > 0) picked.push(queue.shift()!);
    i++;
  }
  return picked;
}

export const Route = createFileRoute("/api/daily-question")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Supabase config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);
        const userId = auth.userId;

        const url = new URL(request.url);
        const isExtra = url.searchParams.get("extra") === "1";

        const { data: profile } = await supabase
          .from("profiles")
          .select("user_mode, plan, plan_expires_at")
          .eq("id", userId)
          .maybeSingle();
        const dbMode: "individual" | "student" =
          profile?.user_mode === "private_student" ? "student" : "individual";
        const isExpired = profile?.plan_expires_at
          ? new Date(profile.plan_expires_at).getTime() < Date.now()
          : false;
        const plan = profile?.plan && !isExpired ? (profile.plan as string) : "free";

        let selected: Candidate[];

        if (isExtra) {
          // 追加ラウンド: 固定化せず、その場で選んで返すだけ
          const candidates = await collectUnansweredCandidates(supabase, userId, dbMode, 5, plan);
          selected = pickRoundRobin(candidates, 5);
        } else {
          const date = todayJst();
          const { data: existingAssignment } = await supabase
            .from("daily_question_assignments")
            .select("question_ids")
            .eq("user_id", userId)
            .eq("mode", dbMode)
            .eq("assignment_date", date)
            .maybeSingle();

          if (existingAssignment?.question_ids?.length) {
            const ids = existingAssignment.question_ids as string[];
            // 割り当て済みのIDから、bank/generated両方を引いて復元する
            const [{ data: bankRows }, { data: genRows }] = await Promise.all([
              supabase
                .from("daily_question_bank")
                .select("id, category, question_text")
                .in("id", ids),
              supabase
                .from("user_generated_questions")
                .select("id, category, question_text")
                .in("id", ids),
            ]);
            const byId = new Map(
              [...(bankRows ?? []), ...(genRows ?? [])].map((q: any) => [q.id as string, q]),
            );
            selected = ids
              .map((id) => byId.get(id))
              .filter(Boolean)
              .map((q: any) => ({ ...q, source: "bank" as const })); // 表示上sourceは使わないので仮値でよい
          } else {
            const candidates = await collectUnansweredCandidates(supabase, userId, dbMode, 5, plan);
            selected = pickRoundRobin(candidates, 5);
            if (selected.length > 0) {
              await supabase.from("daily_question_assignments").upsert(
                {
                  user_id: userId,
                  mode: dbMode,
                  assignment_date: date,
                  question_ids: selected.map((q) => q.id),
                },
                { onConflict: "user_id,mode,assignment_date" },
              );
            }
          }
        }

        if (selected.length === 0) {
          return json({ questions: [] });
        }

        const { data: myResponses } = await supabase
          .from("daily_question_responses")
          .select("question_id, answer_text")
          .eq("user_id", userId)
          .in(
            "question_id",
            selected.map((q) => q.id),
          );
        const responseMap = new Map(
          (myResponses ?? []).map((r: any) => [r.question_id as string, r.answer_text as string]),
        );

        const questions = selected.map((q) => ({
          id: q.id,
          category: q.category,
          question_text: q.question_text,
          answer_text: responseMap.get(q.id) ?? null,
        }));

        return json({ questions });
      },
    },
  },
});
