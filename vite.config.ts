import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: { port: 8080 },
  resolve: {
    alias: [
      {
        // jspdf's exports map only declares "node"/"browser" conditions, which the
        // Cloudflare Worker SSR environment doesn't match. Point directly at the ESM build.
        find: /^jspdf$/,
        replacement: "jspdf/dist/jspdf.es.min.js",
      },
    ],
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  plugins: [
    // SSR は Cloudflare Workers ランタイム上で動く（wrangler.jsonc の main = src/server.ts）
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      // src/server.ts（SSRエラーラッパー + Cron の scheduled ハンドラ）をサーバーエントリにする
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    viteReact(),
  ],
});
