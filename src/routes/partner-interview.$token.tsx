import { createFileRoute } from "@tanstack/react-router";
import { PartnerInterviewPage } from "@/components/pages/PartnerInterviewPage";

// 提携先（POSPOS）のお店の AI 一次面接。応募者が URL を開くだけで受けられる（会員登録なし）
export const Route = createFileRoute("/partner-interview/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "AI面接" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: PartnerInterviewRoute,
});

function PartnerInterviewRoute() {
  const { token } = Route.useParams();
  return <PartnerInterviewPage token={token} />;
}
