import { createFileRoute } from "@tanstack/react-router";
import { ScreeningPage } from "@/components/pages/ScreeningPage";
import { BusinessShell } from "@/components/ModeShell";

export const Route = createFileRoute("/business/company/screening")({
  head: () => ({ meta: [{ title: "書類選考AI｜企業" }] }),
  component: () => (
    <BusinessShell>
      <ScreeningPage />
    </BusinessShell>
  ),
});
