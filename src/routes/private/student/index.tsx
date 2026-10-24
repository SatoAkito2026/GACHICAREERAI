import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { PrivateShell } from "@/components/ModeShell";
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
      <StudentMobileHome />
    </PrivateShell>
  );
}
