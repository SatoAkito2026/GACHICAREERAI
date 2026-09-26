/**
 * 候補者データベース(企業向け)
 *
 * GET /api/candidate-database?minScore=&maxScore=&prefecture=&minAge=&maxAge=&keyword=&sort=&bookmarkedOnly=
 *
 * 「総評閲覧プラン」加入企業のみアクセス可能。
 * 顔・氏名・詳細住所・電話番号・メールアドレスは一切返さない(都道府県のみ)。
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey, verifyApiUser } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function extractPrefecture(address?: string | null): string | null {
  if (!address) return null;
  const match = address.match(/^(北海道|東京都|(?:京都|大阪)府|.{2,3}県)/);
  return match ? match[1] : null;
}

function calcAge(birthdate?: string | null): number | null {
  if (!birthdate) return null;
  const d = new Date(birthdate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export const Route = createFileRoute("/api/candidate-database")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Server config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);

        // 総評閲覧プランへの加入確認
        const { data: companyProfile } = await supabase
          .from("profiles")
          .select("candidate_view_addon_active, candidate_view_addon_expires_at")
          .eq("id", auth.userId)
          .maybeSingle();
        const isActive =
          !!companyProfile?.candidate_view_addon_active &&
          (!companyProfile?.candidate_view_addon_expires_at ||
            new Date(companyProfile.candidate_view_addon_expires_at).getTime() > Date.now());
        if (!isActive) return json({ error: "candidate_view プランへの加入が必要です" }, 402);

        const url = new URL(request.url);
        const minScore = url.searchParams.get("minScore");
        const prefecture = url.searchParams.get("prefecture");
        const minAge = url.searchParams.get("minAge");
        const maxAge = url.searchParams.get("maxAge");
        const keyword = url.searchParams.get("keyword");
        const sort = url.searchParams.get("sort") ?? "recent";
        const bookmarkedOnly = url.searchParams.get("bookmarkedOnly") === "true";

        // 公開対象の模擬面接一覧を取得
        const { data: interviews } = await supabase
          .from("interviews")
          .select(
            "id, user_id, job_type, created_at, interview_summaries(overview, positives, concerns, radar_scores, red_flags)",
          )
          .eq("listed_for_companies", true)
          .order("created_at", { ascending: false })
          .limit(200);

        if (!interviews || interviews.length === 0) return json({ ok: true, candidates: [] });

        const userIds = Array.from(new Set(interviews.map((i: any) => i.user_id)));

        const { data: profilesData } = await supabase
          .from("user_career_profiles")
          .select("user_id, basic_info")
          .in("user_id", userIds)
          .eq("mode", "individual");
        const profileByUser = new Map((profilesData ?? []).map((p: any) => [p.user_id, p]));

        const { data: bookmarks } = await supabase
          .from("candidate_bookmarks")
          .select("candidate_user_id")
          .eq("company_user_id", auth.userId);
        const bookmarkedSet = new Set((bookmarks ?? []).map((b: any) => b.candidate_user_id));

        let candidates = interviews.map((iv: any) => {
          const summary = Array.isArray(iv.interview_summaries)
            ? iv.interview_summaries[0]
            : iv.interview_summaries;
          const profile = profileByUser.get(iv.user_id);
          const basicInfo = (profile?.basic_info ?? {}) as Record<string, any>;
          const radarScores = summary?.radar_scores ?? {};
          const overallScore =
            typeof radarScores === "object" && radarScores
              ? Math.round(
                  (
                    Object.values(radarScores).filter((v) => typeof v === "number") as number[]
                  ).reduce((a, b) => a + b, 0) /
                    Math.max(
                      1,
                      Object.values(radarScores).filter((v) => typeof v === "number").length,
                    ),
                )
              : null;

          return {
            interviewId: iv.id,
            candidateUserId: iv.user_id,
            jobType: iv.job_type,
            interviewedAt: iv.created_at,
            prefecture: extractPrefecture(basicInfo.address),
            age: calcAge(basicInfo.birthdate),
            overview: summary?.overview ?? null,
            positives: summary?.positives ?? null,
            concerns: summary?.concerns ?? null,
            redFlags: summary?.red_flags ?? null,
            radarScores,
            overallScore,
            isBookmarked: bookmarkedSet.has(iv.user_id),
          };
        });

        if (minScore)
          candidates = candidates.filter((c) => (c.overallScore ?? 0) >= Number(minScore));
        if (prefecture) candidates = candidates.filter((c) => c.prefecture === prefecture);
        if (minAge)
          candidates = candidates.filter((c) => c.age !== null && c.age >= Number(minAge));
        if (maxAge)
          candidates = candidates.filter((c) => c.age !== null && c.age <= Number(maxAge));
        if (keyword) {
          const kw = keyword.toLowerCase();
          candidates = candidates.filter(
            (c) =>
              (c.overview ?? "").toLowerCase().includes(kw) ||
              (c.positives ?? "").toLowerCase().includes(kw) ||
              (c.jobType ?? "").toLowerCase().includes(kw),
          );
        }
        if (bookmarkedOnly) candidates = candidates.filter((c) => c.isBookmarked);

        if (sort === "score_desc")
          candidates.sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));
        else if (sort === "score_asc")
          candidates.sort((a, b) => (a.overallScore ?? 0) - (b.overallScore ?? 0));
        else if (sort === "age_asc") candidates.sort((a, b) => (a.age ?? 999) - (b.age ?? 999));
        // "recent" はデフォルトの並び順(既にcreated_at降順)のまま

        return json({ ok: true, candidates });
      },
    },
  },
});
