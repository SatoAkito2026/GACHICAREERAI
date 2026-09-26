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

export const Route = createFileRoute("/api/customer-portal")({
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

        const { data: profile } = await supabase
          .from("profiles")
          .select("stripe_customer_id")
          .eq("id", auth.userId)
          .maybeSingle();

        if (!profile?.stripe_customer_id) {
          return json({ error: "No Stripe customer found" }, 400);
        }

        const body = await request.json().catch(() => ({}));
        const ALLOWED_ORIGIN = "https://interview-copilot-ai.akitogroup.jp";
        const requestedReturnUrl = (body as any).returnUrl;
        const returnUrl =
          typeof requestedReturnUrl === "string" &&
          requestedReturnUrl.startsWith(`${ALLOWED_ORIGIN}/`)
            ? requestedReturnUrl
            : `${ALLOWED_ORIGIN}/mypage`;

        const session = await stripe.billingPortal.sessions.create({
          customer: profile.stripe_customer_id,
          return_url: returnUrl,
        });

        return json({ url: session.url });
      },
    },
  },
});
