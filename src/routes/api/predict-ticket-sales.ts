/**
 * 役者データベース: 公演ごとの集客予測・役柄適合率
 *
 * POST /api/predict-ticket-sales
 *   body: { actorId, productionTitle?, productionType?, venueCapacity?, genre?, roleDescription? }
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseUrl, getServiceRoleKey, verifyApiUser } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/predict-ticket-sales")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        const serviceKey = getServiceRoleKey();
        if (!anthropicKey || !serviceKey) return json({ error: "Server config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);

        const body = (await request.json().catch(() => null)) as {
          actorId?: string;
          productionTitle?: string;
          productionType?: string;
          venueCapacity?: number;
          genre?: string;
          roleDescription?: string;
        } | null;
        if (!body?.actorId) return json({ error: "actorId is required" }, 400);

        const { data: actor } = await supabase
          .from("actors")
          .select("*")
          .eq("id", body.actorId)
          .maybeSingle();
        if (!actor) return json({ error: "actor_not_found" }, 404);

        const systemPrompt = `あなたはエンタメ業界の集客予測AIです。
役者の公開データ(SNSフォロワー数・過去出演作品・社会的影響力)をもとに、
今回の公演に対する集客予測(チケット販売見込み)と、役柄との適合率を算出してください。
これはあくまで公開データに基づく参考値であり、断定的な保証ではないことを前提とすること。

必ず次のJSON形式のみで出力してください。前置きや説明は不要。
{
  "fit_percentage": 75,
  "fit_reasoning": "役柄との適合率の根拠(2〜3文)",
  "predicted_tickets_low": 100,
  "predicted_tickets_high": 300,
  "prediction_basis": "集客予測の根拠(SNSフォロワー数・過去作品の実績等を踏まえて、3〜4文)"
}

# 役者の公開データ
氏名: ${actor.name}
所属: ${actor.agency_name ?? "不明"}
SNSフォロワー数: ${JSON.stringify(actor.follower_counts ?? {})}
過去出演作品: ${JSON.stringify(actor.past_works ?? [])}
影響力の要約: ${actor.influence_summary ?? "情報なし"}

# 今回の公演情報
タイトル: ${body.productionTitle ?? "未設定"}
種別: ${body.productionType ?? "未設定"}
会場キャパシティ: ${body.venueCapacity ?? "未設定"}
ジャンル: ${body.genre ?? "未設定"}
今回の役柄: ${body.roleDescription ?? "未設定"}`;

        const anthropic = new Anthropic({ apiKey: anthropicKey });
        let parsed: Record<string, unknown> = {};
        try {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 1500,
            system: systemPrompt,
            messages: [
              { role: "user", content: "上記の情報をもとに、集客予測と適合率を算出してください。" },
            ],
          });
          const textBlock = response.content.find((b: any) => b.type === "text") as any;
          const rawText = textBlock?.text ?? "{}";
          let cleaned = rawText.replace(/```json|```/g, "").trim();
          const firstBrace = cleaned.indexOf("{");
          const lastBrace = cleaned.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.slice(firstBrace, lastBrace + 1);
          }
          parsed = JSON.parse(cleaned);
        } catch (e) {
          console.error("[predict-ticket-sales] failed", e);
          return json({ error: "ai_call_failed" }, 500);
        }

        const { data: saved, error } = await supabase
          .from("actor_ticket_predictions")
          .insert({
            actor_id: body.actorId,
            company_user_id: auth.userId,
            production_title: body.productionTitle ?? null,
            production_type: body.productionType ?? null,
            venue_capacity: body.venueCapacity ?? null,
            genre: body.genre ?? null,
            role_description: body.roleDescription ?? null,
            fit_percentage: parsed.fit_percentage ?? null,
            fit_reasoning: parsed.fit_reasoning ?? null,
            predicted_tickets_low: parsed.predicted_tickets_low ?? null,
            predicted_tickets_high: parsed.predicted_tickets_high ?? null,
            prediction_basis: parsed.prediction_basis ?? null,
          })
          .select("*")
          .single();

        if (error) {
          console.error("[predict-ticket-sales] save failed", error);
          return json({ error: "save_failed" }, 500);
        }

        return json({ ok: true, prediction: saved });
      },
    },
  },
});
