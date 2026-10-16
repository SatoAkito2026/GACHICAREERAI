import { createFileRoute } from "@tanstack/react-router";
import { SchoolStudentPage } from "@/components/pages/SchoolPages";

export const Route = createFileRoute("/business/school/students_/$id")({
  head: () => ({ meta: [{ title: "生徒の練習結果｜学校・塾" }] }),
  component: function SchoolStudentRoute() {
    const { id } = Route.useParams();
    return <SchoolStudentPage id={id} />;
  },
});
