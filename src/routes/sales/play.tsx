import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SalesPlayPage } from "@/components/pages/SalesPlayPage";

const Search = z.object({
  scenario: z.enum(["door", "inbound", "teleapo", "b2b"]).catch("door"),
  difficulty: z.enum(["easy", "normal", "hard"]).catch("normal"),
  coach: z.enum(["coach", "full"]).catch("coach"),
});

// 営業ロープレの本番（AI のお客さん役と声で話す）
export const Route = createFileRoute("/sales/play")({
  ssr: false,
  validateSearch: (s) => Search.parse(s),
  head: () => ({
    meta: [{ title: "営業ロープレ｜ガチキャリAI" }, { name: "robots", content: "noindex" }],
  }),
  component: SalesPlayRoute,
});

function SalesPlayRoute() {
  const { scenario, difficulty, coach } = Route.useSearch();
  return <SalesPlayPage scenario={scenario} difficulty={difficulty} coachMode={coach} />;
}
