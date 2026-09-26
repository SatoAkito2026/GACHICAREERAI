import { createFileRoute } from "@tanstack/react-router";
import { PrivateShell } from "@/components/ModeShell";
import { DashGrid } from "@/components/DashCard";

export const Route = createFileRoute("/private/")({
  head: () => ({ meta: [{ title: "Private｜インタビアAI" }] }),
  component: PrivateTop,
});

function PrivateTop() {
  return (
    <PrivateShell>
      <DashGrid
        title="どちらで使いますか？"
        subtitle="目的に合わせて選んでください"
        cards={[
          {
            emoji: "👤",
            title: "個人",
            desc: "就活・転職向け。模擬面接・ES添削・企業研究をAIでサポート",
            to: "/private/individual",
          },
          {
            emoji: "🎓",
            title: "受験生",
            desc: "入試対策向け。入試面接練習・志望理由書添削をAIでサポート",
            to: "/private/student",
          },
        ]}
      />
    </PrivateShell>
  );
}
