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

// プラン別メーター設定
const PLAN_LIMITS: Record<string, number> = {
  company_light: 20,
  company_pro: 50,
};

const OVERAGE_METER: Record<string, string> = {
  company_light: "interview_usage_light_extra",
  company_pro: "interview_usage_pro_extra",
  company_metered: "interview_usage",
};

export const Route = createFileRoute("/api/report-usage")({
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

        const stripe = new Stripe(stripeSecret, {
          httpClient: Stripe.createFetchHttpClient(),
        });
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // ユーザーのプラン・カスタマーID・利用回数を取得
        const { data: profile } = await supabase
          .from("profiles")
          .select("stripe_customer_id, plan, period_interview_count")
          .eq("id", auth.userId)
          .maybeSingle();

        if (!profile?.stripe_customer_id) {
          return json({ error: "No Stripe customer found" }, 400);
        }

        const plan = profile.plan as string;
        const count = Number(profile.period_interview_count ?? 0);
        const limit = PLAN_LIMITS[plan] ?? Infinity;
        const isOverage = plan === "company_metered" || count > limit;

        // 超過・従量課金の場合のみStripeメーターイベントを送信
        if (isOverage) {
          const meterEventName = OVERAGE_METER[plan];
          if (meterEventName) {
            await stripe.billing.meterEvents.create({
              event_name: meterEventName,
              payload: {
                stripe_customer_id: profile.stripe_customer_id,
                value: "1",
              },
            });
          }
        }

        return json({ success: true, isOverage, plan, count, limit });
      },
    },
  },
});
