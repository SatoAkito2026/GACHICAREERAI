import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { PrivateShell } from "@/components/ModeShell";
import { DashGrid } from "@/components/DashCard";
import { GrowthBadge } from "@/components/GrowthBadge";
import { useMode } from "@/hooks/use-mode";

export const Route = createFileRoute("/private/individual/")({
  head: () => ({ meta: [{ title: "個人ダッシュボード｜インタビアAI" }] }),
  component: IndividualDashboard,
});

function IndividualDashboard() {
  const { mode, setMode } = useMode();
  const attemptedRef = useRef(false);

  // 「個人」カードから遷移してきた場合、user_modeが未確定/受験生のままだと
  // 以降のAI機能(チャット・生成物等)がモードを誤判定するため、ここで確定させる。
  // attemptedRefで「このページ表示につき1回だけ」に制限し、
  // setModeの参照が再生成されても再実行されないようにする。
  useEffect(() => {
    if (attemptedRef.current || !mode) return;
    attemptedRef.current = true;
    if (mode !== "private_individual") {
      void setMode("private_individual");
    }
  }, [mode, setMode]);

  return (
    <PrivateShell>
      <GrowthBadge />
      <DashGrid
        title="個人"
        subtitle="練習 → 評価 → プロフィール公開 → オファー の順に進めます"
        cards={[
          {
            emoji: "🤖",
            title: "① 模擬面接を受ける",
            desc: "AIの面接官と練習。何回でも受けられます",
            to: "/private/individual/practice",
          },
          {
            emoji: "📊",
            title: "② 評価を見る",
            desc: "発言を根拠にした評価と、点数の推移",
            to: "/private/individual/history",
          },
          {
            emoji: "🌐",
            title: "③ プロフィールを公開",
            desc: "人物まとめを企業に公開（名前は伏せて表示）",
            to: "/private/individual/talent",
          },
          {
            emoji: "✉️",
            title: "④ オファー",
            desc: "企業からの面談の申し込み・メッセージ",
            to: "/private/individual/offers",
          },
        ]}
      />
      <DashGrid
        title="そのほかのツール"
        cards={[
          {
            emoji: "🪪",
            title: "経歴・希望条件",
            desc: "学歴・資格・希望条件などを編集",
            to: "/private/individual/profile",
          },
          {
            emoji: "📄",
            title: "書類生成AI",
            desc: "履歴書・自己PR・ES添削",
            to: "/private/individual/documents",
          },
          {
            emoji: "🔍",
            title: "企業研究AI（プロ限定）",
            desc: "志望企業の想定質問を自動生成",
            to: "/private/individual/research",
          },
          {
            emoji: "🧭",
            title: "自己分析レポート",
            desc: "強み・弱み・向いている職業を分析",
            to: "/private/individual/self-analysis",
          },
        ]}
      />
    </PrivateShell>
  );
}
