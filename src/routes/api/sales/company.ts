/**
 * 営業ロープレ：会社（企業アカウント）の管理
 *
 * GET  /api/sales/company → 招待コード・社員ごとの練習の状況・資料・最近のロープレ
 * POST /api/sales/company { action: "newCode" }                    → 招待コードを作る（作り直す）
 * POST /api/sales/company { action: "addMaterial", title, content } → 資料を足す（文字だけ）
 * POST /api/sales/company { action: "deleteMaterial", id }         → 資料を消す
 * POST /api/sales/company { action: "removeMember", userId }       → 社員を外す
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, serviceClient } from "@/lib/talent";
import { SCENARIOS, getSalesCompany, issueSalesJoinCode } from "@/lib/sales-roleplay";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("newCode") }),
  z.object({
    action: z.literal("addMaterial"),
    kind: z.enum(["script", "product", "minutes", "other"]),
    scenario: z.enum(["all", "door", "inbound", "teleapo", "b2b"]),
    title: z.string().trim().min(1).max(80),
    content: z.string().trim().min(1).max(20000),
  }),
  z.object({ action: z.literal("deleteMaterial"), id: z.string().uuid() }),
  z.object({ action: z.literal("removeMember"), userId: z.string().uuid() }),
]);

export const Route = createFileRoute("/api/sales/company")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const company = await getSalesCompany(supabase, auth.userId);
        if (!company) return jsonResponse({ error: "企業アカウントでログインしてください" }, 403);
        const joinCode = company.joinCode ?? (await issueSalesJoinCode(supabase, company.id));

        const [{ data: members }, { data: materials }, { data: plays }] = await Promise.all([
          supabase
            .from("sales_memberships")
            .select("user_id, display_name, created_at")
            .eq("company_id", company.id)
            .order("created_at", { ascending: true }),
          supabase
            .from("sales_materials")
            .select("id, kind, scenario, title, content, created_at")
            .eq("company_id", company.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("sales_roleplays")
            .select("id, user_id, scenario, difficulty, status, outcome, evaluation, started_at")
            .eq("company_id", company.id)
            .order("started_at", { ascending: false })
            .limit(500),
        ]);
        const memberIds = new Set((members ?? []).map((m) => m.user_id));
        const done = (plays ?? []).filter((p) => p.status === "done" && memberIds.has(p.user_id));
        const avg = (p: (typeof done)[number]) =>
          (p.evaluation as { average?: number } | null)?.average ?? null;
        return jsonResponse({
          company: { name: company.name, joinCode },
          members: (members ?? []).map((m) => {
            const mine = done.filter((p) => p.user_id === m.user_id);
            const scores = mine.map(avg).filter((v): v is number => typeof v === "number");
            return {
              userId: m.user_id,
              name: m.display_name,
              joinedAt: m.created_at,
              count: mine.length,
              lastAt: mine[0]?.started_at ?? null,
              latest: scores[0] ?? null,
              average: scores.length
                ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
                : null,
            };
          }),
          materials: (materials ?? []).map((m) => ({
            id: m.id,
            kind: m.kind,
            scenario: m.scenario,
            title: m.title,
            length: m.content.length,
            preview: m.content.slice(0, 120),
            createdAt: m.created_at,
          })),
          recent: done.slice(0, 50).map((p) => ({
            id: p.id,
            userId: p.user_id,
            scenario: p.scenario,
            scenarioLabel: SCENARIOS[p.scenario as keyof typeof SCENARIOS]?.label ?? p.scenario,
            difficulty: p.difficulty,
            outcome: p.outcome,
            average: avg(p),
            startedAt: p.started_at,
          })),
        });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const company = await getSalesCompany(supabase, auth.userId);
        if (!company) return jsonResponse({ error: "企業アカウントでログインしてください" }, 403);
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return jsonResponse({ error: "入力の形が正しくありません" }, 400);
        const b = parsed.data;
        if (b.action === "newCode")
          return jsonResponse({ joinCode: await issueSalesJoinCode(supabase, company.id) });
        if (b.action === "addMaterial") {
          const { count } = await supabase
            .from("sales_materials")
            .select("id", { count: "exact", head: true })
            .eq("company_id", company.id);
          if ((count ?? 0) >= 30)
            return jsonResponse(
              { error: "資料は30件までです。古いものを消してから足してください" },
              400,
            );
          const { error } = await supabase.from("sales_materials").insert({
            company_id: company.id,
            kind: b.kind,
            scenario: b.scenario,
            title: b.title,
            content: b.content,
          });
          if (error) return jsonResponse({ error: "保存に失敗しました" }, 500);
          return jsonResponse({ ok: true });
        }
        if (b.action === "deleteMaterial") {
          await supabase
            .from("sales_materials")
            .delete()
            .eq("id", b.id)
            .eq("company_id", company.id);
          return jsonResponse({ ok: true });
        }
        await supabase
          .from("sales_memberships")
          .delete()
          .eq("company_id", company.id)
          .eq("user_id", b.userId);
        return jsonResponse({ ok: true });
      },
    },
  },
});
