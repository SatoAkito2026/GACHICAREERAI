import { createFileRoute } from "@tanstack/react-router";
import { ProfileContent } from "@/components/ProfileContent";

export const Route = createFileRoute("/private/student/profile")({
  head: () => ({ meta: [{ title: "プロフィール｜インタビアAI" }] }),
  component: () => <ProfileContent mode="student" backTo="/private/student" />,
});
