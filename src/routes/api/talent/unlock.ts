/**
 * 企業向け：チケット購入（1人分のプロフィールの閲覧権）
 *
 * POST /api/talent/unlock { action: "intent", code }          → Stripe の支払い（PaymentIntent）を作る
 * POST /api/talent/unlock { action: "confirm", paymentIntentId } → 支払い完了をサーバーで確認して閲覧権を記録
 *
 * 成功報酬ではなく、閲覧・連絡の権利に対する料金。採用の成否とは関係しない。
 */
import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { verifyApiUser } from "@/lib/api-auth";
import {
  COMPANY_REQUIRED_MESSAGE,
  getCompanyProfile,
  getTicketPrice,
  jsonResponse,
  notifyUnlocked,
  recordUnlockFromPaymentIntent,
  serviceClient,
} from "@/lib/talent";

export const Route = createFileRoute("/api/talent/unlock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        const stripeSecret = process.env.STRIPE_SECRET_KEY;
        if (!supabase || !stripeSecret)
          return jsonResponse({ error: "Server config missing" }, 500);
        const company = await getCompanyProfile(supabase, auth.userId);
        if (!company)
          return jsonResponse({ error: COMPANY_REQUIRED_MESSAGE, needsCompany: true }, 403);

        let body: { action?: unknown; code?: unknown; paymentIntentId?: unknown };
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }
        const stripe = new Stripe(stripeSecret, { httpClient: Stripe.createFetchHttpClient() });

        if (body.action === "intent") {
          const code = typeof body.code === "string" ? body.code : "";
          const { data: p } = await supabase
            .from("candidate_profiles")
            .select("user_id, is_public")
            .eq("public_code", code)
            .maybeSingle();
          if (!p || !p.is_public)
            return jsonResponse({ error: "このプロフィールは公開されていません" }, 404);
          if (p.user_id === auth.userId)
            return jsonResponse({ error: "ご自身のプロフィールです" }, 400);
          const { data: already } = await supabase
            .from("profile_unlocks")
            .select("id")
            .eq("company_user_id", auth.userId)
            .eq("candidate_user_id", p.user_id)
            .maybeSingle();
          if (already) return jsonResponse({ alreadyUnlocked: true });

          // Stripe の顧客は、サブスクリプションと同じものを使い回す
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

          const amount = getTicketPrice();
          const pi = await stripe.paymentIntents.create({
            amount,
            currency: "jpy",
            customer: customerId,
            payment_method_types: ["card"],
            description: `人材プロフィール閲覧チケット（${code}）`,
            metadata: {
              kind: "profile_unlock",
              company_user_id: auth.userId,
              candidate_user_id: p.user_id,
              candidate_code: code,
            },
          });
          return jsonResponse({ clientSecret: pi.client_secret, paymentIntentId: pi.id, amount });
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
          const result = await recordUnlockFromPaymentIntent(supabase, pi);
          if (!result) return jsonResponse({ error: "閲覧権の記録に失敗しました" }, 500);
          if (result.isNew) await notifyUnlocked(supabase, result.candidateUserId, auth.userId);
          return jsonResponse({ ok: true, code: pi.metadata?.candidate_code ?? null });
        }

        return jsonResponse({ error: "Unknown action" }, 400);
      },
    },
  },
});
