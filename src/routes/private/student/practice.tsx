import { createFileRoute } from "@tanstack/react-router";
import { PracticeContent } from "@/components/PracticeContent";

export const Route = createFileRoute("/private/student/practice")({
  head: () => ({ meta: [{ title: "入試面接練習｜インタビアAI" }] }),
  component: () => <PracticeContent mode="student" backTo="/private/student" />,
});
