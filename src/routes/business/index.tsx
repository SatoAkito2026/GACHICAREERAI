import { createFileRoute } from "@tanstack/react-router";
import { BusinessShell } from "@/components/ModeShell";
import { DashGrid } from "@/components/DashCard";

export const Route = createFileRoute("/business/")({
  head: () => ({ meta: [{ title: "Business｜インタビアAI" }] }),
  component: BusinessTop,
});

function BusinessTop() {
  return (
    <BusinessShell>
      <DashGrid
        title="どちらで利用しますか？"
        cards={[
          {
            emoji: "🏢",
            title: "企業",
            desc: "採用担当向け。書類選考・採用面接をAIで効率化",
            to: "/business/company",
          },
          {
            emoji: "🏫",
            title: "学校・塾",
            desc: "学校・予備校・塾向け。志願者面接・生徒の入試対策をAIでサポート",
            to: "/business/school",
          },
          {
            emoji: "🎭",
            title: "芸能・キャスティング",
            desc: "制作・キャスティング会社向け。役者データベース・経歴確認面接",
            to: "/business/actor",
          },
        ]}
      />
    </BusinessShell>
  );
}
