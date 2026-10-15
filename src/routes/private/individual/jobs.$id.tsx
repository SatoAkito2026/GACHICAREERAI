import { createFileRoute } from "@tanstack/react-router";
import { JobDetailPage } from "@/components/pages/JobPages";

export const Route = createFileRoute("/private/individual/jobs/$id")({
  head: () => ({ meta: [{ title: "求人の詳細｜ガチキャリAI" }] }),
  component: function JobDetailRoute() {
    const { id } = Route.useParams();
    return <JobDetailPage id={id} />;
  },
});
