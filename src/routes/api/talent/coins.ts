/**
 * 企業向け：コイン（人材の詳しい評価を見るときに使う。有効期限6か月）
 *
 * GET  /api/talent/coins                                   → 残りのコイン・いちばん近い期限・パック
 * POST /api/talent/coins { action: "intent", pack }        → Stripe の支払い（PaymentIntent）を作る
 * POST /api/talent/coins { action: "confirm", paymentIntentId } → 支払い完了をサーバーで確認してコインを記録
 */
import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { verifyApiUser } from "@/lib/api-auth";
import { COIN_PACKS } from "@/lib/coins";
import {
  COMPANY_REQUIRED_MESSAGE,
  getCoinBalance,
  getCompanyProfile,
  jsonResponse,
  recordCoinPackFromPaymentIntent,
  serviceClient,
} from "@/lib/talent";

export const Route = createFileRoute("/api/talent/coins")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        if (!(await getCompanyProfile(supabase, auth.userId))) {
          return jsonResponse({ error: COMPANY_REQUIRED_MESSAGE, needsCompany: true }, 403);
        }
        return jsonResponse({
          ...(await getCoinBalance(supabase, auth.userId)),
          packs: COIN_PACKS,
        });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        const stripeSecret = process.env.STRIPE_SECRET_KEY;
        if (!supabase || !stripeSecret)
          return jsonResponse({ error: "Server config missing" }, 500);
        const company = await getCompanyProfile(supabase, auth.userId);
        if (!company) {
          return jsonResponse({ error: COMPANY_REQUIRED_MESSAGE, needsCompany: true }, 403);
        }
        const body = (await request.json().catch(() => ({}))) as {
          action?: unknown;
          pack?: unknown;
          paymentIntentId?: unknown;
        };
        const stripe = new Stripe(stripeSecret, { httpClient: Stripe.createFetchHttpClient() });

        if (body.action === "intent") {
          const pack = COIN_PACKS.find((p) => p.id === body.pack);
          if (!pack) return jsonResponse({ error: "パックを選んでください" }, 400);

          // Stripe の顧客は、ほかの支払いと同じものを使い回す
          const { data: prof } = await supabase
            .from("profiles")
            .select("stripe_customer_id")
            .eq("id", auth.userId)
            .maybeSingle();
          let customerId = prof?.stripe_customer_id ?? null;
          if (!customerId) {
            const { data: u } = await supabase.auth.admin.getUserById(auth.userId);
            const customer = await stripe.customers.create({
              email: u?.user?.email ?? undefined,
              name: company.company_name,
              metadata: { supabase_user_id: auth.userId },
            });
            customerId = customer.id;
            await supabase
              .from("profiles")
              .update({ stripe_customer_id: customerId })
              .eq("id", auth.userId);
          }

          const pi = await stripe.paymentIntents.create({
            amount: pack.priceJpy,
            currency: "jpy",
            customer: customerId,
            payment_method_types: ["card"],
            description: `ガチキャリコイン ${pack.coins}枚`,
            metadata: {
              kind: "coin_pack",
              company_user_id: auth.userId,
              pack: pack.id,
              coins: String(pack.coins),
            },
          });
          return jsonResponse({ clientSecret: pi.client_secret, paymentIntentId: pi.id });
        }

        if (body.action === "confirm") {
          const id = typeof body.paymentIntentId === "string" ? body.paymentIntentId : "";
          if (!id.startsWith("pi_")) return jsonResponse({ error: "Invalid paymentIntentId" }, 400);
          const pi = await stripe.paymentIntents.retrieve(id);
          if (pi.metadata?.company_user_id !== auth.userId) {
            return jsonResponse({ error: "この支払いは確認できません" }, 403);
          }
          if (pi.status !== "succeeded") {
            return jsonResponse({ error: "支払いがまだ完了していません" }, 402);
          }
          const result = await recordCoinPackFromPaymentIntent(supabase, pi);
          if (!result) return jsonResponse({ error: "コインの記録に失敗しました" }, 500);
          return jsonResponse({ ok: true, ...(await getCoinBalance(supabase, auth.userId)) });
        }

        return jsonResponse({ error: "Unknown action" }, 400);
      },
    },
  },
});
