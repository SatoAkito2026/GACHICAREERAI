/**
 * 企業向け：公開されている人材の一覧（匿名）
 *
 * GET /api/talent/search?keyword=&stage=&minScore=&sort=recent|score|<能力のkey>
 *
 * 名前・連絡先・録画はここでは返さない。年齢・性別での絞り込みはしない（公正な採用のため）。
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import {
  COMPANY_REQUIRED_MESSAGE,
  COMPETENCIES,
  getCompanyProfile,
  getTicketPrice,
  jsonResponse,
  serviceClient,
  type TalentSummary,
} from "@/lib/talent";

export const Route = createFileRoute("/api/talent/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        if (!(await getCompanyProfile(supabase, auth.userId))) {
          return jsonResponse({ error: COMPANY_REQUIRED_MESSAGE, needsCompany: true }, 403);
        }

        const url = new URL(request.url);
        const keyword = (url.searchParams.get("keyword") ?? "").trim().toLowerCase().slice(0, 50);
        const stage = url.searchParams.get("stage") ?? "";
        const minScore = Number(url.searchParams.get("minScore") ?? "") || 0;
        const sort = url.searchParams.get("sort") ?? "recent";

        const { data: rows, error } = await supabase
          .from("candidate_profiles")
          .select(
            "user_id, public_code, headline, career_stage, desired_jobs, desired_locations, summary, summary_updated_at, interview_count, average_score, show_recording",
          )
          .eq("is_public", true)
          .gt("interview_count", 0)
          .order("summary_updated_at", { ascending: false, nullsFirst: false })
          .limit(300);
        if (error) {
          console.error("[talent/search]", error);
          return jsonResponse({ error: "読み込みに失敗しました" }, 500);
        }

        const ids = (rows ?? []).map((r) => r.user_id);
        const [{ data: unlocks }, { data: requests }] = await Promise.all([
          supabase
            .from("profile_unlocks")
            .select("candidate_user_id")
            .eq("company_user_id", auth.userId)
            .in("candidate_user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
          supabase
            .from("contact_requests")
            .select("candidate_user_id, status")
            .eq("company_user_id", auth.userId)
            .in("candidate_user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
        ]);
        const unlocked = new Set((unlocks ?? []).map((u) => u.candidate_user_id));
        const statusBy = new Map((requests ?? []).map((r) => [r.candidate_user_id, r.status]));

        let list = (rows ?? []).map((r) => {
          const s = (r.summary ?? null) as TalentSummary | null;
          return {
            code: r.public_code,
            headline: r.headline,
            careerStage: r.career_stage,
            desiredJobs: r.desired_jobs,
            desiredLocations: r.desired_locations,
            overview: s?.overview ?? "",
            strengths: (s?.strengths ?? []).map((x) => x.title),
            competencies: s?.competencies ?? [],
            interviewCount: r.interview_count,
            averageScore: r.average_score,
            hasRecording: r.show_recording,
            updatedAt: r.summary_updated_at,
            unlocked: unlocked.has(r.user_id),
            contactStatus: statusBy.get(r.user_id) ?? null,
          };
        });

        if (stage) list = list.filter((c) => c.careerStage === stage);
        if (minScore) list = list.filter((c) => (c.averageScore ?? 0) >= minScore);
        if (keyword) {
          list = list.filter((c) =>
            [c.headline, c.desiredJobs, c.desiredLocations, c.overview, ...c.strengths]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(keyword),
          );
        }
        if (sort === "score") {
          list.sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0));
        } else if (COMPETENCIES.some((c) => c.key === sort)) {
          const val = (c: (typeof list)[number]) =>
            c.competencies.find((x) => x.key === sort)?.score ?? 0;
          list.sort((a, b) => val(b) - val(a));
        }

        return jsonResponse({ candidates: list.slice(0, 100), ticketPrice: getTicketPrice() });
      },
    },
  },
});
