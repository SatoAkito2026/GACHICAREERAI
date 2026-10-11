import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMode } from "@/hooks/use-mode";

/**
 * onboarding_answers.completed_at の有無で、
 * オンボーディング(初回プロフィール構築)が完了しているかを判定する。
 *
 * user_career_profiles / onboarding_answers は (user_id, mode) の
 * 複合キーで個人/受験生それぞれ独立した行を持つため、
 * 「今どちらのモードか」に応じて別の行を見る必要がある。
 * mode が未確定(null)の場合は individual をデフォルトとして扱う
 * (ModeShellのリダイレクト先デフォルトと合わせている)。
 */
// 完了済みと分かったユーザーは覚えておき、ページを移るたびに問い合わせて「読み込み中」を出さないようにする
// （完了済みから未完了に戻ることはない）
const completedCache = new Set<string>();

export function useOnboardingStatus() {
  const { user, loading: authLoading } = useAuth();
  const { mode, loading: modeLoading } = useMode();
  const dbMode = mode === "private_student" ? "student" : "individual";
  const cacheKey = user ? `${user.id}:${dbMode}` : "";
  const cached = !!cacheKey && completedCache.has(cacheKey);
  const [completed, setCompleted] = useState(cached);
  const [loading, setLoading] = useState(!cached);

  const refresh = useCallback(async () => {
    // 認証状態・モード判定がまだ確定していない間は判定しない(loadingのままにする)。
    // ここで確定前に「未ログイン」扱いしてしまうと、リロード直後の一瞬だけ
    // completed=false と誤判定され、オンボーディング完了済みのユーザーが
    // 一瞬だけ onboarding にリダイレクトされるバグになる。
    if (authLoading || modeLoading) return;

    if (!user) {
      setCompleted(false);
      setLoading(false);
      return;
    }
    if (completedCache.has(`${user.id}:${dbMode}`)) {
      setCompleted(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from("onboarding_answers")
        .select("completed_at")
        .eq("user_id", user.id)
        .eq("mode", dbMode)
        .maybeSingle() as any);
      if (error) {
        console.error(error);
        setCompleted(false);
      } else {
        setCompleted(!!data?.completed_at);
        if (data?.completed_at) completedCache.add(`${user.id}:${dbMode}`);
      }
    } catch (e) {
      console.error(e);
      setCompleted(false);
    } finally {
      setLoading(false);
    }
  }, [user, authLoading, dbMode, modeLoading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { completed, loading, refresh };
}
