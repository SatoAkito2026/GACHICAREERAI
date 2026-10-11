import { createFileRoute } from "@tanstack/react-router";
import { PracticeContent } from "@/components/PracticeContent";

export const Route = createFileRoute("/private/individual/practice")({
  head: () => ({ meta: [{ title: "模擬面接AI｜ガチキャリAI" }] }),
  component: () => <PracticeContent mode="individual" backTo="/private/individual" />,
});
