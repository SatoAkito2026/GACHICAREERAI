import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "@/routes/history";
import { BusinessShell } from "@/components/ModeShell";
export const Route = createFileRoute("/business/company/history")({
  head: () => ({ meta: [{ title: "面接履歴｜企業" }] }),
  component: () => (
    <BusinessShell>
      <HistoryPage showEntranceTab={false} showHeader={false} />
    </BusinessShell>
  ),
});
