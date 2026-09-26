import { createFileRoute } from "@tanstack/react-router";
import { PracticeHistoryContent } from "@/components/PracticeHistoryContent";

export const Route = createFileRoute("/private/student/history")({
  head: () => ({ meta: [{ title: "練習履歴｜インタビアAI" }] }),
  component: () => <PracticeHistoryContent mode="student" backTo="/private/student" />,
});
