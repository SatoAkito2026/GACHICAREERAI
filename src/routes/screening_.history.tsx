import { createFileRoute } from "@tanstack/react-router";
import { ScreeningHistoryPage } from "@/components/pages/ScreeningHistoryPage";

export const Route = createFileRoute("/screening_/history")({
  head: () => ({
    meta: [{ title: "選考履歴 — 書類選考AI｜面接コーチAI" }],
  }),
  component: ScreeningHistoryPage,
});
