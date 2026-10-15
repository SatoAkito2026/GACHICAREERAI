import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ArrowLeft } from "lucide-react";
import { usePlan, type Plan, PLAN_PRICES } from "@/hooks/use-plan";
import { useMode } from "@/hooks/use-mode";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";
import { CheckoutModal } from "@/components/CheckoutModal";
import { limitText, PRACTICE_RULES, type IndividualPlanKey } from "@/lib/plan-rules";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "料金プラン — ガチキャリAI｜AI面接・採用支援ツール" },
      { name: "description", content: "ガチキャリAI｜AI面接・採用支援ツールの料金プラン" },
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

/** 個人プランの説明は src/lib/plan-rules.ts の数字から作る（数字を1か所で管理するため） */
function individualFeatures(key: IndividualPlanKey): string[] {
  const r = PRACTICE_RULES[key];
  const count = r.perMonth == null ? `1日${r.perDay}回` : `1日${r.perDay}回・月${r.perMonth}回まで`;
  return [
    `模擬面接：${count}`,
    `1回の長さ：${limitText(r.maxMinutes, "分")}`,
    `練習できる職種：${r.jobTypes == null ? "無制限" : `月${r.jobTypes}つまで`}`,
    `保存できる結果：${r.results == null ? "無制限" : `新しい${r.results}件`}`,
    "根拠つきの評価・プロフィール公開・オファー：全プラン同じ",
  ];
}

const INDIVIDUAL_PLANS: PlanCard[] = [
  {
    key: "free",
    name: "無料プラン",
    price: PLAN_PRICES.free,
    features: individualFeatures("free"),
    highlight: false,
  },
  {
    key: "individual_light",
    name: "ライトプラン",
    price: PLAN_PRICES.individual_light,
    features: individualFeatures("individual_light"),
    highlight: false,
  },
  {
    key: "individual_pro",
    name: "プロプラン",
    price: PLAN_PRICES.individual_pro,
    features: [...individualFeatures("individual_pro"), "書類アップロードして面接：可"],
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

  const plans = INDIVIDUAL_PLANS;

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
          ガチキャリAI｜AI面接・採用支援ツール
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

        {isBusiness ? (
          <CompanyPricing />
        ) : (
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
        )}
      </main>

      {checkoutPlan && <CheckoutModal plan={checkoutPlan} onClose={() => setCheckoutPlan(null)} />}
    </div>
  );
}

/** 企業向け：月額プランはなし。人材の閲覧はチケット、求人掲載は今は無料 */
function CompanyPricing() {
  const items: { name: string; price: string; features: string[] }[] = [
    {
      name: "人材の閲覧チケット",
      price: "1人ごと",
      features: [
        "人材を探す・匿名の人物まとめを見る：無料",
        "チケットで名前・面接ごとの採用担当者向け評価・会話・録画（本人が許可した場合）を閲覧",
        "チケットを買った人に面談を申し込み、承諾されたらメッセージ",
        "採用が決まっても成功報酬はかかりません",
      ],
    },
    {
      name: "求人掲載",
      price: "今は無料",
      features: ["求人を掲載して応募を受け付ける", "掲載・終了はいつでも切り替え可能"],
    },
    {
      name: "書類選考AI",
      price: "求人掲載中は無料",
      features: ["履歴書PDFをAIで一括判定", "求人を1件以上掲載している企業が使えます"],
    },
  ];
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {items.map((p) => (
        <div
          key={p.name}
          className="flex flex-col rounded-2xl bg-[#222222] p-6"
          style={{ border: "1.5px solid #333333" }}
        >
          <h2 className="text-[16px]" style={{ fontWeight: 600, color: "#F0F0F0" }}>
            {p.name}
          </h2>
          <div className="mt-3 text-[22px]" style={{ fontWeight: 700, color: "#C8FF00" }}>
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
        </div>
      ))}
    </div>
  );
}
