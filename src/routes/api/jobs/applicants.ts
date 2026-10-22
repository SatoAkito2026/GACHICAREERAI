/**
 * 企業：自社の求人への応募者
 *
 * GET /api/jobs/applicants?jobId=
 *
 * 名前・ひとこと・応募日・7つの力の平均と、評価を見るためのプロフィールのコードを返す。
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, loadShownResults, serviceClient } from "@/lib/talent";

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
              .select("user_id, public_code, display_name, headline")
              .in("user_id", ids)
          : { data: [] };
        const by = new Map((profiles ?? []).map((p) => [p.user_id, p]));
        // 公開中の結果の数（結果は1つずつ別物なので、平均はまとめない）
        const shownCount = new Map<string, number>();
        for (const r of await loadShownResults(supabase, ids)) {
          shownCount.set(r.userId, (shownCount.get(r.userId) ?? 0) + 1);
        }

        const applicants = (apps ?? []).map((a) => {
          const p = by.get(a.applicant_user_id);
          return {
            id: a.id,
            code: p?.public_code ?? null,
            name: p?.display_name || "（名前未登録）",
            headline: p?.headline ?? null,
            message: a.message,
            createdAt: a.created_at,
            resultCount: shownCount.get(a.applicant_user_id) ?? 0,
          };
        });
        return jsonResponse({ applicants });
      },
    },
  },
});
