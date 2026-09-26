import { createFileRoute } from "@tanstack/react-router";
import ComingSoon from "@/components/ComingSoon";
import { PrivateShell } from "@/components/ModeShell";

export const Route = createFileRoute("/private/individual/prep")({
  head: () => ({ meta: [{ title: "ES添削AI｜インタビアAI" }] }),
  component: () => (
    <PrivateShell>
      <ComingSoon title="ES添削AI" />
    </PrivateShell>
  ),
});
