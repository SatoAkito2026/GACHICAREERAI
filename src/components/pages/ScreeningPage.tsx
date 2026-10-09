import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { postChatApi } from "@/lib/chat-api";
import type { Json } from "@/integrations/supabase/types";
import {
  Upload,
  X,
  FileText,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Copy,
  ClipboardCheck,
  Lock,
  Download,
  Building2,
  ArrowUp,
  ArrowDown,
  ListOrdered,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePlan } from "@/hooks/use-plan";
import { supabase } from "@/integrations/supabase/client";
import {
  REQUIRED_CONDITION_CATEGORIES,
  PREFERRED_CONDITION_CATEGORIES,
  IDEAL_PERSON_CATEGORIES,
  getJobTypeScreeningFocus,
  type ConditionCategory,
  type ConditionItem,
} from "@/lib/screening-config";

const JOB_TYPES = [
  "営業",
  "事務・総務",
  "経理・財務",
  "人事・採用",
  "マーケ・広報",
  "カスタマーサポート",
  "エンジニア・開発",
  "デザイナー",
  "現場スタッフ・製造",
  "物流・配送",
  "飲食・サービス",
  "医療・介護",
  "教育・保育",
  "マネージャー・管理職",
  "その他",
];

// 書類選考AIは全アカウントで無料・無制限
const UPLOAD_LIMITS: Record<string, number> = {
  free: 10,
  individual_light: 10,
  individual_pro: 10,
  company_metered: 10,
  company_light: 10,
  company_pro: 10,
  // 後方互換
  standard: 10,
  pro: 10,
};

const SCREENING_LIMITS: Record<string, number> = {
  free: Infinity,
  individual_light: Infinity,
  individual_pro: Infinity,
  company_metered: Infinity,
  company_light: Infinity,
  company_pro: Infinity,
  // 後方互換
  standard: Infinity,
  pro: Infinity,
};

const LOADING_MESSAGES = [
  "候補者の書類を読み込んでいます...",
  "必須条件との適合度を確認中...",
  "ランキングを作成しています...",
];

interface CandidateFile {
  id: string;
  file: File;
  text: string;
  candidateName?: string;
  objectUrl?: string;
}

interface ScoreBreakdownItem {
  label: string;
  points: number;
  reason: string;
}

interface ScreeningResult {
  candidateIndex: number;
  fileName: string;
  candidateName: string;
  rank: "A" | "B" | "C" | "D" | string;
  score: number;
  summary: string;
  strengths: string[];
  concerns: string[];
  checkPoints: string[];
  positiveEvidence?: string[];
  negativeEvidence?: string[];
  scoreBreakdown?: ScoreBreakdownItem[];
  resumeExcerpt?: string;
  companyInfoUsed?: string[];
  objectUrl?: string;
}

const RANK_META: Record<string, { label: string; bg: string; color: string; border: string }> = {
  A: { label: "ぜひ会いたい", bg: "#C8FF00", color: "#0F0F0F", border: "#C8FF00" },
  B: { label: "会ってみたい", bg: "#1A3A1A", color: "#00CC88", border: "#00CC88" },
  C: { label: "再検討", bg: "#2A2A1A", color: "#CCAA00", border: "#CCAA00" },
  D: { label: "見送り", bg: "#2A1A1A", color: "#CC4444", border: "#CC4444" },
};

function rankMeta(rank: string) {
  return RANK_META[rank] ?? RANK_META.C;
}

const RANK_ORDER: string[] = ["A", "B", "C", "D"];

// AIが書類に書かれていない内容を「推測」して加点してしまうことを防ぐための保険。
// reasonに「記述なし」「明記なし」「推測」「示唆」などの語が含まれる項目は、
// 書類に根拠が無いままスコアに影響している可能性が高いため除外する。
// ベーススコアは常に残す。0点の項目（根拠なしで加点しなかった旨の記録）も冗長なので除外する。
// 減点項目（points < 0）は、定着リスク等の正当な減点理由であることが多いため、
// reasonに「記述なし」等が含まれていても基本的には残す（明確な減点根拠＝絶対条件違反等は別途reasonに記述される）。
const UNGROUNDED_REASON_PATTERN =
  /記述(が)?(ない|なく|なし|無い|見当たらない)|記載(が)?(ない|なく|なし|無い)|明記(が)?(ない|なく|なし|無い)|該当(する)?記述(が)?(ない|なく|無い|なし|見当たらない)|推測|示唆|推察|推定|推量|思われる|考えられる|断言できない/;

function filterUngroundedScoreBreakdown<
  T extends { label: string; points: number; reason?: string },
>(scoreBreakdown: T[]): T[] {
  return scoreBreakdown.filter((b) => {
    if (b.label === "ベーススコア") return true;
    if (typeof b.points !== "number" || b.points === 0) return false; // 0点項目は表示しない
    if (b.points < 0) return true; // 減点項目はそのまま残す
    const reason = b.reason ?? "";
    return !UNGROUNDED_REASON_PATTERN.test(reason);
  });
}

// scoreBreakdownの合計値から、最終スコアとランクを算出する。
// AIが返すscoreがscoreBreakdownの合計と一致しない場合があるため、
// scoreBreakdownが存在する場合は常にこちらを正とする（表示の整合性を保証する）。
// ランク基準のデフォルト値（企業がSTEP1の詳細設定で変更可能）
export interface RankThresholds {
  a: number; // A以上
  b: number; // B以上
  c: number; // C以上（これ未満はD）
}
const DEFAULT_RANK_THRESHOLDS: RankThresholds = { a: 65, b: 50, c: 38 };

function deriveScoreAndRank(
  scoreBreakdown: { points: number }[] | undefined,
  fallbackScore: number,
  fallbackRank: string,
  thresholds: RankThresholds = DEFAULT_RANK_THRESHOLDS,
): { score: number; rank: string } {
  if (!scoreBreakdown || scoreBreakdown.length === 0) {
    return { score: fallbackScore, rank: fallbackRank };
  }
  const sum = scoreBreakdown.reduce(
    (acc, b) => acc + (typeof b.points === "number" ? b.points : 0),
    0,
  );
  const score = Math.round(Math.min(100, Math.max(20, sum)));
  let rank = "D";
  if (score >= thresholds.a) rank = "A";
  else if (score >= thresholds.b) rank = "B";
  else if (score >= thresholds.c) rank = "C";
  return { score, rank };
}

// ============================================================
// 優先順位ベースの配点ロジック
// ============================================================
// ポジティブ評価の合計上限（ベース点との合計が100になるよう設計）
const POSITIVE_TOTAL = 70;
// ベーススコア（固定）
const BASE_SCORE = 30;

// カテゴリ間の重み（必須:歓迎:求める人物像）。合計100で正規化して使う。
export interface CategoryWeights {
  required: number;
  preferred: number;
  ideal: number;
}
const DEFAULT_CATEGORY_WEIGHTS: CategoryWeights = { required: 50, preferred: 20, ideal: 30 };

// 最大剰余法（largest remainder method）：各値の小数部分を切り捨てた上で、
// 合計が目標値(target)になるよう、剰余の大きい順に+1点を配分する。
// これにより「配点の合計が必ずtargetと一致する」ことを保証する（整数化）。
function distributeIntegers(rawValues: number[], target: number): number[] {
  const floored = rawValues.map((v) => Math.floor(v));
  let remainder = target - floored.reduce((a, b) => a + b, 0);
  const fractions = rawValues.map((v, i) => ({ i, frac: v - floored[i] }));
  fractions.sort((a, b) => b.frac - a.frac);
  const result = [...floored];
  for (let k = 0; k < fractions.length && remainder > 0; k++) {
    result[fractions[k].i] += 1;
    remainder--;
  }
  return result;
}

// 各カテゴリの配分点（POSITIVE_TOTAL × 重み比率、整数）を計算。
// チェック済み項目が1つ以上あるカテゴリのみを配分対象とする（チェックゼロのカテゴリは0点）。
// 有効カテゴリ間での合計が必ずPOSITIVE_TOTALと一致するよう最大剰余法で整数化する。
function getCategoryAllocations(
  weights: CategoryWeights,
  hasItems: { required: boolean; preferred: boolean; ideal: boolean },
): CategoryWeights {
  // チェックがないカテゴリの重みを0にする
  const effectiveWeights = {
    required: hasItems.required ? weights.required : 0,
    preferred: hasItems.preferred ? weights.preferred : 0,
    ideal: hasItems.ideal ? weights.ideal : 0,
  };
  const total = effectiveWeights.required + effectiveWeights.preferred + effectiveWeights.ideal;
  if (total <= 0) return { required: 0, preferred: 0, ideal: 0 };
  const raw = [
    (POSITIVE_TOTAL * effectiveWeights.required) / total,
    (POSITIVE_TOTAL * effectiveWeights.preferred) / total,
    (POSITIVE_TOTAL * effectiveWeights.ideal) / total,
  ];
  const [required, preferred, ideal] = distributeIntegers(raw, POSITIVE_TOTAL);
  return { required, preferred, ideal };
}

// 優先順位リスト（先頭が最重要）に対し、線形減衰で配点を割り振る（整数）。
// n項目あるとき、i番目(1-indexed)の素の配点 = allocation × 2*(n-i+1) / (n*(n+1))
// → 最大剰余法で整数化し、合計が必ずallocationと一致するようにする。
function allocatePointsByPriority(
  priorityIds: string[],
  allocation: number,
): Record<string, number> {
  const n = priorityIds.length;
  const result: Record<string, number> = {};
  if (n === 0 || allocation <= 0) return result;
  const target = Math.round(allocation);
  const denom = (n * (n + 1)) / 2;
  const raw = priorityIds.map((_, idx) => {
    const weight = n - idx; // 1位はn、最下位は1
    return (allocation * weight) / denom;
  });
  const ints = distributeIntegers(raw, target);
  priorityIds.forEach((id, idx) => {
    result[id] = ints[idx];
  });
  return result;
}

// カテゴリ一覧から item.id -> label のマップを作る（優先順位リスト表示・AIへの採点表生成用）
function buildLabelMap(categories: ConditionCategory[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const cat of categories) {
    for (const item of cat.items) {
      map[item.id] = item.label;
    }
  }
  return map;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ScreeningPage() {
  const { user, session, loading: authLoading } = useAuth();
  const { plan, limits } = usePlan();
  const navigate = useNavigate();
  const [screeningCount, setScreeningCount] = useState(0);
  const [countLoading, setCountLoading] = useState(true);

  const [jobType, setJobType] = useState("");
  const [requiredConditions, setRequiredConditions] = useState("");
  const [preferredConditions, setPreferredConditions] = useState("");
  const [idealPerson, setIdealPerson] = useState("");

  // チェックボックス選択状態（カテゴリ問わずitem.idで管理）
  const [requiredChecks, setRequiredChecks] = useState<Record<string, boolean>>({});
  const [preferredChecks, setPreferredChecks] = useState<Record<string, boolean>>({});
  const [idealChecks, setIdealChecks] = useState<Record<string, boolean>>({});
  // 数値入力欄（item.idごとの数値・自由記述）
  const [requiredValues, setRequiredValues] = useState<Record<string, string>>({});
  const [preferredValues, setPreferredValues] = useState<Record<string, string>>({});
  // 複数選択プルダウン項目（item.idごとの選択済みラベル配列。例：学歴）
  const [requiredMultiValues, setRequiredMultiValues] = useState<Record<string, string[]>>({});
  // 「未経験可」トグル（item.idごと。inexperienceOkToggle対象項目のみ使用）
  const [inexperienceOk, setInexperienceOk] = useState<Record<string, boolean>>({});
  // カテゴリごとの優先順位リスト（先頭が最重要。item.idの配列）
  const [requiredPriority, setRequiredPriority] = useState<string[]>([]);
  const [preferredPriority, setPreferredPriority] = useState<string[]>([]);
  const [idealPriority, setIdealPriority] = useState<string[]>([]);
  // カテゴリ間の重み（必須:歓迎:求める人物像）。詳細設定で調整可能。デフォルト5:2:3相当
  const [categoryWeights, setCategoryWeights] = useState<CategoryWeights>(DEFAULT_CATEGORY_WEIGHTS);
  // 企業が設定するランク基準（何点以上でA/B/C/D）
  const [rankThresholds, setRankThresholds] = useState<RankThresholds>(DEFAULT_RANK_THRESHOLDS);
  // 優先順位リストを一度も並び替えていないかどうか（カテゴリごと）。
  // チェック順=デフォルト順のまま変更がない場合、開始前に確認ダイアログを出す
  const [priorityReordered, setPriorityReordered] = useState<Record<string, boolean>>({
    required: false,
    preferred: false,
    ideal: false,
  });
  const [showPriorityConfirm, setShowPriorityConfirm] = useState(false);
  // アコーディオンの開閉状態（カテゴリid単位）
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  // 企業側自由記述（4項目）
  const [mustHaveConditions, setMustHaveConditions] = useState(""); // 絶対条件
  const [highlyValuedExperience, setHighlyValuedExperience] = useState(""); // 高評価する経験
  const [avoidPersonality, setAvoidPersonality] = useState(""); // 避けたい人物像
  const [expectedOutcome, setExpectedOutcome] = useState(""); // 入社後に期待する成果

  // マイページ会社情報（InterviewCoach.tsx の companyContextRef 相当）
  const companyContextRef = useRef<string>("");
  const [companyContextLoaded, setCompanyContextLoaded] = useState(false);
  // マイページで入力済みの会社情報項目ラベル一覧（AIへの「参照可能な項目」提示・結果画面での表示に使用）
  const companyFieldLabelsRef = useRef<string[]>([]);
  // 会社情報を書類選考の評価に反映するかどうか（マイページに会社情報がある場合のみ表示・デフォルトON）
  const [useCompanyContext, setUseCompanyContext] = useState(true);
  const [presets, setPresets] = useState<{ id: string; name: string }[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [presetSaving, setPresetSaving] = useState(false);

  const [files, setFiles] = useState<CandidateFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<"input" | "processing" | "result">("input");
  const [results, setResults] = useState<ScreeningResult[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const [companyNameInput, setCompanyNameInput] = useState("");
  const [companyNameSaving, setCompanyNameSaving] = useState(false);
  const [companyNameSaved, setCompanyNameSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.company_id) {
        const { data: company } = await supabase
          .from("companies")
          .select("name")
          .eq("id", profile.company_id)
          .maybeSingle();
        if (company?.name) setCompanyNameInput(company.name as string);
      }
    })();
  }, [user]);

  const handleSaveCompanyName = async () => {
    if (!user || !companyNameInput.trim()) return;
    setCompanyNameSaving(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle();

      let companyId = (profile as any)?.company_id;

      if (!companyId) {
        // companiesレコードがなければ新規作成
        const { data: newCompany } = await (supabase
          .from("companies")
          .insert({ owner_id: user.id, name: companyNameInput.trim() })
          .select("id")
          .maybeSingle() as any);
        companyId = newCompany?.id;

        if (companyId) {
          // profilesのcompany_idを更新
          await (supabase
            .from("profiles")
            .update({ company_id: companyId } as any)
            .eq("id", user.id) as any);
        }
      } else {
        // 既存のcompaniesレコードを更新
        await (supabase
          .from("companies")
          .update({ name: companyNameInput.trim() } as any)
          .eq("id", companyId) as any);
      }

      setCompanyNameSaved(true);
      setTimeout(() => setCompanyNameSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setCompanyNameSaving(false);
    }
  };

  const maxFiles = UPLOAD_LIMITS[plan] ?? 0;
  const canUpload = maxFiles > 0;
  const screeningLimit = SCREENING_LIMITS[plan] ?? 0;
  const canStartScreening = true;

  useEffect(() => {
    const savedPhase = sessionStorage.getItem("screening_phase");
    const savedResults = sessionStorage.getItem("screening_results");
    const savedJobType = sessionStorage.getItem("screening_jobType");

    if (savedJobType) setJobType(savedJobType);

    if (savedResults) {
      try {
        setResults(JSON.parse(savedResults));
      } catch (e) {
        sessionStorage.removeItem("screening_results");
      }
    }

    if (savedPhase === "result" && savedResults) {
      setPhase("result");
    } else if (savedPhase === "processing") {
      let hasResults = false;
      try {
        hasResults = !!savedResults && JSON.parse(savedResults).length > 0;
      } catch {
        hasResults = false;
      }
      setPhase(hasResults ? "result" : "input");
    }
  }, []);

  // phase・resultsが変わるたびに保存
  useEffect(() => {
    sessionStorage.setItem("screening_phase", phase);
    if (results.length > 0) {
      sessionStorage.setItem("screening_results", JSON.stringify(results));
    }
  }, [phase, results]);

  // jobTypeが変わるたびに保存
  useEffect(() => {
    sessionStorage.setItem("screening_jobType", jobType);
  }, [jobType]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setCountLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("screening_count_this_month")
        .eq("id", user.id)
        .maybeSingle();
      setScreeningCount(Number(data?.screening_count_this_month ?? 0));
      setCountLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    if (!user) {
      companyContextRef.current = "";
      setCompanyContextLoaded(true);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select(
          "company_name, industry, employee_count, business_description, company_strengths, ideal_candidate, company_culture, hiring_positions, successful_hire_traits, failed_hire_traits, first_job_description, competitors, interview_focus",
        )
        .eq("id", user.id)
        .maybeSingle();
      if (!data) {
        companyContextRef.current = "";
        setCompanyContextLoaded(true);
        return;
      }
      const c = data as unknown as Record<string, string | null>;
      const has = Object.values(c).some((v) => typeof v === "string" && v.trim());
      if (!has) {
        companyContextRef.current = "";
        setCompanyContextLoaded(true);
        return;
      }
      // 評価軸として参照される可能性のある項目のうち、実際に入力済みのものをラベル化
      const FIELD_LABELS: { key: string; label: string }[] = [
        { key: "business_description", label: "事業内容" },
        { key: "competitors", label: "業界・競合" },
        { key: "ideal_candidate", label: "求める人物像" },
        { key: "company_culture", label: "社風・文化" },
        { key: "company_strengths", label: "自社の強み" },
        { key: "successful_hire_traits", label: "活躍社員の特徴" },
        { key: "failed_hire_traits", label: "採用失敗の傾向" },
        { key: "first_job_description", label: "入社後最初の仕事" },
        { key: "interview_focus", label: "書類選考で特に確認すべき特性" },
      ];
      companyFieldLabelsRef.current = FIELD_LABELS.filter((f) => {
        const v = c[f.key];
        return typeof v === "string" && v.trim();
      }).map((f) => f.label);
      companyContextRef.current = `【採用企業情報 - 必ずこの企業基準で評価してください】
会社名：${c.company_name ?? ""}
事業内容：${c.business_description ?? ""}
業界・競合：${c.competitors ?? ""}
求める人物像：${c.ideal_candidate ?? ""}
社風・文化：${c.company_culture ?? ""}
自社の強み：${c.company_strengths ?? ""}
採用職種：${c.hiring_positions ?? ""}
活躍社員の特徴：${c.successful_hire_traits ?? ""}
採用失敗の傾向：${c.failed_hire_traits ?? ""}
入社後最初の仕事：${c.first_job_description ?? ""}
書類選考で特に確認すべき特性：${c.interview_focus ?? ""}

【書類選考の前提（必ず守る）】
- 「求める人物像」「社風・文化」「活躍社員の特徴」を評価軸として、候補者の経験・記述と照合すること
- 「採用失敗の傾向」に該当するパターンが候補者の書類に見られないか特に注意して評価すること
- 「書類選考で特に確認すべき特性」は、面接で確認すべきこと（checkPoints）に優先的に反映すること
- 上記の採用企業情報のうち、実際にこの候補者の評価（scoreBreakdownのreason、summary、strengths、concerns、checkPointsのいずれか）で具体的に参照した項目名を、JSON出力のcompanyInfoUsedに列挙すること（参照していない項目は含めない）`;
      setCompanyContextLoaded(true);
    })();
  }, [user]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase
        .from("screening_criteria_presets")
        .select("id, name")
        .eq("company_user_id", user.id)
        .order("updated_at", { ascending: false }) as any);
      setPresets((data ?? []) as { id: string; name: string }[]);
    })();
  }, [user]);

  const buildCriteriaSnapshot = () => ({
    jobType,
    requiredConditions,
    preferredConditions,
    idealPerson,
    requiredChecks,
    preferredChecks,
    idealChecks,
    requiredValues,
    preferredValues,
    requiredMultiValues,
    inexperienceOk,
    requiredPriority,
    preferredPriority,
    idealPriority,
    categoryWeights,
    rankThresholds,
    mustHaveConditions,
    highlyValuedExperience,
    avoidPersonality,
    expectedOutcome,
  });

  const applyCriteriaSnapshot = (s: ReturnType<typeof buildCriteriaSnapshot>) => {
    setJobType(s.jobType ?? "");
    setRequiredConditions(s.requiredConditions ?? "");
    setPreferredConditions(s.preferredConditions ?? "");
    setIdealPerson(s.idealPerson ?? "");
    setRequiredChecks(s.requiredChecks ?? {});
    setPreferredChecks(s.preferredChecks ?? {});
    setIdealChecks(s.idealChecks ?? {});
    setRequiredValues(s.requiredValues ?? {});
    setPreferredValues(s.preferredValues ?? {});
    setRequiredMultiValues(s.requiredMultiValues ?? {});
    setInexperienceOk(s.inexperienceOk ?? {});
    setRequiredPriority(s.requiredPriority ?? []);
    setPreferredPriority(s.preferredPriority ?? []);
    setIdealPriority(s.idealPriority ?? []);
    setCategoryWeights(s.categoryWeights ?? DEFAULT_CATEGORY_WEIGHTS);
    setRankThresholds(s.rankThresholds ?? DEFAULT_RANK_THRESHOLDS);
    setMustHaveConditions(s.mustHaveConditions ?? "");
    setHighlyValuedExperience(s.highlyValuedExperience ?? "");
    setAvoidPersonality(s.avoidPersonality ?? "");
    setExpectedOutcome(s.expectedOutcome ?? "");
  };

  const handleSavePreset = async () => {
    if (!user) return;
    const name = presetName.trim();
    if (!name) {
      setToast("設定に名前を付けてください。");
      return;
    }
    setPresetSaving(true);
    try {
      const { data, error } = await supabase
        .from("screening_criteria_presets")
        .insert({
          company_user_id: user.id,
          name,
          criteria_data: buildCriteriaSnapshot() as unknown as Json,
        })
        .select("id, name")
        .single();
      if (error) throw error;
      setPresets((prev) => [{ id: data.id, name: data.name }, ...prev]);
      setPresetName("");
      setToast("設定を保存しました。");
    } catch (e) {
      console.error(e);
      setToast("保存に失敗しました。");
    } finally {
      setPresetSaving(false);
    }
  };

  const handleLoadPreset = async (id: string) => {
    if (!id) return;
    const { data } = await supabase
      .from("screening_criteria_presets")
      .select("criteria_data")
      .eq("id", id)
      .maybeSingle();
    if (data?.criteria_data) {
      applyCriteriaSnapshot(
        data.criteria_data as unknown as ReturnType<typeof buildCriteriaSnapshot>,
      );
      setToast("設定を読み込みました。");
    }
  };

  const handleDeletePreset = async (id: string) => {
    await supabase.from("screening_criteria_presets").delete().eq("id", id);
    setPresets((prev) => prev.filter((p) => p.id !== id));
    if (selectedPresetId === id) setSelectedPresetId("");
  };

  useEffect(() => {
    if (phase !== "processing") return;
    const t = setInterval(() => {
      setLoadingIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 1800);
    return () => clearInterval(t);
  }, [phase]);

  const loadPdfJs = async (): Promise<any> => {
    const w = window as any;
    if (w["pdfjs-dist/build/pdf"]) return w["pdfjs-dist/build/pdf"];
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("pdf.js load failed"));
      document.head.appendChild(s);
    });
    const lib = w["pdfjs-dist/build/pdf"];
    lib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    return lib;
  };

  const extractPdfText = async (file: File): Promise<string> => {
    const lib = await loadPdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: buf }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it: any) => it.str).join(" ") + "\n";
    }
    return text;
  };

  const toggleCategory = (id: string) => {
    setOpenCategories((p) => ({ ...p, [id]: !p[id] }));
  };

  // チェックボックスのON/OFFと、優先順位リストへの追加/削除を同時に行う共通ハンドラ。
  // ONにした項目は優先順位リストの末尾に追加し、OFFにした項目はリストから除去する。
  const makeToggleCheck =
    (
      setChecks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
      setPriority: React.Dispatch<React.SetStateAction<string[]>>,
      categoryKey: "required" | "preferred" | "ideal",
    ) =>
    (id: string) => {
      setChecks((p) => {
        const nextChecked = !p[id];
        setPriority((prev) => {
          if (nextChecked) {
            return prev.includes(id) ? prev : [...prev, id];
          }
          return prev.filter((x) => x !== id);
        });
        // チェック状態が変わったら、そのカテゴリの並び替え確認フラグはリセットしない
        // （並び替え済みかどうかは別途priorityReorderedで管理）
        return { ...p, [id]: nextChecked };
      });
    };

  // 優先順位リスト内で項目を1つ上/下に移動する
  const movePriority = (
    setPriority: React.Dispatch<React.SetStateAction<string[]>>,
    categoryKey: "required" | "preferred" | "ideal",
    index: number,
    direction: -1 | 1,
  ) => {
    setPriority((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setPriorityReordered((p) => ({ ...p, [categoryKey]: true }));
  };

  // チェック項目を「項目名（補足値）」のような行のリストに変換（AIに渡す用）
  const buildSelectedItemsText = (
    categories: ConditionCategory[],
    checks: Record<string, boolean>,
    values: Record<string, string>,
    multiValues: Record<string, string[]> = {},
    inexperienceOkMap: Record<string, boolean> = {},
  ): string[] => {
    const lines: string[] = [];
    for (const cat of categories) {
      for (const item of cat.items) {
        if (item.inexperienceOkToggle && inexperienceOkMap[item.id]) {
          lines.push(
            `${item.label}：未経験可（この項目は実務経験の有無を加点・減点の対象にしないこと）`,
          );
          continue;
        }
        if (!checks[item.id]) continue;
        if (item.multiSelectOptions) {
          const selected = multiValues[item.id] ?? [];
          if (selected.length > 0) {
            lines.push(`${item.label}：${selected.join("・")}`);
          } else {
            lines.push(item.label);
          }
          continue;
        }
        const val = values[item.id]?.trim();
        if (item.numberInput && val) {
          lines.push(`${item.label}（${val}${item.unit ?? ""}）`);
        } else if (item.placeholder && val) {
          lines.push(`${item.label}：${val}`);
        } else {
          lines.push(item.label);
        }
      }
    }
    return lines;
  };

  // 優先順位リストと配点に基づき、AIに渡す「採点表」の行を生成する。
  // 各行は「項目名（◯◯点）：補足値」の形式。
  // 「未経験可」項目は配点対象外（表示のみ）のため、配点計算からは除外する
  // （除外後の項目に対して配点を計算するので、合計はallocationと一致する）。
  const buildScoredItemsText = (
    categories: ConditionCategory[],
    priority: string[],
    allocation: number,
    values: Record<string, string>,
    multiValues: Record<string, string[]> = {},
    inexperienceOkMap: Record<string, boolean> = {},
  ): string[] => {
    const labelMap = buildLabelMap(categories);
    const allItems = categories.flatMap((c) => c.items);
    const scoredPriority = priority.filter((id) => {
      const item = allItems.find((it) => it.id === id);
      return !(item?.inexperienceOkToggle && inexperienceOkMap[id]);
    });
    const points = allocatePointsByPriority(scoredPriority, allocation);
    const lines: string[] = [];
    for (const id of scoredPriority) {
      const label = labelMap[id] ?? id;
      const item = allItems.find((it) => it.id === id);
      const pt = points[id] ?? 0;
      let suffix = "";
      if (item?.multiSelectOptions) {
        const selected = multiValues[id] ?? [];
        if (selected.length > 0) suffix = `：${selected.join("・")}`;
      } else {
        const val = values[id]?.trim();
        if (item?.numberInput && val) suffix = `（${val}${item.unit ?? ""}）`;
        else if (item?.placeholder && val) suffix = `：${val}`;
      }
      lines.push(`${label}${suffix}（配点：${pt}点）`);
    }
    return lines;
  };

  const addFiles = (incoming: FileList | File[]) => {
    const pdfs = Array.from(incoming).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdfs.length === 0) return;
    setFiles((prev) => {
      const remaining = maxFiles - prev.length;
      if (remaining <= 0) {
        setToast(`最大${maxFiles}件までアップロードできます。`);
        return prev;
      }
      const toAdd = pdfs.slice(0, remaining).map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        text: "",
        objectUrl: URL.createObjectURL(file),
      }));
      if (pdfs.length > remaining) {
        setToast(`最大${maxFiles}件までアップロードできます。`);
      }
      return [...prev, ...toAdd];
    });
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const requiredSelectedCount = Object.values(requiredChecks).filter(Boolean).length;
  const canStart =
    jobType !== "" &&
    (requiredSelectedCount > 0 ||
      requiredConditions.trim() !== "" ||
      mustHaveConditions.trim() !== "") &&
    files.length > 0;

  // 優先順位表示・配点計算用
  // 「未経験可」のみの項目は配点対象外なので、配点対象となる項目が1つ以上あるかを判定する
  const hasRequiredScored = requiredPriority.some((id) => !inexperienceOk[id]);
  const categoryAllocations = getCategoryAllocations(categoryWeights, {
    required: hasRequiredScored,
    preferred: preferredPriority.length > 0,
    ideal: idealPriority.length > 0,
  });

  const callOpenAI = async (system: string, user: string) => {
    const data = await postChatApi({ system, user });
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    // Claudeのレスポンスからコードブロックを除去してJSONを抽出
    const content = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    try {
      return JSON.parse(content);
    } catch (e) {
      // JSONが見つからない場合は正規表現で抽出を試みる
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          throw new Error("parse");
        }
      }
      throw new Error("parse");
    }
  };

  // 優先順位リストが2項目以上あるのに、一度も並び替えられていないカテゴリがあるか判定する。
  // ある場合は、選考開始前に確認ダイアログを出す。
  const hasUnreorderedPriority = () => {
    const checks: { priority: string[]; key: "required" | "preferred" | "ideal" }[] = [
      { priority: requiredPriority, key: "required" },
      { priority: preferredPriority, key: "preferred" },
      { priority: idealPriority, key: "ideal" },
    ];
    return checks.some(({ priority, key }) => priority.length >= 2 && !priorityReordered[key]);
  };

  // 「AIで書類選考を開始する」ボタンの実際のクリックハンドラ。
  // 優先順位が未調整のカテゴリがあれば確認ダイアログを表示し、なければ即座に選考を開始する。
  const handleStartClick = () => {
    if (!canStart || !canStartScreening) return;
    if (hasUnreorderedPriority()) {
      setShowPriorityConfirm(true);
      return;
    }
    startScreening();
  };

  const startScreening = async () => {
    if (!canStart) return;
    const nextCount = screeningCount + 1;
    setScreeningCount(nextCount);
    if (user) {
      await supabase
        .from("profiles")
        .update({ screening_count_this_month: nextCount })
        .eq("id", user.id);
    }
    setPhase("processing");
    setLoadingIndex(0);
    try {
      const candidates: { fileName: string; text: string }[] = [];
      for (const f of files) {
        let text = f.text;
        if (!text) {
          try {
            text = await extractPdfText(f.file);
          } catch (e) {
            text = "";
          }
        }
        if (!text || text.trim().length === 0) {
          setToast(`PDFのテキストを読み取れませんでした：${f.file.name}`);
          continue;
        }
        candidates.push({ fileName: f.file.name, text });
      }

      if (candidates.length === 0) {
        setToast("PDFのテキストを読み取れませんでした。別のファイルでお試しください。");
        setPhase("input");
        return;
      }

      // 選択されたチェック項目を構造化テキストに変換
      const requiredSelected = buildSelectedItemsText(
        REQUIRED_CONDITION_CATEGORIES,
        requiredChecks,
        requiredValues,
        requiredMultiValues,
        inexperienceOk,
      );
      const preferredSelected = buildSelectedItemsText(
        PREFERRED_CONDITION_CATEGORIES,
        preferredChecks,
        preferredValues,
      );
      const idealSelected = buildSelectedItemsText(IDEAL_PERSON_CATEGORIES, idealChecks, {});

      // 優先順位＋配点に基づく採点表（AIに「この項目は何点満点か」を明示する）
      const requiredScored = buildScoredItemsText(
        REQUIRED_CONDITION_CATEGORIES,
        requiredPriority,
        categoryAllocations.required,
        requiredValues,
        requiredMultiValues,
        inexperienceOk,
      );
      const preferredScored = buildScoredItemsText(
        PREFERRED_CONDITION_CATEGORIES,
        preferredPriority,
        categoryAllocations.preferred,
        preferredValues,
      );
      const idealScored = buildScoredItemsText(
        IDEAL_PERSON_CATEGORIES,
        idealPriority,
        categoryAllocations.ideal,
        {},
      );

      const jobTypeFocus = getJobTypeScreeningFocus(jobType);
      const companyContext =
        useCompanyContext && companyContextRef.current ? `${companyContextRef.current}\n\n` : "";

      const system = `あなたは採用のプロフェッショナルです。
企業の採用条件と候補者の書類を照合し、
採用担当者が書類選考の判断をしやすいよう
客観的・具体的に評価してください。
重要：採用すべき・不採用にすべきという断定はしない。
「確認すべき点」「注意点」という形で提示すること。
必ずJSONのみで返すこと。前置き不要。

${companyContext}【募集職種「${jobType}」の評価フォーカス】
${jobTypeFocus}

【全ての指示の中で最優先：positiveEvidence/negativeEvidence先行抽出 → 採点表に基づき加点を判定 → 合計してスコア確定】
印象だけでスコアを決めることを禁止する。必ず以下の手順で判定すること。

ステップ1：候補者の書類を読み、後述の【必須条件（採点表）】【歓迎条件（採点表）】【求める人物像（採点表）】それぞれの項目について、書類中に合致する根拠（具体的な記述）があるかを確認し、positiveEvidence / negativeEvidence として抽出する。
- 推測や期待ではなく、書類に明記されている事実のみを根拠とすること
- 該当する記述が無い項目は「根拠なし」として扱う（ペナルティではなく、加点しないだけ）

【学歴の判定基準（厳守）】
学歴に関する項目を評価する際は、以下の定義を必ず守ること。名称の類似性や「〜相当」という解釈で判定してはならない。書類の学歴欄に明記されている名称のみを根拠にすること。

- 大学卒（大卒）：「大学」「University」「学部」「学科」という言葉が学歴欄に明記されている場合のみ。4年制大学を卒業していること
- 大学院卒：「大学院」「Graduate School」「修士」「博士」が学歴欄に明記されている場合のみ
- 大学中退：「大学」に入学したが卒業していない場合。「中退」「退学」「休学」が明記されている
- 高専卒：「高等専門学校」「高専」が学歴欄に明記されている場合のみ（5年制、準学士相当）
- 専門卒：「専門学校」「専修学校」が学歴欄に明記されている場合のみ
- 高卒：「高等学校」「高校」が最終学歴の場合。「高等工科学校」「工科学校」「技術学校」「職業訓練校」「各種学校」なども高卒扱いとする（大学ではない）
- 中卒：中学校が最終学歴の場合

【特に注意】「高等工科学校」「工科学校」「技術学校」は大学ではなく高校相当である。「大学」という文字が含まれていない限り、大卒として判定してはならない。

ステップ2：ステップ1の抽出結果を、以下のスコアリング基準に従ってscoreBreakdownとして列挙する。
- scoreBreakdownの先頭には必ず { "label": "ベーススコア", "points": ${BASE_SCORE}, "reason": "全候補者共通の基準点" } を含める
- 【必須条件（採点表）】【歓迎条件（採点表）】【求める人物像（採点表）】の各項目には、それぞれ「配点（◯点）」が指定されている。書類でその項目の根拠が確認できた場合のみ、その配点をそのままpointsとしてscoreBreakdownに追加する（根拠が確認できなければ追加しない。配点を分割したり独自に増減したりしないこと）
- 【厳守】「推測できる」「示唆される」「と思われる」「明記はないが」「断定できないが」など、書類に明記されていない内容を根拠に加点することは固く禁止する。reasonに「記述なし」「明記なし」「推測」「示唆」という言葉が入る場合、その項目はscoreBreakdownに加えてはならない（0点として扱い、リストに含めない）
- 採点表に配点が示されている項目だからといって、全項目に加点する必要はない。書類に根拠が無い項目はそのまま加点せず終わってよい。根拠のある項目だけがscoreBreakdownに載る、という結果で構わない（むしろそれが正しい）
- 「未経験可」と明記された項目は、実務経験の有無にかかわらず加点も減点もしないこと（scoreBreakdownにも含めない）。未経験であることを気になる点・面接確認事項として挙げるのも禁止する
- 【企業の絶対条件（自由記述）】に明確に違反している場合：-20点
- 【企業の高評価する経験（自由記述）】に合致する記述がある場合：+5点
- 【企業の避けたい人物像（自由記述）】に該当する傾向が見られる場合：-10点
- 早期離職が複数回繰り返されている等、定着リスクが明確な場合：-10点
- 職歴に矛盾・説明不能な空白期間がある場合：-5点
- 各項目には、何の項目に対する加減点か（label）、何点か（points。加点は+、減点は-。採点表の項目はその配点の値をそのまま使う）、その判断根拠（reason。書類のどの記述に基づくか。必ず書類中の具体的な記述を引用または要約すること）を必ず含めること
- この候補者固有の書類内容に基づいて、加点・減点の対象・件数は候補者ごとに必ず異なってよい（むしろ異ならないのは不自然である）。複数の候補者に同じscoreBreakdownを使い回すことを禁止する

ステップ3：scoreBreakdownに列挙した全項目のpointsを実際に足し算し、その合計値（最低20点・最高100点の範囲にクランプしたもの）をscoreとして出力する。
- scoreは「だいたいこのくらい」という感覚値で決めてはならない。scoreBreakdownのpointsを実際に合計した値そのものを使うこと
- 出力前に必ず検算すること：scoreBreakdownのpointsの合計とscoreが一致しているか確認し、一致していなければscoreBreakdownの合計値に修正する

【ランク基準（必ず守ること）】
- ${rankThresholds.a}点以上：A（ぜひ会いたい）
- ${rankThresholds.b}〜${rankThresholds.a - 1}点：B（会ってみたい）
- ${rankThresholds.c}〜${rankThresholds.b - 1}点：C（再検討）
- ${rankThresholds.c - 1}点以下：D（見送り）

この基準を必ず守り、同じ書類には常に同じスコアを返すこと。

【総評（summary）の書き方】
- 5〜7文程度で、以下を必ず含めて具体的に書く：
  1. 候補者の経歴・実績のうち最も評価に影響した点（scoreBreakdownの加点項目に対応する具体的な記述を引用または要約する）
  2. 減点・懸念につながった点があれば、その内容と理由
  3. ${companyContext ? "企業の求める人物像・社風・自社の強み・活躍社員の特徴・採用失敗の傾向のうち、少なくとも1つに明確に言及し、この候補者がそれにどう合致または不一致かを述べる" : "企業の採用条件・求める人物像への合致度を具体的に述べる"}
- 「適性が高い」「良い候補者」のような抽象的な表現だけで終えず、必ず根拠となる具体的な記述内容を含めること

【strengths / concerns / checkPoints の書き方】
- それぞれ2〜3項目、各項目は一文で具体的に（「営業経験がある」のような曖昧な記述ではなく、「株式会社XYZでの新規開拓を年間100件担当し達成率120%」のように書類の具体的記述を反映する）
${companyContext ? "- concernsまたはcheckPointsのうち少なくとも1つは、企業の「求める人物像」「採用失敗の傾向」「書類選考で特に確認すべき特性」のいずれかと関連付けること" : ""}`;

      // 候補者ごとに個別にAPIを呼ぶ（1回のリクエストを小さく保ち、502タイムアウトを回避）
      const raw: ScreeningResult[] = [];
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const user = `以下の採用条件と候補者1名の書類をもとに書類選考を行ってください。

【募集職種】
${jobType}

【必須条件（採点表：書類で根拠が確認できた項目の配点をそのまま加点する）】
${requiredScored.length > 0 ? requiredScored.map((l) => `- ${l}`).join("\n") : "（採点対象項目なし）"}
${requiredSelected
  .filter((l) => l.includes("未経験可"))
  .map((l) => `- ${l}`)
  .join("\n")}

【必須条件（自由記述）】
${requiredConditions.trim() || "（なし）"}

【企業の絶対条件（自由記述・満たさない場合は大きく減点）】
${mustHaveConditions.trim() || "（なし）"}

【歓迎条件（採点表：書類で根拠が確認できた項目の配点をそのまま加点する）】
${preferredScored.length > 0 ? preferredScored.map((l) => `- ${l}`).join("\n") : "（採点対象項目なし）"}

【歓迎条件（自由記述）】
${preferredConditions.trim() || "（なし）"}

【企業の高評価する経験（自由記述）】
${highlyValuedExperience.trim() || "（なし）"}

【求める人物像（採点表：書類で根拠が確認できた項目の配点をそのまま加点する）】
${idealScored.length > 0 ? idealScored.map((l) => `- ${l}`).join("\n") : "（採点対象項目なし）"}

【求める人物像（自由記述）】
${idealPerson.trim() || "（なし）"}

【企業の避けたい人物像（自由記述）】
${avoidPersonality.trim() || "（なし）"}

【入社後に期待する成果（自由記述）】
${expectedOutcome.trim() || "（なし）"}

【候補者の書類】
ファイル名：${c.fileName}
${c.text.slice(0, 1500)}

以下のJSON形式で必ず返してください：
{
  "candidateName": "書類から読み取った候補者の氏名（読み取れなければファイル名をそのまま使う）",
  "positiveEvidence": ["上記の【必須条件】【歓迎条件】【求める人物像】【高評価する経験】のうち、書類中の記述で根拠が確認できた項目と、その根拠となる記述（項目名：根拠の要約の形式）"],
  "negativeEvidence": ["上記の【企業の絶対条件】【避けたい人物像】への該当、定着リスク、職歴の矛盾など、懸念点（具体的に）"],
  "scoreBreakdown": [
    { "label": "ベーススコア", "points": ${BASE_SCORE}, "reason": "全候補者共通の基準点" },
    { "label": "必須条件：〇〇の経験", "points": 10, "reason": "（例）採点表でこの項目の配点が10点だった場合。書類の具体的な記述（社名・年数・実績等）に基づくreasonを書く。根拠が無ければこの項目自体を出力しない" }
  ],
  "rank": "B",
  "score": 40,
  "summary": "この候補者の総評。5〜7文程度で、評価に最も影響した実績・懸念点・企業の採用基準との合致/不一致を具体的に書く。",
  "strengths": ["強み1（書類の具体的記述を反映）", "強み2"],
  "concerns": ["気になる点1（書類の具体的記述を反映）", "気になる点2"],
  "checkPoints": ["面接で確認すべきこと1", "面接で確認すべきこと2"],
  "companyInfoUsed": ["この候補者の評価で実際に参照した採用企業情報の項目名（例：求める人物像、活躍社員の特徴）。採用企業情報が提供されていない場合は空配列"]
}
注：上記のscoreBreakdownの例は「ベーススコアと、根拠が確認できた項目が1つだけだった場合」の例である。根拠が確認できた項目数に応じて行数は変わる（0個でもよい）。scoreの40という値も例であり、実際はscoreBreakdownの合計値を使うこと。`;

        const json = await callOpenAI(system, user);
        const scoreBreakdown = filterUngroundedScoreBreakdown(
          Array.isArray(json.scoreBreakdown) ? json.scoreBreakdown : [],
        ).map((b) => ({ label: b.label, points: b.points, reason: b.reason ?? "" }));
        const { score, rank } = deriveScoreAndRank(
          scoreBreakdown,
          typeof json.score === "number" ? json.score : 0,
          json.rank ?? "C",
          rankThresholds,
        );
        raw.push({
          candidateIndex: i,
          fileName: c.fileName,
          candidateName:
            typeof json.candidateName === "string" && json.candidateName.trim()
              ? json.candidateName.trim()
              : c.fileName,
          rank,
          score,
          summary: json.summary ?? "",
          strengths: Array.isArray(json.strengths) ? json.strengths : [],
          concerns: Array.isArray(json.concerns) ? json.concerns : [],
          checkPoints: Array.isArray(json.checkPoints) ? json.checkPoints : [],
          positiveEvidence: Array.isArray(json.positiveEvidence) ? json.positiveEvidence : [],
          negativeEvidence: Array.isArray(json.negativeEvidence) ? json.negativeEvidence : [],
          scoreBreakdown,
          resumeExcerpt: c.text.slice(0, 800),
          companyInfoUsed: Array.isArray(json.companyInfoUsed) ? json.companyInfoUsed : [],
          objectUrl: files[i]?.objectUrl,
        });
      }

      const sorted = raw
        .map((r, i) => ({
          candidateIndex: typeof r.candidateIndex === "number" ? r.candidateIndex : i,
          fileName: r.fileName ?? candidates[i]?.fileName ?? `候補者${i + 1}`,
          candidateName: r.candidateName ?? r.fileName ?? `候補者${i + 1}`,
          rank: r.rank ?? "C",
          score: typeof r.score === "number" ? r.score : 0,
          summary: r.summary ?? "",
          strengths: Array.isArray(r.strengths) ? r.strengths : [],
          concerns: Array.isArray(r.concerns) ? r.concerns : [],
          checkPoints: Array.isArray(r.checkPoints) ? r.checkPoints : [],
          positiveEvidence: Array.isArray(r.positiveEvidence) ? r.positiveEvidence : [],
          negativeEvidence: Array.isArray(r.negativeEvidence) ? r.negativeEvidence : [],
          scoreBreakdown: Array.isArray(r.scoreBreakdown) ? r.scoreBreakdown : [],
          resumeExcerpt: r.resumeExcerpt ?? "",
          companyInfoUsed: Array.isArray(r.companyInfoUsed) ? r.companyInfoUsed : [],
          objectUrl: r.objectUrl,
        }))
        .sort((a, b) => b.score - a.score);
      if (sorted.length === 0) throw new Error("empty");
      setResults(sorted);
      setExpanded({});
      sessionStorage.setItem("screening_results", JSON.stringify(sorted));
      sessionStorage.setItem("screening_phase", "result");
      setPhase("result");

      // 履歴に保存（プロプラン限定機能。候補者1人＝1レコード。
      // objectUrl・履歴書PDF原本は保存しない。resumeExcerptのみテキストとして保持する）
      if (user) {
        const batchId = crypto.randomUUID();
        const sharedFields = {
          job_type: jobType,
          required_conditions: { selected: requiredSelected, freeText: requiredConditions.trim() },
          preferred_conditions: {
            selected: preferredSelected,
            freeText: preferredConditions.trim(),
          },
          ideal_person: { selected: idealSelected, freeText: idealPerson.trim() },
          must_have_conditions: mustHaveConditions.trim() || null,
          highly_valued_experience: highlyValuedExperience.trim() || null,
          avoid_personality: avoidPersonality.trim() || null,
          expected_outcome: expectedOutcome.trim() || null,
        };
        const rows = sorted.map((r) => ({
          user_id: user.id,
          batch_id: batchId,
          ...sharedFields,
          candidate_name: r.candidateName,
          file_name: r.fileName,
          resume_excerpt: r.resumeExcerpt || null,
          rank: r.rank,
          score: r.score,
          score_breakdown: r.scoreBreakdown ?? [],
          summary: r.summary,
          strengths: r.strengths,
          concerns: r.concerns,
          check_points: r.checkPoints,
          positive_evidence: r.positiveEvidence ?? [],
          negative_evidence: r.negativeEvidence ?? [],
          company_info_used: r.companyInfoUsed ?? [],
        }));
        const { data: insertedRows, error: historyError } = await supabase
          .from("screening_candidates")
          .insert(rows as never)
          .select("id, candidate_name");
        if (historyError) console.error("screening_candidates INSERT error:", historyError);

        // PDFをSupabase Storageにアップロード
        if (insertedRows && insertedRows.length > 0) {
          for (let i = 0; i < sorted.length; i++) {
            const originalFile = files.find((f) => f.file.name === sorted[i].fileName)?.file;
            const insertedRow = insertedRows[i];
            if (!originalFile || !insertedRow) {
              console.log(
                "PDF skip:",
                sorted[i].fileName,
                "file found:",
                !!originalFile,
                "row:",
                !!insertedRow,
              );
              continue;
            }
            try {
              const storagePath = `${user.id}/${insertedRow.id}.pdf`;
              const { error: uploadError } = await supabase.storage
                .from("resumes")
                .upload(storagePath, originalFile, {
                  contentType: "application/pdf",
                  upsert: true,
                });
              if (uploadError) {
                console.error("PDF upload error:", JSON.stringify(uploadError));
              } else {
                await supabase
                  .from("screening_candidates")
                  .update({ resume_storage_path: storagePath } as never)
                  .eq("id", insertedRow.id);
                console.log("PDF uploaded:", storagePath);
              }
            } catch (e) {
              console.error("PDF upload failed for:", sorted[i].candidateName, e);
            }
          }
        }
      }
    } catch (e) {
      setToast("選考に失敗しました。もう一度お試しください。");
      setPhase("input");
    }
  };

  const resetAll = () => {
    sessionStorage.removeItem("screening_results");
    sessionStorage.removeItem("screening_phase");
    sessionStorage.removeItem("screening_jobType");
    setResults([]);
    setExpanded({});
    setPhase("input");
  };

  const copyResults = async () => {
    const text = results
      .map((r, i) => {
        const m = rankMeta(r.rank);
        return [
          `【${i + 1}位】${r.fileName}`,
          `ランク：${r.rank}（${m.label}）／スコア：${r.score}点`,
          `総評：${r.summary}`,
          `強み：${r.strengths.join("、")}`,
          `気になる点：${r.concerns.join("、")}`,
          `面接で確認すべきこと：${r.checkPoints.join("、")}`,
        ].join("\n");
      })
      .join("\n\n────────────────\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setToast("コピーに失敗しました。");
    }
  };

  const downloadResultsPdf = async () => {
    if (!resultsRef.current || results.length === 0) return;
    setGeneratingPdf(true);
    // PDFには全候補者の詳細（スコア内訳・強み・気になる点など）を含めるため、
    // 一時的に全カードを展開した状態でキャプチャする
    const prevExpanded = expanded;
    const allExpanded: Record<number, boolean> = {};
    results.forEach((r) => {
      allExpanded[r.candidateIndex] = true;
    });
    setExpanded(allExpanded);
    // 展開後のレイアウト確定を待つ
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const node = resultsRef.current;
      const canvas = await html2canvas(node, {
        backgroundColor: "#0F0F0F",
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      pdf.save(`書類選考結果_${jobType || "選考"}_${dateStr}.pdf`);
    } catch (err) {
      console.error("PDF生成エラー:", err);
      setToast("PDFの生成に失敗しました。");
    } finally {
      setExpanded(prevExpanded);
      setGeneratingPdf(false);
    }
  };

  if (authLoading) {
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
  if (!session) return <Navigate to="/login" />;

  const inputStyle: React.CSSProperties = {
    background: "#1A1A1A",
    border: "1px solid #333333",
    color: "#F0F0F0",
    borderRadius: 8,
    padding: "10px 14px",
    width: "100%",
  };
  const headingFont = { fontFamily: "'Space Grotesk', sans-serif" };

  return (
    <div
      className="min-h-screen"
      style={{ background: "#0F0F0F", fontFamily: "'Inter', sans-serif" }}
    >
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1
              className="text-[26px]"
              style={{ ...headingFont, fontWeight: 700, color: "#F0F0F0" }}
            >
              書類選考 AI
            </h1>
            <p className="mt-2 text-[14px]" style={{ color: "#888888" }}>
              採用条件と履歴書をもとに、AIが候補者をランク付けします。
            </p>
          </div>
        </div>

        {/* 会社名入力欄 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
            padding: "10px 14px",
            background: "#1A1A1A",
            border: "1px solid #252525",
            borderRadius: 10,
          }}
        >
          <span style={{ fontSize: 13, color: "#555", flexShrink: 0 }}>会社名</span>
          <input
            type="text"
            value={companyNameInput}
            onChange={(e) => setCompanyNameInput(e.target.value)}
            placeholder="会社名を入力してください"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#F0F0F0",
              fontSize: 14,
            }}
          />
          <button
            onClick={handleSaveCompanyName}
            disabled={companyNameSaving || !companyNameInput.trim()}
            style={{
              background: companyNameSaved ? "#1A3A1A" : "#C8FF00",
              color: companyNameSaved ? "#C8FF00" : "#0F0F0F",
              border: companyNameSaved ? "1px solid #C8FF00" : "none",
              borderRadius: 7,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
              opacity: !companyNameInput.trim() || companyNameSaving ? 0.5 : 1,
            }}
          >
            {companyNameSaved ? "✓ 保存済み" : companyNameSaving ? "保存中..." : "保存"}
          </button>
        </div>

        {phase === "input" && (
          <div className="flex flex-col gap-8">
            {/* STEP 1 */}
            <section
              className="rounded-2xl p-6"
              style={{ background: "#1A1A1A", border: "1px solid #333333" }}
            >
              <h2
                className="mb-5 text-[15px]"
                style={{ ...headingFont, fontWeight: 600, color: "#F0F0F0" }}
              >
                STEP 1 ・ 求人条件の入力
              </h2>

              {presets.length > 0 && (
                <div className="mb-5 flex items-center gap-2">
                  <select
                    value={selectedPresetId}
                    onChange={(e) => setSelectedPresetId(e.target.value)}
                    className="flex-1 appearance-none outline-none"
                    style={inputStyle}
                  >
                    <option value="">保存済みの設定を読み込む...</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleLoadPreset(selectedPresetId)}
                    disabled={!selectedPresetId}
                    className="shrink-0 rounded-lg px-3 py-2 text-[12px] disabled:opacity-40"
                    style={{ background: "#222222", border: "1px solid #333333", color: "#F0F0F0" }}
                  >
                    読み込む
                  </button>
                  {selectedPresetId && (
                    <button
                      type="button"
                      onClick={() => handleDeletePreset(selectedPresetId)}
                      className="shrink-0 rounded-lg px-3 py-2 text-[12px]"
                      style={{ color: "#FF6B6B" }}
                    >
                      削除
                    </button>
                  )}
                </div>
              )}
              <div
                className="mb-6 flex items-center gap-2 rounded-lg p-3"
                style={{ background: "#0F0F0F", border: "1px solid #333333" }}
              >
                <input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="この設定に名前を付けて保存（例：営業職 標準条件）"
                  className="flex-1 outline-none"
                  style={{
                    ...inputStyle,
                    background: "transparent",
                    border: "none",
                    padding: "4px 8px",
                  }}
                />
                <button
                  type="button"
                  onClick={handleSavePreset}
                  disabled={presetSaving}
                  className="shrink-0 rounded-lg px-4 py-2 text-[12px] disabled:opacity-50"
                  style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 600 }}
                >
                  {presetSaving ? "保存中..." : "設定を保存"}
                </button>
              </div>

              <label className="mb-2 block text-[13px]" style={{ color: "#888888" }}>
                募集職種
              </label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                className="appearance-none outline-none"
                style={{ ...inputStyle, borderColor: jobType ? "#C8FF00" : "#333333" }}
              >
                <option value="" disabled>
                  職種を選択してください
                </option>
                {JOB_TYPES.map((j) => (
                  <option key={j} value={j} style={{ background: "#1A1A1A", color: "#F0F0F0" }}>
                    {j}
                  </option>
                ))}
              </select>

              {user && (
                <div className="mt-2">
                  {!companyContextLoaded ? (
                    <p className="text-[12px]" style={{ color: "#888888" }}>
                      マイページの会社情報を確認中...
                    </p>
                  ) : companyContextRef.current ? (
                    <>
                      <label
                        className="flex cursor-pointer items-center gap-2 text-[12px]"
                        style={{ color: useCompanyContext ? "#00CC88" : "#888888" }}
                      >
                        <input
                          type="checkbox"
                          checked={useCompanyContext}
                          onChange={(e) => setUseCompanyContext(e.target.checked)}
                          className="h-4 w-4 shrink-0 accent-[#C8FF00]"
                        />
                        <span>
                          {useCompanyContext
                            ? "✓ マイページの会社情報を評価に反映します"
                            : "マイページの会社情報を評価に反映する（現在OFF）"}
                        </span>
                      </label>
                      {useCompanyContext && companyFieldLabelsRef.current.length > 0 && (
                        <p className="mt-1 ml-6 text-[11px]" style={{ color: "#666666" }}>
                          反映対象：{companyFieldLabelsRef.current.join("・")}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[12px]" style={{ color: "#888888" }}>
                      マイページに会社情報が登録されていません（マイページから登録すると評価精度が上がります）
                    </p>
                  )}
                </div>
              )}

              <label className="mb-2 mt-5 block text-[13px]" style={{ color: "#888888" }}>
                必須条件（該当するものを選択）
              </label>
              <ConditionAccordion
                categories={REQUIRED_CONDITION_CATEGORIES}
                checks={requiredChecks}
                onToggleCheck={makeToggleCheck(setRequiredChecks, setRequiredPriority, "required")}
                values={requiredValues}
                onChangeValue={(id, v) => setRequiredValues((p) => ({ ...p, [id]: v }))}
                multiValues={requiredMultiValues}
                onToggleMultiValue={(id, option) =>
                  setRequiredMultiValues((p) => {
                    const current = p[id] ?? [];
                    const next = current.includes(option)
                      ? current.filter((o) => o !== option)
                      : [...current, option];
                    return { ...p, [id]: next };
                  })
                }
                inexperienceOk={inexperienceOk}
                onToggleInexperienceOk={(id) =>
                  setInexperienceOk((p) => {
                    const next = !p[id];
                    if (next) {
                      // 未経験可をONにしたら、対応するチェック項目はオフにし（排他制御）、
                      // 優先順位リストには「未経験可」項目として追加する（配点対象外・表示のみ）
                      setRequiredChecks((c) => ({ ...c, [id]: false }));
                      setRequiredPriority((prev) => (prev.includes(id) ? prev : [...prev, id]));
                    } else {
                      setRequiredPriority((prev) => prev.filter((x) => x !== id));
                    }
                    return { ...p, [id]: next };
                  })
                }
                openMap={openCategories}
                onToggleCategory={toggleCategory}
              />
              <PriorityList
                priority={requiredPriority}
                categories={REQUIRED_CONDITION_CATEGORIES}
                values={requiredValues}
                multiValues={requiredMultiValues}
                inexperienceOk={inexperienceOk}
                allocation={categoryAllocations.required}
                onMove={(index, direction) =>
                  movePriority(setRequiredPriority, "required", index, direction)
                }
              />
              <label className="mb-2 mt-3 block text-[13px]" style={{ color: "#888888" }}>
                必須条件（その他・自由記述）
              </label>
              <textarea
                value={requiredConditions}
                onChange={(e) => setRequiredConditions(e.target.value)}
                rows={2}
                placeholder="例：上記にない条件があれば入力してください"
                className="outline-none focus:border-[#C8FF00]"
                style={{ ...inputStyle, resize: "vertical" }}
              />

              <label className="mb-2 mt-5 block text-[13px]" style={{ color: "#888888" }}>
                歓迎条件（該当するものを選択）
              </label>
              <ConditionAccordion
                categories={PREFERRED_CONDITION_CATEGORIES}
                checks={preferredChecks}
                onToggleCheck={makeToggleCheck(
                  setPreferredChecks,
                  setPreferredPriority,
                  "preferred",
                )}
                values={preferredValues}
                onChangeValue={(id, v) => setPreferredValues((p) => ({ ...p, [id]: v }))}
                openMap={openCategories}
                onToggleCategory={toggleCategory}
              />
              <PriorityList
                priority={preferredPriority}
                categories={PREFERRED_CONDITION_CATEGORIES}
                values={preferredValues}
                allocation={categoryAllocations.preferred}
                onMove={(index, direction) =>
                  movePriority(setPreferredPriority, "preferred", index, direction)
                }
              />
              <label className="mb-2 mt-3 block text-[13px]" style={{ color: "#888888" }}>
                歓迎条件（その他・自由記述）
              </label>
              <textarea
                value={preferredConditions}
                onChange={(e) => setPreferredConditions(e.target.value)}
                rows={2}
                placeholder="例：上記にない条件があれば入力してください"
                className="outline-none focus:border-[#C8FF00]"
                style={{ ...inputStyle, resize: "vertical" }}
              />

              <label className="mb-2 mt-5 block text-[13px]" style={{ color: "#888888" }}>
                求める人物像（該当するものを選択）
              </label>
              <ConditionAccordion
                categories={IDEAL_PERSON_CATEGORIES}
                checks={idealChecks}
                onToggleCheck={makeToggleCheck(setIdealChecks, setIdealPriority, "ideal")}
                openMap={openCategories}
                onToggleCategory={toggleCategory}
              />
              <PriorityList
                priority={idealPriority}
                categories={IDEAL_PERSON_CATEGORIES}
                allocation={categoryAllocations.ideal}
                onMove={(index, direction) =>
                  movePriority(setIdealPriority, "ideal", index, direction)
                }
              />
              <label className="mb-2 mt-3 block text-[13px]" style={{ color: "#888888" }}>
                求める人物像（その他・自由記述）
              </label>
              <textarea
                value={idealPerson}
                onChange={(e) => setIdealPerson(e.target.value)}
                rows={2}
                placeholder="例：上記にない人物像があれば入力してください"
                className="outline-none focus:border-[#C8FF00]"
                style={{ ...inputStyle, resize: "vertical" }}
              />

              <div className="mt-6 border-t pt-5" style={{ borderColor: "#333333" }}>
                <p className="mb-4 text-[13px]" style={{ color: "#888888" }}>
                  さらに詳しく設定する（任意）
                </p>

                <label className="mb-2 block text-[13px]" style={{ color: "#888888" }}>
                  絶対条件（満たさない場合は不合格としたい条件）
                </label>
                <textarea
                  value={mustHaveConditions}
                  onChange={(e) => setMustHaveConditions(e.target.value)}
                  rows={2}
                  placeholder="例：営業経験3年以上、資格保有必須、土日勤務可能"
                  className="outline-none focus:border-[#C8FF00]"
                  style={{ ...inputStyle, resize: "vertical" }}
                />

                <label className="mb-2 mt-4 block text-[13px]" style={{ color: "#888888" }}>
                  高評価する経験（あれば加点したい経験）
                </label>
                <textarea
                  value={highlyValuedExperience}
                  onChange={(e) => setHighlyValuedExperience(e.target.value)}
                  rows={2}
                  placeholder="例：新規開拓営業経験、大型案件対応経験、チームリーダー経験"
                  className="outline-none focus:border-[#C8FF00]"
                  style={{ ...inputStyle, resize: "vertical" }}
                />

                <label className="mb-2 mt-4 block text-[13px]" style={{ color: "#888888" }}>
                  避けたい人物像（リスクとして注意したい傾向）
                </label>
                <textarea
                  value={avoidPersonality}
                  onChange={(e) => setAvoidPersonality(e.target.value)}
                  rows={2}
                  placeholder="例：指示待ち傾向が強い、短期離職が多い、責任転嫁する傾向がある"
                  className="outline-none focus:border-[#C8FF00]"
                  style={{ ...inputStyle, resize: "vertical" }}
                />

                <label className="mb-2 mt-4 block text-[13px]" style={{ color: "#888888" }}>
                  入社後に期待する成果
                </label>
                <textarea
                  value={expectedOutcome}
                  onChange={(e) => setExpectedOutcome(e.target.value)}
                  rows={2}
                  placeholder="例：3ヶ月以内に一人で営業活動ができる、半年以内に月間売上目標達成"
                  className="outline-none focus:border-[#C8FF00]"
                  style={{ ...inputStyle, resize: "vertical" }}
                />

                <div className="mt-5 border-t pt-4" style={{ borderColor: "#2A2A2A" }}>
                  <label className="mb-1 block text-[13px]" style={{ color: "#888888" }}>
                    必須条件・歓迎条件・求める人物像の重視度
                  </label>
                  <p className="mb-3 text-[11px]" style={{ color: "#666666" }}>
                    スコアにおける各カテゴリの重み（合計に対する比率）を調整できます。デフォルトは必須条件を最も重視する設定です。
                  </p>
                  <CategoryWeightSliders
                    weights={categoryWeights}
                    onChange={setCategoryWeights}
                    hasItems={{
                      required: hasRequiredScored,
                      preferred: preferredPriority.length > 0,
                      ideal: idealPriority.length > 0,
                    }}
                    rankThresholds={rankThresholds}
                    onChangeRankThresholds={setRankThresholds}
                  />
                </div>
              </div>
            </section>

            {/* 残り回数バナー */}
            <div
              className="rounded-xl px-5 py-4 text-[13px]"
              style={{ background: "#1A1A1A", border: "1px solid #333333", color: "#888888" }}
            >
              書類選考は無料・無制限でご利用いただけます
            </div>

            {/* STEP 2 */}
            <section
              className="rounded-2xl p-6"
              style={{ background: "#1A1A1A", border: "1px solid #333333" }}
            >
              <h2
                className="mb-5 text-[15px]"
                style={{ ...headingFont, fontWeight: 600, color: "#F0F0F0" }}
              >
                STEP 2 ・ 履歴書アップロード
              </h2>

              {!canUpload ? (
                <div
                  className="flex flex-col items-center justify-center rounded-xl px-6 py-10 text-center"
                  style={{ border: "1px dashed #333333", background: "#0F0F0F" }}
                >
                  <Lock size={22} color="#888888" />
                  <p className="mt-3 text-[14px]" style={{ color: "#F0F0F0", fontWeight: 500 }}>
                    プロプラン限定です
                  </p>
                  <Link
                    to="/pricing"
                    className="mt-3 text-[13px]"
                    style={{ color: "#C8FF00", fontWeight: 500 }}
                  >
                    プランを見る →
                  </Link>
                </div>
              ) : (
                <>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      addFiles(e.dataTransfer.files);
                    }}
                    className="flex cursor-pointer flex-col items-center justify-center rounded-xl px-6 py-10 text-center transition-colors"
                    style={{
                      border: `1px dashed ${dragOver ? "#C8FF00" : "#333333"}`,
                      background: "#0F0F0F",
                    }}
                  >
                    <Upload size={22} color="#C8FF00" />
                    <p className="mt-3 text-[14px]" style={{ color: "#F0F0F0", fontWeight: 500 }}>
                      PDFをドラッグ&ドロップ、またはクリックして選択
                    </p>
                    <p className="mt-1 text-[12px]" style={{ color: "#888888" }}>
                      最大{maxFiles}件まで（{files.length}/{maxFiles}）
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>

                  {files.length > 0 && (
                    <div className="mt-4 flex flex-col gap-2">
                      {files.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center gap-3 rounded-lg px-4 py-3"
                          style={{ background: "#222222", border: "1px solid #333333" }}
                        >
                          <FileText size={16} color="#C8FF00" className="shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px]" style={{ color: "#F0F0F0" }}>
                              {f.file.name}
                            </div>
                            <div className="text-[11px]" style={{ color: "#888888" }}>
                              {formatSize(f.file.size)}
                            </div>
                          </div>
                          {f.objectUrl && (
                            <a
                              href={f.objectUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded-md border px-2 py-1 text-[11px] transition-colors hover:bg-[#333333]"
                              style={{ borderColor: "#444444", color: "#888888" }}
                              title="履歴書を見る"
                            >
                              開く
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => removeFile(f.id)}
                            className="shrink-0 rounded-md p-1 transition-colors hover:bg-[#333333]"
                            aria-label="削除"
                          >
                            <X size={15} color="#888888" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <button
                type="button"
                disabled={!canStart || !canStartScreening}
                onClick={handleStartClick}
                className="mt-6 w-full rounded-lg px-4 py-3 text-[14px] transition-opacity"
                style={{
                  background: canStart && canStartScreening ? "#C8FF00" : "#333333",
                  color: canStart && canStartScreening ? "#0F0F0F" : "#888888",
                  fontWeight: 600,
                  cursor: canStart && canStartScreening ? "pointer" : "not-allowed",
                }}
              >
                {!canStartScreening
                  ? `今月の上限（月${screeningLimit}回）に達しました`
                  : "AIで書類選考を開始する →"}
              </button>
            </section>
          </div>
        )}

        {phase === "processing" && (
          <div
            className="flex flex-col items-center justify-center rounded-2xl px-6 py-20 text-center"
            style={{ background: "#1A1A1A", border: "1px solid #333333" }}
          >
            <div
              className="h-10 w-10 animate-spin rounded-full"
              style={{ border: "3px solid #333333", borderTopColor: "#C8FF00" }}
            />
            <p className="mt-6 text-[15px]" style={{ color: "#F0F0F0", fontWeight: 500 }}>
              {LOADING_MESSAGES[loadingIndex].replace("候補者の", `候補者${files.length}名の`)}
            </p>
            <p className="mt-2 text-[12px]" style={{ color: "#888888" }}>
              少々お待ちください…
            </p>
          </div>
        )}

        {phase === "result" && (
          <div className="flex flex-col gap-5">
            <h2
              className="text-[18px]"
              style={{ ...headingFont, fontWeight: 600, color: "#F0F0F0" }}
            >
              {results.length}名の書類選考が完了しました
            </h2>

            <div ref={resultsRef} className="flex flex-col gap-5">
              {Array.from(new Set([...RANK_ORDER, ...results.map((r) => r.rank)]))
                .filter((rank) => results.some((r) => r.rank === rank))
                .map((rank, gi) => {
                  const m = rankMeta(rank);
                  const group = results
                    .filter((r) => r.rank === rank)
                    .sort((a, b) => b.score - a.score);
                  const top = gi === 0;
                  return (
                    <section key={rank} className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex items-center justify-center rounded-lg text-center"
                          style={{
                            background: m.bg,
                            color: m.color,
                            border: `1px solid ${m.border}`,
                            width: top ? 44 : 36,
                            height: top ? 44 : 36,
                            ...headingFont,
                            fontWeight: 700,
                            fontSize: top ? 20 : 16,
                          }}
                        >
                          {rank}
                        </span>
                        <span
                          className="text-[14px]"
                          style={{ ...headingFont, fontWeight: 700, color: m.border }}
                        >
                          {m.label}
                        </span>
                        <span className="text-[12px]" style={{ color: "#888888" }}>
                          {group.length}名
                        </span>
                      </div>

                      {group.map((r) => {
                        const key = r.candidateIndex;
                        const open = !!expanded[key];
                        return (
                          <div
                            key={key}
                            className="rounded-2xl p-5"
                            style={{
                              background: top ? "#1F1F12" : "#1A1A1A",
                              border: `1px solid ${top ? m.border : "#333333"}`,
                              boxShadow: top ? `0 0 0 1px ${m.border}33` : "none",
                            }}
                          >
                            <div className="flex items-start gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="truncate text-[14px]"
                                    style={{ color: "#F0F0F0", fontWeight: 700 }}
                                  >
                                    {r.candidateName}
                                  </span>
                                  <span
                                    className="shrink-0 text-[11px]"
                                    style={{ color: "#555555" }}
                                  >
                                    {r.fileName}
                                  </span>
                                  <span
                                    className="shrink-0 text-[13px]"
                                    style={{ color: "#C8FF00", fontWeight: 600 }}
                                  >
                                    {r.score}点
                                  </span>
                                  {r.objectUrl && (
                                    <a
                                      href={r.objectUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="shrink-0 rounded-md border px-2 py-0.5 text-[11px] transition-colors hover:bg-[#222222]"
                                      style={{ borderColor: "#444444", color: "#888888" }}
                                    >
                                      履歴書
                                    </a>
                                  )}
                                </div>
                                <p
                                  className="mt-2 text-[13px] leading-relaxed"
                                  style={{ color: "#888888" }}
                                >
                                  {r.summary}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => setExpanded((p) => ({ ...p, [key]: !p[key] }))}
                                className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[#222222]"
                                aria-label="詳細"
                              >
                                {open ? (
                                  <ChevronUp size={18} color="#888888" />
                                ) : (
                                  <ChevronDown size={18} color="#888888" />
                                )}
                              </button>
                            </div>

                            {open && (
                              <div
                                className="mt-5 flex flex-col gap-5 border-t pt-5"
                                style={{ borderColor: "#333333" }}
                              >
                                {r.scoreBreakdown && r.scoreBreakdown.length > 0 && (
                                  <div>
                                    <div className="mb-2 flex items-center gap-2">
                                      <span
                                        className="text-[13px]"
                                        style={{ color: "#F0F0F0", fontWeight: 700 }}
                                      >
                                        スコア内訳（合計 {r.score}点）
                                      </span>
                                    </div>
                                    <ul className="flex flex-col gap-1">
                                      {r.scoreBreakdown.map((b, i) => (
                                        <li
                                          key={i}
                                          className="flex items-start justify-between gap-3 text-[12px] leading-relaxed"
                                          style={{ color: "#888888" }}
                                        >
                                          <span className="min-w-0 flex-1">
                                            {b.label}
                                            {b.reason && (
                                              <span style={{ color: "#666666" }}>　{b.reason}</span>
                                            )}
                                          </span>
                                          <span
                                            className="shrink-0"
                                            style={{
                                              color: b.points >= 0 ? "#00CC88" : "#CC6666",
                                              fontWeight: 600,
                                            }}
                                          >
                                            {b.points >= 0 ? `+${b.points}` : b.points}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                <ResultSection
                                  icon={<ThumbsUp size={15} color="#00CC88" />}
                                  title="強み"
                                  items={r.strengths}
                                />
                                <ResultSection
                                  icon={<AlertTriangle size={15} color="#CCAA00" />}
                                  title="気になる点"
                                  items={r.concerns}
                                />
                                <ResultSection
                                  icon={<HelpCircle size={15} color="#4DA3FF" />}
                                  title="面接で確認すべきこと"
                                  items={r.checkPoints}
                                />
                                {r.companyInfoUsed && r.companyInfoUsed.length > 0 && (
                                  <div>
                                    <div className="mb-1.5 flex items-center gap-2">
                                      <Building2 size={15} color="#9D7BFF" />
                                      <span
                                        className="text-[13px]"
                                        style={{ color: "#F0F0F0", fontWeight: 700 }}
                                      >
                                        会社情報の反映
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {r.companyInfoUsed.map((label, i) => (
                                        <span
                                          key={i}
                                          className="rounded-md border px-2 py-0.5 text-[11px]"
                                          style={{
                                            borderColor: "#3A3050",
                                            background: "#1A1730",
                                            color: "#C9B8FF",
                                          }}
                                        >
                                          {label}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </section>
                  );
                })}
            </div>

            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={resetAll}
                className="flex items-center gap-2 rounded-lg px-4 py-3 text-[14px]"
                style={{
                  background: "#222222",
                  border: "1px solid #333333",
                  color: "#F0F0F0",
                  fontWeight: 500,
                }}
              >
                <RefreshCw size={15} />
                もう一度選考する
              </button>
              <button
                type="button"
                onClick={copyResults}
                className="flex items-center gap-2 rounded-lg px-4 py-3 text-[14px]"
                style={{
                  background: "#222222",
                  border: "1px solid #333333",
                  color: "#F0F0F0",
                  fontWeight: 500,
                }}
              >
                {copied ? <ClipboardCheck size={15} /> : <Copy size={15} />}
                {copied ? "コピーしました" : "この結果をコピーする"}
              </button>
              <button
                type="button"
                onClick={downloadResultsPdf}
                disabled={generatingPdf}
                className="flex items-center gap-2 rounded-lg px-4 py-3 text-[14px]"
                style={{
                  background: "#C8FF00",
                  color: "#0F0F0F",
                  fontWeight: 600,
                  opacity: generatingPdf ? 0.6 : 1,
                  cursor: generatingPdf ? "default" : "pointer",
                }}
              >
                <Download size={15} />
                {generatingPdf ? "PDFを作成中..." : "PDFで保存する"}
              </button>
            </div>
          </div>
        )}
      </main>

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-3 text-[13px]"
          style={{ background: "#222222", border: "1px solid #333333", color: "#F0F0F0" }}
        >
          {toast}
        </div>
      )}

      {showPriorityConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.6)" }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ background: "#1A1A1A", border: "1px solid #333333" }}
          >
            <div className="mb-2 flex items-center gap-2">
              <ListOrdered size={18} color="#C8FF00" />
              <h3
                className="text-[15px]"
                style={{ ...headingFont, fontWeight: 700, color: "#F0F0F0" }}
              >
                優先順位を確認してください
              </h3>
            </div>
            <p className="mb-5 text-[13px] leading-relaxed" style={{ color: "#888888" }}>
              必須条件・歓迎条件・求める人物像のうち、複数選択しているにもかかわらず優先順位リストを並び替えていない項目があります。
              現在の並び順（チェックした順）のままスコアに反映されますが、優先順位リストを並び替えなくても大丈夫ですか？
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowPriorityConfirm(false)}
                className="w-full rounded-lg px-4 py-3 text-[14px]"
                style={{
                  background: "#222222",
                  border: "1px solid #333333",
                  color: "#F0F0F0",
                  fontWeight: 500,
                }}
              >
                優先順位を見直す
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPriorityConfirm(false);
                  startScreening();
                }}
                className="w-full rounded-lg px-4 py-3 text-[14px]"
                style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 600 }}
              >
                このまま選考を開始する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultSection({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-[13px]" style={{ color: "#F0F0F0", fontWeight: 600 }}>
          {title}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 pl-1">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex gap-2 text-[13px] leading-relaxed"
            style={{ color: "#888888" }}
          >
            <span style={{ color: "#555555" }}>・</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 必須条件・歓迎条件・求める人物像の選択UI（カテゴリごとにアコーディオン展開）
function ConditionAccordion({
  categories,
  checks,
  onToggleCheck,
  values,
  onChangeValue,
  multiValues,
  onToggleMultiValue,
  inexperienceOk,
  onToggleInexperienceOk,
  openMap,
  onToggleCategory,
}: {
  categories: ConditionCategory[];
  checks: Record<string, boolean>;
  onToggleCheck: (id: string) => void;
  values?: Record<string, string>;
  onChangeValue?: (id: string, value: string) => void;
  multiValues?: Record<string, string[]>;
  onToggleMultiValue?: (id: string, option: string) => void;
  inexperienceOk?: Record<string, boolean>;
  onToggleInexperienceOk?: (id: string) => void;
  openMap: Record<string, boolean>;
  onToggleCategory: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {categories.map((cat) => {
        const open = !!openMap[cat.id];
        const checkedCount = cat.items.filter((it) => checks[it.id]).length;
        return (
          <div
            key={cat.id}
            className="rounded-lg"
            style={{ border: "1px solid #333333", background: "#0F0F0F" }}
          >
            <button
              type="button"
              onClick={() => onToggleCategory(cat.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-[13px]" style={{ color: "#F0F0F0", fontWeight: 500 }}>
                {cat.label}
                {checkedCount > 0 && (
                  <span className="ml-2 text-[11px]" style={{ color: "#C8FF00" }}>
                    {checkedCount}件選択中
                  </span>
                )}
              </span>
              {open ? (
                <ChevronUp size={16} color="#888888" />
              ) : (
                <ChevronDown size={16} color="#888888" />
              )}
            </button>
            {open && (
              <div className="flex flex-col gap-2 px-4 pb-4">
                {cat.items.map((item) => {
                  const checked = !!checks[item.id];
                  const inexpActive = !!inexperienceOk?.[item.id];
                  return (
                    <div key={item.id} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          className="flex cursor-pointer items-center gap-2 text-[13px]"
                          style={{ color: inexpActive ? "#666666" : "#F0F0F0" }}
                        >
                          <input
                            type="checkbox"
                            checked={checked && !inexpActive}
                            disabled={inexpActive}
                            onChange={() => onToggleCheck(item.id)}
                            className="h-4 w-4 shrink-0 accent-[#C8FF00]"
                          />
                          <span>{item.label}</span>
                        </label>
                        {item.inexperienceOkToggle && onToggleInexperienceOk && (
                          <button
                            type="button"
                            onClick={() => onToggleInexperienceOk(item.id)}
                            className="shrink-0 rounded-md border px-2.5 py-1 text-[12px] transition-colors"
                            style={
                              inexpActive
                                ? {
                                    background: "#C8FF00",
                                    color: "#0F0F0F",
                                    borderColor: "#C8FF00",
                                    fontWeight: 600,
                                  }
                                : {
                                    background: "transparent",
                                    color: "#888888",
                                    borderColor: "#333333",
                                  }
                            }
                          >
                            未経験可
                          </button>
                        )}
                      </div>
                      {checked &&
                        !inexpActive &&
                        (item.numberInput || item.placeholder) &&
                        onChangeValue && (
                          <div className="ml-6 flex items-center gap-2">
                            <input
                              type={item.numberInput ? "number" : "text"}
                              value={values?.[item.id] ?? ""}
                              onChange={(e) => onChangeValue(item.id, e.target.value)}
                              placeholder={item.numberInput ? "数値を入力" : item.placeholder}
                              className="outline-none focus:border-[#C8FF00]"
                              style={{
                                background: "#1A1A1A",
                                border: "1px solid #333333",
                                color: "#F0F0F0",
                                borderRadius: 6,
                                padding: "6px 10px",
                                width: item.numberInput ? 100 : "100%",
                                fontSize: 13,
                              }}
                            />
                            {item.numberInput && item.unit && (
                              <span className="text-[12px]" style={{ color: "#888888" }}>
                                {item.unit}
                              </span>
                            )}
                          </div>
                        )}
                      {checked && !inexpActive && item.multiSelectOptions && onToggleMultiValue && (
                        <div className="ml-6 flex flex-wrap gap-2">
                          {item.multiSelectOptions.map((opt) => {
                            const selected = (multiValues?.[item.id] ?? []).includes(opt);
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => onToggleMultiValue(item.id, opt)}
                                className="rounded-md border px-2.5 py-1 text-[12px] transition-colors"
                                style={
                                  selected
                                    ? {
                                        background: "#C8FF00",
                                        color: "#0F0F0F",
                                        borderColor: "#C8FF00",
                                        fontWeight: 600,
                                      }
                                    : {
                                        background: "transparent",
                                        color: "#888888",
                                        borderColor: "#333333",
                                      }
                                }
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 優先順位リスト：チェックした項目を「重要な順」に上下矢印で並び替えるUI。
// 1位が最も配点が高く、下位ほど配点が低くなる（線形減衰）。
function PriorityList({
  priority,
  categories,
  values,
  multiValues,
  inexperienceOk,
  allocation,
  onMove,
}: {
  priority: string[];
  categories: ConditionCategory[];
  values?: Record<string, string>;
  multiValues?: Record<string, string[]>;
  inexperienceOk?: Record<string, boolean>;
  allocation: number;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  if (priority.length === 0) return null;
  const itemMap: Record<string, ConditionItem> = {};
  for (const cat of categories) {
    for (const item of cat.items) {
      itemMap[item.id] = item;
    }
  }
  // 「未経験可」項目は配点対象外（表示のみ）として、配点計算からは除外する
  const isScored = (id: string) => !(itemMap[id]?.inexperienceOkToggle && inexperienceOk?.[id]);
  const scoredPriority = priority.filter(isScored);
  const points = allocatePointsByPriority(scoredPriority, allocation);
  // 項目のラベルに、数値入力・自由記述・複数選択などの入力値や「未経験可」を付加して表示する
  const displayLabel = (id: string): string => {
    const item = itemMap[id];
    if (!item) return id;
    if (item.inexperienceOkToggle && inexperienceOk?.[id]) {
      return `${item.label}（未経験可）`;
    }
    if (item.multiSelectOptions) {
      const selected = multiValues?.[id] ?? [];
      return selected.length > 0 ? `${item.label}：${selected.join("・")}` : item.label;
    }
    const val = values?.[id]?.trim();
    if (item.numberInput && val) return `${item.label}（${val}${item.unit ?? ""}）`;
    if (item.placeholder && val) return `${item.label}：${val}`;
    return item.label;
  };
  return (
    <div
      className="mt-3 rounded-lg p-3"
      style={{ border: "1px solid #333333", background: "#0F0F0F" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <ListOrdered size={14} color="#C8FF00" />
        <span className="text-[12px]" style={{ color: "#F0F0F0", fontWeight: 600 }}>
          優先順位（重要な順に並び替えてください）
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {priority.map((id, idx) => (
          <div
            key={id}
            className="flex items-center gap-2 rounded-md px-2.5 py-1.5"
            style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]"
              style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
            >
              {idx + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "#F0F0F0" }}>
              {displayLabel(id)}
            </span>
            <span className="shrink-0 text-[11px]" style={{ color: "#888888" }}>
              {isScored(id) ? `${points[id] ?? 0}点` : "対象外"}
            </span>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => onMove(idx, -1)}
                disabled={idx === 0}
                className="rounded p-1 transition-colors hover:bg-[#2A2A2A] disabled:opacity-30"
                aria-label="上に移動"
              >
                <ArrowUp size={13} color="#888888" />
              </button>
              <button
                type="button"
                onClick={() => onMove(idx, 1)}
                disabled={idx === priority.length - 1}
                className="rounded p-1 transition-colors hover:bg-[#2A2A2A] disabled:opacity-30"
                aria-label="下に移動"
              >
                <ArrowDown size={13} color="#888888" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 必須条件・歓迎条件・求める人物像の重み（カテゴリ間の配点比率）を調整するスライダー群。
// 各スライダーの値は相対比率（合計が100でなくても良い）で、表示時に正規化して
// 「実際の配点（70点満点中の何点か）」をパーセンテージとして示す。
function CategoryWeightSliders({
  weights,
  onChange,
  hasItems,
  rankThresholds,
  onChangeRankThresholds,
}: {
  weights: CategoryWeights;
  onChange: (w: CategoryWeights) => void;
  hasItems: { required: boolean; preferred: boolean; ideal: boolean };
  rankThresholds: RankThresholds;
  onChangeRankThresholds: (t: RankThresholds) => void;
}) {
  // 表示用の配点計算（スライダーの比率をそのまま表示、チェック状況はhasItemsで反映）
  const allocations = getCategoryAllocations(weights, hasItems);
  const rows: { key: keyof CategoryWeights; label: string }[] = [
    { key: "required", label: "必須条件" },
    { key: "preferred", label: "歓迎条件" },
    { key: "ideal", label: "求める人物像" },
  ];

  // ランク基準のバリデーション（A > B > C の順であること）
  const rankError =
    rankThresholds.a <= rankThresholds.b || rankThresholds.b <= rankThresholds.c
      ? "A > B > C の順に設定してください"
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {rows.map(({ key, label }) => {
          const disabled = !hasItems[key];
          return (
            <div key={key} style={{ opacity: disabled ? 0.4 : 1 }}>
              <div
                className="mb-1 flex items-center justify-between text-[12px]"
                style={{ color: "#F0F0F0" }}
              >
                <span>{label}</span>
                <span style={{ color: disabled ? "#666666" : "#C8FF00", fontWeight: 600 }}>
                  {disabled ? "チェックなし（0点）" : `${allocations[key]}点`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={weights[key]}
                disabled={disabled}
                onChange={(e) => onChange({ ...weights, [key]: Number(e.target.value) })}
                className="w-full accent-[#C8FF00]"
                style={{ cursor: disabled ? "not-allowed" : "pointer" }}
              />
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => onChange(DEFAULT_CATEGORY_WEIGHTS)}
          className="mt-1 self-start text-[11px] underline"
          style={{ color: "#888888" }}
        >
          デフォルト（必須:歓迎:人物像 = 5:2:3）に戻す
        </button>
      </div>

      <div className="border-t pt-4" style={{ borderColor: "#2A2A2A" }}>
        <div className="mb-1 text-[13px]" style={{ color: "#888888" }}>
          ランク基準（何点以上でAなどを設定）
        </div>
        <p className="mb-3 text-[11px]" style={{ color: "#666666" }}>
          書類選考の合否感覚に合わせて調整してください。デフォルトは65/50/38点です。
        </p>
        <div className="flex flex-col gap-2">
          {(
            [
              { key: "a" as const, label: "A（ぜひ会いたい）", color: "#00CC88" },
              { key: "b" as const, label: "B（会ってみたい）", color: "#4DA3FF" },
              { key: "c" as const, label: "C（再検討）", color: "#CCAA00" },
            ] as const
          ).map(({ key, label, color }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-36 shrink-0 text-[12px]" style={{ color }}>
                {label}
              </span>
              <input
                type="number"
                min={1}
                max={99}
                value={rankThresholds[key]}
                onChange={(e) => {
                  const val = Math.min(99, Math.max(1, Number(e.target.value)));
                  onChangeRankThresholds({ ...rankThresholds, [key]: val });
                }}
                className="w-20 rounded-lg px-3 py-2 text-center text-[13px] outline-none focus:border-[#C8FF00]"
                style={{ background: "#1A1A1A", border: "1px solid #333333", color: "#F0F0F0" }}
              />
              <span className="text-[12px]" style={{ color: "#666666" }}>
                点以上
              </span>
            </div>
          ))}
          {rankError && (
            <p className="text-[11px]" style={{ color: "#CC6666" }}>
              {rankError}
            </p>
          )}
          <div className="text-[11px]" style={{ color: "#666666" }}>
            {rankThresholds.c - 1}点以下 → D（見送り）
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChangeRankThresholds(DEFAULT_RANK_THRESHOLDS)}
          className="mt-2 self-start text-[11px] underline"
          style={{ color: "#888888" }}
        >
          デフォルト（65/50/38点）に戻す
        </button>
      </div>
    </div>
  );
}
