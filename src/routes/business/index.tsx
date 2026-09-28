import { createFileRoute, redirect } from "@tanstack/react-router";

// 今は企業向けだけを受け付けている（学校・塾／芸能・キャスティングは入口を隠している）
export const Route = createFileRoute("/business/")({
  beforeLoad: () => {
    throw redirect({ to: "/business/company" });
  },
});
