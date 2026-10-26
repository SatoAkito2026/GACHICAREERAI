/**
 * 営業ロープレ：1回分の結果（会話・評価）
 * GET /api/sales/result?id= → 本人か、その社員が参加している会社の企業アカウントだけが見られる
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, serviceClient } from "@/lib/talent";
import { DIFFICULTIES, SCENARIOS, getSalesCompany, type SalesLine } from "@/lib/sales-roleplay";

export const Route = createFileRoute("/api/sales/result")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
        if (!id.success) return jsonResponse({ error: "見つかりません" }, 404);
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const { data: row } = await supabase
          .from("sales_roleplays")
          .select("*")
          .eq("id", id.data)
          .maybeSingle();
        if (!row) return jsonResponse({ error: "見つかりません" }, 404);
        let allowed = row.user_id === auth.userId;
        let memberName: string | null = null;
        if (!allowed) {
          const company = await getSalesCompany(supabase, auth.userId);
          if (company && company.id === row.company_id) {
            // 会社から外れた社員の結果は見せない
            const { data: m } = await supabase
              .from("sales_memberships")
              .select("display_name")
              .eq("company_id", company.id)
              .eq("user_id", row.user_id)
              .maybeSingle();
            if (m) {
              allowed = true;
              memberName = m.display_name;
            }
          }
        }
        if (!allowed) return jsonResponse({ error: "見つかりません" }, 404);
        const persona = row.persona as { name?: string; profile?: string };
        return jsonResponse({
          id: row.id,
          memberName,
          scenarioLabel: SCENARIOS[row.scenario as keyof typeof SCENARIOS]?.label ?? row.scenario,
          difficultyLabel:
            DIFFICULTIES[row.difficulty as keyof typeof DIFFICULTIES]?.label ?? row.difficulty,
          coachMode: row.coach_mode,
          persona: { name: persona.name ?? "", profile: persona.profile ?? "" },
          status: row.status,
          outcome: row.outcome,
          startedAt: row.started_at,
          finishedAt: row.finished_at,
          transcript: (row.transcript as SalesLine[]).map((l) => ({
            role: l.role,
            text: l.text,
            retracted: !!l.retracted,
          })),
          evaluation: row.evaluation,
        });
      },
    },
  },
});
