import { createFileRoute } from "@tanstack/react-router";
import ComingSoon from "@/components/ComingSoon";
import { BusinessShell } from "@/components/ModeShell";

export const Route = createFileRoute("/business/school/history")({
  head: () => ({ meta: [{ title: "面接履歴｜学校・塾" }] }),
  component: () => (
    <BusinessShell>
      <ComingSoon title="面接履歴（学校・塾）" />
    </BusinessShell>
  ),
});
