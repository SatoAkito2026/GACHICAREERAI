import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getOrCreateDeviceId, getDeviceLabel } from "@/lib/device-id";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// この端末がまだ有効か、定期的に確認する間隔(ミリ秒)
const DEVICE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5分

/** ログイン成功時にこの端末を登録する(上限超過なら最古端末が追い出される) */
export async function registerDevice(accessToken: string) {
  try {
    await fetch("/api/register-device", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        deviceId: getOrCreateDeviceId(),
        deviceLabel: getDeviceLabel(),
      }),
    });
  } catch (e) {
    // 端末登録の失敗でログイン自体は止めない(ネットワーク不調時など)
    console.error("[device] register failed", e);
  }
}

/** この端末が今も有効か確認する。無効なら true (=サインアウトすべき) を返す */
async function checkDeviceEvicted(accessToken: string): Promise<boolean> {
  try {
    // "_t"はキャッシュ回避専用のダミーパラメータ(値自体に意味はない)。
    // deviceIdだけだとURLが毎回同じになり、CDN/ブラウザにキャッシュされて
    // 古い判定結果が使い回される事例が実際にあったため付与している。
    const res = await fetch(
      `/api/register-device?deviceId=${encodeURIComponent(getOrCreateDeviceId())}&_t=${Date.now()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    );
    if (!res.ok) return false; // 通信エラー等では強制ログアウトしない(安全側)
    const data = (await res.json()) as { active?: boolean };
    return data.active === false;
  } catch (e) {
    console.error("[device] status check failed", e);
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
      // 端末登録(registerDevice)はここでは呼ばない。
      // onAuthStateChangeのイベント種別(SIGNED_IN等)は、Supabaseの挙動によって
      // ページリロード時にも発火することがあり信頼できないため
      // (実際にリロードのたびに他端末を誤って追い出すバグが発生した)。
      // 登録は login.tsx のログイン/サインアップ成功ハンドラから
      // 明示的に呼び出す方式に統一している。
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      // 既存セッションでの起動(=ページリロード)は「登録」ではなく
      // 「まだ有効か確認するだけ」にする。ここでregisterDevice(POST)を呼ぶと、
      // 単なるリロードが新しいログインとして扱われ、他の正規端末を
      // 誤って追い出してしまうため(実際に起きたバグ)。
      if (data.session?.access_token) {
        void checkDeviceEvicted(data.session.access_token).then((evicted) => {
          if (evicted) {
            toast.error("他の端末でログインされたため、ログアウトしました");
            void supabase.auth.signOut().then(() => {
              window.location.href = "/login";
            });
          }
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 定期的に「この端末はまだ有効か」を確認し、他端末に追い出されていたら
  // 自動でサインアウトする(プラン上限超過時の最古端末追い出し用)
  useEffect(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    if (!session?.access_token) return;

    checkIntervalRef.current = setInterval(async () => {
      const evicted = await checkDeviceEvicted(session.access_token);
      if (evicted) {
        toast.error("他の端末でログインされたため、ログアウトしました");
        await supabase.auth.signOut();
        window.location.href = "/login";
      }
    }, DEVICE_CHECK_INTERVAL_MS);

    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [session?.access_token]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
