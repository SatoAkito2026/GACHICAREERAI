/**
 * 学校：1人の生徒の練習の結果
 *
 * GET /api/school/student?id=<生徒のユーザーID>
 * 自分の学校に参加している生徒だけ見られる。
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, serviceClient } from "@/lib/talent";
import { getSchool, loadPractice } from "@/lib/school";

export const Route = createFileRoute("/api/school/student")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const school = await getSchool(supabase, auth.userId);
        if (!school) return jsonResponse({ error: "学校のアカウントで使ってください" }, 403);

        const studentId = new URL(request.url).searchParams.get("id") ?? "";
        const { data: member } = await supabase
          .from("school_memberships")
          .select("display_name, created_at")
          .eq("school_id", school.id)
          .eq("student_user_id", studentId)
          .maybeSingle();
        if (!member) return jsonResponse({ error: "この生徒は参加していません" }, 404);

        const practice = await loadPractice(supabase, [studentId], 50);
        return jsonResponse({
          name: member.display_name || "（名前未登録）",
          joinedAt: member.created_at,
          practice: practice.map((p) => ({
            id: p.id,
            date: p.created_at,
            mode: p.mode,
            target: p.job_type,
            score: p.feedback?.readiness_score ?? null,
            overall: p.feedback?.overall_impression ?? "",
            scoreBreakdown: p.feedback?.score_breakdown ?? [],
            goodPoints: p.feedback?.good_points ?? [],
            improvementPoints: p.feedback?.improvement_points ?? [],
          })),
        });
      },
    },
  },
});
