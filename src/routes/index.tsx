import { createFileRoute } from "@tanstack/react-router";
import { SafeNavigate } from "@/components/SafeNavigate";

export const Route = createFileRoute("/")({
  component: () => <SafeNavigate to="/login" />,
});
