/**
 * 企業向け：公開されている面接の結果の一覧（匿名）
 *
 * GET /api/talent/search?keyword=&stage=&job=&area=&minScore=&sort=recent|score|<能力のkey>
 *
 * 本人が公開に選んだ面接の結果を1つずつ別のカードとして返す（同じ人でも結果ごとに評価・値段が別）。
 * 名前・連絡先・録画はここでは返さない。年齢・性別での絞り込みはしない（公正な採用のため）。
 */
import { priceCoins } from "@/lib/coins";
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import {
  COMPANY_REQUIRED_MESSAGE,
  COMPETENCIES,
  canSeeInterview,
  getCompanyProfile,
  getCoinBalance,
  getPaidViewCounts,
  getUnlockAccess,
  jsonResponse,
  loadShownResults,
  serviceClient,
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
        // 企業向けの点数は「7つの評価」の平均（1〜5）。本人向けの練習の点数（100点満点）は使わない
        const minScore = Number(url.searchParams.get("minScore") ?? "") || 0;
        const sort = url.searchParams.get("sort") ?? "recent";
        const job = (url.searchParams.get("job") ?? "").trim().slice(0, 50);
        const area = (url.searchParams.get("area") ?? "").trim().slice(0, 20);

        const { data: rows, error } = await supabase
          .from("candidate_profiles")
          .select(
            "user_id, public_code, headline, career_stage, desired_jobs, desired_locations, show_recording",
          )
          .eq("is_public", true)
          .neq("user_id", auth.userId)
          .limit(500);
        if (error) {
          console.error("[talent/search]", error);
          return jsonResponse({ error: "読み込みに失敗しました" }, 500);
        }

        const profileBy = new Map((rows ?? []).map((r) => [r.user_id, r]));
        const ids = [...profileBy.keys()];
        const [results, access, paidViews, { data: requests }] = await Promise.all([
          loadShownResults(supabase, ids),
          getUnlockAccess(supabase, auth.userId, ids),
          getPaidViewCounts(supabase, ids),
          supabase
            .from("contact_requests")
            .select("candidate_user_id, status")
            .eq("company_user_id", auth.userId)
            .in("candidate_user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
        ]);
        const statusBy = new Map((requests ?? []).map((r) => [r.candidate_user_id, r.status]));

        let list = results.map((r) => {
          const p = profileBy.get(r.userId)!;
          return {
            id: r.id,
            code: p.public_code,
            headline: p.headline,
            careerStage: p.career_stage,
            desiredJobs: p.desired_jobs,
            desiredLocations: p.desired_locations,
            date: r.date,
            jobType: r.jobType,
            avatarStyle: r.avatarStyle,
            overview: r.overview,
            strengths: r.strengths,
            competencies: r.competencies,
            competencyAverage: r.average,
            priceCoins: priceCoins(r.average, paidViews.get(r.userId) ?? 0),
            hasRecording: r.hasRecording && !!p.show_recording,
            unlocked: canSeeInterview(access.get(r.userId), r.id),
            contactStatus: statusBy.get(r.userId) ?? null,
          };
        });

        if (stage) list = list.filter((c) => c.careerStage === stage);
        if (job) {
          list = list.filter((c) => c.jobType === job || (c.desiredJobs ?? "").includes(job));
        }
        if (area) list = list.filter((c) => (c.desiredLocations ?? "").includes(area));
        if (minScore) list = list.filter((c) => (c.competencyAverage ?? 0) >= minScore);
        if (keyword) {
          list = list.filter((c) =>
            [c.headline, c.desiredJobs, c.desiredLocations, c.overview, c.jobType, ...c.strengths]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(keyword),
          );
        }
        if (sort === "score") {
          list.sort((a, b) => (b.competencyAverage ?? 0) - (a.competencyAverage ?? 0));
        } else if (COMPETENCIES.some((c) => c.key === sort)) {
          const val = (c: (typeof list)[number]) =>
            c.competencies.find((x) => x.key === sort)?.score ?? 0;
          list.sort((a, b) => val(b) - val(a));
        }

        return jsonResponse({
          results: list.slice(0, 100),
          coins: await getCoinBalance(supabase, auth.userId),
        });
      },
    },
  },
});
