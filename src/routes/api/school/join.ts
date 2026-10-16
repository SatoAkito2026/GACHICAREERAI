/**
 * 生徒：学校とつながる
 *
 * GET  /api/school/join                         → 参加している学校
 * POST /api/school/join { code, name }          → 招待コードで参加
 * POST /api/school/join { action: "leave", schoolId } → 抜ける（先生から見えなくなる）
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, serviceClient } from "@/lib/talent";

export const Route = createFileRoute("/api/school/join")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const { data } = await supabase
          .from("school_memberships")
          .select("school_id, display_name, created_at, companies(name)")
          .eq("student_user_id", auth.userId);
        return jsonResponse({
          schools: (data ?? []).map((m: any) => ({
            id: m.school_id,
            name: m.companies?.name ?? "（学校名未登録）",
            displayName: m.display_name,
            joinedAt: m.created_at,
          })),
        });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const body = (await request.json().catch(() => null)) as {
          action?: string;
          schoolId?: string;
          code?: string;
          name?: string;
        } | null;

        if (body?.action === "leave") {
          if (typeof body.schoolId !== "string") {
            return jsonResponse({ error: "不正なリクエストです" }, 400);
          }
          await supabase
            .from("school_memberships")
            .delete()
            .eq("school_id", body.schoolId)
            .eq("student_user_id", auth.userId);
          return jsonResponse({ ok: true });
        }

        const code = String(body?.code ?? "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
        const name = String(body?.name ?? "")
          .trim()
          .slice(0, 50);
        if (!code) return jsonResponse({ error: "招待コードを入力してください" }, 400);
        if (!name) return jsonResponse({ error: "お名前を入力してください" }, 400);
        const { data: school } = await supabase
          .from("companies")
          .select("id, name")
          .eq("join_code", code)
          .maybeSingle();
        if (!school) return jsonResponse({ error: "招待コードが見つかりません" }, 404);

        const { error } = await supabase
          .from("school_memberships")
          .upsert(
            { school_id: school.id, student_user_id: auth.userId, display_name: name },
            { onConflict: "school_id,student_user_id" },
          );
        if (error) {
          console.error("[school/join]", error);
          return jsonResponse({ error: "参加に失敗しました" }, 500);
        }
        return jsonResponse({ ok: true, schoolName: school.name });
      },
    },
  },
});
