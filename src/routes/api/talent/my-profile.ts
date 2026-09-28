/**
 * ユーザー本人の公開プロフィール
 *
 * GET  /api/talent/my-profile                 → プロフィール・人物まとめ・練習回数
 * POST /api/talent/my-profile { ...fields }   → 保存（公開するには同意が必要）
 * POST /api/talent/my-profile { action: "refresh" } → 人物まとめを今すぐ作り直す
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { CAREER_STAGES, jsonResponse, refreshCandidateSummary, serviceClient } from "@/lib/talent";

const TEXT_LIMITS = {
  display_name: 60,
  headline: 80,
  desired_jobs: 200,
  desired_locations: 200,
  self_pr: 1500,
} as const;

async function countPractice(supabase: any, userId: string): Promise<number> {
  const { count } = await supabase
    .from("interviews")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("mode", "individual")
    .neq("impression", "途中退出");
  return count ?? 0;
}

export const Route = createFileRoute("/api/talent/my-profile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);

        const { data: profile } = await supabase
          .from("candidate_profiles")
          .select("*")
          .eq("user_id", auth.userId)
          .maybeSingle();
        const { count: unlocks } = await supabase
          .from("profile_unlocks")
          .select("id", { count: "exact", head: true })
          .eq("candidate_user_id", auth.userId);
        return jsonResponse({
          profile,
          practiceCount: await countPractice(supabase, auth.userId),
          unlockCount: unlocks ?? 0,
        });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);

        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }

        const { data: existing } = await supabase
          .from("candidate_profiles")
          .select("user_id, consented_at, summary_updated_at, summary")
          .eq("user_id", auth.userId)
          .maybeSingle();

        if (body.action === "refresh") {
          if (!existing) return jsonResponse({ error: "先にプロフィールを保存してください" }, 400);
          const last = existing.summary_updated_at
            ? new Date(existing.summary_updated_at).getTime()
            : 0;
          if (existing.summary && Date.now() - last < 3 * 60 * 1000) {
            return jsonResponse({ error: "少し時間をおいてからもう一度お試しください" }, 429);
          }
          const summary = await refreshCandidateSummary(supabase, auth.userId);
          return jsonResponse({ ok: true, summary });
        }

        const row: Record<string, unknown> = {
          user_id: auth.userId,
          updated_at: new Date().toISOString(),
        };
        for (const [key, max] of Object.entries(TEXT_LIMITS)) {
          if (key in body) {
            const v =
              typeof body[key] === "string" ? (body[key] as string).trim().slice(0, max) : "";
            row[key] = v || null;
          }
        }
        if ("career_stage" in body) {
          row.career_stage =
            typeof body.career_stage === "string" && CAREER_STAGES[body.career_stage]
              ? body.career_stage
              : null;
        }
        for (const key of ["record_practice", "show_recording"] as const) {
          if (key in body) row[key] = body[key] === true;
        }

        if ("is_public" in body) {
          const wantPublic = body.is_public === true;
          if (wantPublic) {
            if (!existing?.consented_at && body.consent !== true) {
              return jsonResponse({ error: "公開するには同意が必要です" }, 400);
            }
            if ((await countPractice(supabase, auth.userId)) === 0) {
              return jsonResponse(
                { error: "公開するには、模擬面接（個人）を1回以上受けてください" },
                400,
              );
            }
            if (!existing?.consented_at) row.consented_at = new Date().toISOString();
          }
          row.is_public = wantPublic;
        }

        const { data, error } = await supabase
          .from("candidate_profiles")
          .upsert(row, { onConflict: "user_id" })
          .select("*")
          .maybeSingle();
        if (error) {
          console.error("[talent/my-profile] save failed", error);
          return jsonResponse({ error: "保存に失敗しました" }, 500);
        }

        // 初めて公開したときなど、まとめがまだ無ければすぐ作る
        if (data?.is_public && !data.summary) {
          const summary = await refreshCandidateSummary(supabase, auth.userId);
          return jsonResponse({ ok: true, profile: { ...data, summary } });
        }
        return jsonResponse({ ok: true, profile: data });
      },
    },
  },
});
