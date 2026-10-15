import { createFileRoute } from "@tanstack/react-router";
import { SchoolStudentsPage } from "@/components/pages/SchoolPages";

export const Route = createFileRoute("/business/school/students")({
  head: () => ({ meta: [{ title: "生徒の練習状況｜学校・塾" }] }),
  component: SchoolStudentsPage,
});
