import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // リンクに触れた（スマホではタップし始めた）時点で次のページを読み込み始め、移動を速くする
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
