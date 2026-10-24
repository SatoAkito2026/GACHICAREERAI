/**
 * 本人の最新の練習の点数が、練習した人の中で上位何%か
 *
 * GET /api/talent/my-rank?mode=individual|student
 *   → { score, total, rank, percent }（比べる人数が少ないうちは { notEnough: true, total }）
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, serviceClient } from "@/lib/talent";

/** これより少ない人数では「上位◯%」を出さない（数人だと意味がないため） */
const MIN_PEOPLE = 20;

export const Route = createFileRoute("/api/talent/my-rank")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const mode =
          new URL(request.url).searchParams.get("mode") === "student" ? "student" : "individual";

        const { data: list } = await supabase
          .from("interviews")
          .select("id")
          .eq("user_id", auth.userId)
          .eq("mode", mode)
          .order("created_at", { ascending: false })
          .limit(10);
        const ids = (list ?? []).map((r) => r.id);
        if (ids.length === 0) return jsonResponse({ score: null });
        const { data: sums } = await supabase
          .from("interview_summaries")
          .select("interview_id, practice_feedback")
          .in("interview_id", ids);
        const byId = new Map(
          (sums ?? []).map((s) => [
            s.interview_id,
            (s.practice_feedback as { readiness_score?: unknown } | null)?.readiness_score,
          ]),
        );
        const latestId = ids.find((id) => typeof byId.get(id) === "number");
        if (!latestId) return jsonResponse({ score: null });
        const score = byId.get(latestId) as number;

        const { data, error } = await supabase.rpc("practice_rank", {
          p_mode: mode,
          p_score: score,
        });
        if (error) return jsonResponse({ score, notEnough: true, total: 0 });
        const row = (Array.isArray(data) ? data[0] : data) as {
          total: number;
          above: number;
        } | null;
        const total = Number(row?.total ?? 0);
        if (total < MIN_PEOPLE) return jsonResponse({ score, notEnough: true, total });
        const rank = Number(row?.above ?? 0) + 1;
        return jsonResponse({
          score,
          total,
          rank,
          percent: Math.max(1, Math.ceil((rank / total) * 100)),
        });
      },
    },
  },
});
