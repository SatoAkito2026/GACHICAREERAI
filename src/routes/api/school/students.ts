/**
 * 学校：参加している生徒の一覧と練習の状況
 *
 * GET  /api/school/students                 → 学校名・招待コード・生徒ごとの回数／点数
 * POST /api/school/students { action: "new-code" } → 招待コードを作り直す（古いコードは使えなくなる）
 * POST /api/school/students { action: "remove", studentId } → 生徒を外す
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, serviceClient } from "@/lib/talent";
import { getSchool, issueJoinCode, loadPractice } from "@/lib/school";

export const Route = createFileRoute("/api/school/students")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const school = await getSchool(supabase, auth.userId);
        if (!school) return jsonResponse({ error: "学校のアカウントで使ってください" }, 403);
        const joinCode = school.joinCode ?? (await issueJoinCode(supabase, school.id));

        const { data: members } = await supabase
          .from("school_memberships")
          .select("student_user_id, display_name, created_at")
          .eq("school_id", school.id)
          .order("created_at", { ascending: true })
          .limit(1000);
        const practice = await loadPractice(
          supabase,
          (members ?? []).map((m) => m.student_user_id),
        );
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const students = (members ?? []).map((m) => {
          const mine = practice.filter((p) => p.user_id === m.student_user_id);
          const scores = mine
            .map((p) => p.feedback?.readiness_score)
            .filter((n): n is number => typeof n === "number");
          const recent = scores.slice(0, 5);
          return {
            id: m.student_user_id,
            name: m.display_name || "（名前未登録）",
            joinedAt: m.created_at,
            practiceCount: mine.length,
            monthCount: mine.filter((p) => new Date(p.created_at) >= monthStart).length,
            lastPracticeAt: mine[0]?.created_at ?? null,
            latestScore: scores[0] ?? null,
            firstScore: scores.length ? scores[scores.length - 1] : null,
            recentAverage: recent.length
              ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length)
              : null,
          };
        });
        return jsonResponse({ school: { name: school.name, joinCode }, students });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const school = await getSchool(supabase, auth.userId);
        if (!school) return jsonResponse({ error: "学校のアカウントで使ってください" }, 403);
        const body = (await request.json().catch(() => null)) as {
          action?: string;
          studentId?: string;
        } | null;
        if (body?.action === "new-code") {
          return jsonResponse({ joinCode: await issueJoinCode(supabase, school.id) });
        }
        if (body?.action === "remove" && typeof body.studentId === "string") {
          await supabase
            .from("school_memberships")
            .delete()
            .eq("school_id", school.id)
            .eq("student_user_id", body.studentId);
          return jsonResponse({ ok: true });
        }
        return jsonResponse({ error: "不正なリクエストです" }, 400);
      },
    },
  },
});
