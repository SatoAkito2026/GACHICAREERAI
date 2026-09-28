/**
 * 企業向け：1人分のプロフィール
 *
 * GET /api/talent/detail?code=<public_code>
 *
 * チケット購入前：匿名の人物まとめ（根拠の引用つき）だけ
 * チケット購入後：名前・面接ごとの詳しい評価・会話・録画（本人が許可した場合）も返す
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import {
  COMPANY_REQUIRED_MESSAGE,
  RECORDING_BUCKET,
  getCompanyProfile,
  getTicketPrice,
  jsonResponse,
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
          averageScore: p.average_score,
          hasRecording: p.show_recording,
          ticketPrice: getTicketPrice(),
          unlocked: !!unlock,
          contact,
        };
        if (!unlock) return jsonResponse(base);

        // ---- 購入済み：詳しい情報 ----
        const { data: interviews } = await supabase
          .from("interviews")
          .select("id, created_at, job_type, recording_path")
          .eq("user_id", p.user_id)
          .eq("mode", "individual")
          .neq("impression", "途中退出")
          .order("created_at", { ascending: false })
          .limit(10);
        const ids = (interviews ?? []).map((i) => i.id);
        const [{ data: summaries }, { data: turns }] = await Promise.all([
          supabase
            .from("interview_summaries")
            .select("interview_id, practice_feedback")
            .in("interview_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
          supabase
            .from("interview_turns")
            .select("interview_id, turn_number, question, memo")
            .in("interview_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
            .order("turn_number", { ascending: true }),
        ]);
        const fb = new Map(
          (summaries ?? []).map((s: any) => [s.interview_id, s.practice_feedback]),
        );

        const details = [];
        for (const iv of interviews ?? []) {
          let recordingUrl: string | null = null;
          if (p.show_recording && iv.recording_path) {
            const { data: signed } = await supabase.storage
              .from(RECORDING_BUCKET)
              .createSignedUrl(iv.recording_path, 60 * 60);
            recordingUrl = signed?.signedUrl ?? null;
          }
          const f = (fb.get(iv.id) ?? {}) as any;
          details.push({
            id: iv.id,
            date: iv.created_at,
            jobType: iv.job_type,
            recordingUrl,
            score: f.readiness_score ?? null,
            overall: f.overall_impression ?? "",
            scoreBreakdown: f.score_breakdown ?? [],
            competencies: f.competencies ?? [],
            goodPoints: f.good_points ?? [],
            improvementPoints: f.improvement_points ?? [],
            transcript: (turns ?? [])
              .filter((t) => t.interview_id === iv.id)
              .map((t) => ({ q: t.question, a: t.memo })),
          });
        }

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
