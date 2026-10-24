import { createFileRoute } from "@tanstack/react-router";
import { PracticeHistoryContent } from "@/components/PracticeHistoryContent";

export const Route = createFileRoute("/private/individual/history")({
  head: () => ({ meta: [{ title: "評価｜ガチキャリAI" }] }),
  component: () => <PracticeHistoryContent mode="individual" backTo="/private/individual" />,
});
