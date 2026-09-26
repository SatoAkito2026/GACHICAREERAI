import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ArrowLeft } from "lucide-react";
import { usePlan, type Plan, PLAN_PRICES } from "@/hooks/use-plan";
import { useMode } from "@/hooks/use-mode";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";
import { CheckoutModal } from "@/components/CheckoutModal";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "料金プラン — インタビアAI｜AI面接・採用支援ツール" },
      { name: "description", content: "インタビアAI｜AI面接・採用支援ツールの料金プラン" },
    ],
  }),
  component: PricingPage,
});

type PlanCard = {
  key: Plan;
  name: string;
  price: string;
  features: string[];
  highlight: boolean;
};

const INDIVIDUAL_PLANS: PlanCard[] = [
  {
    key: "free",
    name: "無料プラン",
    price: PLAN_PRICES.free,
    features: ["AI面接：2回/月", "履歴保存：不可", "PDF出力：不可", "追加購入：¥550/回（税込）"],
    highlight: false,
  },
  {
    key: "individual_light",
    name: "ライトプラン",
    price: PLAN_PRICES.individual_light,
    features: ["AI面接：15回/月", "履歴保存：可", "PDF出力：可", "追加購入：¥330/回（税込）"],
    highlight: false,
  },
  {
    key: "individual_pro",
    name: "プロプラン",
    price: PLAN_PRICES.individual_pro,
    features: [
      "AI面接：25回/月",
      "履歴保存：可",
      "PDF出力：可",
      "履歴書自動生成：可（近日公開）",
      "追加購入：¥330/回（税込）",
    ],
    highlight: true,
  },
];

const COMPANY_PLANS: PlanCard[] = [
  {
    key: "company_metered",
    name: "従量課金プラン",
    price: PLAN_PRICES.company_metered,
    features: [
      "書類選考AI：無料・無制限",
      "書類選考履歴：無料・無制限",
      "AI面接：¥2,200/回（税込・使った分だけ）",
      "月額なし",
      "PDF出力：不可",
      "書類選考ランキング：不可",
      "独自アバター：可（別途初期費用¥110,000・税込）",
    ],
    highlight: false,
  },
  {
    key: "company_light",
    name: "ライトプラン",
    price: PLAN_PRICES.company_light,
    features: [
      "書類選考AI：無料・無制限",
      "書類選考履歴：無料・無制限",
      "AI面接：20回/月込み・超過¥330/回（税込）",
      "PDF出力：可",
      "書類選考ランキング：不可",
      "独自アバター：可（別途初期費用¥77,000・税込）",
    ],
    highlight: false,
  },
  {
    key: "company_pro",
    name: "プロプラン",
    price: PLAN_PRICES.company_pro,
    features: [
      "書類選考AI：無料・無制限",
      "書類選考履歴：無料・無制限",
      "書類選考ランキング：可",
      "AI面接：50回/月込み・超過¥330/回（税込）",
      "PDF出力：可",
      "独自アバター：可（別途初期費用¥55,000・税込）",
      "複数担当者：無制限",
      "面接履歴ランキング：可",
      "優先サポート：可",
    ],
    highlight: true,
  },
];

function PricingPage() {
  const { plan } = usePlan();
  const { isBusiness } = useMode();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checkoutPlan, setCheckoutPlan] = useState<Exclude<Plan, "free"> | null>(null);

  const handleSelect = (key: Exclude<Plan, "free">) => {
    if (!user) {
      void navigate({ to: "/login" });
      return;
    }
    setCheckoutPlan(key);
  };

  const plans = isBusiness ? COMPANY_PLANS : INDIVIDUAL_PLANS;
  const extraCredit = "¥330/回（税込）";

  return (
    <div
      className="min-h-screen"
      style={{ background: "#0F0F0F", fontFamily: "'Inter', sans-serif" }}
    >
      <nav
        className="fixed inset-x-0 top-0 z-30 flex h-[52px] items-center justify-between border-b bg-[#0F0F0F] px-6"
        style={{ borderColor: "#333333" }}
      >
        <div className="text-[15px]" style={{ fontWeight: 500, color: "#F0F0F0" }}>
          インタビアAI｜AI面接・採用支援ツール
        </div>
        <Link
          to={isBusiness ? "/business" : "/private"}
          className="flex items-center gap-1 text-[12px] transition-colors hover:text-[#F0F0F0]"
          style={{ color: "#888888", fontWeight: 500 }}
        >
          <ArrowLeft size={14} />
          戻る
        </Link>
      </nav>

      <main className="mx-auto max-w-5xl px-6 pb-20 pt-[92px]">
        <div className="mb-10 text-center">
          <h1 className="text-[26px]" style={{ fontWeight: 600, color: "#F0F0F0" }}>
            料金プラン
          </h1>
          <p className="mt-2 text-[14px]" style={{ color: "#888888" }}>
            ニーズに合わせてプランをお選びいただけます。
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = plan === p.key;
            return (
              <div
                key={p.key}
                className="flex flex-col rounded-2xl bg-[#222222] p-6"
                style={{
                  border: `${p.highlight ? "2px solid #C8FF00" : "1.5px solid #333333"}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-[16px]" style={{ fontWeight: 600, color: "#F0F0F0" }}>
                    {p.name}
                  </h2>
                  {p.highlight && (
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px]"
                      style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 600 }}
                    >
                      おすすめ
                    </span>
                  )}
                  {isCurrent && (
                    <span
                      className="rounded-md border px-2 py-0.5 text-[11px]"
                      style={{
                        background: "#C8FF00",
                        color: "#0F0F0F",
                        borderColor: "#C8FF00",
                        fontWeight: 600,
                      }}
                    >
                      現在のプラン
                    </span>
                  )}
                </div>
                <div className="mt-3 text-[24px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
                  {p.price}
                </div>

                <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                  {p.features.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[13px]"
                      style={{ color: "#888888" }}
                    >
                      <Check size={15} color="#00CC88" className="mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {p.key === "free" ? (
                  <button
                    type="button"
                    disabled
                    className="mt-6 w-full rounded-lg px-4 py-3 text-[14px]"
                    style={{
                      background: "#333333",
                      color: "#888888",
                      fontWeight: 500,
                      cursor: "not-allowed",
                    }}
                  >
                    {isCurrent ? "ご利用中" : "無料プラン"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isCurrent}
                    onClick={() => handleSelect(p.key as Exclude<Plan, "free">)}
                    className="mt-6 w-full rounded-lg px-4 py-3 text-[14px] transition-colors"
                    style={{
                      background: isCurrent ? "#333333" : "#C8FF00",
                      color: isCurrent ? "#888888" : "#0F0F0F",
                      fontWeight: 600,
                      cursor: isCurrent ? "not-allowed" : "pointer",
                    }}
                  >
                    {isCurrent ? "ご利用中" : "申し込む"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {isBusiness && (
          <div
            className="mt-12 rounded-2xl bg-[#222222] p-6 text-center"
            style={{ border: "1.5px solid #333333" }}
          >
            <h2 className="text-[18px]" style={{ fontWeight: 600, color: "#F0F0F0" }}>
              独自AIアバター初期費用
            </h2>
            <p className="mt-2 text-[14px]" style={{ color: "#888888" }}>
              企業専用のAIアバターを作成します。
            </p>
            <div className="mt-4 flex flex-col gap-1 text-[14px]" style={{ color: "#F0F0F0" }}>
              <span>従量課金：¥110,000（税込）</span>
              <span>ライト：¥77,000（税込）</span>
              <span>プロ：¥55,000（税込）</span>
            </div>
            <div className="mt-3 text-[13px]" style={{ color: "#888888" }}>
              お問い合わせ：
              <a href="mailto:info@akitogroup.jp" style={{ color: "#C8FF00", fontWeight: 500 }}>
                info@akitogroup.jp
              </a>
            </div>
          </div>
        )}

        {/* 追加クレジット購入セクション */}
        <div
          className="mt-12 rounded-2xl bg-[#222222] p-6 text-center"
          style={{ border: "1.5px solid #333333" }}
        >
          <h2 className="text-[18px]" style={{ fontWeight: 600, color: "#F0F0F0" }}>
            追加クレジット購入
          </h2>
          <p className="mt-2 text-[14px]" style={{ color: "#888888" }}>
            月の回数を使い切った場合は追加購入できます
          </p>
          <div className="mt-4 text-[22px]" style={{ fontWeight: 700, color: "#C8FF00" }}>
            {extraCredit}
          </div>
          <div className="mt-2 text-[12px]" style={{ color: "#888888" }}>
            （近日公開）
          </div>
        </div>
      </main>

      {checkoutPlan && <CheckoutModal plan={checkoutPlan} onClose={() => setCheckoutPlan(null)} />}
    </div>
  );
}
