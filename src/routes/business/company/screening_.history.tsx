import { createFileRoute } from "@tanstack/react-router";
import { ScreeningHistoryPage } from "@/routes/screening_.history";
import { BusinessShell } from "@/components/ModeShell";
export const Route = createFileRoute("/business/company/screening_/history")({
  head: () => ({ meta: [{ title: "書類選考履歴｜企業" }] }),
  component: () => (
    <BusinessShell>
      <ScreeningHistoryPage showHeader={false} />
    </BusinessShell>
  ),
});
