import { createFileRoute } from "@tanstack/react-router";
import { ScreeningPage } from "@/components/pages/ScreeningPage";

export const Route = createFileRoute("/screening")({
  head: () => ({
    meta: [
      { title: "書類選考 AI — 面接コーチAI" },
      { name: "description", content: "複数の履歴書をAIがランク付けする書類選考ツール" },
    ],
  }),
  component: ScreeningPage,
});
