import { getAuthHeaders } from "@/lib/chat-api";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePlan, PLAN_LABELS } from "@/hooks/use-plan";
import { useMode } from "@/hooks/use-mode";
import { supabase } from "@/integrations/supabase/client";
import { CheckoutModal } from "@/components/CheckoutModal";

export const Route = createFileRoute("/mypage")({
  head: () => ({
    meta: [
      { title: "マイページ — ガチキャリAI" },
      { name: "description", content: "アカウント・プランと利用状況の確認" },
    ],
  }),
  component: MyPage,
});

function formatLimit(value: number) {
  return Number.isFinite(value) ? `${value}回` : "無制限";
}

const CARD_STYLE = { border: "1px solid #2A2A2A", background: "#1A1A1A" } as const;
const ROW_BORDER = "1px solid #2A2A2A";

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl" style={CARD_STYLE}>
      <div
        className="px-5 py-4 text-[13px] tracking-wide"
        style={{ color: "#C8FF00", fontWeight: 700, borderBottom: ROW_BORDER }}
      >
        {title}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  onClick,
  href,
  arrow,
  danger,
  loading,
}: {
  label: string;
  value?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  arrow?: boolean;
  danger?: boolean;
  loading?: boolean;
}) {
  const inner = (
    <div
      className="flex items-center justify-between px-5 py-4 text-[14px]"
      style={{ borderBottom: ROW_BORDER }}
    >
      <span style={{ color: danger ? "#FF5A5A" : "#F0F0F0", fontWeight: 500 }}>{label}</span>
      <span className="flex items-center gap-2 text-[13px]" style={{ color: "#888888" }}>
        {loading && <Loader2 size={14} className="animate-spin" />}
        {value}
        {arrow && <ChevronRight size={16} style={{ color: "#666666" }} />}
      </span>
    </div>
  );

  if (href) {
    const external = href.startsWith("mailto:");
    if (external) {
      return (
        <a href={href} className="block transition-colors hover:bg-[#222222]">
          {inner}
        </a>
      );
    }
    return (
      <Link to={href as "/terms"} className="block transition-colors hover:bg-[#222222]">
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left transition-colors hover:bg-[#222222]"
      >
        {inner}
      </button>
    );
  }
  return inner;
}

function MyPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { plan, planExpiresAt, isPlanActive, interviewCount, limits, loading } = usePlan();
  const { isBusiness } = useMode();
  const navigate = useNavigate();
  const [pwSending, setPwSending] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actorAddonActive, setActorAddonActive] = useState(false);
  const [actorAddonExpiresAt, setActorAddonExpiresAt] = useState<Date | null>(null);
  const [actorCheckoutOpen, setActorCheckoutOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("actor_addon_active, actor_addon_expires_at")
        .eq("id", user.id)
        .maybeSingle();
      setActorAddonActive(!!(data as any)?.actor_addon_active);
      setActorAddonExpiresAt(
        (data as any)?.actor_addon_expires_at
          ? new Date((data as any).actor_addon_expires_at)
          : null,
      );
    })();
  }, [user]);

  if (!authLoading && !user) {
    return <Navigate to="/login" />;
  }

  const planLabel =
    (isBusiness
      ? (
          {
            company_metered: "従量課金プラン（¥2,200/回・税込）",
            company_light: "ライトプラン（企業）",
            company_pro: "プロプラン（企業）",
            free: "未加入",
          } as Record<string, string>
        )[plan]
      : (
          {
            individual_light: "ライトプラン",
            individual_pro: "プロプラン",
            free: "無料プラン",
          } as Record<string, string>
        )[plan]) ?? PLAN_LABELS[plan];

  const interviewLimit =
    (isBusiness
      ? (
          {
            free: 0,
            company_metered: Infinity,
            company_light: 20,
            company_pro: 50,
          } as Record<string, number>
        )[plan]
      : (
          {
            free: 2,
            individual_light: 15,
            individual_pro: 25,
          } as Record<string, number>
        )[plan]) ?? limits.interviews;

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setPwSending(true);
    setPwMsg("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/login`,
      });
      setPwMsg(error ? "送信に失敗しました。" : "リセットメールを送信しました。");
    } finally {
      setPwSending(false);
    }
  };

  const handleOpenPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/customer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPortalLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
      });
      if (res.ok) {
        await signOut();
        window.location.href = "/login";
      } else {
        const data = await res.json().catch(() => ({}));
        console.error("Delete failed:", data);
        alert("削除に失敗しました。サポートにお問い合わせください。");
        setDeleting(false);
        setConfirmDelete(false);
      }
    } catch (e) {
      console.error(e);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: "#0F0F0F", fontFamily: "'Inter', sans-serif" }}
    >
      <nav
        className="fixed inset-x-0 top-0 z-30 flex h-[52px] items-center justify-between border-b bg-[#0F0F0F] px-6"
        style={{ borderColor: "#2A2A2A" }}
      >
        <div className="text-[15px]" style={{ fontWeight: 500, color: "#F0F0F0" }}>
          ガチキャリAI
        </div>
        <Link
          to={isBusiness ? "/business" : "/private"}
          className="flex items-center gap-1 text-[12px] transition-colors hover:text-[#F0F0F0]"
          style={{ color: "#888888", fontWeight: 500 }}
        >
          <ArrowLeft size={14} />
          ホームに戻る
        </Link>
      </nav>

      <main className="mx-auto max-w-xl px-5 pb-24 pt-[84px]">
        <h1 className="text-[24px]" style={{ fontWeight: 600, color: "#F0F0F0" }}>
          {isBusiness ? "マイページ｜Business" : "マイページ｜Private"}
        </h1>

        {loading ? (
          <div className="mt-10 flex items-center gap-2 text-[14px]" style={{ color: "#888888" }}>
            <Loader2 size={16} className="animate-spin" />
            読み込み中...
          </div>
        ) : (
          <>
            <SectionCard title="アカウント">
              <Row label="メールアドレス" value={user?.email ?? "—"} />
              <Row
                label="パスワード変更"
                value={pwMsg || undefined}
                onClick={handlePasswordReset}
                loading={pwSending}
                arrow
              />
            </SectionCard>

            <SectionCard title="プラン・お支払い">
              <Row label="現在のプラン" value={planLabel} />
              {planExpiresAt && plan !== "free" && isPlanActive && (
                <Row
                  label="次回お支払い日"
                  value={planExpiresAt.toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                />
              )}
              {planExpiresAt && !isPlanActive && (
                <div className="px-5 py-3 text-[13px]" style={{ color: "#FF5A5A" }}>
                  ⚠ プランの有効期限が切れています。プランを更新してください。
                </div>
              )}
              <Row
                label="今期のURL発行回数"
                value={
                  plan === "company_metered"
                    ? `${interviewCount}回（¥2,200/回・税込・従量課金）`
                    : `${interviewCount}回 / ${formatLimit(interviewLimit)}`
                }
              />
              {/* 請求予定額（企業プランのみ） */}
              {(plan === "company_metered" ||
                plan === "company_light" ||
                plan === "company_pro") && (
                <Row
                  label="今月の請求予定額（超過分）"
                  value={(() => {
                    if (plan === "company_metered") {
                      return `¥${(interviewCount * 2200).toLocaleString()}（税込）`;
                    }
                    const limit = interviewLimit;
                    const overage = Math.max(0, interviewCount - limit);
                    if (overage === 0) return "¥0（上限内）";
                    return `¥${(overage * 330).toLocaleString()}（${overage}回超過 × ¥330・税込）`;
                  })()}
                />
              )}
              <Row label="プランを変更する" onClick={() => navigate({ to: "/pricing" })} arrow />
              {/* 芸能・キャスティング向けは今は受け付けていないので、加入済みの人にだけ表示する */}
              {actorAddonActive && (
                <Row
                  label="キャスティングプラン：加入中"
                  value={
                    actorAddonExpiresAt
                      ? `次回更新：${actorAddonExpiresAt.toLocaleDateString("ja-JP")}`
                      : undefined
                  }
                />
              )}
              {actorCheckoutOpen && (
                <CheckoutModal
                  plan="actor_pro"
                  onClose={() => {
                    setActorCheckoutOpen(false);
                    if (user) {
                      (async () => {
                        const { data } = await supabase
                          .from("profiles")
                          .select("actor_addon_active, actor_addon_expires_at")
                          .eq("id", user.id)
                          .maybeSingle();
                        setActorAddonActive(!!(data as any)?.actor_addon_active);
                        setActorAddonExpiresAt(
                          (data as any)?.actor_addon_expires_at
                            ? new Date((data as any).actor_addon_expires_at)
                            : null,
                        );
                      })();
                    }
                  }}
                />
              )}
              {plan !== "free" && (
                <Row
                  label="お支払い方法を変更する"
                  onClick={handleOpenPortal}
                  loading={portalLoading}
                  arrow
                />
              )}
              {plan !== "free" && (
                <Row
                  label="プランを解約する"
                  onClick={handleOpenPortal}
                  loading={portalLoading}
                  danger
                  arrow
                />
              )}
            </SectionCard>

            <SectionCard title="サポート">
              <Row label="利用規約" href="/terms" arrow />
              <Row label="プライバシーポリシー" href="/privacy" arrow />
              <Row label="特定商取引法に基づく表記" href="/tokusho" arrow />
              <Row label="お問い合わせ" href="mailto:info@akitogroup.jp" arrow />
            </SectionCard>

            <SectionCard title="アカウント操作">
              <Row label="ログアウト" onClick={handleLogout} danger />
              {confirmDelete ? (
                <div className="px-5 py-4" style={{ borderBottom: ROW_BORDER }}>
                  <p className="text-[14px]" style={{ color: "#FF5A5A", fontWeight: 600 }}>
                    本当にアカウントを削除しますか？
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: "#888" }}>
                    この操作は取り消せません。すべてのデータが削除されます。
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={handleDeleteAccount}
                      className="flex items-center gap-1 rounded-md px-4 py-2 text-[13px]"
                      style={{ background: "#FF4444", color: "#fff", fontWeight: 600 }}
                    >
                      {deleting && <Loader2 size={13} className="animate-spin" />}
                      削除する
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-md px-4 py-2 text-[13px]"
                      style={{ border: "1px solid #333", color: "#888" }}
                    >
                      やめる
                    </button>
                  </div>
                </div>
              ) : (
                <Row
                  label="アカウントを削除する"
                  onClick={() => setConfirmDelete(true)}
                  danger
                  arrow
                />
              )}
            </SectionCard>
          </>
        )}
      </main>
    </div>
  );
}
