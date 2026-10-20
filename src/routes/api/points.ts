/**
 * 本人：ガチキャリポイント
 *
 * GET  /api/points                     → 残高と最近の履歴
 * POST /api/points { action: "apply" } → ライト・プロの次回の支払いに使う（1か月分まで）
 */
import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { verifyApiUser } from "@/lib/api-auth";
import { PRACTICE_RULES } from "@/lib/plan-rules";
import { applyPointsToStripe } from "@/lib/points";
import { getPointBalance, jsonResponse, serviceClient } from "@/lib/talent";

export const Route = createFileRoute("/api/points")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const { data: history } = await supabase
          .from("point_ledger")
          .select("points, reason, created_at")
          .eq("user_id", auth.userId)
          .order("created_at", { ascending: false })
          .limit(30);
        return jsonResponse({
          balance: await getPointBalance(supabase, auth.userId),
          history: history ?? [],
        });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        const stripeSecret = process.env.STRIPE_SECRET_KEY;
        if (!supabase || !stripeSecret)
          return jsonResponse({ error: "Server config missing" }, 500);
        const body = (await request.json().catch(() => ({}))) as { action?: unknown };
        if (body.action !== "apply") return jsonResponse({ error: "Unknown action" }, 400);

        const { data: profile } = await supabase
          .from("profiles")
          .select("plan, plan_expires_at, stripe_customer_id, stripe_subscription_id")
          .eq("id", auth.userId)
          .maybeSingle();
        const plan = profile?.plan as string | undefined;
        if (
          (plan !== "individual_light" && plan !== "individual_pro") ||
          !profile?.stripe_customer_id ||
          !profile?.stripe_subscription_id
        ) {
          return jsonResponse(
            {
              error:
                "ポイントは、ライト・プロの月額の支払いに使えます。先にプランに申し込んでください。",
            },
            400,
          );
        }
        const stripe = new Stripe(stripeSecret, { httpClient: Stripe.createFetchHttpClient() });
        const used = await applyPointsToStripe(
          supabase,
          stripe,
          auth.userId,
          profile.stripe_customer_id,
          PRACTICE_RULES[plan].priceJpy,
        );
        if (used === 0) return jsonResponse({ error: "使えるポイントがありません" }, 400);
        return jsonResponse({
          ok: true,
          used,
          balance: await getPointBalance(supabase, auth.userId),
        });
      },
    },
  },
});
