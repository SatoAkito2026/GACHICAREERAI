/**
 * 個人：掲載中の求人
 *
 * GET /api/jobs/public            → 一覧（新しい順）
 * GET /api/jobs/public?id=<id>    → 1件の詳細
 *
 * 会社名をつけて返す。ログインしていれば、応募済みかどうかも返す。
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { getCompanyProfile, jsonResponse, serviceClient } from "@/lib/talent";

const LIST_COLUMNS =
  "id, company_user_id, title, job_type, employment_type, salary_range, location, work_style, thumbnail_path, created_at";
const DETAIL_COLUMNS = `${LIST_COLUMNS}, description, working_hours, holidays, benefits, selection_process, application_requirements, ideal_candidate, company_appeal`;

export const Route = createFileRoute("/api/jobs/public")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);

        const id = new URL(request.url).searchParams.get("id");
        const query = supabase
          .from("job_postings")
          .select(id ? DETAIL_COLUMNS : LIST_COLUMNS)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(id ? 1 : 200);
        const { data, error } = id ? await query.eq("id", id) : await query;
        if (error) {
          console.error("[jobs/public]", error);
          return jsonResponse({ error: "読み込みに失敗しました" }, 500);
        }
        const rows = (data ?? []) as unknown as Record<string, unknown>[];
        if (id && rows.length === 0) {
          return jsonResponse({ error: "この求人は募集を終了しました" }, 404);
        }

        const companyIds = [...new Set(rows.map((r) => r.company_user_id as string))];
        const names = new Map<string, string>();
        for (const cid of companyIds) {
          names.set(cid, (await getCompanyProfile(supabase, cid))?.company_name ?? "企業名未登録");
        }
        const { data: applied } = await supabase
          .from("job_applications")
          .select("job_posting_id")
          .eq("applicant_user_id", auth.userId)
          .in(
            "job_posting_id",
            rows.length
              ? rows.map((r) => r.id as string)
              : ["00000000-0000-0000-0000-000000000000"],
          );
        const appliedSet = new Set((applied ?? []).map((a) => a.job_posting_id));

        const jobs = rows.map(({ company_user_id, ...r }) => ({
          ...r,
          company_name: names.get(company_user_id as string) ?? "企業名未登録",
          applied: appliedSet.has(r.id as string),
        }));

        if (!id) return jsonResponse({ jobs });
        const { data: cp } = await supabase
          .from("candidate_profiles")
          .select("display_name")
          .eq("user_id", auth.userId)
          .maybeSingle();
        return jsonResponse({ job: jobs[0], myName: cp?.display_name ?? "" });
      },
    },
  },
});
