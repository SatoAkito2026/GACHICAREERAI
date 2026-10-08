import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/use-auth";
import { PlanProvider } from "@/hooks/use-plan";
import { ModeProvider } from "@/hooks/use-mode";
import { Toaster } from "@/components/ui/sonner";
import { PersistentChatBubble } from "@/components/PersistentChatBubble";
import { ReferralFlushListener } from "@/components/ReferralFlushListener";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ガチキャリAI｜AIで自分を磨く。企業と出会う。" },
      {
        name: "description",
        content:
          "ガチキャリAIは、AIとの対話による応募書類の作成と模擬面接を通じて、学生・求職者の就職・転職活動を支援するキャリアプラットフォームです。企業は候補者のプロフィールや模擬面接を確認し、実際に会いたい人材へ直接スカウト。求職者と企業、それぞれの「選ぶ」と「選ばれる」をAIでつなぎます。",
      },
      { property: "og:title", content: "ガチキャリAI｜AIで自分を磨く。企業と出会う。" },
      {
        property: "og:description",
        content:
          "ガチキャリAIは、AIとの対話による応募書類の作成と模擬面接を通じて、学生・求職者の就職・転職活動を支援するキャリアプラットフォームです。企業は候補者のプロフィールや模擬面接を確認し、実際に会いたい人材へ直接スカウト。求職者と企業、それぞれの「選ぶ」と「選ばれる」をAIでつなぎます。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "ガチキャリAI｜AIで自分を磨く。企業と出会う。" },
      {
        name: "twitter:description",
        content:
          "ガチキャリAIは、AIとの対話による応募書類の作成と模擬面接を通じて、学生・求職者の就職・転職活動を支援するキャリアプラットフォームです。企業は候補者のプロフィールや模擬面接を確認し、実際に会いたい人材へ直接スカウト。求職者と企業、それぞれの「選ぶ」と「選ばれる」をAIでつなぎます。",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/NOsOMGMBY8WExHjQZQDpa3doOB03/social-images/social-1783580299259-実際の面接風景.webp",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/NOsOMGMBY8WExHjQZQDpa3doOB03/social-images/social-1783580299259-実際の面接風景.webp",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const location = useLocation();
  // 面接画面は画面いっぱいに使うので、下のフッターを出さない
  const isInterviewPage = /^\/(interview|chat-interview|actor-interview)\//.test(location.pathname);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PlanProvider>
          <ModeProvider>
            <Outlet />
            {!isInterviewPage && (
              <footer
                className="border-t py-4 text-center text-[11px]"
                style={{ borderColor: "#222", color: "#555" }}
              >
                <div className="flex items-center justify-center gap-4">
                  <Link to="/terms" style={{ color: "#555" }}>
                    利用規約
                  </Link>
                  <Link to="/privacy" style={{ color: "#555" }}>
                    プライバシーポリシー
                  </Link>
                  <Link to="/tokusho" style={{ color: "#555" }}>
                    特定商取引法に基づく表記
                  </Link>
                </div>
                <p className="mt-1">© 2026 合同会社AKITOグループ</p>
              </footer>
            )}
            <Toaster theme="dark" position="top-center" />
            <PersistentChatBubble />
            <ReferralFlushListener />
          </ModeProvider>
        </PlanProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
