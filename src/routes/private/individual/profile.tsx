import { createFileRoute } from "@tanstack/react-router";
import { ProfileContent } from "@/components/ProfileContent";

export const Route = createFileRoute("/private/individual/profile")({
  head: () => ({ meta: [{ title: "プロフィール｜ガチキャリAI" }] }),
  component: () => <ProfileContent mode="individual" backTo="/private/individual" />,
});
