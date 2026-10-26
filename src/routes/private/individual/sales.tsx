import { createFileRoute } from "@tanstack/react-router";
import { SalesMemberPage } from "@/components/pages/SalesPages";

export const Route = createFileRoute("/private/individual/sales")({
  head: () => ({ meta: [{ title: "営業ロープレ｜ガチキャリAI" }] }),
  component: SalesMemberPage,
});
