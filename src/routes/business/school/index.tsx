import { createFileRoute } from "@tanstack/react-router";
import { SafeNavigate } from "@/components/SafeNavigate";

// 学校・塾モードは「生徒の練習状況」だけなので、そのまま一覧へ
export const Route = createFileRoute("/business/school/")({
  component: () => <SafeNavigate to="/business/school/students" />,
});
