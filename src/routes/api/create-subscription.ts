import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { verifyApiUser, getSupabaseUrl, getServiceRoleKey } from "@/lib/api-auth";
import { PRACTICE_RULES } from "@/lib/plan-rules";
import { applyPointsToStripe } from "@/lib/points";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const PRICE_IDS: Record<string, string> = {
  // 後方互換（旧価格ID）
  standard: "price_1Tdk7ZJZ1l0vgZoNx7d8O8BP",
  pro: "price_1Tdk7yJZ1l0vgZoNKnrSdOI5",
  // 個人プラン（税込み）
  individual_light: "price_1Tm4zbJ1Nq1hx5wCT6kbl2jp",
  individual_pro: "price_1Tm4ztJ1Nq1hx5wCohqR6LHq",
  // 企業プラン（税込み）
  company_metered: "price_1Tm4uXJ1Nq1hx5wCdMJF6yP9",
  company_light: "price_1Tm4wnJ1Nq1hx5wCgfikaBCJ",
  company_light_overage: "price_1Tm4xNJ1Nq1hx5wCRI86l0Cd",
  company_pro: "price_1Tm4xhJ1Nq1hx5wCGHR63HFj",
  company_pro_overage: "price_1Tm4y9J1Nq1hx5wCgRL4SDnw",
  // 芸能・キャスティングプラン（¥50,000/月・税込み）
  // TODO: StripeでPrice IDを作成したら、下記のプレースホルダーを実際の値に置き換えてください
  actor_pro: "price_1TtlqwJ1Nq1hx5wC55WUV8U2",
  // 候補者データベース(総評閲覧)プラン（¥30,000/月・税込み）
  // TODO: StripeでPrice IDを作成したら、下記のプレースホルダーを実際の値に置き換えてください
  candidate_view: "price_1TxqAVJ1Nq1hx5wCY2IqXeT7",
};

const METER_ID = "mtr_61UvA51ZYJpoBBKhh41J1Nq1hx5wCQVk";
void METER_ID;

/**
 * 個人プランの値段は src/lib/plan-rules.ts で決める。
 * Stripe で新しい Price を作ったら wrangler.jsonc の STRIPE_PRICE_INDIVIDUAL_LIGHT / _PRO に入れる。
 * 入っていなければ下の PRICE_IDS を使う。その金額が plan-rules と違う（古い・停止中）ときだけ、
 * 同じ商品で値段だけ新しくして申し込む。
 */
async function individualPlanItem(
  stripe: Stripe,
  plan: "individual_light" | "individual_pro",
): Promise<Stripe.SubscriptionCreateParams.Item> {
  const envPrice =
    plan === "individual_light"
      ? process.env.STRIPE_PRICE_INDIVIDUAL_LIGHT
      : process.env.STRIPE_PRICE_INDIVIDUAL_PRO;
  if (envPrice) return { price: envPrice };
  const base = await stripe.prices.retrieve(PRICE_IDS[plan]);
  // Stripe の画面で金額を新しくしてあれば、その Price をそのまま使う
  if (base.active && base.unit_amount === PRACTICE_RULES[plan].priceJpy) {
    return { price: base.id };
  }
  const product = typeof base.product === "string" ? base.product : base.product.id;
  return {
    price_data: {
      currency: "jpy",
      product,
      unit_amount: PRACTICE_RULES[plan].priceJpy,
      recurring: { interval: "month" },
      tax_behavior: base.tax_behavior === "exclusive" ? "exclusive" : "inclusive",
    },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/create-subscription")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const stripeSecret = process.env.STRIPE_SECRET_KEY;
        const supabaseUrl = getSupabaseUrl();
        const supabaseServiceKey = getServiceRoleKey();

        if (!stripeSecret) return json({ error: "STRIPE_SECRET_KEY is not configured" }, 500);
        if (!supabaseUrl || !supabaseServiceKey)
          return json({ error: "Supabase config missing" }, 500);

        let body: {
          paymentMethodId?: unknown;
          plan?: unknown;
          email?: unknown;
          usePoints?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const paymentMethodId =
          typeof body.paymentMethodId === "string" ? body.paymentMethodId : "";
        const plan = typeof body.plan === "string" ? body.plan : "";
        const email =
          typeof body.email === "string" && body.email.length <= 320 ? body.email : undefined;
        const userId = auth.userId;

        if (!paymentMethodId || !PRICE_IDS[plan]) {
          return json({ error: "Invalid paymentMethodId or plan" }, 400);
        }
        // 企業の月額プラン（ライト・プロ）と総評閲覧プランは廃止。企業はチケットとAI面接の従量課金だけ
        if (["company_light", "company_pro", "candidate_view"].includes(plan)) {
          return json({ error: "このプランは受付を終了しました" }, 400);
        }

        const stripe = new Stripe(stripeSecret, {
          httpClient: Stripe.createFetchHttpClient(),
        });
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        try {
          // 既にStripe顧客IDを持っていれば使い回す(キャスティングプランの追加加入等、複数サブスクリプションを
          // 同じ顧客にまとめるため)。無ければ新規作成する。
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("stripe_customer_id")
            .eq("id", userId)
            .maybeSingle();

          let customer: Stripe.Customer;
          if (existingProfile?.stripe_customer_id) {
            customer = (await stripe.customers.retrieve(
              existingProfile.stripe_customer_id,
            )) as Stripe.Customer;
            await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
            await stripe.customers.update(customer.id, {
              invoice_settings: { default_payment_method: paymentMethodId },
            });
          } else {
            // Stripe: Customer作成
            customer = await stripe.customers.create({
              email,
              payment_method: paymentMethodId,
              invoice_settings: { default_payment_method: paymentMethodId },
              metadata: { supabase_user_id: userId },
            });
          }

          // ガチキャリポイントを使う場合は、最初の請求の前に Stripe の残高に入れておく（1か月分まで）
          if (
            body.usePoints === true &&
            (plan === "individual_light" || plan === "individual_pro")
          ) {
            await applyPointsToStripe(
              supabase,
              stripe,
              userId,
              customer.id,
              PRACTICE_RULES[plan].priceJpy,
            );
          }

          // Stripe: Subscription作成
          let subscriptionItems: Stripe.SubscriptionCreateParams.Item[];
          if (plan === "company_metered") {
            // 従量課金：metered billing
            subscriptionItems = [{ price: PRICE_IDS.company_metered }];
          } else if (plan === "company_light") {
            // ライト：月額 + 超過分metered
            subscriptionItems = [
              { price: PRICE_IDS.company_light },
              { price: PRICE_IDS.company_light_overage },
            ];
          } else if (plan === "company_pro") {
            // プロ：月額 + 超過分metered
            subscriptionItems = [
              { price: PRICE_IDS.company_pro },
              { price: PRICE_IDS.company_pro_overage },
            ];
          } else if (plan === "individual_light" || plan === "individual_pro") {
            subscriptionItems = [await individualPlanItem(stripe, plan)];
          } else {
            subscriptionItems = [{ price: PRICE_IDS[plan] }];
          }

          const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: subscriptionItems,
            // 従量課金（メーター連携価格）は Flexible billing が必須
            billing_mode: { type: "flexible" },
            expand: ["latest_invoice.payment_intent"],
          } as Stripe.SubscriptionCreateParams);

          const invoice = subscription.latest_invoice as
            (Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | null }) | null;
          const pi = (invoice?.payment_intent ?? null) as Stripe.PaymentIntent | null;

          const isActive =
            subscription.status === "active" ||
            subscription.status === "trialing" ||
            pi?.status === "succeeded";

          if (!isActive) {
            return json(
              {
                error: "Payment not completed",
                status: subscription.status,
                paymentStatus: pi?.status ?? null,
              },
              402,
            );
          }

          // 決済起算で1ヶ月後の有効期限を計算
          const now = new Date();
          const expiresAt = new Date(now);
          expiresAt.setMonth(expiresAt.getMonth() + 1);

          // キャスティングプランは既存プランを上書きしない独立したアドオンとして扱う
          // (従量課金/ライト/プロのいずれと組み合わせても良いし、単独でも良い)
          const updatePayload =
            plan === "actor_pro"
              ? {
                  actor_addon_active: true,
                  actor_addon_expires_at: expiresAt.toISOString(),
                  stripe_customer_id: customer.id,
                }
              : plan === "candidate_view"
                ? {
                    candidate_view_addon_active: true,
                    candidate_view_addon_expires_at: expiresAt.toISOString(),
                    stripe_customer_id: customer.id,
                  }
                : {
                    plan,
                    // 従量課金は期限なし（解約されると webhook が stripe_subscription_id を消す）
                    plan_expires_at: plan === "company_metered" ? null : expiresAt.toISOString(),
                    stripe_subscription_id: subscription.id,
                    stripe_customer_id: customer.id,
                    // 新規プラン開始時に利用回数をリセット
                    period_interview_count: 0,
                    period_start_at: now.toISOString(),
                  };

          // Supabase: profilesを更新（サービスロールキーで直接更新）
          const { error: dbErr } = await supabase
            .from("profiles")
            .update(updatePayload)
            .eq("id", userId);

          if (dbErr) {
            console.error("[create-subscription] DB update error:", dbErr);
            // Stripeの決済は成功しているのでエラーを返さず、フロントに通知
            return json({
              success: true,
              status: subscription.status,
              subscriptionId: subscription.id,
              dbError: "プラン情報の更新に失敗しました。サポートにお問い合わせください。",
            });
          }

          return json({
            success: true,
            status: subscription.status,
            subscriptionId: subscription.id,
            expiresAt: expiresAt.toISOString(),
          });
        } catch (e) {
          console.error("[create-subscription] error:", e);
          return json(
            { error: "決済処理に失敗しました。カード情報をご確認のうえ再度お試しください。" },
            402,
          );
        }
      },
    },
  },
});
