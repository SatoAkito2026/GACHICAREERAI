import { createFileRoute } from "@tanstack/react-router";
import { ResearchContent } from "@/components/ResearchContent";

export const Route = createFileRoute("/private/individual/research")({
  head: () => ({ meta: [{ title: "企業研究AI｜インタビアAI" }] }),
  component: () => <ResearchContent mode="individual" backTo="/private/individual" />,
});
