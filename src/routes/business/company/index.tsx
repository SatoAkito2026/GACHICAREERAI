import { createFileRoute } from "@tanstack/react-router";
import { BusinessShell } from "@/components/ModeShell";
import { DashGrid } from "@/components/DashCard";

export const Route = createFileRoute("/business/company/")({
  head: () => ({ meta: [{ title: "企業ダッシュボード｜インタビアAI" }] }),
  component: CompanyDashboard,
});

function CompanyDashboard() {
  return (
    <BusinessShell>
      <DashGrid
        title="企業"
        subtitle="採用担当向け"
        cards={[
          {
            emoji: "📄",
            title: "書類選考AI",
            desc: "PDF一括AI判定",
            to: "/business/company/screening",
          },
          {
            emoji: "🗂️",
            title: "書類選考履歴",
            desc: "選考結果・候補者管理",
            to: "/business/company/screening/history",
          },
          {
            emoji: "🎙️",
            title: "面接履歴",
            desc: "面接結果・AIレポート",
            to: "/business/company/history",
          },
          {
            emoji: "🗂️",
            title: "ガチキャリダッシュボード",
            desc: "模擬面接の総評を閲覧・録画を購入",
            to: "/business/company/candidates",
          },
          {
            emoji: "📢",
            title: "求人掲載",
            desc: "求人を掲載・応募者を確認（ライト/プロ限定）",
            to: "/business/company/jobs",
          },
          {
            emoji: "⚙️",
            title: "企業設定",
            desc: "採用基準・AIアバター設定",
            to: "/business/company/settings",
          },
        ]}
      />
    </BusinessShell>
  );
}
