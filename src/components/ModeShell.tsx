import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useMode } from "@/hooks/use-mode";
import { useOnboardingStatus } from "@/hooks/use-onboarding";
import PrivateNav from "@/components/PrivateNav";
import BusinessNav from "@/components/BusinessNav";
import { PlanUpgradeBanner } from "@/components/PlanUpgradeBanner";

function Loading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: "#0F0F0F" }}
    >
      <p className="text-sm" style={{ color: "#888888" }}>
        読み込み中...
      </p>
    </div>
  );
}

export function PrivateShell({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const { isBusiness, mode, loading: modeLoading } = useMode();
  const { completed: onboardingCompleted, loading: onboardingLoading } = useOnboardingStatus();

  if (loading || modeLoading || onboardingLoading) return <Loading />;
  if (!session) return <Navigate to="/login" />;
  if (isBusiness) return <Navigate to="/business" />;
  // 初回プロフィール構築が未完了なら、ダッシュボードより先にオンボーディングへ誘導する
  // (welcome/onboarding画面自体はPrivateShellを使わないためループしない)。
  // 個人/受験生でオンボーディングURL自体が分かれているため、現在のmodeに応じて振り分ける。
  // mode未確定(null)の場合は個人向けをデフォルトにする。
  if (!onboardingCompleted) {
    return (
      <Navigate
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
  if (!session) return <Navigate to="/login" />;
  if (!modeLoading && isPrivate) return <Navigate to="/private" />;

  return (
    <div
      className="min-h-screen"
      style={{ background: "#0F0F0F", fontFamily: "'Inter', sans-serif" }}
    >
      <BusinessNav />
      {children}
      <PlanUpgradeBanner />
    </div>
  );
}
