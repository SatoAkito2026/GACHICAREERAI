import { createFileRoute } from "@tanstack/react-router";
import ComingSoon from "@/components/ComingSoon";
import { BusinessShell } from "@/components/ModeShell";

export const Route = createFileRoute("/business/school/settings")({
  head: () => ({ meta: [{ title: "学校設定｜学校・塾" }] }),
  component: () => (
    <BusinessShell>
      <ComingSoon title="学校設定" />
    </BusinessShell>
  ),
});
