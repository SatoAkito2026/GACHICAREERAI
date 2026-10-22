/**
 * 運営の管理者だけに出す切り替え：管理ダッシュボード／個人モード／企業モード
 * （ログインすると管理ダッシュボードに入るので、ここから個人・企業の画面を確かめる）
 */
import { useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useMode } from "@/hooks/use-mode";

export function AdminModeSwitch() {
  const { isAdmin, isBusiness, hasCompany, mode, setMode } = useMode();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [busy, setBusy] = useState(false);
  if (!isAdmin) return null;

  const current = pathname.startsWith("/private/admin")
    ? "admin"
    : pathname.startsWith("/business")
      ? "business"
      : "private";

  const go = async (to: "admin" | "private" | "business") => {
    if (busy || to === current) return;
    if (to === "admin") return void navigate({ to: "/private/admin" });
    if (to === "business" && !hasCompany) {
      // 会社がまだ登録されていなければ、会社の登録から
      window.location.href = "/login?mode=business";
      return;
    }
    setBusy(true);
    try {
      if (to === "business") {
        await setMode(isBusiness && mode ? mode : "business_company");
        navigate({ to: "/business" });
      } else {
        await setMode(!isBusiness && mode ? mode : "private_individual");
        navigate({ to: "/private" });
      }
    } finally {
      setBusy(false);
    }
  };

  const items = [
    { key: "admin", label: "管理ダッシュボード" },
    { key: "private", label: "個人モード" },
    { key: "business", label: "企業モード" },
  ] as const;

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto px-4 py-1.5 text-[11px]"
      style={{ background: "#1A1A00", borderBottom: "1px solid #3A3A12", color: "#BBBB88" }}
    >
      <span className="shrink-0">管理者：</span>
      {items.map((it) => {
        const active = current === it.key;
        return (
          <button
            key={it.key}
            type="button"
            disabled={busy}
            onClick={() => void go(it.key)}
            className="shrink-0 rounded-md px-2.5 py-1 disabled:opacity-50"
            style={
              active
                ? { background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }
                : { border: "1px solid #3A3A12", color: "#E6E6B0" }
            }
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
