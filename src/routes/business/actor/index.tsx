import { createFileRoute } from "@tanstack/react-router";
import { BusinessShell } from "@/components/ModeShell";
import { DashGrid } from "@/components/DashCard";
import { useActorPaywall, ActorPaywallScreen } from "@/components/ActorPaywall";

export const Route = createFileRoute("/business/actor/")({
  head: () => ({ meta: [{ title: "芸能・キャスティングダッシュボード｜インタビアAI" }] }),
  component: ActorDashboard,
});

function ActorDashboard() {
  const { isPaid, loading } = useActorPaywall();

  if (loading) return null;
  if (!isPaid) {
    return (
      <BusinessShell>
        <ActorPaywallScreen />
      </BusinessShell>
    );
  }

  return (
    <BusinessShell>
      <DashGrid
        title="芸能・キャスティング"
        subtitle="制作・キャスティング会社向け"
        cards={[
          {
            emoji: "🎭",
            title: "役者データベース",
            desc: "検索・プロフィール・集客予測",
            to: "/business/actor/database",
          },
          {
            emoji: "📄",
            title: "書類選考",
            desc: "作品条件×一括評価",
            to: "/business/actor/screening",
          },
          {
            emoji: "🗂️",
            title: "書類選考履歴",
            desc: "選考結果一覧",
            to: "/business/actor/screening/history",
          },
          {
            emoji: "🎙️",
            title: "面接履歴",
            desc: "経歴確認面接の結果",
            to: "/business/actor/history",
          },
        ]}
      />
    </BusinessShell>
  );
}
