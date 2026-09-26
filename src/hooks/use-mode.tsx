import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
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
  loading: boolean;
  setMode: (mode: UserMode) => Promise<void>;
  refresh: () => Promise<void>;
}

const ModeContext = createContext<ModeContextValue | undefined>(undefined);

export function ModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [mode, setModeState] = useState<UserMode | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setModeState(null);
      setCompany(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: profile } = await (supabase
        .from("profiles")
        .select("user_mode, company_id")
        .eq("id", user.id)
        .maybeSingle() as any);

      const userMode = (profile?.user_mode ?? "private_individual") as UserMode;
      setModeState(userMode);

      if (
        (userMode === "business_company" || userMode === "business_school") &&
        profile?.company_id
      ) {
        const { data: companyData } = await supabase
          .from("companies")
          .select("id, name, plan, settings, avatar_config")
          .eq("id", profile.company_id)
          .maybeSingle();
        setCompany((companyData as unknown as Company) ?? null);
      } else {
        setCompany(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setMode = useCallback(
    async (newMode: UserMode) => {
      if (!user) return;
      setModeState(newMode);
      await (supabase
        .from("profiles")
        .update({ user_mode: newMode } as any)
        .eq("id", user.id) as any);
    },
    [user],
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
