/**
 * 受験モード：志望校について調べた内容
 *
 * GET  /api/school-info?name=&faculty=        → 保存してある内容（{ status: "ready" | "none" | "missing", text? }）
 * POST /api/school-info { name, faculty, type } → なければ AI がウェブで調べて保存する（30〜90秒）。全プラン。
 *   新しく調べるのは1人1日5校まで（すでに調べてある学校は数えない・何度でも見られる）
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { addFeatureUsage, getFeatureUsage, verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, serviceClient } from "@/lib/talent";
import { guessSchoolType, isExamSchoolType } from "@/lib/exam-schools";
import { SCHOOL_RESEARCH_PER_DAY, getSchoolInfo, researchSchool } from "@/lib/school-research";

const Body = z.object({
  name: z.string().trim().min(2).max(100),
  faculty: z.string().trim().max(100).optional().default(""),
  type: z.string().optional(),
});

export const Route = createFileRoute("/api/school-info")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const url = new URL(request.url);
        const name = (url.searchParams.get("name") ?? "").trim().slice(0, 100);
        const faculty = (url.searchParams.get("faculty") ?? "").trim().slice(0, 100);
        if (name.length < 2) return jsonResponse({ status: "missing" });
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const info = await getSchoolInfo(supabase, name, faculty);
        if (!info) return jsonResponse({ status: "missing" });
        return jsonResponse(
          info.found
            ? { status: "ready", text: info.text, sources: info.sources, updatedAt: info.updatedAt }
            : { status: "none" },
        );
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return jsonResponse({ error: "学校名を入れてください" }, 400);
        const { name, faculty } = parsed.data;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);

        const cached = await getSchoolInfo(supabase, name, faculty);
        if (cached)
          return jsonResponse(
            cached.found
              ? { status: "ready", text: cached.text, sources: cached.sources }
              : { status: "none" },
          );

        const { data: profile } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", auth.userId)
          .maybeSingle();
        const isAdmin = !!(profile as { is_admin?: boolean } | null)?.is_admin;
        if (!isAdmin) {
          const usage = await getFeatureUsage(supabase, auth.userId, "school_research");
          if (usage.today >= SCHOOL_RESEARCH_PER_DAY)
            return jsonResponse(
              {
                error: `新しく学校を調べられるのは1日${SCHOOL_RESEARCH_PER_DAY}校までです。明日またお試しください（練習はこのままできます）`,
              },
              429,
            );
        }
        const type = isExamSchoolType(parsed.data.type)
          ? parsed.data.type
          : (guessSchoolType(name) ?? "other");
        try {
          const info = await researchSchool(supabase, { name, faculty, type });
          if (!isAdmin) await addFeatureUsage(supabase, auth.userId, "school_research");
          return jsonResponse(
            info.found
              ? { status: "ready", text: info.text, sources: info.sources }
              : { status: "none" },
          );
        } catch (e) {
          console.error("[school-info] research failed", e);
          return jsonResponse(
            { error: "学校の情報を調べられませんでした。少し時間をおいてお試しください" },
            502,
          );
        }
      },
    },
  },
});
