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

// 企業は月額プランなし。使った分だけ（LP・会社ホームページと同じ内容）
const COMPANY_PRICES: { name: string; price: string; desc: string }[] = [
  { name: "人材一覧・人物まとめ", price: "無料", desc: "匿名の一覧とまとめを見られます" },
  {
    name: "閲覧チケット",
    price: "¥10,000／1人（税込・買い切り）",
    desc: "名前・面接ごとの採用担当者向けの評価・会話・録画（本人が許可した場合）が見られ、そのまま面談を申し込めます。採用が決まっても成功報酬はゼロ",
  },
  {
    name: "AI面接（URL発行）",
    price: `${PLAN_PRICES.company_metered}・従量課金`,
    desc: "書類選考した候補者に面接URLを送ると、AI面接官が一次面接をします。候補者が面接を始めた回だけ請求。月額はなし",
  },
  {
    name: "求人掲載",
    price: "今は無料",
    desc: "応募があると、応募者の練習の評価を見てメッセージできます",
  },
  { name: "書類選考AI", price: "掲載中は無料", desc: "履歴書PDFをAIが一括で判定します" },
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
            {isBusiness
              ? "月額料金はなく、使った分だけのお支払いです。"
              : "ニーズに合わせてプランをお選びいただけます。"}
          </p>
        </div>

        {isBusiness ? (
          <div className="flex flex-col gap-3">
            {COMPANY_PRICES.map((r) => (
              <div
                key={r.name}
                className="rounded-2xl bg-[#222222] p-5"
                style={{ border: "1.5px solid #333333" }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[16px]" style={{ fontWeight: 600, color: "#F0F0F0" }}>
                    {r.name}
                  </h2>
                  <span className="text-[16px]" style={{ fontWeight: 700, color: "#C8FF00" }}>
                    {r.price}
                  </span>
                </div>
                <p className="mt-2 text-[13px]" style={{ color: "#888888", lineHeight: 1.7 }}>
                  {r.desc}
                </p>
              </div>
            ))}
            <p className="mt-2 text-center text-[13px]" style={{ color: "#888888" }}>
              月額料金・成功報酬はありません。表示はすべて税込です。
            </p>
          </div>
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
              <span>¥110,000（税込）</span>
            </div>
            <div className="mt-3 text-[13px]" style={{ color: "#888888" }}>
              お問い合わせ：
              <a href="mailto:info@akitogroup.jp" style={{ color: "#C8FF00", fontWeight: 500 }}>
                info@akitogroup.jp
              </a>
            </div>
          </div>
        )}

        {/* 追加クレジット購入セクション（個人向け） */}
        {!isBusiness && (
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
        )}
      </main>

      {checkoutPlan && <CheckoutModal plan={checkoutPlan} onClose={() => setCheckoutPlan(null)} />}
    </div>
  );
}
