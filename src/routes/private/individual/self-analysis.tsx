import { createFileRoute } from "@tanstack/react-router";
import { SelfAnalysisContent } from "@/components/SelfAnalysisContent";

export const Route = createFileRoute("/private/individual/self-analysis")({
  head: () => ({ meta: [{ title: "自己分析レポート｜インタビアAI" }] }),
  component: () => <SelfAnalysisContent mode="individual" backTo="/private/individual" />,
});
