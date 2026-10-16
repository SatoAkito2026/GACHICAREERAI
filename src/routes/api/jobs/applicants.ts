/**
 * 企業：自社の求人への応募者
 *
 * GET /api/jobs/applicants?jobId=
 *
 * 名前・ひとこと・応募日・7つの力の平均と、評価を見るためのプロフィールのコードを返す。
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, serviceClient, type TalentSummary } from "@/lib/talent";

export const Route = createFileRoute("/api/jobs/applicants")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);

        const jobId = new URL(request.url).searchParams.get("jobId") ?? "";
        const { data: job } = await supabase
          .from("job_postings")
          .select("id")
          .eq("id", jobId)
          .eq("company_user_id", auth.userId)
          .maybeSingle();
        if (!job) return jsonResponse({ error: "求人が見つかりません" }, 404);

        const { data: apps } = await supabase
          .from("job_applications")
          .select("id, applicant_user_id, message, created_at")
          .eq("job_posting_id", jobId)
          .order("created_at", { ascending: false })
          .limit(500);
        const ids = (apps ?? []).map((a) => a.applicant_user_id);
        const { data: profiles } = ids.length
          ? await supabase
              .from("candidate_profiles")
              .select("user_id, public_code, display_name, headline, summary, interview_count")
              .in("user_id", ids)
          : { data: [] };
        const by = new Map((profiles ?? []).map((p) => [p.user_id, p]));

        const applicants = (apps ?? []).map((a) => {
          const p = by.get(a.applicant_user_id);
          const s = (p?.summary ?? null) as TalentSummary | null;
          const scores = (s?.competencies ?? [])
            .map((c) => c.score)
            .filter((n): n is number => typeof n === "number");
          return {
            id: a.id,
            code: p?.public_code ?? null,
            name: p?.display_name || "（名前未登録）",
            headline: p?.headline ?? null,
            message: a.message,
            createdAt: a.created_at,
            interviewCount: p?.interview_count ?? 0,
            competencyAverage: scores.length
              ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10
              : null,
          };
        });
        return jsonResponse({ applicants });
      },
    },
  },
});
