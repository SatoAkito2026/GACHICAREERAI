/**
 * 企業向け：1人分のプロフィール
 *
 * GET /api/talent/detail?code=<public_code>
 *
 * チケット購入前：匿名の人物まとめ（根拠の引用つき）だけ
 * チケット購入後：名前・面接ごとの詳しい評価・会話・録画（本人が許可した場合）も返す
 */
import { evaluationAverage, priceCoins } from "@/lib/coins";
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import {
  COMPANY_REQUIRED_MESSAGE,
  getCompanyProfile,
  getCoinBalance,
  getPaidViewCounts,
  jsonResponse,
  loadCompanyInterviews,
  serviceClient,
} from "@/lib/talent";

export const Route = createFileRoute("/api/talent/detail")({
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

        const code = new URL(request.url).searchParams.get("code") ?? "";
        const { data: p } = await supabase
          .from("candidate_profiles")
          .select("*")
          .eq("public_code", code)
          .maybeSingle();
        const { data: unlock } = p
          ? await supabase
              .from("profile_unlocks")
              .select("id, created_at")
              .eq("company_user_id", auth.userId)
              .eq("candidate_user_id", p.user_id)
              .maybeSingle()
          : { data: null };
        // 非公開になった人は、購入済みの企業にだけ見せ続ける
        if (!p || (!p.is_public && !unlock)) {
          return jsonResponse({ error: "このプロフィールは公開されていません" }, 404);
        }
        if (p.user_id === auth.userId) {
          return jsonResponse({ error: "ご自身のプロフィールです" }, 400);
        }

        const { data: contact } = await supabase
          .from("contact_requests")
          .select("id, status, created_at")
          .eq("company_user_id", auth.userId)
          .eq("candidate_user_id", p.user_id)
          .maybeSingle();

        const base = {
          code: p.public_code,
          headline: p.headline,
          careerStage: p.career_stage,
          desiredJobs: p.desired_jobs,
          desiredLocations: p.desired_locations,
          selfPr: p.self_pr,
          summary: p.summary,
          interviewCount: p.interview_count,
          hasRecording: p.show_recording,
          priceCoins: priceCoins(
            evaluationAverage(
              (p.summary as { competencies?: { score: number | null }[] } | null)?.competencies,
            ),
            (await getPaidViewCounts(supabase, [p.user_id])).get(p.user_id) ?? 0,
          ),
          coins: await getCoinBalance(supabase, auth.userId),
          unlocked: !!unlock,
          contact,
        };
        if (!unlock) return jsonResponse(base);

        // ---- 購入済み：詳しい情報 ----
        const details = await loadCompanyInterviews(supabase, p.user_id, !!p.show_recording);

        return jsonResponse({
          ...base,
          displayName: p.display_name || "（名前未登録）",
          unlockedAt: unlock.created_at,
          interviews: details,
        });
      },
    },
  },
});
