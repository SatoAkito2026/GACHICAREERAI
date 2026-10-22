/**
 * 企業向け：チケットを買った人（と、自社の求人に応募してきた人）の一覧
 *
 * GET /api/talent/purchased
 *
 * 名前・ひとこと・購入日・買った結果の数・最後に練習した日・面談の状況を返す。
 * 面接ごとの詳しい評価は /api/talent/detail で見る。
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import {
  COMPANY_REQUIRED_MESSAGE,
  getCompanyProfile,
  jsonResponse,
  serviceClient,
} from "@/lib/talent";

export const Route = createFileRoute("/api/talent/purchased")({
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

        const { data: unlocks } = await supabase
          .from("profile_unlocks")
          .select("candidate_user_id, interview_id, created_at, amount")
          .eq("company_user_id", auth.userId)
          .order("created_at", { ascending: false })
          .limit(500);
        // 同じ人の結果を複数買っていても、人ごとに1行にまとめる
        const byPerson = new Map<
          string,
          {
            candidate_user_id: string;
            created_at: string;
            viaApplication: boolean;
            all: boolean;
            count: number;
          }
        >();
        for (const u of unlocks ?? []) {
          const row = byPerson.get(u.candidate_user_id) ?? {
            candidate_user_id: u.candidate_user_id,
            created_at: u.created_at,
            viaApplication: false,
            all: false,
            count: 0,
          };
          if (u.interview_id) row.count += 1;
          else {
            row.all = true;
            if (u.amount === 0) row.viaApplication = true;
          }
          byPerson.set(u.candidate_user_id, row);
        }
        const ids = [...byPerson.keys()];
        if (ids.length === 0) return jsonResponse({ people: [] });

        const [{ data: profiles }, { data: requests }, { data: latest }] = await Promise.all([
          supabase
            .from("candidate_profiles")
            .select("user_id, public_code, display_name, headline, desired_jobs")
            .in("user_id", ids),
          supabase
            .from("contact_requests")
            .select("candidate_user_id, status")
            .eq("company_user_id", auth.userId)
            .in("candidate_user_id", ids),
          supabase
            .from("interviews")
            .select("user_id, created_at")
            .in("user_id", ids)
            .eq("mode", "individual")
            .order("created_at", { ascending: false })
            .limit(2000),
        ]);
        const profileBy = new Map((profiles ?? []).map((p) => [p.user_id, p]));
        const statusBy = new Map((requests ?? []).map((r) => [r.candidate_user_id, r.status]));
        const lastPracticeBy = new Map<string, string>();
        for (const iv of latest ?? []) {
          if (!lastPracticeBy.has(iv.user_id)) lastPracticeBy.set(iv.user_id, iv.created_at);
        }

        const people = [...byPerson.values()]
          .map((u) => {
            const p = profileBy.get(u.candidate_user_id);
            if (!p) return null;
            return {
              code: p.public_code,
              displayName: p.display_name || "（名前未登録）",
              headline: p.headline,
              desiredJobs: p.desired_jobs,
              // 見られる結果の数（null＝公開中の結果すべて）
              boughtResults: u.all ? null : u.count,
              purchasedAt: u.created_at,
              viaApplication: u.viaApplication,
              lastPracticeAt: lastPracticeBy.get(u.candidate_user_id) ?? null,
              contactStatus: statusBy.get(u.candidate_user_id) ?? null,
            };
          })
          .filter(Boolean);

        return jsonResponse({ people });
      },
    },
  },
});
