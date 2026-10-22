import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { PrivateShell } from "@/components/ModeShell";
import { DashGrid } from "@/components/DashCard";
import { useMode } from "@/hooks/use-mode";
import { StudentMobileHome } from "@/components/mobile/MobileHome";

export const Route = createFileRoute("/private/student/")({
  head: () => ({ meta: [{ title: "受験生ダッシュボード｜ガチキャリAI" }] }),
  component: StudentDashboard,
});

function StudentDashboard() {
  const { mode, setMode } = useMode();
  const attemptedRef = useRef(false);

  // 「受験生」カードから遷移してきた場合、user_modeが未確定/個人のままだと
  // 以降のAI機能(チャット・生成物等)がモードを誤判定するため、ここで確定させる。
  // attemptedRefで「このページ表示につき1回だけ」に制限し、
  // setModeの参照が再生成されても再実行されないようにする。
  useEffect(() => {
    if (attemptedRef.current || !mode) return;
    attemptedRef.current = true;
    if (mode !== "private_student") {
      void setMode("private_student");
    }
  }, [mode, setMode]);

  return (
    <PrivateShell>
      {/* スマホ・タブレット：アプリらしいホーム（個人と同じ形） */}
      <div className="lg:hidden">
        <StudentMobileHome />
      </div>
      {/* パソコン：カード一覧 */}
      <div className="hidden lg:block">
        <DashGrid
          title="受験生"
          subtitle="入試対策向け"
          cards={[
            {
              emoji: "🤖",
              title: "入試面接練習",
              desc: "AIアバターが面接官役を務めます",
              to: "/private/student/practice",
            },
            {
              emoji: "🪪",
              title: "プロフィール",
              desc: "学歴・資格・志望校などを編集",
              to: "/private/student/profile",
            },
            {
              emoji: "📄",
              title: "書類生成AI",
              desc: "志望理由書・小論文添削",
              to: "/private/student/documents",
            },
            {
              emoji: "🔍",
              title: "志望校研究AI（プロ限定）",
              desc: "想定質問を自動生成",
              to: "/private/student/research",
            },
            {
              emoji: "🧭",
              title: "自己分析レポート",
              desc: "強み・弱み・向いている学校傾向を分析",
              to: "/private/student/self-analysis",
            },
            {
              emoji: "📊",
              title: "練習履歴",
              desc: "スコア推移を確認",
              to: "/private/student/history",
            },
            {
              emoji: "🎁",
              title: "友だちを招待",
              desc: "友だちと自分に練習のボーナス+3回",
              to: "/private/invite",
            },
          ]}
        />
      </div>
    </PrivateShell>
  );
}
