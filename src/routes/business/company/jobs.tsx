import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { usePlan } from "@/hooks/use-plan";
import { supabase } from "@/integrations/supabase/client";
import { BusinessShell } from "@/components/ModeShell";

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
const EMPLOYMENT_TYPES = ["正社員", "契約社員", "業務委託", "アルバイト・パート", "インターン"];

type Preset = { id: string; name: string };
type JobPosting = {
  id: string;
  title: string;
  job_type: string | null;
  employment_type: string | null;
  description: string | null;
  salary_range: string | null;
  location: string | null;
  work_style: string | null;
  working_hours: string | null;
  holidays: string | null;
  benefits: string | null;
  selection_process: string | null;
  application_requirements: string | null;
  ideal_candidate: string | null;
  successful_hire_traits: string | null;
  company_appeal: string | null;
  thumbnail_path: string | null;
  status: "open" | "closed";
  screening_preset_id: string | null;
  created_at: string;
};
type Applicant = {
  id: string;
  applicant_user_id: string;
  status: string;
  rank: string | null;
  score: number | null;
  summary: string | null;
  strengths: string[];
  concerns: string[];
  created_at: string;
};

export const Route = createFileRoute("/business/company/jobs")({
  head: () => ({ meta: [{ title: "求人掲載｜インタビアAI" }] }),
  component: JobsPage,
});

const RANK_COLORS: Record<string, string> = {
  A: "#C8FF00",
  B: "#00CC88",
  C: "#CCAA00",
  D: "#CC4444",
};
const inputStyle = {
  background: "#0F0F0F",
  border: "1px solid #333333",
  borderRadius: 8,
  color: "#F0F0F0",
  padding: "9px 12px",
  width: "100%",
  fontSize: 13,
} as const;
const cardStyle = { background: "#1A1A1A", border: "1px solid #333333", borderRadius: 16 } as const;
const SUPABASE_STORAGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/job-thumbnails/`;

function FormField({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <label style={{ color: "#AAAAAA", fontSize: 12 }}>{label}</label>
      <div className="mt-1">{children}</div>
      {hint && (
        <p className="mt-1" style={{ color: "#666666", fontSize: 11 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function CultureSliderInput({
  leftLabel,
  rightLabel,
  value,
  onChange,
}: {
  leftLabel: string;
  rightLabel: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex justify-between" style={{ fontSize: 11 }}>
        <span
          style={{ color: value <= 2 ? "#C8FF00" : "#888888", fontWeight: value <= 2 ? 700 : 400 }}
        >
          {leftLabel}
        </span>
        <span
          style={{ color: value >= 4 ? "#C8FF00" : "#888888", fontWeight: value >= 4 ? 700 : 400 }}
        >
          {rightLabel}
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#C8FF00]"
      />
    </div>
  );
}

function CultureMeter({
  leftLabel,
  rightLabel,
  value,
}: {
  leftLabel: string;
  rightLabel: string;
  value: number;
}) {
  const pct = ((value - 1) / 4) * 100;
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between" style={{ fontSize: 10, color: "#888888" }}>
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <div className="relative h-1.5 rounded-full" style={{ background: "#2A2A2A" }}>
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full"
          style={{ left: `calc(${pct}% - 6px)`, background: "#C8FF00" }}
        />
      </div>
    </div>
  );
}

function JobsPage() {
  const { user, session, loading } = useAuth();
  const { plan } = usePlan();
  const canPostJobs = plan === "company_light" || plan === "company_pro";

  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedApplicants, setExpandedApplicants] = useState<Record<string, Applicant[]>>({});
  const [loadingApplicants, setLoadingApplicants] = useState<string | null>(null);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [jobType, setJobType] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [description, setDescription] = useState("");
  const [salaryRange, setSalaryRange] = useState("");
  const [location, setLocation] = useState("");
  const [workStyle, setWorkStyle] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [holidays, setHolidays] = useState("");
  const [benefits, setBenefits] = useState("");
  const [selectionProcess, setSelectionProcess] = useState("");
  const [applicationRequirements, setApplicationRequirements] = useState("");
  const [idealCandidate, setIdealCandidate] = useState("");
  const [successfulHireTraits, setSuccessfulHireTraits] = useState("");
  const [companyAppeal, setCompanyAppeal] = useState("");
  const [thumbnailPath, setThumbnailPath] = useState("");
  const [presetId, setPresetId] = useState("");
  const [culturePace, setCulturePace] = useState(3);
  const [cultureTeam, setCultureTeam] = useState(3);
  const [cultureSpeed, setCultureSpeed] = useState(3);
  const [cultureAge, setCultureAge] = useState(3);
  const [cultureGrowth, setCultureGrowth] = useState(3);

  const loadData = async () => {
    if (!user) return;
    const [{ data: jobs }, { data: presetRows }] = await Promise.all([
      supabase
        .from("job_postings")
        .select("*")
        .eq("company_user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("screening_criteria_presets")
        .select("id, name")
        .eq("company_user_id", user.id)
        .order("updated_at", { ascending: false }),
    ]);
    setPostings((jobs ?? []) as JobPosting[]);
    setPresets((presetRows ?? []) as Preset[]);
    setFetching(false);
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading || fetching) {
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

  const resetForm = () => {
    setTitle("");
    setJobType("");
    setEmploymentType("");
    setDescription("");
    setSalaryRange("");
    setLocation("");
    setWorkStyle("");
    setWorkingHours("");
    setHolidays("");
    setBenefits("");
    setSelectionProcess("");
    setApplicationRequirements("");
    setIdealCandidate("");
    setSuccessfulHireTraits("");
    setCompanyAppeal("");
    setThumbnailPath("");
    setPresetId("");
    setCulturePace(3);
    setCultureTeam(3);
    setCultureSpeed(3);
    setCultureAge(3);
    setCultureGrowth(3);
  };

  const handleThumbnailSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("画像ファイルを選んでください");
      return;
    }
    setUploadingThumb(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("job-thumbnails")
        .upload(path, file, { upsert: true });
      if (error) throw error;
      setThumbnailPath(path);
      toast.success("画像をアップロードしました");
    } catch (err) {
      console.error(err);
      toast.error("アップロードに失敗しました");
    } finally {
      setUploadingThumb(false);
    }
  };

  const handleCreate = async () => {
    if (!user) return;
    if (!title.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("job_postings").insert({
        company_user_id: user.id,
        title: title.trim(),
        job_type: jobType || null,
        employment_type: employmentType || null,
        description: description.trim() || null,
        salary_range: salaryRange.trim() || null,
        location: location.trim() || null,
        work_style: workStyle.trim() || null,
        working_hours: workingHours.trim() || null,
        holidays: holidays.trim() || null,
        benefits: benefits.trim() || null,
        selection_process: selectionProcess.trim() || null,
        application_requirements: applicationRequirements.trim() || null,
        ideal_candidate: idealCandidate.trim() || null,
        successful_hire_traits: successfulHireTraits.trim() || null,
        company_appeal: companyAppeal.trim() || null,
        thumbnail_path: thumbnailPath || null,
        screening_preset_id: presetId || null,
        culture_pace: culturePace,
        culture_team: cultureTeam,
        culture_speed: cultureSpeed,
        culture_age: cultureAge,
        culture_growth: cultureGrowth,
        status: "open",
      } as any);
      if (error) throw error;
      resetForm();
      setShowForm(false);
      void loadData();
      toast.success("求人を掲載しました");
    } catch (e) {
      console.error(e);
      toast.error("作成に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (job: JobPosting) => {
    const nextStatus = job.status === "open" ? "closed" : "open";
    await supabase.from("job_postings").update({ status: nextStatus }).eq("id", job.id);
    setPostings((prev) => prev.map((p) => (p.id === job.id ? { ...p, status: nextStatus } : p)));
  };

  const handleDelete = async (id: string) => {
    await supabase.from("job_postings").delete().eq("id", id);
    setPostings((prev) => prev.filter((p) => p.id !== id));
  };

  const loadApplicants = async (jobId: string) => {
    if (expandedApplicants[jobId]) {
      setExpandedApplicants((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
      return;
    }
    setLoadingApplicants(jobId);
    const { data } = await supabase
      .from("job_applications")
      .select(
        "id, applicant_user_id, status, rank, score, summary, strengths, concerns, created_at",
      )
      .eq("job_posting_id", jobId)
      .order("score", { ascending: false, nullsFirst: false });
    setExpandedApplicants((prev) => ({ ...prev, [jobId]: (data ?? []) as Applicant[] }));
    setLoadingApplicants(null);
  };

  if (!canPostJobs) {
    return (
      <BusinessShell>
        <div className="mx-auto max-w-2xl px-6 py-10">
          <h1 className="text-[22px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
            求人掲載
          </h1>
          <div className="mt-6 rounded-2xl p-6 text-center" style={cardStyle}>
            <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 600 }}>
              ライト/プロプラン限定機能です
            </p>
            <p className="mt-2" style={{ color: "#888888", fontSize: 13 }}>
              求人掲載機能は、ライトプラン・プロプランでご利用いただけます。
            </p>
          </div>
        </div>
      </BusinessShell>
    );
  }

  return (
    <BusinessShell>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
            求人掲載
          </h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-full px-4 py-2 text-[13px]"
            style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
          >
            {showForm ? "閉じる" : "＋新規求人を作成"}
          </button>
        </div>

        {showForm && (
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="col-span-2 rounded-2xl p-5" style={cardStyle}>
              <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                基本情報
              </p>

              <FormField label="サムネイル画像（任意）">
                <div className="flex items-center gap-3">
                  {thumbnailPath && (
                    <img
                      src={`${SUPABASE_STORAGE_BASE}${thumbnailPath}`}
                      alt="サムネイル"
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => thumbInputRef.current?.click()}
                    disabled={uploadingThumb}
                    className="rounded-lg px-3 py-2 text-[12px]"
                    style={{ background: "#222222", border: "1px solid #333333", color: "#F0F0F0" }}
                  >
                    {uploadingThumb ? "アップロード中..." : "📷 画像を選ぶ"}
                  </button>
                  <input
                    type="file"
                    accept="image/*"
                    ref={thumbInputRef}
                    onChange={handleThumbnailSelect}
                    className="hidden"
                  />
                </div>
              </FormField>

              <FormField label="求人タイトル">
                <input
                  style={inputStyle}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例：法人営業（未経験歓迎）"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="職種">
                  <select
                    style={inputStyle}
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                  >
                    <option value="">選択してください</option>
                    {JOB_TYPES.map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="雇用形態">
                  <select
                    style={inputStyle}
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                  >
                    <option value="">選択してください</option>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="給与">
                  <input
                    style={inputStyle}
                    value={salaryRange}
                    onChange={(e) => setSalaryRange(e.target.value)}
                    placeholder="例：月給25万円〜"
                  />
                </FormField>
                <FormField label="勤務地">
                  <input
                    style={inputStyle}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="例：東京都渋谷区"
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="勤務時間">
                  <input
                    style={inputStyle}
                    value={workingHours}
                    onChange={(e) => setWorkingHours(e.target.value)}
                    placeholder="例：9:00〜18:00（休憩1h）"
                  />
                </FormField>
                <FormField label="休日・休暇">
                  <input
                    style={inputStyle}
                    value={holidays}
                    onChange={(e) => setHolidays(e.target.value)}
                    placeholder="例：土日祝、年間休日120日"
                  />
                </FormField>
              </div>
              <FormField label="働き方">
                <input
                  style={inputStyle}
                  value={workStyle}
                  onChange={(e) => setWorkStyle(e.target.value)}
                  placeholder="例：フルリモート可、フレックス"
                />
              </FormField>
              <FormField label="福利厚生">
                <textarea
                  style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                  value={benefits}
                  onChange={(e) => setBenefits(e.target.value)}
                  placeholder="例：社会保険完備、交通費支給、資格手当"
                />
              </FormField>

              <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700, margin: "16px 0 10px" }}>
                仕事内容・アピール
              </p>
              <FormField label="仕事内容">
                <textarea
                  style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="具体的な業務内容"
                />
              </FormField>
              <FormField label="この求人ならではのアピールポイント">
                <textarea
                  style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
                  value={companyAppeal}
                  onChange={(e) => setCompanyAppeal(e.target.value)}
                  placeholder="この仕事・チームならではの魅力"
                />
              </FormField>
              <FormField label="応募資格">
                <textarea
                  style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                  value={applicationRequirements}
                  onChange={(e) => setApplicationRequirements(e.target.value)}
                  placeholder="例：普通自動車免許、実務経験2年以上（未経験可の場合はその旨）"
                />
              </FormField>
              <FormField label="選考フロー">
                <textarea
                  style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                  value={selectionProcess}
                  onChange={(e) => setSelectionProcess(e.target.value)}
                  placeholder="例：書類選考→面接1回→内定"
                />
              </FormField>

              <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700, margin: "16px 0 10px" }}>
                この求人が求める人材（他社との差別化ポイント）
              </p>
              <FormField
                label="求める人材像"
                hint="この求人特有の人物像。企業設定の内容に加えて、この求人ならではの観点があれば"
              >
                <textarea
                  style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
                  value={idealCandidate}
                  onChange={(e) => setIdealCandidate(e.target.value)}
                  placeholder="例：粘り強く行動できる人、チームで成果を出すのが好きな人"
                />
              </FormField>
              <FormField label="活躍している人材の特徴">
                <textarea
                  style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
                  value={successfulHireTraits}
                  onChange={(e) => setSuccessfulHireTraits(e.target.value)}
                  placeholder="例：既存メンバーで成果を出している人の共通点"
                />
              </FormField>

              <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700, margin: "16px 0 10px" }}>
                社風・働き方診断
              </p>
              <p style={{ color: "#666666", fontSize: 11, marginBottom: 10 }}>
                職場の雰囲気を5段階のスライダーで伝えます。応募者の一覧・詳細画面に表示されます。
              </p>
              <CultureSliderInput
                leftLabel="落ち着いている"
                rightLabel="にぎやか"
                value={culturePace}
                onChange={setCulturePace}
              />
              <CultureSliderInput
                leftLabel="個人プレー重視"
                rightLabel="チームワーク重視"
                value={cultureTeam}
                onChange={setCultureTeam}
              />
              <CultureSliderInput
                leftLabel="丁寧・慎重"
                rightLabel="スピード重視"
                value={cultureSpeed}
                onChange={setCultureSpeed}
              />
              <CultureSliderInput
                leftLabel="ベテラン中心"
                rightLabel="若手活躍"
                value={cultureAge}
                onChange={setCultureAge}
              />
              <CultureSliderInput
                leftLabel="安定志向"
                rightLabel="挑戦・成長志向"
                value={cultureGrowth}
                onChange={setCultureGrowth}
              />

              <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700, margin: "16px 0 10px" }}>
                AI評価
              </p>
              <FormField
                label="AI評価基準（書類選考AIの保存済み設定）"
                hint={
                  presets.length === 0
                    ? "書類選考AIの画面で条件を設定し「設定を保存」しておくと、ここで選べるようになります。"
                    : undefined
                }
              >
                <select
                  style={inputStyle}
                  value={presetId}
                  onChange={(e) => setPresetId(e.target.value)}
                >
                  <option value="">選択しない（評価は簡易的になります）</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <button
                onClick={handleCreate}
                disabled={saving || !title.trim()}
                className="mt-2 w-full rounded-lg py-2.5 text-[13px] disabled:opacity-50"
                style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
              >
                {saving ? "作成中..." : "求人を掲載する"}
              </button>
            </div>

            {/* プレビュー(1/3幅) : 実際の求人サイト風に項目ごとにセクション分け */}
            <div className="col-span-1">
              <div className="sticky top-4 rounded-2xl p-4" style={cardStyle}>
                <p
                  style={{
                    color: "#666666",
                    fontSize: 11,
                    fontWeight: 700,
                    marginBottom: 10,
                    textTransform: "uppercase",
                  }}
                >
                  応募者に見える画面のプレビュー
                </p>
                <div
                  className="max-h-[80vh] overflow-y-auto rounded-xl"
                  style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                >
                  {/* ヘッダー: サムネイル+タイトル+タグ */}
                  {thumbnailPath ? (
                    <img
                      src={`${SUPABASE_STORAGE_BASE}${thumbnailPath}`}
                      alt=""
                      className="h-28 w-full object-cover"
                      style={{ borderRadius: "12px 12px 0 0" }}
                    />
                  ) : (
                    <div
                      className="flex h-28 w-full items-center justify-center"
                      style={{
                        background: "#1A1A1A",
                        color: "#444444",
                        fontSize: 11,
                        borderRadius: "12px 12px 0 0",
                      }}
                    >
                      サムネイル未設定
                    </div>
                  )}
                  <div className="p-4">
                    <p style={{ color: "#F0F0F0", fontSize: 16, fontWeight: 700, lineHeight: 1.4 }}>
                      {title || "求人タイトル"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[jobType, employmentType].filter(Boolean).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full px-2 py-0.5"
                          style={{
                            background: "#1A1A1A",
                            border: "1px solid #333333",
                            color: "#AAAAAA",
                            fontSize: 10,
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    {salaryRange && (
                      <p
                        className="mt-3"
                        style={{ color: "#C8FF00", fontSize: 16, fontWeight: 700 }}
                      >
                        {salaryRange}
                      </p>
                    )}
                  </div>

                  {/* 募集要項テーブル */}
                  <div className="border-t px-4 py-3" style={{ borderColor: "#2A2A2A" }}>
                    <p style={{ color: "#C8FF00", fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
                      募集要項
                    </p>
                    <div className="space-y-1.5">
                      {[
                        ["勤務地", location],
                        ["勤務時間", workingHours],
                        ["休日・休暇", holidays],
                        ["働き方", workStyle],
                        ["福利厚生", benefits],
                        ["応募資格", applicationRequirements],
                        ["選考フロー", selectionProcess],
                      ]
                        .filter(([, v]) => v)
                        .map(([label, value]) => (
                          <div
                            key={label as string}
                            className="flex gap-2"
                            style={{ fontSize: 11 }}
                          >
                            <span className="shrink-0" style={{ color: "#777777", width: 68 }}>
                              {label}
                            </span>
                            <span
                              style={{ color: "#DDDDDD", lineHeight: 1.6, whiteSpace: "pre-wrap" }}
                            >
                              {value}
                            </span>
                          </div>
                        ))}
                      {!location &&
                        !workingHours &&
                        !holidays &&
                        !workStyle &&
                        !benefits &&
                        !applicationRequirements &&
                        !selectionProcess && (
                          <p style={{ color: "#555555", fontSize: 11 }}>未入力</p>
                        )}
                    </div>
                  </div>

                  {/* 仕事内容 */}
                  {description && (
                    <div className="border-t px-4 py-3" style={{ borderColor: "#2A2A2A" }}>
                      <p
                        style={{ color: "#C8FF00", fontSize: 11, fontWeight: 700, marginBottom: 6 }}
                      >
                        仕事内容
                      </p>
                      <p
                        style={{
                          color: "#CCCCCC",
                          fontSize: 11,
                          lineHeight: 1.7,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {description}
                      </p>
                    </div>
                  )}

                  {/* アピールポイント */}
                  {companyAppeal && (
                    <div className="border-t px-4 py-3" style={{ borderColor: "#2A2A2A" }}>
                      <p
                        style={{ color: "#C8FF00", fontSize: 11, fontWeight: 700, marginBottom: 6 }}
                      >
                        この求人ならではの魅力
                      </p>
                      <p
                        style={{
                          color: "#CCCCCC",
                          fontSize: 11,
                          lineHeight: 1.7,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {companyAppeal}
                      </p>
                    </div>
                  )}

                  {/* 求める人材像 */}
                  {(idealCandidate || successfulHireTraits) && (
                    <div className="border-t px-4 py-3" style={{ borderColor: "#2A2A2A" }}>
                      <p
                        style={{ color: "#C8FF00", fontSize: 11, fontWeight: 700, marginBottom: 6 }}
                      >
                        求める人材
                      </p>
                      {idealCandidate && (
                        <div className="mb-2">
                          <p style={{ color: "#888888", fontSize: 10 }}>求める人物像</p>
                          <p
                            style={{
                              color: "#CCCCCC",
                              fontSize: 11,
                              lineHeight: 1.6,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {idealCandidate}
                          </p>
                        </div>
                      )}
                      {successfulHireTraits && (
                        <div>
                          <p style={{ color: "#888888", fontSize: 10 }}>活躍している人材の特徴</p>
                          <p
                            style={{
                              color: "#CCCCCC",
                              fontSize: 11,
                              lineHeight: 1.6,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {successfulHireTraits}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 社風・働き方診断メーター */}
                  <div className="border-t px-4 py-3" style={{ borderColor: "#2A2A2A" }}>
                    <p
                      style={{ color: "#C8FF00", fontSize: 11, fontWeight: 700, marginBottom: 10 }}
                    >
                      社風・働き方診断
                    </p>
                    <CultureMeter
                      leftLabel="落ち着いている"
                      rightLabel="にぎやか"
                      value={culturePace}
                    />
                    <CultureMeter
                      leftLabel="個人プレー重視"
                      rightLabel="チームワーク重視"
                      value={cultureTeam}
                    />
                    <CultureMeter
                      leftLabel="丁寧・慎重"
                      rightLabel="スピード重視"
                      value={cultureSpeed}
                    />
                    <CultureMeter
                      leftLabel="ベテラン中心"
                      rightLabel="若手活躍"
                      value={cultureAge}
                    />
                    <CultureMeter
                      leftLabel="安定志向"
                      rightLabel="挑戦・成長志向"
                      value={cultureGrowth}
                    />
                  </div>

                  {/* 応募CTA(プレビューなので非活性表示) */}
                  <div className="border-t p-4" style={{ borderColor: "#2A2A2A" }}>
                    <div
                      className="w-full rounded-full py-2.5 text-center"
                      style={{
                        background: "#2A2A2A",
                        color: "#666666",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      この求人に応募する（プレビュー）
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-3">
          {postings.length === 0 && (
            <p style={{ color: "#888888", fontSize: 13 }}>まだ求人がありません。</p>
          )}
          {postings.map((job) => (
            <div key={job.id} className="rounded-2xl p-5" style={cardStyle}>
              <div className="flex items-start gap-3">
                {job.thumbnail_path && (
                  <img
                    src={`${SUPABASE_STORAGE_BASE}${job.thumbnail_path}`}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between">
                    <p style={{ color: "#F0F0F0", fontSize: 15, fontWeight: 700 }}>{job.title}</p>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-[11px]"
                      style={{
                        background: job.status === "open" ? "#1A3A1A" : "#2A2A2A",
                        color: job.status === "open" ? "#00CC88" : "#888888",
                      }}
                    >
                      {job.status === "open" ? "掲載中" : "終了"}
                    </span>
                  </div>
                  <p style={{ color: "#888888", fontSize: 12, marginTop: 2 }}>
                    {job.job_type} {job.employment_type ? `・${job.employment_type}` : ""}{" "}
                    {job.location ? `・${job.location}` : ""}{" "}
                    {job.salary_range ? `・${job.salary_range}` : ""}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => loadApplicants(job.id)}
                  disabled={loadingApplicants === job.id}
                  className="rounded-lg px-3 py-1.5 text-[12px]"
                  style={{ background: "#222222", border: "1px solid #333333", color: "#F0F0F0" }}
                >
                  {expandedApplicants[job.id] ? "応募者を閉じる" : "応募者を見る"}
                </button>
                <button
                  onClick={() => toggleStatus(job)}
                  className="rounded-lg px-3 py-1.5 text-[12px]"
                  style={{ background: "#222222", border: "1px solid #333333", color: "#F0F0F0" }}
                >
                  {job.status === "open" ? "掲載終了にする" : "再掲載する"}
                </button>
                <button
                  onClick={() => handleDelete(job.id)}
                  className="rounded-lg px-3 py-1.5 text-[12px]"
                  style={{ color: "#FF6B6B" }}
                >
                  削除
                </button>
              </div>

              {expandedApplicants[job.id] && (
                <div className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: "#333333" }}>
                  {expandedApplicants[job.id].length === 0 ? (
                    <p style={{ color: "#666666", fontSize: 12 }}>まだ応募がありません。</p>
                  ) : (
                    expandedApplicants[job.id].map((a) => (
                      <div
                        key={a.id}
                        className="rounded-lg p-3"
                        style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {a.rank && (
                              <span
                                className="flex h-6 w-6 items-center justify-center rounded-full text-[11px]"
                                style={{
                                  background: RANK_COLORS[a.rank] ?? "#888888",
                                  color: "#0F0F0F",
                                  fontWeight: 700,
                                }}
                              >
                                {a.rank}
                              </span>
                            )}
                            {a.score != null && (
                              <span style={{ color: "#C8FF00", fontSize: 12, fontWeight: 700 }}>
                                {a.score}点
                              </span>
                            )}
                          </div>
                          <span style={{ color: "#666666", fontSize: 11 }}>
                            {new Date(a.created_at).toLocaleDateString("ja-JP")}
                          </span>
                        </div>
                        {a.summary && (
                          <p
                            className="mt-2"
                            style={{ color: "#CCCCCC", fontSize: 12, lineHeight: 1.6 }}
                          >
                            {a.summary}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </BusinessShell>
  );
}
