import { createFileRoute } from "@tanstack/react-router";
import { BusinessShell } from "@/components/ModeShell";
import { DashGrid } from "@/components/DashCard";

export const Route = createFileRoute("/business/company/")({
  head: () => ({ meta: [{ title: "企業ダッシュボード｜ガチキャリAI" }] }),
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
            emoji: "🔎",
            title: "人材を探す",
            desc: "模擬面接の評価で人材を探す。気になる人はコインで録画・名前・詳しい評価を閲覧",
            to: "/business/company/talent",
          },
          {
            emoji: "✉️",
            title: "面談・メッセージ",
            desc: "面談の申し込み状況と、承諾した人とのメッセージ",
            to: "/business/company/messages",
          },
          {
            emoji: "📄",
            title: "書類選考AI",
            desc: "履歴書PDFをAIで一括判定（求人を掲載中の企業）",
            to: "/business/company/screening",
          },
          {
            emoji: "🗂️",
            title: "書類選考履歴",
            desc: "選考結果・候補者管理",
            to: "/business/company/screening/history",
          },
          {
            emoji: "🧾",
            title: "購入した人材",
            desc: "コインで見た人・応募してきた人の面接履歴と、採用担当者向けの評価",
            to: "/business/company/purchased",
          },
          {
            emoji: "🗣️",
            title: "営業ロープレ（社員研修）",
            desc: "社員がAIのお客さん相手に訪問販売・反響営業・テレアポ・商談を練習。結果と評価を確認（月100回まで無料）",
            to: "/business/company/sales",
          },
          {
            emoji: "📢",
            title: "求人掲載",
            desc: "求人を掲載・応募者を確認（今は無料）",
            to: "/business/company/jobs",
          },
          {
            emoji: "⚙️",
            title: "企業設定",
            desc: "会社情報・採用基準",
            to: "/business/company/settings",
          },
        ]}
      />
    </BusinessShell>
  );
}
