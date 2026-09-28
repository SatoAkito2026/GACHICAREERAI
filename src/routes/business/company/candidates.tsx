import { createFileRoute, redirect } from "@tanstack/react-router";

// 旧「ガチキャリダッシュボード」（月額の総評閲覧プラン）は、チケット制の「人材を探す」に置き換えた
export const Route = createFileRoute("/business/company/candidates")({
  beforeLoad: () => {
    throw redirect({ to: "/business/company/talent" });
  },
});
