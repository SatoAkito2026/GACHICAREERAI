import { createFileRoute } from "@tanstack/react-router";
import ComingSoon from "@/components/ComingSoon";
import { PrivateShell } from "@/components/ModeShell";

export const Route = createFileRoute("/private/student/statement")({
  head: () => ({ meta: [{ title: "志望理由書添削｜インタビアAI" }] }),
  component: () => (
    <PrivateShell>
      <ComingSoon title="志望理由書添削" />
    </PrivateShell>
  ),
});
