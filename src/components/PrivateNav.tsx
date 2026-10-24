import { NotificationBell } from "@/components/NotificationBell";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  CircleUserRound,
  FileText,
  Globe,
  Home,
  Mail,
  MessageCircle,
  Mic,
  User,
} from "lucide-react";
import { OPEN_AI_CHAT_EVENT } from "@/components/PersistentChatBubble";

// パソコンの上のメニュー：スマホの下のメニューと同じ並び（公開プロフィールにすぐ行けるように）
const INDIVIDUAL_TABS = [
  { label: "ホーム", to: "/private/individual", exact: true },
  { label: "練習", to: "/private/individual/practice" },
  { label: "評価", to: "/private/individual/history" },
  { label: "公開プロフィール", to: "/private/individual/talent" },
  { label: "オファー", to: "/private/individual/offers" },
  { label: "マイページ", to: "/mypage" },
] as const;

const STUDENT_TABS = [
  { label: "ホーム", to: "/private/student", exact: true },
  { label: "練習", to: "/private/student/practice" },
  { label: "履歴", to: "/private/student/history" },
  { label: "書類", to: "/private/student/documents" },
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
  const tabs = isStudent ? STUDENT_TABS : INDIVIDUAL_TABS;
  // いちばん深く一致するものを光らせる（「ホーム」は完全一致だけ）
  const activeTab =
    [...tabs].reverse().find((t) => isActive(pathname, t.to, "exact" in t && t.exact))?.to ?? null;

  return (
    <>
      <nav
        className="flex h-[52px] items-center justify-between gap-3 border-b px-4 lg:px-6"
        style={{ background: "#0F0F0F", borderColor: "#333333" }}
      >
        <Link
          to="/private"
          className="shrink-0 whitespace-nowrap text-[13px] leading-tight"
          style={{ fontWeight: 600, color: "#F0F0F0" }}
        >
          ガチキャリAI<span style={{ color: "#C8FF00" }}>｜Private</span>
        </Link>

        {/* パソコン：上にタブ */}
        <div className="hidden items-center gap-1.5 lg:flex">
          <NotificationBell />
          {tabs.map((tab) => {
            const active = activeTab === tab.to;
            const highlight = tab.to === "/private/individual/talent" && !active;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] transition-colors"
                style={
                  active
                    ? { background: "#C8FF00", color: "#0F0F0F", fontWeight: 600 }
                    : highlight
                      ? { color: "#C8FF00", fontWeight: 600, border: "1px solid #3A4A12" }
                      : { color: "#AAAAAA", fontWeight: 500 }
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* スマホ・タブレット：上はAIチャットとマイページのアイコンだけ（ほかは下のメニュー） */}
        <div className="flex items-center gap-1 lg:hidden">
          <NotificationBell />
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_AI_CHAT_EVENT))}
            className="flex h-10 w-10 items-center justify-center rounded-full active:bg-[#222]"
            aria-label="AIチャットを開く"
          >
            <MessageCircle size={21} color="#CCCCCC" />
          </button>
          <Link
            to="/mypage"
            className="flex h-10 w-10 items-center justify-center rounded-full active:bg-[#222]"
            aria-label="マイページ"
          >
            <CircleUserRound size={22} color="#CCCCCC" />
          </Link>
        </div>
      </nav>

      <nav
        className="bottom-nav fixed inset-x-0 bottom-0 z-40 grid border-t lg:hidden"
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
