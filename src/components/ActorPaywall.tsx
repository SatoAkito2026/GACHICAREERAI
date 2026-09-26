import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { PLAN_PRICES } from "@/hooks/use-plan";

/**
 * 役者データベース系のページ全てに使う、キャスティングプラン加入必須のゲート。
 * これは既存の企業プラン(plan列)とは独立したアドオン扱い(actor_addon_active列)で判定する。
 * 従量課金/ライト/プロのいずれと組み合わせても、単独でも加入できる。
 */
export function useActorPaywall() {
  const { user, loading: authLoading } = useAuth();
  const [isPaid, setIsPaid] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsPaid(false);
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("actor_addon_active, actor_addon_expires_at")
        .eq("id", user.id)
        .maybeSingle();
      const active =
        !!(data as any)?.actor_addon_active &&
        (!(data as any)?.actor_addon_expires_at ||
          new Date((data as any).actor_addon_expires_at).getTime() > Date.now());
      setIsPaid(active);
      setLoading(false);
    })();
  }, [user, authLoading]);

  return { isPaid, loading: loading || authLoading };
}

export function ActorPaywallScreen() {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <p style={{ color: "#F0F0F0", fontSize: 18, fontWeight: 700 }}>
        キャスティングプランへの加入が必要です
      </p>
      <p className="mt-3" style={{ color: "#888888", fontSize: 13, lineHeight: 1.7 }}>
        役者データベース・書類選考・経歴確認面接など、すべての機能は月額{PLAN_PRICES.actor_pro}
        のプランでご利用いただけます。
        既にご契約中のプラン（従量課金・ライト・プロ）に追加でご加入いただけます。
      </p>
      <Link
        to="/mypage"
        className="mt-6 inline-block rounded-full px-6 py-3 text-[13px]"
        style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
      >
        マイページから加入する
      </Link>
    </div>
  );
}
