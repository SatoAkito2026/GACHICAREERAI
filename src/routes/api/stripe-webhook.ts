/**
 * Stripe Webhook エンドポイント
 *
 * 処理するイベント:
 * - invoice.payment_succeeded  → 自動更新成功時: plan_expires_at を+1ヶ月延長
 * - invoice.payment_failed     → 自動更新失敗時: ログのみ（期限が来たらフロントでfreeに降格）
 * - customer.subscription.deleted → 解約完了時: stripe_subscription_idをnullに
 *   （plan_expires_atはそのまま→期限到来でフロントがfreeに降格）
 *
 * Stripeダッシュボードで設定するWebhook URL:
 *   https://interview-copilot-ai.akitogroup.jp/api/stripe-webhook
 *
 * 設定するイベント:
 *   invoice.payment_succeeded
 *   invoice.payment_failed
 *   customer.subscription.deleted
 */

import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey } from "@/lib/api-auth";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const stripeSecret = process.env.STRIPE_SECRET_KEY;
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        const supabaseUrl = getSupabaseUrl();
        const supabaseServiceKey = getServiceRoleKey();

        if (!stripeSecret || !webhookSecret) {
          console.error("[webhook] Stripe config missing");
          return json({ error: "Stripe config missing" }, 500);
        }
        if (!supabaseUrl || !supabaseServiceKey) {
          console.error("[webhook] Supabase config missing");
          return json({ error: "Supabase config missing" }, 500);
        }

        const stripe = new Stripe(stripeSecret, {
          httpClient: Stripe.createFetchHttpClient(),
        });
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 署名検証
        const sig = request.headers.get("stripe-signature");
        if (!sig) return json({ error: "No signature" }, 400);

        const rawBody = await request.text();
        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret);
        } catch (e) {
          console.error("[webhook] Signature verification failed:", e);
          return json({ error: "Invalid signature" }, 400);
        }

        console.log("[webhook] Event received:", event.type);

        try {
          switch (event.type) {
            // ─── 自動更新成功 → plan_expires_at を+1ヶ月延長 ───
            case "invoice.payment_succeeded": {
              const invoice = event.data.object as Stripe.Invoice;
              // 初回請求（subscription_created）はcreate-subscription側で処理済みなのでスキップ
              if (invoice.billing_reason === "subscription_create") break;

              // Stripe SDKのバージョンによりInvoice.subscriptionの型が異なるためanyでアクセス
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const invoiceAny = invoice as any;
              const subscriptionId: string | undefined =
                typeof invoiceAny.subscription === "string"
                  ? invoiceAny.subscription
                  : typeof invoiceAny.subscription?.id === "string"
                    ? invoiceAny.subscription.id
                    : undefined;

              if (!subscriptionId) break;

              // 既存の有効期限から+1ヶ月延長（ズレ防止）
              const { data: profile, error: fetchErr } = await supabase
                .from("profiles")
                .select("plan_expires_at, plan")
                .eq("stripe_subscription_id", subscriptionId)
                .maybeSingle();

              if (fetchErr || !profile) {
                console.error("[webhook] Profile not found for subscription:", subscriptionId);
                break;
              }

              const base = profile.plan_expires_at ? new Date(profile.plan_expires_at) : new Date();
              // 有効期限が過去になっている場合はnowから計算
              const baseDate = base < new Date() ? new Date() : base;
              const newExpiry = new Date(baseDate);
              newExpiry.setMonth(newExpiry.getMonth() + 1);

              const { error: updErr } = await supabase
                .from("profiles")
                .update({
                  plan_expires_at: newExpiry.toISOString(),
                  // 更新時に利用回数もリセット
                  period_interview_count: 0,
                  period_start_at: new Date().toISOString(),
                })
                .eq("stripe_subscription_id", subscriptionId);

              if (updErr) {
                console.error("[webhook] Failed to extend plan_expires_at:", updErr);
              } else {
                console.log("[webhook] Plan extended to:", newExpiry.toISOString());
              }
              break;
            }

            // ─── 自動更新失敗 → ログのみ（期限到来でフロントがfreeに降格） ───
            case "invoice.payment_failed": {
              const invoice = event.data.object as Stripe.Invoice;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const failedInvoiceAny = invoice as any;
              const failedSubId: string | undefined =
                typeof failedInvoiceAny.subscription === "string"
                  ? failedInvoiceAny.subscription
                  : failedInvoiceAny.subscription?.id;
              console.warn("[webhook] Payment failed for subscription:", failedSubId);
              // ここでは何もしない。plan_expires_atが過ぎたらフロントがfreeに降格する。
              // 必要なら将来的にメール通知を追加する。
              break;
            }

            // ─── 解約完了 → stripe_subscription_idをnullに ───
            // （plan_expires_atはそのまま残す→期限まで使える）
            case "customer.subscription.deleted": {
              const subscription = event.data.object as Stripe.Subscription;

              const { error: updErr } = await supabase
                .from("profiles")
                .update({
                  stripe_subscription_id: null,
                  // planはそのまま（plan_expires_atが来たらフロントがfreeに降格）
                })
                .eq("stripe_subscription_id", subscription.id);

              if (updErr) {
                console.error("[webhook] Failed to clear subscription_id:", updErr);
              } else {
                console.log("[webhook] Subscription cancelled:", subscription.id);
              }
              break;
            }

            default:
              console.log("[webhook] Unhandled event type:", event.type);
          }
        } catch (e) {
          console.error("[webhook] Handler error:", e);
          return json({ error: "Handler error" }, 500);
        }

        return json({ received: true });
      },
    },
  },
});
