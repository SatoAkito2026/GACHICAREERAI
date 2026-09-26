import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type Plan =
  | "free"
  | "individual_light"
  | "individual_pro"
  | "company_metered"
  | "company_light"
  | "company_pro"
  | "actor_pro";

export interface PlanLimits {
  interviews: number; // 月の面接回数（Infinity=無制限）
  interviewCostPerUnit: number; // 従量課金単価（円）0=非対応
  extraCostPerUnit: number; // 超過時の単価（円）
  history: boolean;
  pdf: boolean;
  resumeGenerator: boolean;
  customAvatar: boolean;
  multiUser: boolean;
  historyRanking: boolean;
  screeningFree: boolean; // 書類選考が無料かどうか
  screeningRanking: boolean; // 書類選考ランキング機能
  /** 使用可能なAIコーチのキー; null = 全て使用可 */
  personalities: string[] | null;
  /** 独自質問の最大数; Infinity = 無制限 */
  customQuestions: number;
  /** 入試モード使用可否 */
  entranceExam: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    interviews: 2,
    interviewCostPerUnit: 0,
    extraCostPerUnit: 500,
    history: false,
    pdf: false,
    resumeGenerator: false,
    customAvatar: false,
    multiUser: false,
    historyRanking: false,
    screeningFree: false,
    screeningRanking: false,
    personalities: ["gentle"],
    customQuestions: 0,
    entranceExam: false,
  },
  individual_light: {
    interviews: 15,
    interviewCostPerUnit: 0,
    extraCostPerUnit: 300,
    history: true,
    pdf: true,
    resumeGenerator: false,
    customAvatar: false,
    multiUser: false,
    historyRanking: false,
    screeningFree: false,
    screeningRanking: false,
    personalities: null,
    customQuestions: 2,
    entranceExam: false,
  },
  individual_pro: {
    interviews: 25,
    interviewCostPerUnit: 0,
    extraCostPerUnit: 300,
    history: true,
    pdf: true,
    resumeGenerator: true,
    customAvatar: false,
    multiUser: false,
    historyRanking: false,
    screeningFree: false,
    screeningRanking: false,
    personalities: null,
    customQuestions: Infinity,
    entranceExam: false,
  },
  company_metered: {
    interviews: Infinity,
    interviewCostPerUnit: 400,
    extraCostPerUnit: 400,
    history: true,
    pdf: false,
    resumeGenerator: false,
    customAvatar: false,
    multiUser: false,
    historyRanking: false,
    screeningFree: true,
    screeningRanking: false,
    personalities: null,
    customQuestions: Infinity,
    entranceExam: false,
  },
  company_light: {
    interviews: 20,
    interviewCostPerUnit: 0,
    extraCostPerUnit: 300,
    history: true,
    pdf: true,
    resumeGenerator: false,
    customAvatar: false,
    multiUser: false,
    historyRanking: false,
    screeningFree: true,
    screeningRanking: false,
    personalities: null,
    customQuestions: Infinity,
    entranceExam: false,
  },
  company_pro: {
    interviews: 50,
    interviewCostPerUnit: 0,
    extraCostPerUnit: 300,
    history: true,
    pdf: true,
    resumeGenerator: false,
    customAvatar: true,
    multiUser: true,
    historyRanking: true,
    screeningFree: true,
    screeningRanking: true,
    personalities: null,
    customQuestions: Infinity,
    entranceExam: true,
  },
  actor_pro: {
    interviews: Infinity,
    interviewCostPerUnit: 0,
    extraCostPerUnit: 0,
    history: true,
    pdf: true,
    resumeGenerator: false,
    customAvatar: false,
    multiUser: false,
    historyRanking: false,
    screeningFree: true,
    screeningRanking: false,
    personalities: null,
    customQuestions: Infinity,
    entranceExam: false,
  },
};

export const PLAN_LABELS: Record<Plan, string> = {
  free: "無料プラン",
  individual_light: "ライトプラン",
  individual_pro: "プロプラン",
  company_metered: "従量課金プラン",
  company_light: "ライトプラン",
  company_pro: "プロプラン",
  actor_pro: "芸能・キャスティングプラン",
};

export const PLAN_PRICES: Record<Plan, string> = {
  free: "¥0",
  individual_light: "¥2,200/月（税込）",
  individual_pro: "¥5,500/月（税込）",
  company_metered: "¥2,200/回（税込）",
  company_light: "¥33,000/月（税込）",
  company_pro: "¥55,000/月（税込）",
  actor_pro: "¥50,000/月（税込）",
};

interface PlanContextValue {
  plan: Plan;
  /** 現在のプラン有効期限（nullの場合は無期限または未設定） */
  planExpiresAt: Date | null;
  /** プランが有効かどうか（期限切れの場合はfalse） */
  isPlanActive: boolean;
  /** 現在の期間内の面接利用回数 */
  interviewCount: number;
  limits: PlanLimits;
  loading: boolean;
  refresh: () => Promise<void>;
  incrementInterviewCount: () => Promise<void>;
}

const PlanContext = createContext<PlanContextValue | undefined>(undefined);

// 後方互換のため旧プランを新プランにマップ
function normalizePlan(value: unknown): Plan {
  if (value === "individual_light") return "individual_light";
  if (value === "individual_pro") return "individual_pro";
  if (value === "company_metered") return "company_metered";
  if (value === "company_light") return "company_light";
  if (value === "company_pro") return "company_pro";
  if (value === "pro") return "individual_pro";
  if (value === "standard") return "individual_light";
  return "free";
}

/** plan_expires_atが過去の場合はfreeに降格して返す */
function resolveActivePlan(plan: Plan, expiresAt: Date | null): Plan {
  if (plan === "free") return "free";
  if (!expiresAt) return plan; // 有効期限未設定（無料ユーザーなど）はそのまま
  const now = new Date();
  if (expiresAt < now) {
    // 有効期限切れ → freeに降格
    return "free";
  }
  return plan;
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [rawPlan, setRawPlan] = useState<Plan>("free");
  const [planExpiresAt, setPlanExpiresAt] = useState<Date | null>(null);
  const [interviewCount, setInterviewCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setRawPlan("free");
      setPlanExpiresAt(null);
      setInterviewCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("plan, plan_expires_at, period_interview_count, interview_count_this_month")
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        console.error(error);
        setRawPlan("free");
        setPlanExpiresAt(null);
        setInterviewCount(0);
      } else {
        setRawPlan(normalizePlan(data?.plan));
        setPlanExpiresAt(data?.plan_expires_at ? new Date(data.plan_expires_at) : null);
        // period_interview_countがあればそちらを優先、なければ旧カラムを使う
        const count =
          data?.period_interview_count != null
            ? Number(data.period_interview_count)
            : Number(data?.interview_count_this_month ?? 0);
        setInterviewCount(count);
      }
    } catch (e) {
      console.error(e);
      setRawPlan("free");
      setPlanExpiresAt(null);
      setInterviewCount(0);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 有効期限切れの場合はfreeに降格
  const plan = resolveActivePlan(rawPlan, planExpiresAt);
  const isPlanActive = plan !== "free" || rawPlan === "free";

  const incrementInterviewCount = useCallback(async () => {
    const next = interviewCount + 1;
    setInterviewCount(next);
    if (!user) return;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          period_interview_count: next,
          // 旧カラムも並行更新（後方互換）
          interview_count_this_month: next,
        })
        .eq("id", user.id);
      if (error) console.error(error);
    } catch (e) {
      console.error(e);
    }
  }, [interviewCount, user]);

  return (
    <PlanContext.Provider
      value={{
        plan,
        planExpiresAt,
        isPlanActive,
        interviewCount,
        limits: PLAN_LIMITS[plan],
        loading,
        refresh,
        incrementInterviewCount,
      }}
    >
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within a PlanProvider");
  return ctx;
}
