import { createFileRoute } from "@tanstack/react-router";
import { DocumentsContent } from "@/components/DocumentsContent";

export const Route = createFileRoute("/private/individual/documents")({
  head: () => ({ meta: [{ title: "書類生成AI｜インタビアAI" }] }),
  component: () => <DocumentsContent mode="individual" backTo="/private/individual" />,
});
