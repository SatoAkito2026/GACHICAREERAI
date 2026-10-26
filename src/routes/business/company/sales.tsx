import { createFileRoute } from "@tanstack/react-router";
import { SalesCompanyPage } from "@/components/pages/SalesPages";

export const Route = createFileRoute("/business/company/sales")({
  head: () => ({ meta: [{ title: "営業ロープレ｜ガチキャリAI Business" }] }),
  component: SalesCompanyPage,
});
