import { createFileRoute } from "@tanstack/react-router";
import { BusinessShell } from "@/components/ModeShell";
import { DashGrid } from "@/components/DashCard";

export const Route = createFileRoute("/business/school/")({
  head: () => ({ meta: [{ title: "学校ダッシュボード｜インタビアAI" }] }),
  component: SchoolDashboard,
});

function SchoolDashboard() {
  return (
    <BusinessShell>
      <DashGrid
        title="学校・塾"
        subtitle="学校・予備校・塾向け"
        cards={[
          {
            emoji: "📄",
            title: "書類選考AI",
            desc: "志願書をAI判定",
            to: "/business/school/screening",
          },
          {
            emoji: "🗂️",
            title: "書類選考履歴",
            desc: "選考結果・候補者管理",
            to: "/business/school/screening/history",
          },
          {
            emoji: "🎙️",
            title: "面接履歴",
            desc: "志願者の面接結果",
            to: "/business/school/history",
          },
          {
            emoji: "👥",
            title: "生徒管理",
            desc: "練習履歴・志望校・模試管理",
            to: "/business/school/students",
            comingSoon: true,
          },
        ]}
      />
    </BusinessShell>
  );
}
