import { Link, useRouterState } from "@tanstack/react-router";

const MODE_TABS = [
  { label: "🏢 企業", to: "/business/company" },
  // 学校・塾／芸能・キャスティングは今は入口を隠している（機能は残っている）
] as const;

const COMPANY_SUBTABS = [
  { label: "人材を探す", to: "/business/company/talent" },
  { label: "面談・メッセージ", to: "/business/company/messages" },
  { label: "書類選考", to: "/business/company/screening" },
  { label: "書類選考履歴", to: "/business/company/screening/history" },
  { label: "面接履歴", to: "/business/company/history" },
  { label: "求人掲載", to: "/business/company/jobs" },
  { label: "設定", to: "/business/company/settings" },
] as const;

const SCHOOL_SUBTABS = [
  { label: "書類選考", to: "/business/school/screening" },
  { label: "書類選考履歴", to: "/business/school/screening/history" },
  { label: "面接履歴", to: "/business/school/history" },
  { label: "生徒管理", to: "/business/school/students" },
  { label: "設定", to: "/business/school/settings" },
] as const;

const ACTOR_SUBTABS = [
  { label: "ダッシュボード", to: "/business/actor" },
  { label: "役者データベース", to: "/business/actor/database" },
  { label: "書類選考", to: "/business/actor/screening" },
  { label: "書類選考履歴", to: "/business/actor/screening/history" },
  { label: "面接履歴", to: "/business/actor/history" },
] as const;

export default function BusinessNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isSchool = pathname.startsWith("/business/school");
  const isActor = pathname.startsWith("/business/actor");
  const subTabs = isActor ? ACTOR_SUBTABS : isSchool ? SCHOOL_SUBTABS : COMPANY_SUBTABS;

  return (
    <nav className="border-b" style={{ background: "#0F0F0F", borderColor: "#333333" }}>
      <div className="flex h-[52px] items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <Link
            to="/business"
            className="text-[15px]"
            style={{ fontWeight: 600, color: "#F0F0F0" }}
          >
            インタビアAI<span style={{ color: "#C8FF00" }}>｜Business</span>
          </Link>
          <div className="flex items-center gap-1.5">
            {MODE_TABS.map((tab) => {
              const active = pathname.startsWith(tab.to);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className="rounded-lg px-3 py-1.5 text-[12px] transition-colors"
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
        </div>
        <Link to="/mypage" className="text-[12px]" style={{ color: "#888888", fontWeight: 500 }}>
          マイページ
        </Link>
      </div>
      <div
        className="flex h-[44px] items-center gap-1.5 px-6"
        style={{ borderTop: "1px solid #1F1F1F" }}
      >
        {subTabs.map((tab) => {
          const active = pathname === tab.to || pathname.startsWith(tab.to + "/");
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className="rounded-lg px-3 py-1.5 text-[12px] transition-colors"
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
    </nav>
  );
}
