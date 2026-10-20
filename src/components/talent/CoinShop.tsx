/**
 * 企業向け：ガチキャリコインを買う（パックを選んでカードで支払う）。有効期限は買った日から6か月。
 */
import { useState } from "react";
import { Elements, CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Coins, X } from "lucide-react";
import { stripePromise } from "@/components/CheckoutModal";
import { Button, C, ErrorText, talentApi } from "@/components/talent/TalentUI";
import { COIN_EXPIRY_MONTHS, COIN_PACKS, type CoinPack } from "@/lib/coins";

export type CoinBalance = { balance: number; nextExpiry: string | null };

const CARD_OPTIONS = {
  hidePostalCode: true,
  style: {
    base: { color: "#F0F0F0", fontSize: "15px", "::placeholder": { color: "#888888" } },
    invalid: { color: "#FF5C5C" },
  },
};

/** 残りのコインの表示（ヘッダーなどに置く） */
export function CoinBadge({ coins, onBuy }: { coins: CoinBalance | null; onBuy: () => void }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3 py-2"
      style={{ background: C.card, border: `1px solid ${C.border}` }}
    >
      <Coins size={18} color={C.accent} />
      <div className="leading-tight">
        <p style={{ color: C.text, fontSize: 15, fontWeight: 800 }}>
          {coins ? coins.balance.toLocaleString() : "—"}
          <span className="ml-1 text-[11px]" style={{ color: C.muted, fontWeight: 600 }}>
            コイン
          </span>
        </p>
        {coins?.nextExpiry && coins.balance > 0 && (
          <p className="text-[10px]" style={{ color: C.muted }}>
            {new Date(coins.nextExpiry).toLocaleDateString("ja-JP")} に期限のものがあります
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onBuy}
        className="rounded-lg px-3 py-1.5 text-[12px]"
        style={{ background: C.accent, color: "#0F0F0F", fontWeight: 700 }}
      >
        コインを買う
      </button>
    </div>
  );
}

function BuyForm({ pack, onDone }: { pack: CoinPack; onDone: (c: CoinBalance) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pay = async () => {
    if (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
    if (!card) return;
    setLoading(true);
    setError("");
    const intent = await talentApi<{ clientSecret?: string; paymentIntentId?: string }>(
      "/api/talent/coins",
      { action: "intent", pack: pack.id },
    );
    if (!intent.ok) {
      setLoading(false);
      return setError(intent.data.error ?? "決済の準備に失敗しました");
    }
    const result = await stripe.confirmCardPayment(intent.data.clientSecret!, {
      payment_method: { card },
    });
    if (result.error) {
      setLoading(false);
      return setError(result.error.message ?? "決済に失敗しました");
    }
    const confirm = await talentApi<CoinBalance>("/api/talent/coins", {
      action: "confirm",
      paymentIntentId: result.paymentIntent?.id ?? intent.data.paymentIntentId,
    });
    setLoading(false);
    if (!confirm.ok) {
      return setError(
        (confirm.data.error ?? "確認に失敗しました") +
          "（決済済みの場合は、数分後にページを開き直すと反映されます）",
      );
    }
    onDone(confirm.data);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <CardElement options={CARD_OPTIONS} />
      </div>
      <label className="flex items-start gap-2 text-[12px]" style={{ color: C.sub }}>
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          コインの有効期限は購入日から{COIN_EXPIRY_MONTHS}
          か月で、期限を過ぎたコインは使えなくなります。購入後のキャンセル・返金・現金への交換はできません。閲覧した個人情報は採用の検討・連絡のためだけに使い、第三者に渡さないことに同意します。
        </span>
      </label>
      <ErrorText>{error}</ErrorText>
      <Button onClick={() => void pay()} loading={loading} disabled={!stripe || !agree}>
        {pack.priceJpy.toLocaleString()}円を支払う
      </Button>
    </div>
  );
}

export function CoinShopModal({
  needCoins,
  onClose,
  onDone,
}: {
  needCoins?: number;
  onClose: () => void;
  onDone: (c: CoinBalance) => void;
}) {
  const [pack, setPack] = useState<CoinPack>(
    COIN_PACKS.find((p) => !needCoins || p.coins >= needCoins) ?? COIN_PACKS[COIN_PACKS.length - 1],
  );
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-6"
        style={{ background: C.card2, border: `1.5px solid ${C.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 style={{ color: C.text, fontSize: 17, fontWeight: 700 }}>コインを買う</h2>
          <button type="button" onClick={onClose} aria-label="閉じる">
            <X size={20} color={C.muted} />
          </button>
        </div>
        {needCoins ? (
          <p className="mb-3 text-[13px]" style={{ color: C.sub }}>
            この方を見るには <b style={{ color: C.accent }}>{needCoins}コイン</b> 必要です。
          </p>
        ) : null}
        <div className="mb-4 flex flex-col gap-2">
          {COIN_PACKS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPack(p)}
              className="flex items-center justify-between rounded-xl px-4 py-3 text-left"
              style={{
                background: pack.id === p.id ? "#16200A" : C.bg,
                border: `1.5px solid ${pack.id === p.id ? C.accent : C.border}`,
              }}
            >
              <span className="flex items-center gap-2">
                <Coins size={18} color={C.accent} />
                <span style={{ color: C.text, fontSize: 16, fontWeight: 800 }}>
                  {p.coins}コイン
                </span>
                {p.bonus && (
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[10px]"
                    style={{ background: C.accent, color: "#0F0F0F", fontWeight: 700 }}
                  >
                    {p.bonus}
                  </span>
                )}
              </span>
              <span style={{ color: C.sub, fontSize: 14, fontWeight: 700 }}>
                ¥{p.priceJpy.toLocaleString()}
              </span>
            </button>
          ))}
        </div>
        <Elements stripe={stripePromise}>
          <BuyForm pack={pack} onDone={onDone} />
        </Elements>
      </div>
    </div>
  );
}
