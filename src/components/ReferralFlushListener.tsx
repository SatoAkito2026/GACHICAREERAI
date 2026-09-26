import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

const REFERRAL_STORAGE_KEY = "pending_referral_code";

/**
 * どのページに着地しても、セッションが確立した時点で保留中の紹介コード
 * (localStorageに保存済み)があれば記録する。メール確認リンクを踏んだ後の
 * 着地先が/loginとは限らないため、アプリ全体(__root.tsx)にマウントする。
 */
export function ReferralFlushListener() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.access_token) return;
    let pending: string | null = null;
    try {
      pending = localStorage.getItem(REFERRAL_STORAGE_KEY);
    } catch {
      pending = null;
    }
    if (!pending) return;

    fetch("/api/record-referral", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ referralCode: pending }),
    })
      .then((res) => {
        if (res.ok) {
          try {
            localStorage.removeItem(REFERRAL_STORAGE_KEY);
          } catch {
            // ignore
          }
        }
      })
      .catch((e) => console.error("[referral] record failed", e));
  }, [session?.access_token]);

  return null;
}
