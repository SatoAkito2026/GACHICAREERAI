/**
 * 企業向け：1人分の公開中の面接の結果
 *
 * GET /api/talent/detail?code=<public_code>
 *
 * 結果ごとに値段と購入済みかを返す。買った結果だけ、詳しい評価・会話・録画（本人が許可した場合）も返す。
 * どれか1つでも買っていれば、名前を見て面談を申し込める。
 */
import { priceCoins } from "@/lib/coins";
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import {
  COMPANY_REQUIRED_MESSAGE,
  canSeeInterview,
  getCompanyProfile,
  getCoinBalance,
  getPaidViewCounts,
  getUnlockAccess,
  jsonResponse,
  loadCompanyInterviews,
  loadShownResults,
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
        const access = p
          ? (await getUnlockAccess(supabase, auth.userId, [p.user_id])).get(p.user_id)
          : undefined;
        // 非公開になった人は、購入済みの企業にだけ見せ続ける
        if (!p || (!p.is_public && !access)) {
          return jsonResponse({ error: "このプロフィールは公開されていません" }, 404);
        }
        if (p.user_id === auth.userId) {
          return jsonResponse({ error: "ご自身のプロフィールです" }, 400);
        }

        const [{ data: contact }, shown, views, coins] = await Promise.all([
          supabase
            .from("contact_requests")
            .select("id, status, created_at")
            .eq("company_user_id", auth.userId)
            .eq("candidate_user_id", p.user_id)
            .maybeSingle(),
          loadShownResults(supabase, [p.user_id], 100),
          getPaidViewCounts(supabase, [p.user_id]),
          getCoinBalance(supabase, auth.userId),
        ]);
        // 非公開になった人・公開から外された結果は、買った結果だけ見せ続ける
        const visible = shown.filter((r) => p.is_public || canSeeInterview(access, r.id));
        const boughtIds = [...(access?.ids ?? [])];
        const details = access
          ? await loadCompanyInterviews(supabase, p.user_id, !!p.show_recording, {
              onlyShown: false,
              ids: access.all ? visible.map((r) => r.id) : boughtIds,
            })
          : [];
        const detailBy = new Map(details.map((d) => [d.id, d]));
        // 買ったあとに公開から外された結果も、買った企業には見せ続ける
        for (const d of details) {
          if (!visible.some((r) => r.id === d.id)) {
            visible.push({
              id: d.id,
              userId: p.user_id,
              date: d.date,
              jobType: d.jobType,
              avatarStyle: d.settings?.avatar_style ?? null,
              overview: d.recruiterView?.summary ?? "",
              strengths: (d.recruiterView?.strengths ?? []).map((x) => x.point).slice(0, 3),
              competencies: d.competencies.map((c) => ({
                key: c.key,
                label: c.label,
                score: c.score,
              })),
              average: null,
              hasRecording: !!d.recordingUrl,
            });
          }
        }
        const paidViews = views.get(p.user_id) ?? 0;
        const results = visible
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .map((r) => ({
            id: r.id,
            date: r.date,
            jobType: r.jobType,
            avatarStyle: r.avatarStyle,
            overview: r.overview,
            strengths: r.strengths,
            competencies: r.competencies,
            average:
              r.average ??
              (() => {
                const s = r.competencies
                  .map((c) => c.score)
                  .filter((n): n is number => typeof n === "number");
                return s.length
                  ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10
                  : null;
              })(),
            hasRecording: r.hasRecording && !!p.show_recording,
            priceCoins: priceCoins(r.average, paidViews),
            unlocked: canSeeInterview(access, r.id),
            detail: detailBy.get(r.id) ?? null,
          }));

        return jsonResponse({
          code: p.public_code,
          headline: p.headline,
          careerStage: p.career_stage,
          desiredJobs: p.desired_jobs,
          desiredLocations: p.desired_locations,
          selfPr: p.self_pr,
          coins,
          unlocked: !!access,
          contact,
          results,
          ...(access
            ? { displayName: p.display_name || "（名前未登録）", unlockedAt: access.firstAt }
            : {}),
        });
      },
    },
  },
});
