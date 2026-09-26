import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/home")({
  component: () => <Navigate to="/private" />,
});
