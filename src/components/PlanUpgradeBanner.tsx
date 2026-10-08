import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { usePlan } from "@/hooks/use-plan";
import { useMode } from "@/hooks/use-mode";

const DISMISSED_KEY = "plan_banner_dismissed_at";

export function PlanUpgradeBanner() {
  const { plan } = usePlan();
  const { isBusiness } = useMode();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (plan !== "free") return;

    const dismissedAt = localStorage.getItem(DISMISSED_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - Number(dismissedAt);
      if (elapsed < 24 * 60 * 60 * 1000) return;
    }

    setVisible(true);
  }, [plan]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed left-1/2 z-50 flex w-[calc(100%-24px)] max-w-lg -translate-x-1/2 items-center justify-between gap-3 rounded-xl px-4 py-3 shadow-lg sm:gap-4 sm:px-5"
      style={{
        bottom: "calc(var(--bottom-nav-h) + var(--float-gap))",
        background: "#1A1A1A",
        border: "1px solid #C8FF00",
      }}
    >
      <div className="flex items-center gap-3">
        <span style={{ color: "#C8FF00", fontSize: 20 }}>⚡</span>
        <div>
          <p className="text-[13px]" style={{ color: "#F0F0F0", fontWeight: 600 }}>
            {isBusiness
              ? "企業プランにアップグレードして面接URLを発行しよう"
              : "プランにアップグレードしてもっと使おう"}
          </p>
          <p className="text-[11px]" style={{ color: "#888888" }}>
            {isBusiness
              ? "従量課金¥440/回〜。面接URL発行・AI面接が使えます"
              : "ライトプラン¥2,200/月〜"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          to="/pricing"
          className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px]"
          style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 600 }}
        >
          プランを見る
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex h-6 w-6 items-center justify-center rounded-full"
          style={{ background: "#2A2A2A", color: "#888" }}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
