import { getAuthHeaders } from "@/lib/chat-api";
import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { X, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePlan, type Plan, PLAN_LABELS, PLAN_PRICES } from "@/hooks/use-plan";

const STRIPE_PUBLISHABLE_KEY =
  "pk_live_51Tdk13J1Nq1hx5wCgIw06UH1GBp6higghN4FnL4cobvKt5kGvfIm80fkia6OjJrWRgPybVkB7LrjEuJJDng7i8wY00539luPFI";

export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

const CARD_OPTIONS = {
  hidePostalCode: true,
  style: {
    base: {
      color: "#F0F0F0",
      fontFamily: "'Inter', sans-serif",
      fontSize: "15px",
      "::placeholder": { color: "#888888" },
    },
    invalid: { color: "#FF5C5C" },
  },
};

type Props = {
  plan: Exclude<Plan, "free">;
  onClose: () => void;
};

function CheckoutForm({ plan, onClose }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const { user } = useAuth();
  const { refresh } = usePlan();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [postalCode, setPostalCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
    if (!card) return;

    setLoading(true);
    setError(null);

    try {
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card,
        billing_details: {
          email: user?.email ?? undefined,
          address: {
            country: "JP",
            postal_code: postalCode.replace(/[^0-9]/g, "") || undefined,
          },
        },
      });
      if (pmError || !paymentMethod) {
        setError(pmError?.message ?? "カード情報の処理に失敗しました");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          paymentMethodId: paymentMethod.id,
          plan,
          email: user?.email,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error ?? "決済に失敗しました");
        setLoading(false);
        return;
      }

      // DB更新はサーバー側（create-subscription.ts）で完結しているためフロントでは不要
      await refresh();
      setSuccess(true);
      setLoading(false);
    } catch {
      setError("予期せぬエラーが発生しました");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <CheckCircle2 size={48} color="#C8FF00" />
        <div className="text-[18px]" style={{ fontWeight: 600, color: "#F0F0F0" }}>
          プランが有効になりました
        </div>
        <div className="text-[13px]" style={{ color: "#888888" }}>
          {PLAN_LABELS[plan]}をご利用いただけます。
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-lg px-4 py-3 text-[14px]"
          style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 600 }}
        >
          閉じる
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div
        className="rounded-lg p-3"
        style={{ background: "#0F0F0F", border: "1px solid #333333" }}
      >
        <CardElement options={CARD_OPTIONS} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px]" style={{ color: "#888888" }}>
          郵便番号
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          placeholder="123-4567"
          maxLength={8}
          className="w-full rounded-lg px-3 py-2.5 text-[15px] outline-none"
          style={{
            background: "#0F0F0F",
            border: "1px solid #333333",
            color: "#F0F0F0",
          }}
        />
      </div>
      {error && (
        <div className="text-[12px]" style={{ color: "#FF5C5C" }}>
          {error}
        </div>
      )}
      <div className="text-[11px]" style={{ color: "#888888" }}>
        {"\n"}
      </div>
      <button
        type="submit"
        disabled={!stripe || loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-[14px]"
        style={{
          background: loading ? "#333333" : "#C8FF00",
          color: loading ? "#888888" : "#0F0F0F",
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        {loading ? "処理中..." : "申し込む"}
      </button>
    </form>
  );
}

export function CheckoutModal({ plan, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: "#222222", border: "1.5px solid #333333" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px]" style={{ fontWeight: 600, color: "#F0F0F0" }}>
            プランを申し込む
          </h2>
          <button type="button" onClick={onClose} aria-label="閉じる">
            <X size={20} color="#888888" />
          </button>
        </div>
        <div className="mb-4 flex items-baseline gap-2">
          <span className="text-[15px]" style={{ color: "#F0F0F0", fontWeight: 600 }}>
            {PLAN_LABELS[plan]}
          </span>
          <span className="text-[18px]" style={{ color: "#C8FF00", fontWeight: 700 }}>
            {PLAN_PRICES[plan]}
          </span>
        </div>
        <Elements stripe={stripePromise}>
          <CheckoutForm plan={plan} onClose={onClose} />
        </Elements>
      </div>
    </div>
  );
}
