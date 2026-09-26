/**
 * 解約API
 * - StripeのSubscriptionをキャンセル（period_end時点で終了）
 * - stripe_subscription_idをDBからnullに（Webhookが来るまでの暫定処理）
 * - plan_expires_atはそのまま→期限まで引き続き利用可能
 */

import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { verifyApiUser, getSupabaseUrl, getServiceRoleKey } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/cancel-subscription")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const stripeSecret = process.env.STRIPE_SECRET_KEY;
        const supabaseUrl = getSupabaseUrl();
        const supabaseServiceKey = getServiceRoleKey();

        if (!stripeSecret || !supabaseUrl || !supabaseServiceKey) {
          return json({ error: "Server config missing" }, 500);
        }

        const userId = auth.userId;

        const stripe = new Stripe(stripeSecret, {
          httpClient: Stripe.createFetchHttpClient(),
        });
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // DBからstripe_subscription_idを取得
        const { data: profile, error: fetchErr } = await supabase
          .from("profiles")
          .select("stripe_subscription_id, plan_expires_at")
          .eq("id", userId)
          .maybeSingle();

        if (fetchErr || !profile) {
          return json({ error: "Profile not found" }, 404);
        }

        if (!profile.stripe_subscription_id) {
          return json({ error: "No active subscription found" }, 400);
        }

        try {
          // Stripe側でサブスク解約（期間末まで有効なcancel_at_period_end）
          await stripe.subscriptions.update(profile.stripe_subscription_id, {
            cancel_at_period_end: true,
          });

          // DBのstripe_subscription_idをnullに（期限はそのまま）
          await supabase.from("profiles").update({ stripe_subscription_id: null }).eq("id", userId);

          return json({
            success: true,
            message: "解約を受け付けました。有効期限まではサービスをご利用いただけます。",
            expiresAt: profile.plan_expires_at,
          });
        } catch (e) {
          console.error("[cancel-subscription] error:", e);
          return json({ error: "解約処理に失敗しました。時間をおいて再度お試しください。" }, 500);
        }
      },
    },
  },
});
