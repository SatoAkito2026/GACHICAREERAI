/**
 * 営業ロープレ：社員が練習する
 *
 * GET  /api/sales/roleplay → 自分のロープレの一覧（新しい順）と、今日あと何回できるか
 * POST /api/sales/roleplay { action: "start", scenario, difficulty, coachMode } → 始める。お客さんの最初のひとことと声
 * POST /api/sales/roleplay { action: "turn", id, text }   → 営業の一言を受けて、お客さんの返事（または先生の助言）
 * POST /api/sales/roleplay { action: "finish", id }       → 終わって評価を作る
 * POST /api/sales/roleplay { action: "abandon", id }      → 途中でやめる（評価しない）
 * 会社に参加している社員だけが使える。会話はサーバーに残す（画面から送られた会話は使わない）
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, serviceClient } from "@/lib/talent";
import {
  SALES_MAX_MINUTES,
  SALES_MAX_TURNS,
  SALES_PER_COMPANY_MONTH,
  SALES_PER_USER_DAY,
  SCENARIOS,
  type SalesCoachMode,
  type SalesDifficulty,
  type SalesLine,
  type SalesPersona,
  type SalesScenario,
  customerSpeak,
  customerTurn,
  evaluateRoleplay,
  getSalesMembership,
  jstStarts,
  loadMaterials,
  makePersona,
} from "@/lib/sales-roleplay";
import { trainerKnowledge } from "@/lib/sales-knowledge";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    scenario: z.enum(["door", "inbound", "teleapo", "b2b"]),
    difficulty: z.enum(["easy", "normal", "hard"]),
    coachMode: z.enum(["coach", "full"]),
  }),
  z.object({
    action: z.literal("turn"),
    id: z.string().uuid(),
    text: z.string().trim().min(1).max(2000),
  }),
  z.object({ action: z.literal("finish"), id: z.string().uuid() }),
  z.object({ action: z.literal("abandon"), id: z.string().uuid() }),
]);

type Row = {
  id: string;
  company_id: string;
  user_id: string;
  scenario: SalesScenario;
  difficulty: SalesDifficulty;
  coach_mode: SalesCoachMode;
  persona: SalesPersona;
  transcript: SalesLine[];
  evaluation: unknown;
  status: string;
  outcome: string | null;
  started_at: string;
};

export const Route = createFileRoute("/api/sales/roleplay")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const membership = await getSalesMembership(supabase, auth.userId);
        const { data } = await supabase
          .from("sales_roleplays")
          .select("id, scenario, difficulty, coach_mode, status, outcome, evaluation, started_at")
          .eq("user_id", auth.userId)
          .order("started_at", { ascending: false })
          .limit(50);
        const { count } = await supabase
          .from("sales_roleplays")
          .select("id", { count: "exact", head: true })
          .eq("user_id", auth.userId)
          .gte("started_at", jstStarts().day);
        return jsonResponse({
          membership,
          remainingToday: Math.max(0, SALES_PER_USER_DAY - (count ?? 0)),
          list: (data ?? [])
            .filter((r) => r.status === "done")
            .map((r) => ({
              id: r.id,
              scenarioLabel: SCENARIOS[r.scenario as SalesScenario]?.label ?? r.scenario,
              difficulty: r.difficulty,
              outcome: r.outcome,
              average: (r.evaluation as { average?: number } | null)?.average ?? null,
              startedAt: r.started_at,
            })),
        });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return jsonResponse({ error: "入力の形が正しくありません" }, 400);
        const b = parsed.data;
        const membership = await getSalesMembership(supabase, auth.userId);
        if (!membership)
          return jsonResponse({ error: "会社の招待コードを入れて参加してから使えます" }, 403);

        // ---- 始める ----
        if (b.action === "start") {
          const starts = jstStarts();
          const [{ count: today }, { count: month }] = await Promise.all([
            supabase
              .from("sales_roleplays")
              .select("id", { count: "exact", head: true })
              .eq("user_id", auth.userId)
              .gte("started_at", starts.day),
            supabase
              .from("sales_roleplays")
              .select("id", { count: "exact", head: true })
              .eq("company_id", membership.companyId)
              .gte("started_at", starts.month),
          ]);
          if ((today ?? 0) >= SALES_PER_USER_DAY)
            return jsonResponse(
              { error: `ロープレは1日${SALES_PER_USER_DAY}回までです。明日またどうぞ` },
              429,
            );
          if ((month ?? 0) >= SALES_PER_COMPANY_MONTH)
            return jsonResponse(
              {
                error: `会社の今月の無料分（${SALES_PER_COMPANY_MONTH}回）を使い切りました。会社の担当者にお問い合わせください`,
              },
              429,
            );
          const persona = makePersona(b.scenario);
          const opener = SCENARIOS[b.scenario].opener;
          const { data: row, error } = await supabase
            .from("sales_roleplays")
            .insert({
              company_id: membership.companyId,
              user_id: auth.userId,
              scenario: b.scenario,
              difficulty: b.difficulty,
              coach_mode: b.coachMode,
              persona,
              transcript: [{ role: "customer", text: opener }],
            })
            .select("id")
            .single();
          if (error || !row) return jsonResponse({ error: "始められませんでした" }, 500);
          return jsonResponse({
            id: row.id,
            persona: { name: persona.name, profile: persona.profile },
            phone: SCENARIOS[b.scenario].phone,
            reply: opener,
            audioBase64: await customerSpeak(opener, persona, b.difficulty),
          });
        }

        const { data } = await supabase
          .from("sales_roleplays")
          .select("*")
          .eq("id", b.id)
          .eq("user_id", auth.userId)
          .maybeSingle();
        const row = data as Row | null;
        if (!row) return jsonResponse({ error: "見つかりません" }, 404);

        // ---- 途中でやめる ----
        if (b.action === "abandon") {
          if (row.status === "in_progress")
            await supabase
              .from("sales_roleplays")
              .update({ status: "abandoned", finished_at: new Date().toISOString() })
              .eq("id", row.id);
          return jsonResponse({ ok: true });
        }

        // ---- 終わって評価する ----
        if (b.action === "finish") {
          if (row.status === "done") return jsonResponse({ ok: true, evaluation: row.evaluation });
          if (row.status !== "in_progress") return jsonResponse({ error: "終わっています" }, 409);
          const sellerSaid = row.transcript.some((l) => l.role === "seller" && !l.retracted);
          if (!sellerSaid) {
            await supabase
              .from("sales_roleplays")
              .update({ status: "abandoned", finished_at: new Date().toISOString() })
              .eq("id", row.id);
            return jsonResponse({ error: "まだ何も話していないので、評価できません" }, 400);
          }
          try {
            const evaluation = await evaluateRoleplay({
              scenario: row.scenario,
              difficulty: row.difficulty,
              persona: row.persona,
              companyName: membership.companyName,
              materials: await loadMaterials(supabase, row.company_id, row.scenario),
              knowledge: await trainerKnowledge(supabase, row.scenario),
              transcript: row.transcript,
              outcome: row.outcome,
            });
            await supabase
              .from("sales_roleplays")
              .update({
                status: "done",
                evaluation,
                outcome: evaluation.outcome || row.outcome,
                finished_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            return jsonResponse({ ok: true, evaluation });
          } catch (e) {
            console.error("[sales] evaluate failed", e);
            return jsonResponse({ error: "評価を作れませんでした。もう一度押してください" }, 502);
          }
        }

        // ---- 営業の一言 → お客さんの返事（または先生の助言） ----
        if (row.status !== "in_progress") return jsonResponse({ error: "終わっています" }, 409);
        const sellerTurns = row.transcript.filter((l) => l.role === "seller").length;
        const elapsedMin = (Date.now() - new Date(row.started_at).getTime()) / 60000;
        if (sellerTurns >= SALES_MAX_TURNS || elapsedMin >= SALES_MAX_MINUTES + 2)
          return jsonResponse({ reply: "", coach: null, ended: true, outcome: "時間切れ" });
        const transcript: SalesLine[] = [...row.transcript, { role: "seller", text: b.text }];
        let turn: Awaited<ReturnType<typeof customerTurn>>;
        try {
          turn = await customerTurn({
            scenario: row.scenario,
            difficulty: row.difficulty,
            coachMode: row.coach_mode,
            persona: row.persona,
            companyName: membership.companyName,
            materials: await loadMaterials(supabase, row.company_id, row.scenario),
            knowledge: await trainerKnowledge(supabase, row.scenario),
            transcript,
            elapsedMin,
          });
        } catch (e) {
          console.error("[sales] turn failed", e);
          return jsonResponse(
            { error: "通信がうまくいきませんでした。もう一度話してください" },
            502,
          );
        }
        if (turn.coach) {
          // 助言：今の一言はお客さんに聞こえなかったことにして、言い直してもらう
          transcript[transcript.length - 1] = { role: "seller", text: b.text, retracted: true };
          transcript.push({ role: "coach", text: turn.coach });
        } else {
          transcript.push({ role: "customer", text: turn.reply });
        }
        await supabase
          .from("sales_roleplays")
          .update({ transcript, ...(turn.ended ? { outcome: turn.outcome } : {}) })
          .eq("id", row.id)
          .eq("status", "in_progress");
        return jsonResponse({
          reply: turn.coach ? "" : turn.reply,
          coach: turn.coach,
          ended: turn.ended,
          outcome: turn.outcome,
          audioBase64: turn.coach
            ? null
            : await customerSpeak(turn.reply, row.persona, row.difficulty),
        });
      },
    },
  },
});
