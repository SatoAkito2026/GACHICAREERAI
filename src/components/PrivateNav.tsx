import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, FileText, Globe, Home, Mail, Mic, User } from "lucide-react";

const TABS = [
  { label: "個人", to: "/private/individual" },
  { label: "受験生", to: "/private/student" },
  { label: "オファー", to: "/private/individual/offers" },
  { label: "マイページ", to: "/mypage" },
] as const;

// スマホでは画面の下にアプリのようなメニューを出す
const INDIVIDUAL_BOTTOM = [
  { label: "ホーム", to: "/private/individual", icon: Home, exact: true },
  { label: "練習", to: "/private/individual/practice", icon: Mic },
  { label: "評価", to: "/private/individual/history", icon: BarChart3 },
  { label: "公開", to: "/private/individual/talent", icon: Globe },
  { label: "オファー", to: "/private/individual/offers", icon: Mail },
] as const;

const STUDENT_BOTTOM = [
  { label: "ホーム", to: "/private/student", icon: Home, exact: true },
  { label: "練習", to: "/private/student/practice", icon: Mic },
  { label: "履歴", to: "/private/student/history", icon: BarChart3 },
  { label: "書類", to: "/private/student/documents", icon: FileText },
  { label: "マイページ", to: "/mypage", icon: User },
] as const;

function isActive(pathname: string, to: string, exact = false) {
  if (exact) return pathname === to || pathname === to + "/";
  return pathname === to || pathname.startsWith(to + "/");
}

export default function PrivateNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isStudent = pathname.startsWith("/private/student");
  const bottomItems = isStudent ? STUDENT_BOTTOM : INDIVIDUAL_BOTTOM;
  // 「オファー」は個人の中のページなので、そこにいるときは「個人」ではなく「オファー」を光らせる
  const activeTab = [...TABS].reverse().find((t) => isActive(pathname, t.to))?.to ?? null;

  return (
    <>
      <nav
        className="flex h-[52px] items-center justify-between gap-3 border-b px-4 md:px-6"
        style={{ background: "#0F0F0F", borderColor: "#333333" }}
      >
        <Link
          to="/private"
          className="shrink-0 whitespace-nowrap text-[13px] leading-tight"
          style={{ fontWeight: 600, color: "#F0F0F0" }}
        >
          ガチキャリAI<span style={{ color: "#C8FF00" }}>｜Private</span>
        </Link>

        {/* タブレット・パソコン：上にタブ */}
        <div className="hidden items-center gap-1.5 md:flex">
          {TABS.map((tab) => {
            const active = activeTab === tab.to;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] transition-colors"
                style={
                  active
                    ? { background: "#C8FF00", color: "#0F0F0F", fontWeight: 600 }
                    : { color: "#888888", fontWeight: 500 }
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* スマホ：上は切り替えとマイページだけ */}
        <div className="flex items-center gap-1 md:hidden">
          <Link
            to={isStudent ? "/private/individual" : "/private/student"}
            className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px]"
            style={{ color: "#888888", border: "1px solid #333333" }}
          >
            {isStudent ? "個人へ" : "受験生へ"}
          </Link>
          {!isStudent && (
            <Link
              to="/mypage"
              className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px]"
              style={{ color: "#888888" }}
            >
              マイページ
            </Link>
          )}
        </div>
      </nav>

      <nav
        className="bottom-nav fixed inset-x-0 bottom-0 z-40 grid border-t md:hidden"
        style={{
          gridTemplateColumns: `repeat(${bottomItems.length}, 1fr)`,
          background: "#0F0F0F",
          borderColor: "#2A2A2A",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        aria-label="メニュー"
      >
        {bottomItems.map(({ label, to, icon: Icon, ...rest }) => {
          const active = isActive(pathname, to, "exact" in rest && rest.exact);
          return (
            <Link
              key={to}
              to={to}
              className="flex h-[60px] flex-col items-center justify-center gap-1"
              style={{ color: active ? "#C8FF00" : "#8A8A8A" }}
            >
              <Icon size={21} strokeWidth={active ? 2.4 : 1.8} />
              <span className="text-[10.5px]" style={{ fontWeight: active ? 700 : 500 }}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
