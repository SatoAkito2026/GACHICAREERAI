import { getAuthHeaders } from "@/lib/chat-api";
import { useEffect, useState } from "react";
import { Lock, Loader2, Sparkles, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { usePlan } from "@/hooks/use-plan";
import { supabase } from "@/integrations/supabase/client";

const CARD_STYLE = { border: "1px solid #2A2A2A", background: "#1A1A1A" } as const;
const ROW_BORDER = "1px solid #2A2A2A";

type FieldKey =
  | "company_name"
  | "company_number"
  | "company_address"
  | "founded_year"
  | "employee_count"
  | "industry"
  | "business_description"
  | "hiring_positions"
  | "ideal_candidate"
  | "company_culture"
  | "salary_range"
  | "remote_policy"
  | "company_strengths"
  | "competitive_advantage"
  | "competitors"
  | "successful_hire_traits"
  | "failed_hire_traits"
  | "first_job_description"
  | "interview_focus";

type FormState = Record<FieldKey, string>;

const EMPTY: FormState = {
  company_name: "",
  company_number: "",
  company_address: "",
  founded_year: "",
  employee_count: "",
  industry: "",
  business_description: "",
  hiring_positions: "",
  ideal_candidate: "",
  company_culture: "",
  salary_range: "",
  remote_policy: "",
  company_strengths: "",
  competitive_advantage: "",
  competitors: "",
  successful_hire_traits: "",
  failed_hire_traits: "",
  first_job_description: "",
  interview_focus: "",
};

const ALL_KEYS = Object.keys(EMPTY) as FieldKey[];

const REMOTE_OPTIONS = ["フルリモート", "一部リモート", "出社のみ"];

type FieldDef = {
  key: FieldKey;
  label: string;
  placeholder?: string;
  textarea?: boolean;
  select?: string[];
};

const BASIC_FIELDS: FieldDef[] = [
  { key: "company_name", label: "会社名" },
  {
    key: "company_number",
    label: "法人番号（13桁・T対応）",
    placeholder: "1234567890123 または T1234567890123",
  },
  { key: "company_address", label: "所在地" },
  { key: "founded_year", label: "設立年", placeholder: "例：2010" },
  { key: "employee_count", label: "従業員数", placeholder: "例：50名" },
  { key: "industry", label: "業種" },
  { key: "business_description", label: "事業内容", textarea: true },
];

const HIRING_FIELDS: FieldDef[] = [
  {
    key: "hiring_positions",
    label: "採用職種（カンマ区切り）",
    placeholder: "例：営業, エンジニア, 経理",
  },
  { key: "ideal_candidate", label: "求める人物像", textarea: true },
  { key: "company_culture", label: "社風・文化", textarea: true },
  { key: "salary_range", label: "給与レンジ", placeholder: "例：400〜600万円" },
  { key: "remote_policy", label: "リモート可否", select: REMOTE_OPTIONS },
];

const INTERVIEW_FIELDS: FieldDef[] = [
  { key: "company_strengths", label: "自社の強み", textarea: true },
  { key: "competitive_advantage", label: "競合との差別化", textarea: true },
  { key: "competitors", label: "業界内での位ち位置・市場の状況", textarea: true },
  { key: "successful_hire_traits", label: "活躍している社員の特徴", textarea: true },
  { key: "failed_hire_traits", label: "採用が失敗したときの傾向", textarea: true },
  { key: "first_job_description", label: "入社後最初に任せる仕事", textarea: true },
  { key: "interview_focus", label: "選考で重視する評価軸（職務適性など）", textarea: true },
];

function normalizeCompanyNumber(v: string) {
  return v
    .replace(/[^0-9T]/gi, "")
    .replace(/^T/i, "")
    .slice(0, 13);
}

function Field({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const baseStyle: React.CSSProperties = {
    background: "#121212",
    border: "1px solid #2A2A2A",
    color: "#F0F0F0",
  };
  return (
    <div className="px-5 py-3" style={{ borderBottom: ROW_BORDER }}>
      <label className="mb-1.5 block text-[12px]" style={{ color: "#888888", fontWeight: 500 }}>
        {def.label}
      </label>
      {def.select ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md px-3 py-2 text-[14px] outline-none"
          style={baseStyle}
        >
          <option value="">未選択</option>
          {def.select.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : def.textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full resize-y rounded-md px-3 py-2 text-[14px] outline-none focus:border-[#C8FF00]"
          style={baseStyle}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
          className="w-full rounded-md px-3 py-2 text-[14px] outline-none focus:border-[#C8FF00]"
          style={baseStyle}
        />
      )}
    </div>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-5 py-2.5 text-[12px]"
      style={{ color: "#C8FF00", fontWeight: 600, borderBottom: ROW_BORDER, background: "#161616" }}
    >
      {children}
    </div>
  );
}

export default function CompanyInfoSection() {
  const { user } = useAuth();
  const { plan } = usePlan();
  const isPro = plan === "company_pro" || plan === "individual_pro";

  const [form, setForm] = useState<FormState>(EMPTY);
  const [tab, setTab] = useState<"manual" | "ai">("manual");
  const [saving, setSaving] = useState(false);
  const [researching, setResearching] = useState(false);
  const [aiPreviewed, setAiPreviewed] = useState(false);
  const [companyUrl, setCompanyUrl] = useState("");

  useEffect(() => {
    if (!user || !isPro) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select(ALL_KEYS.join(","))
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        const next = { ...EMPTY };
        for (const k of ALL_KEYS) {
          const v = (data as unknown as Record<string, unknown>)[k];
          if (typeof v === "string") next[k] = v;
        }
        setForm(next);
      }
    })();
  }, [user, isPro]);

  const setField = (k: FieldKey, v: string) =>
    setForm((p) => ({ ...p, [k]: k === "company_number" ? normalizeCompanyNumber(v) : v }));

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const k of ALL_KEYS) payload[k] = form[k];
      const { error } = await supabase
        .from("profiles")
        .update(payload as never)
        .eq("id", user.id);
      if (error) {
        console.error(error);
        toast.error("保存に失敗しました。");
      } else {
        toast.success("会社情報を保存しました");
        setAiPreviewed(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResearch = async () => {
    if (!form.company_name.trim()) {
      toast.error("会社名を入力してください。");
      return;
    }
    setResearching(true);
    try {
      const res = await fetch("/api/research-company", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          company_name: form.company_name,
          company_number: form.company_number,
          company_url: companyUrl.trim(),
        }),
      });
      if (!res.ok) {
        toast.error(
          res.status === 402
            ? "AIの利用上限に達しました。"
            : res.status === 429
              ? "混み合っています。しばらくしてからお試しください。"
              : "AI収集に失敗しました。",
        );
        return;
      }
      const d = await res.json();
      setForm((p) => ({
        ...p,
        company_name: d.company_name || p.company_name,
        company_address: d.address || p.company_address,
        founded_year: d.founded_year || p.founded_year,
        employee_count: d.employee_count || p.employee_count,
        industry: d.industry || p.industry,
        business_description: d.business_description || p.business_description,
        ideal_candidate: d.ideal_candidate || p.ideal_candidate,
        company_culture: d.company_culture || p.company_culture,
        successful_hire_traits: d.successful_hire_traits || p.successful_hire_traits,
        company_strengths: d.strengths || p.company_strengths,
        competitive_advantage: d.competitors || p.competitive_advantage,
      }));
      setAiPreviewed(true);
      toast.success("AIが会社情報を収集しました");
    } catch (e) {
      console.error(e);
      toast.error("AI収集に失敗しました。");
    } finally {
      setResearching(false);
    }
  };

  // Locked state for non-pro users
  if (!isPro) {
    return (
      <section className="relative mt-6 overflow-hidden rounded-2xl" style={CARD_STYLE}>
        <div
          className="flex items-center gap-2 px-5 py-4 text-[13px] tracking-wide"
          style={{ color: "#666666", fontWeight: 700, borderBottom: ROW_BORDER }}
        >
          <Lock size={14} />
          会社情報（プロプラン限定）
        </div>
        <div
          className="flex flex-col items-center gap-3 px-5 py-10 text-center"
          style={{ opacity: 0.6 }}
        >
          <Lock size={28} style={{ color: "#666666" }} />
          <p className="text-[14px]" style={{ color: "#888888" }}>
            プロプランにアップグレードすると利用できます
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl" style={CARD_STYLE}>
      <div
        className="px-5 py-4 text-[13px] tracking-wide"
        style={{ color: "#C8FF00", fontWeight: 700, borderBottom: ROW_BORDER }}
      >
        会社情報
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 pt-4">
        {(["manual", "ai"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="rounded-md px-4 py-2 text-[13px] transition-colors"
            style={{
              fontWeight: 600,
              background: tab === t ? "#C8FF00" : "transparent",
              color: tab === t ? "#0F0F0F" : "#888888",
              border: tab === t ? "none" : "1px solid #2A2A2A",
            }}
          >
            {t === "manual" ? "手動入力" : "AI学習モード"}
          </button>
        ))}
      </div>

      {tab === "ai" && (
        <div className="px-5 pt-4">
          <p className="mb-3 text-[12px] leading-relaxed" style={{ color: "#888888" }}>
            会社名・法人番号・企業URLをもとに、AIが公開情報を収集して各項目にプレビュー表示します。
          </p>
          <div className="mb-3 flex flex-col gap-1.5">
            <label className="text-[12px]" style={{ color: "#888888", fontWeight: 500 }}>
              企業URL（任意・入力すると精度が上がります）
            </label>
            <input
              type="url"
              value={companyUrl}
              onChange={(e) => setCompanyUrl(e.target.value)}
              placeholder="https://www.example.co.jp"
              className="w-full rounded-md px-3 py-2 text-[14px] outline-none"
              style={{ background: "#121212", border: "1px solid #2A2A2A", color: "#F0F0F0" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#C8FF00")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#2A2A2A")}
            />
          </div>
          <button
            type="button"
            onClick={handleResearch}
            disabled={researching}
            className="flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-[14px] disabled:opacity-60"
            style={{
              background: "#1F2A00",
              border: "1px solid #C8FF00",
              color: "#C8FF00",
              fontWeight: 600,
            }}
          >
            {researching ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {researching ? "AIが収集中..." : "AIで会社情報を自動収集する"}
          </button>
          {aiPreviewed && (
            <p
              className="mt-3 rounded-md px-3 py-2 text-[12px] leading-relaxed"
              style={{ background: "#2A2200", border: "1px solid #5A4A00", color: "#E8C84A" }}
            >
              この情報は正しいですか？内容を確認・編集してから保存してください。
            </p>
          )}
          <p className="mt-2 text-[11px]" style={{ color: "#666666" }}>
            AI収集情報は参考情報です。正確性は必ずご確認ください。
          </p>
        </div>
      )}

      <div className="mt-4">
        <GroupTitle>基本情報</GroupTitle>
        {BASIC_FIELDS.map((f) => (
          <Field key={f.key} def={f} value={form[f.key]} onChange={(v) => setField(f.key, v)} />
        ))}
        <GroupTitle>採用情報</GroupTitle>
        {HIRING_FIELDS.map((f) => (
          <Field key={f.key} def={f} value={form[f.key]} onChange={(v) => setField(f.key, v)} />
        ))}
        <GroupTitle>面接強化情報</GroupTitle>
        {INTERVIEW_FIELDS.map((f) => (
          <Field key={f.key} def={f} value={form[f.key]} onChange={(v) => setField(f.key, v)} />
        ))}
      </div>

      <div className="px-5 py-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-[14px] disabled:opacity-60"
          style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          保存する
        </button>
      </div>
    </section>
  );
}
