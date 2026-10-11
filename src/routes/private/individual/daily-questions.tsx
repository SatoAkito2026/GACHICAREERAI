import { createFileRoute } from "@tanstack/react-router";
import { DailyQuestionsContent } from "@/components/DailyQuestionsContent";

export const Route = createFileRoute("/private/individual/daily-questions")({
  head: () => ({ meta: [{ title: "今日の質問｜ガチキャリAI" }] }),
  component: () => <DailyQuestionsContent mode="individual" backTo="/private/individual" />,
});
