import { createFileRoute } from "@tanstack/react-router";
import { SalesResultPage } from "@/components/pages/SalesPages";

// 営業ロープレの結果（本人と、参加している会社の担当者が見られる）
export const Route = createFileRoute("/sales/result/$id")({
  ssr: false,
  head: () => ({
    meta: [{ title: "営業ロープレの結果｜ガチキャリAI" }, { name: "robots", content: "noindex" }],
  }),
  component: SalesResultRoute,
});

function SalesResultRoute() {
  const { id } = Route.useParams();
  return <SalesResultPage id={id} />;
}
