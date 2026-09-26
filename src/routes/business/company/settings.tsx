import { createFileRoute } from "@tanstack/react-router";
import BusinessSettings from "@/components/BusinessSettings";
import { BusinessShell } from "@/components/ModeShell";

export const Route = createFileRoute("/business/company/settings")({
  head: () => ({ meta: [{ title: "企業設定｜企業" }] }),
  component: () => (
    <BusinessShell>
      <BusinessSettings title="企業設定" />
    </BusinessShell>
  ),
});
