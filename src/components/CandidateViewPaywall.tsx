import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

/**
 * 候補者データベース(模擬面接の総評閲覧)のゲート。
 * 既存の企業プラン(plan列)とは独立したアドオン扱い(candidate_view_addon_active列)で判定する。
 */
export function useCandidateViewPaywall() {
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
        .select("candidate_view_addon_active, candidate_view_addon_expires_at")
        .eq("id", user.id)
        .maybeSingle();
      const active =
        !!(data as any)?.candidate_view_addon_active &&
        (!(data as any)?.candidate_view_addon_expires_at ||
          new Date((data as any).candidate_view_addon_expires_at).getTime() > Date.now());
      setIsPaid(active);
      setLoading(false);
    })();
  }, [user, authLoading]);

  return { isPaid, loading: loading || authLoading };
}

export function CandidateViewPaywallScreen() {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <p style={{ color: "#F0F0F0", fontSize: 18, fontWeight: 700 }}>
        ガチキャリダッシュボードへの加入が必要です
      </p>
      <p className="mt-3" style={{ color: "#888888", fontSize: 13, lineHeight: 1.7 }}>
        模擬面接を受けた登録者全員の総評（スコア・強み・懸念点・詳細な評価内訳）を、月額¥30,000で無制限に閲覧できます。
        検索・絞り込み（スコア・都道府県・年齢・キーワード）や、気になる候補者の保存機能も利用できます。
        <br />
        ※このプランでは氏名・顔写真・詳細住所・電話番号・メールアドレスなどの個人情報は表示されません。気になる候補者がいれば、録画を個別に購入することで、実際の面接映像をご覧いただけます（別途課金）。
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
