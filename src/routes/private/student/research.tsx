import { createFileRoute } from "@tanstack/react-router";
import { ResearchContent } from "@/components/ResearchContent";

export const Route = createFileRoute("/private/student/research")({
  head: () => ({ meta: [{ title: "志望校研究AI｜インタビアAI" }] }),
  component: () => <ResearchContent mode="student" backTo="/private/student" />,
});
