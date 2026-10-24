import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type UserMode =
  | "private_individual"
  | "private_student"
  | "business_company"
  | "business_school"
  | "business_actor";

export type AccountType = "private" | "business";

interface Company {
  id: string;
  name: string;
  plan: string;
  settings: Record<string, unknown>;
  avatar_config: Record<string, unknown>;
}

interface ModeContextValue {
  mode: UserMode | null;
  accountType: AccountType | null;
  company: Company | null;
  isPrivate: boolean;
  isBusiness: boolean;
  /** 運営の管理者（profiles.is_admin）。管理ダッシュボードと個人・企業の画面を切り替えられる */
  isAdmin: boolean;
  /** 会社を登録済みか（企業モードに切り替えられるか） */
  hasCompany: boolean;
  loading: boolean;
  setMode: (mode: UserMode, userId?: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const ModeContext = createContext<ModeContextValue | undefined>(undefined);

export function ModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [mode, setModeState] = useState<UserMode | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasCompany, setHasCompany] = useState(false);
  // 読み込みの順番。ログイン直後にモードを切り替えたとき、先に始まった古い読み込みの結果で上書きしない
  const seqRef = useRef(0);
  // モードの書き込み中。読み込みはこれを待ってから始める（書く前の古いモードを読まないように）
  const pendingRef = useRef<Promise<unknown> | null>(null);

  const load = useCallback(async (userId: string | null) => {
    if (pendingRef.current) await pendingRef.current.catch(() => undefined);
    const seq = ++seqRef.current;
    if (!userId) {
      setModeState(null);
      setCompany(null);
      setIsAdmin(false);
      setHasCompany(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: profile } = await (supabase
        .from("profiles")
        .select("user_mode, company_id, is_admin")
        .eq("id", userId)
        .maybeSingle() as any);

      if (seq !== seqRef.current) return;
      const userMode = (profile?.user_mode ?? "private_individual") as UserMode;
      setModeState(userMode);
      setIsAdmin(!!profile?.is_admin);
      setHasCompany(!!profile?.company_id);

      if (
        (userMode === "business_company" || userMode === "business_school") &&
        profile?.company_id
      ) {
        const { data: companyData } = await supabase
          .from("companies")
          .select("id, name, plan, settings, avatar_config")
          .eq("id", profile.company_id)
          .maybeSingle();
        if (seq !== seqRef.current) return;
        setCompany((companyData as unknown as Company) ?? null);
      } else {
        setCompany(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => load(user?.id ?? null), [load, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * モードを切り替える。ログイン直後（まだ画面側にユーザーが届いていないとき）でも使えるように、
   * userId を渡せる。DBに書き終わってから読み直すので、選んだモードで画面が開く。
   */
  const setMode = useCallback(
    async (newMode: UserMode, userId?: string) => {
      const id = userId ?? user?.id;
      if (!id) return;
      seqRef.current += 1;
      setModeState(newMode);
      const write = Promise.resolve(
        supabase
          .from("profiles")
          .update({ user_mode: newMode } as any)
          .eq("id", id) as any,
      );
      pendingRef.current = write;
      try {
        await write;
      } finally {
        if (pendingRef.current === write) pendingRef.current = null;
      }
      await load(id);
    },
    [user, load],
  );

  const accountType: AccountType | null =
    mode === "business_company" || mode === "business_school" || mode === "business_actor"
      ? "business"
      : mode === "private_individual" || mode === "private_student"
        ? "private"
        : null;

  const isPrivate = accountType === "private";
  const isBusiness = accountType === "business";

  return (
    <ModeContext.Provider
      value={{
        mode,
        accountType,
        company,
        isPrivate,
        isBusiness,
        isAdmin,
        hasCompany,
        loading,
        setMode,
        refresh,
      }}
    >
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error("useMode must be used within a ModeProvider");
  return ctx;
}
