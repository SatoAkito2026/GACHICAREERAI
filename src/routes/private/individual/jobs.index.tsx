import { createFileRoute } from "@tanstack/react-router";
import { JobListPage } from "@/components/pages/JobPages";

export const Route = createFileRoute("/private/individual/jobs/")({
  head: () => ({ meta: [{ title: "求人を探す｜ガチキャリAI" }] }),
  component: JobListPage,
});
