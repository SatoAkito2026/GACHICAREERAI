import { createFileRoute } from "@tanstack/react-router";
import ComingSoon from "@/components/ComingSoon";
import { BusinessShell } from "@/components/ModeShell";

export const Route = createFileRoute("/business/school/screening")({
  head: () => ({ meta: [{ title: "書類選考AI｜学校・塾" }] }),
  component: () => (
    <BusinessShell>
      <ComingSoon title="書類選考AI（学校・塾）" />
    </BusinessShell>
  ),
});
