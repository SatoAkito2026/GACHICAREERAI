import { Link, useRouterState } from "@tanstack/react-router";

const TABS = [
  { label: "個人", to: "/private/individual" },
  { label: "受験生", to: "/private/student" },
  { label: "マイページ", to: "/mypage" },
] as const;

export default function PrivateNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      className="flex h-[52px] items-center justify-between border-b px-6"
      style={{ background: "#0F0F0F", borderColor: "#333333" }}
    >
      <Link
        to="/private"
        className="text-[13px] leading-tight"
        style={{ fontWeight: 600, color: "#F0F0F0" }}
      >
        ガチキャリ
        <br />
        AI<span style={{ color: "#C8FF00" }}>｜Private</span>
      </Link>
      <div className="flex items-center gap-1.5">
        {TABS.map((tab) => {
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
