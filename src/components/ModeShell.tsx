import { AdminModeSwitch } from "@/components/AdminModeSwitch";
import type { ReactNode } from "react";
import { SafeNavigate } from "@/components/SafeNavigate";

import { useAuth } from "@/hooks/use-auth";
import { useMode } from "@/hooks/use-mode";
import { useOnboardingStatus } from "@/hooks/use-onboarding";
import PrivateNav from "@/components/PrivateNav";
import BusinessNav from "@/components/BusinessNav";
import { PlanUpgradeBanner } from "@/components/PlanUpgradeBanner";

function Loading() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center"
      style={{ background: "#0F0F0F" }}
    >
      <p className="text-sm" style={{ color: "#888888" }}>
        読み込み中...
      </p>
      {/* 8秒たっても終わらないときだけ出す（CSSだけで出すので、画面の処理が止まっていても表示される） */}
      <div className="loading-fallback flex flex-col items-center gap-3">
        <p className="text-[13px] leading-relaxed" style={{ color: "#AAAAAA" }}>
          読み込みに時間がかかっています。
          <br />
          電波の良い場所で、もう一度読み込んでください。
        </p>
        <div className="flex gap-2">
          <a
            href=""
            className="rounded-lg px-4 py-2 text-[13px]"
            style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
          >
            もう一度読み込む
          </a>
          <a
            href="/login"
            className="rounded-lg px-4 py-2 text-[13px]"
            style={{ border: "1px solid #333", color: "#CCCCCC" }}
          >
            ログイン画面へ
          </a>
        </div>
      </div>
    </div>
  );
}

export function PrivateShell({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const { isBusiness, mode, loading: modeLoading } = useMode();
  const { completed: onboardingCompleted, loading: onboardingLoading } = useOnboardingStatus();

  if (loading || modeLoading || onboardingLoading) return <Loading />;
  if (!session) return <SafeNavigate to="/login" />;
  if (isBusiness) return <SafeNavigate to="/business" />;
  // 初回プロフィール構築が未完了なら、ダッシュボードより先にオンボーディングへ誘導する
  // (welcome/onboarding画面自体はPrivateShellを使わないためループしない)。
  // 個人/受験生でオンボーディングURL自体が分かれているため、現在のmodeに応じて振り分ける。
  // mode未確定(null)の場合は個人向けをデフォルトにする。
  if (!onboardingCompleted) {
    return (
      <SafeNavigate
        to={
          mode === "private_student"
            ? "/private/student/onboarding"
            : "/private/individual/onboarding"
        }
      />
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "#0F0F0F", fontFamily: "'Inter', sans-serif" }}
    >
      <AdminModeSwitch />
      <PrivateNav />
      {children}
      <PlanUpgradeBanner />
    </div>
  );
}

export function BusinessShell({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const { isPrivate, loading: modeLoading } = useMode();

  if (loading || modeLoading) return <Loading />;
  if (!session) return <SafeNavigate to="/login" />;
  if (!modeLoading && isPrivate) return <SafeNavigate to="/private" />;

  return (
    <div
      className="min-h-screen"
      style={{ background: "#0F0F0F", fontFamily: "'Inter', sans-serif" }}
    >
      <AdminModeSwitch />
      <BusinessNav />
      {children}
      <PlanUpgradeBanner />
    </div>
  );
}
