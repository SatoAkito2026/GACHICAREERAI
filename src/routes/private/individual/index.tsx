import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { PrivateShell } from "@/components/ModeShell";
import { useMode } from "@/hooks/use-mode";
import { MobileHome } from "@/components/mobile/MobileHome";

export const Route = createFileRoute("/private/individual/")({
  head: () => ({ meta: [{ title: "個人ダッシュボード｜ガチキャリAI" }] }),
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
      <MobileHome />
    </PrivateShell>
  );
}
