import { createFileRoute } from "@tanstack/react-router";
import ComingSoon from "@/components/ComingSoon";
import { BusinessShell } from "@/components/ModeShell";

export const Route = createFileRoute("/business/school/students")({
  head: () => ({ meta: [{ title: "生徒管理｜学校・塾" }] }),
  component: () => (
    <BusinessShell>
      <ComingSoon title="生徒管理" />
    </BusinessShell>
  ),
});
