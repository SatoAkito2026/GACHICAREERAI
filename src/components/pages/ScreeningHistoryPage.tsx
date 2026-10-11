import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ThumbsUp,
  AlertTriangle,
  HelpCircle,
  Search,
  Building2,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePlan } from "@/hooks/use-plan";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getAuthHeaders } from "@/lib/chat-api";

// ---- 型定義（screening.tsx の保存形式に対応） ----

interface ScoreBreakdownItem {
  label: string;
  points: number;
  reason: string;
}

interface ConditionSnapshot {
  selected: string[];
  freeText: string;
}

interface ScreeningCandidateRow {
  id: string;
  created_at: string;
  job_type: string | null;
  required_conditions: ConditionSnapshot | null;
  preferred_conditions: ConditionSnapshot | null;
  ideal_person: ConditionSnapshot | null;
  must_have_conditions: string | null;
  highly_valued_experience: string | null;
  avoid_personality: string | null;
  expected_outcome: string | null;
  candidate_name: string;
  file_name: string | null;
  resume_excerpt: string | null;
  resume_storage_path: string | null;
  rank: string;
  score: number;
  score_breakdown: ScoreBreakdownItem[] | null;
  summary: string | null;
  strengths: string[] | null;
  concerns: string[] | null;
  check_points: string[] | null;
  positive_evidence: string[] | null;
  negative_evidence: string[] | null;
  company_info_used: string[] | null;
  batch_id: string;
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

const RANK_OPTIONS = ["A", "B", "C", "D"];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const INTERVIEW_URL_ALLOWED_PLANS = ["company_metered", "company_light", "company_pro"];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ScreeningHistoryPage({ showHeader = true }: { showHeader?: boolean } = {}) {
  const { session, user, loading: authLoading } = useAuth();
  const { plan, limits, interviewCount, incrementInterviewCount, loading: planLoading } = usePlan();

  const [issuedUrl, setIssuedUrl] = useState<string | null>(null);
  const [issuedEmail, setIssuedEmail] = useState<string>("");
  const [issuedRowId, setIssuedRowId] = useState<string | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [companyName, setCompanyName] = useState<string>("採用コーチAI");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, company_name")
        .eq("id", user.id)
        .maybeSingle();
      if ((profile as any)?.company_name) {
        setCompanyName((profile as any).company_name);
      } else if ((profile as any)?.company_id) {
        const { data: company } = await supabase
          .from("companies")
          .select("name")
          .eq("id", (profile as any).company_id)
          .maybeSingle();
        if ((company as any)?.name) setCompanyName((company as any).name);
      }
    })();
  }, [user]);

  const handleIssueUrl = async (row: ScreeningCandidateRow) => {
    if (!INTERVIEW_URL_ALLOWED_PLANS.includes(plan)) {
      toast.error(
        "面接URLの発行には企業プランへの加入が必要です。マイページからプランをご確認ください。",
      );
      return;
    }

    // URL発行回数チェック（ライト：20回、プロ：50回、超過時は330円/回）
    const limit = limits.interviews;
    const isOver = limit !== Infinity && interviewCount >= limit;
    if (isOver && plan !== "company_metered") {
      const ok = window.confirm(
        `今月のURL発行上限（${limit}回）を超えています。\n超過分は¥330/回の追加料金が発生します。\n発行しますか？`,
      );
      if (!ok) return;
    }

    const screeningData = {
      candidateName: row.candidate_name || "",
      rank: row.rank || "",
      score: row.score || 0,
      summary: row.summary || "",
      concerns: Array.isArray(row.concerns) ? row.concerns : [],
      checkPoints: Array.isArray(row.check_points) ? row.check_points : [],
      jobType: row.job_type || "",
      resumeExcerpt: row.resume_excerpt || "",
      strengths: Array.isArray(row.strengths) ? row.strengths : [],
      positiveEvidence: Array.isArray(row.positive_evidence) ? row.positive_evidence : [],
      negativeEvidence: Array.isArray(row.negative_evidence) ? row.negative_evidence : [],
    };

    let extractedEmail = "";
    if (row.resume_excerpt) {
      const emailMatch = row.resume_excerpt.match(
        /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/,
      );
      if (emailMatch) extractedEmail = emailMatch[0];
    }

    const { data: invitation, error } = await supabase
      .from("interview_invitations")
      .insert({
        user_id: user!.id,
        candidate_name: row.candidate_name,
        candidate_email: extractedEmail || null,
        job_type: row.job_type,
        screening_candidate_id: row.id,
        screening_data: screeningData,
      })
      .select("token")
      .single();

    if (error || !invitation) {
      toast.error("URLの発行に失敗しました");
      return;
    }

    const url = `${window.location.origin}/interview/${invitation.token}`;
    setIssuedUrl(url);
    setIssuedEmail(extractedEmail);
    setIssuedRowId(row.id);
    setEmailSent(false);

    // 発行回数をインクリメント
    await incrementInterviewCount();

    // Stripeで課金記録（従量課金・超過分）
    if (plan === "company_metered" || isOver) {
      try {
        await fetch("/api/report-usage", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await getAuthHeaders()),
          },
        });
      } catch {
        // 記録失敗してもURL発行は継続
      }
      if (plan === "company_metered") {
        toast.info("面接URL発行に伴い¥400の課金が発生します");
      } else if (isOver) {
        toast.info("超過分として¥330の追加料金が発生します");
      }
    }
  };

  const handleCopyUrl = async () => {
    if (!issuedUrl) return;
    await navigator.clipboard.writeText(issuedUrl);
    toast.success("URLをコピーしました");
  };

  const handleSendEmail = async (
    candidateName: string,
    jobType: string | null,
    companyName: string,
  ) => {
    if (!issuedEmail || !issuedUrl) return;
    setEmailSending(true);
    try {
      const res = await fetch("/api/send-interview-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({
          to: issuedEmail,
          candidateName,
          companyName,
          interviewUrl: issuedUrl,
          jobType,
        }),
      });
      if (!res.ok) throw new Error("送信失敗");
      toast.success(`${issuedEmail} にメールを送信しました`);
      setEmailSent(true);
    } catch (e) {
      toast.error("メール送信に失敗しました。URLをコピーして手動で送ってください。");
      await navigator.clipboard.writeText(issuedUrl);
    } finally {
      setEmailSending(false);
    }
  };

  const [rows, setRows] = useState<ScreeningCandidateRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  // 絞り込み・検索条件
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rankFilter, setRankFilter] = useState<Set<string>>(new Set());
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    if (!user) {
      setFetching(false);
      return;
    }
    let active = true;
    (async () => {
      setFetching(true);
      let query = supabase
        .from("screening_candidates")
        .select(
          "id, created_at, job_type, required_conditions, preferred_conditions, ideal_person, must_have_conditions, highly_valued_experience, avoid_personality, expected_outcome, candidate_name, file_name, resume_excerpt, resume_storage_path, rank, score, score_breakdown, summary, strengths, concerns, check_points, positive_evidence, negative_evidence, company_info_used, batch_id",
        )
        .eq("user_id", user.id);
      query = query.is("actor_id", null);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(500);
      if (!active) return;
      if (error) console.error(error);
      setRows((data as unknown as ScreeningCandidateRow[]) ?? []);
      setFetching(false);
    })();
    return () => {
      active = false;
    };
  }, [user, plan]);

  const toggleRank = (rank: string) => {
    setRankFilter((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) next.delete(rank);
      else next.add(rank);
      return next;
    });
  };

  const filteredRows = useMemo(() => {
    const min = minScore.trim() ? Number(minScore) : null;
    const max = maxScore.trim() ? Number(maxScore) : null;
    const q = searchQuery.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
    const to = dateTo ? new Date(dateTo + "T23:59:59") : null;

    return rows.filter((row) => {
      const created = new Date(row.created_at);
      if (from && created < from) return false;
      if (to && created > to) return false;
      if (rankFilter.size > 0 && !rankFilter.has(row.rank)) return false;
      if (min !== null && row.score < min) return false;
      if (max !== null && row.score > max) return false;
      if (q) {
        const hay =
          `${row.candidate_name ?? ""} ${row.file_name ?? ""} ${row.summary ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, rankFilter, minScore, maxScore, searchQuery, dateFrom, dateTo]);

  const visibleRows = filteredRows.slice(0, pageSize);

  if (authLoading || planLoading) {
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

  const headingFont = { fontFamily: "'Space Grotesk', sans-serif" };
  const inputStyle: React.CSSProperties = {
    background: "#1A1A1A",
    border: "1px solid #333333",
    color: "#F0F0F0",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: "#0F0F0F", fontFamily: "'Inter', sans-serif" }}
    >
      {showHeader && (
        <nav
          className="fixed inset-x-0 top-0 z-30 flex h-[52px] items-center justify-between border-b px-6"
          style={{ borderColor: "#333333", background: "#0F0F0F" }}
        >
          <div className="text-[15px]" style={{ fontWeight: 500, color: "#F0F0F0" }}>
            書類選考 AI ・ 選考履歴
          </div>
          <Link
            to="/mypage"
            className="flex items-center gap-1 text-[12px] transition-colors hover:text-[#F0F0F0]"
            style={{ color: "#888888", fontWeight: 500 }}
          >
            <ArrowLeft size={14} />
            マイページ
          </Link>
        </nav>
      )}

      <main className={`mx-auto max-w-3xl px-6 pb-24 ${showHeader ? "pt-[84px]" : "pt-6"}`}>
        <h1
          className="mb-1 text-[26px]"
          style={{ ...headingFont, fontWeight: 700, color: "#F0F0F0" }}
        >
          選考履歴
        </h1>
        <p className="mb-2 text-[14px]" style={{ color: "#888888" }}>
          過去に実行した書類選考の結果を確認できます。
        </p>
        {/* URL発行残数表示 */}
        {INTERVIEW_URL_ALLOWED_PLANS.includes(plan) && limits.interviews !== Infinity && (
          <div
            className="mb-6 rounded-lg px-4 py-3 text-[13px]"
            style={{
              background: interviewCount >= limits.interviews ? "#2A1010" : "#1A1A1A",
              border: `1px solid ${interviewCount >= limits.interviews ? "#AA3333" : "#333333"}`,
              color: interviewCount >= limits.interviews ? "#FF6B6B" : "#888888",
            }}
          >
            {interviewCount >= limits.interviews
              ? `⚠️ 今月のURL発行上限（${limits.interviews}回）に達しました。超過分は¥330/回の追加料金が発生します。`
              : `✅ 今月のURL発行：${interviewCount} / ${limits.interviews} 回（残り${limits.interviews - interviewCount}回）`}
          </div>
        )}

        <>
          {/* 絞り込み・検索 */}
          <section
            className="mb-6 rounded-2xl p-5"
            style={{ background: "#1A1A1A", border: "1px solid #333333" }}
          >
            <div
              className="mb-4 flex items-center gap-2 rounded-lg"
              style={{ ...inputStyle, padding: 0 }}
            >
              <Search size={15} color="#888888" className="ml-3 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="候補者名・ファイル名・総評で検索"
                className="w-full bg-transparent px-2 py-2 text-[13px] outline-none"
                style={{ color: "#F0F0F0" }}
              />
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-[12px]" style={{ color: "#888888" }}>
                  期間（から）
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px]" style={{ color: "#888888" }}>
                  期間（まで）
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px]" style={{ color: "#888888" }}>
                  スコア（以上）
                </label>
                <input
                  type="number"
                  value={minScore}
                  onChange={(e) => setMinScore(e.target.value)}
                  placeholder="0"
                  className="outline-none"
                  style={{ ...inputStyle, width: 80 }}
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px]" style={{ color: "#888888" }}>
                  スコア（以下）
                </label>
                <input
                  type="number"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                  placeholder="100"
                  className="outline-none"
                  style={{ ...inputStyle, width: 80 }}
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px]" style={{ color: "#888888" }}>
                  表示件数
                </label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="appearance-none outline-none"
                  style={inputStyle}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n} style={{ background: "#1A1A1A", color: "#F0F0F0" }}>
                      {n}件
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className="text-[12px]" style={{ color: "#888888" }}>
                ランク：
              </span>
              {RANK_OPTIONS.map((r) => {
                const m = rankMeta(r);
                const active = rankFilter.has(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRank(r)}
                    className="rounded-md border px-2.5 py-1 text-[12px] transition-colors"
                    style={
                      active
                        ? {
                            background: m.bg,
                            color: m.color,
                            borderColor: m.border,
                            fontWeight: 600,
                          }
                        : { background: "transparent", color: "#888888", borderColor: "#333333" }
                    }
                  >
                    {r}（{m.label}）
                  </button>
                );
              })}
              {(rankFilter.size > 0 ||
                minScore ||
                maxScore ||
                searchQuery ||
                dateFrom ||
                dateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setRankFilter(new Set());
                    setMinScore("");
                    setMaxScore("");
                    setSearchQuery("");
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className="ml-2 text-[12px] underline"
                  style={{ color: "#888888" }}
                >
                  絞り込みをクリア
                </button>
              )}
            </div>
          </section>

          {fetching ? (
            <p className="text-[13px]" style={{ color: "#888888" }}>
              読み込み中...
            </p>
          ) : filteredRows.length === 0 ? (
            <p className="text-[13px]" style={{ color: "#888888" }}>
              {rows.length === 0
                ? "まだ選考履歴がありません。"
                : "条件に一致する履歴がありません。"}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleRows.map((row) => (
                <HistoryItem
                  key={row.id}
                  row={row}
                  open={openId === row.id}
                  onToggle={() => setOpenId(openId === row.id ? null : row.id)}
                  onIssueUrl={handleIssueUrl}
                  canIssueUrl={INTERVIEW_URL_ALLOWED_PLANS.includes(plan)}
                  issuedUrl={issuedUrl}
                  issuedEmail={issuedEmail}
                  issuedRowId={issuedRowId}
                  emailSending={emailSending}
                  emailSent={emailSent}
                  onEmailChange={setIssuedEmail}
                  onCopyUrl={handleCopyUrl}
                  onSendEmail={() => handleSendEmail(row.candidate_name, row.job_type, companyName)}
                  onCloseIssued={() => {
                    setIssuedRowId(null);
                    setIssuedUrl(null);
                    setEmailSent(false);
                  }}
                  onDelete={async () => {
                    if (
                      !window.confirm(
                        `「${row.candidate_name || "この候補者"}」の書類選考履歴を完全に削除します。この操作は取り消せません。本当に削除しますか？`,
                      )
                    )
                      return;
                    // 先にinterview_invitationsの参照を解除
                    await supabase
                      .from("interview_invitations")
                      .update({ screening_candidate_id: null } as any)
                      .eq("screening_candidate_id", row.id);
                    const { error } = await supabase
                      .from("screening_candidates")
                      .delete()
                      .eq("id", row.id);
                    if (error) {
                      console.error(error);
                      toast.error("削除に失敗しました。もう一度お試しください。");
                      return;
                    }
                    setRows((prev) => prev.filter((r) => r.id !== row.id));
                    toast.success("削除しました");
                  }}
                />
              ))}
              {filteredRows.length > pageSize && (
                <p className="text-center text-[12px]" style={{ color: "#888888" }}>
                  {filteredRows.length}件中{pageSize}
                  件を表示中。表示件数を増やすと残りを確認できます。
                </p>
              )}
            </div>
          )}
        </>
      </main>
    </div>
  );
}

function HistoryItem({
  row,
  open,
  onToggle,
  onIssueUrl,
  canIssueUrl,
  issuedUrl,
  issuedEmail,
  issuedRowId,
  emailSending,
  emailSent,
  onEmailChange,
  onCopyUrl,
  onSendEmail,
  onCloseIssued,
  onDelete,
}: {
  row: ScreeningCandidateRow;
  open: boolean;
  onToggle: () => void;
  onIssueUrl: (row: ScreeningCandidateRow) => void;
  canIssueUrl: boolean;
  issuedUrl: string | null;
  issuedEmail: string;
  issuedRowId: string | null;
  emailSending: boolean;
  emailSent: boolean;
  onEmailChange: (value: string) => void;
  onCopyUrl: () => void;
  onSendEmail: () => void;
  onCloseIssued: () => void;
  onDelete: () => void;
}) {
  const m = rankMeta(row.rank);

  return (
    <div className="rounded-xl border" style={{ borderColor: "#333333", background: "#1A1A1A" }}>
      <div className="flex w-full items-center gap-2 px-2 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-3 px-2 py-1 text-left transition-colors hover:bg-[#222222] rounded-lg"
        >
          {open ? (
            <ChevronDown size={16} color="#888888" />
          ) : (
            <ChevronRight size={16} color="#888888" />
          )}
          <span
            className="shrink-0 rounded-md border px-2 py-0.5 text-[11px]"
            style={{ background: m.bg, color: m.color, borderColor: m.border, fontWeight: 600 }}
          >
            {row.rank}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px]" style={{ fontWeight: 600, color: "#F0F0F0" }}>
              {row.candidate_name || row.file_name || "候補者"}
            </div>
            <div className="mt-0.5 text-[12px]" style={{ color: "#888888" }}>
              {formatDateTime(row.created_at)} ・ {row.job_type || "職種未設定"}
            </div>
          </div>
          <span className="shrink-0 text-[13px]" style={{ color: "#C8FF00", fontWeight: 600 }}>
            {row.score}点
          </span>
          {row.resume_storage_path && (
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                const { data, error } = await supabase.storage
                  .from("resumes")
                  .createSignedUrl(row.resume_storage_path!, 60);
                if (error || !data) {
                  alert("履歴書の取得に失敗しました。");
                  return;
                }
                window.open(data.signedUrl, "_blank");
              }}
              className="shrink-0 rounded-md px-2 py-0.5 text-[11px] transition-colors hover:bg-[#1A1A2A]"
              style={{ color: "#6B9FFF", border: "1px solid #2A2A4A", fontWeight: 600 }}
              title="履歴書PDFを閲覧"
            >
              📄 履歴書
            </button>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="この書類選考履歴を削除"
          className="shrink-0 rounded-lg p-2 transition-colors hover:bg-[#3A1A1A]"
          style={{ color: "#FF6B6B" }}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {open && (
        <div className="border-t px-4 py-4" style={{ borderColor: "#333333" }}>
          {/* 求人条件のスナップショット */}
          <div className="mb-4 flex flex-col gap-1 text-[12px]" style={{ color: "#888888" }}>
            {row.required_conditions &&
              (row.required_conditions.selected.length > 0 || row.required_conditions.freeText) && (
                <p>
                  <span style={{ fontWeight: 600 }}>必須条件：</span>
                  {[...row.required_conditions.selected, row.required_conditions.freeText]
                    .filter(Boolean)
                    .join("、")}
                </p>
              )}
            {row.preferred_conditions &&
              (row.preferred_conditions.selected.length > 0 ||
                row.preferred_conditions.freeText) && (
                <p>
                  <span style={{ fontWeight: 600 }}>歓迎条件：</span>
                  {[...row.preferred_conditions.selected, row.preferred_conditions.freeText]
                    .filter(Boolean)
                    .join("、")}
                </p>
              )}
            {row.ideal_person &&
              (row.ideal_person.selected.length > 0 || row.ideal_person.freeText) && (
                <p>
                  <span style={{ fontWeight: 600 }}>求める人物像：</span>
                  {[...row.ideal_person.selected, row.ideal_person.freeText]
                    .filter(Boolean)
                    .join("、")}
                </p>
              )}
          </div>

          {row.summary && (
            <p className="mb-3 text-[13px] leading-relaxed" style={{ color: "#F0F0F0" }}>
              {row.summary}
            </p>
          )}

          {row.score_breakdown && row.score_breakdown.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-[12px]" style={{ color: "#F0F0F0", fontWeight: 600 }}>
                スコア内訳（合計 {row.score}点）
              </div>
              <ul className="flex flex-col gap-1">
                {row.score_breakdown.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-3 text-[12px] leading-relaxed"
                    style={{ color: "#888888" }}
                  >
                    <span className="min-w-0 flex-1">
                      {b.label}
                      {b.reason && <span style={{ color: "#666666" }}>　{b.reason}</span>}
                    </span>
                    <span
                      className="shrink-0"
                      style={{ color: b.points >= 0 ? "#00CC88" : "#CC6666", fontWeight: 600 }}
                    >
                      {b.points >= 0 ? `+${b.points}` : b.points}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <CandidateSection
            icon={<ThumbsUp size={13} color="#00CC88" />}
            title="強み"
            items={row.strengths ?? []}
          />
          <CandidateSection
            icon={<AlertTriangle size={13} color="#CC8800" />}
            title="気になる点"
            items={row.concerns ?? []}
          />
          <CandidateSection
            icon={<HelpCircle size={13} color="#888888" />}
            title="面接で確認すべきこと"
            items={row.check_points ?? []}
          />

          {row.company_info_used && row.company_info_used.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 flex items-center gap-2">
                <Building2 size={13} color="#9D7BFF" />
                <span className="text-[12px]" style={{ color: "#F0F0F0", fontWeight: 600 }}>
                  会社情報の反映
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {row.company_info_used.map((label, i) => (
                  <span
                    key={i}
                    className="rounded-md border px-2 py-0.5 text-[11px]"
                    style={{ borderColor: "#3A3050", background: "#1A1730", color: "#C9B8FF" }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {row.resume_excerpt && (
            <div
              className="mt-3 rounded-lg border px-3 py-2.5"
              style={{ borderColor: "#333333", background: "#161616" }}
            >
              <div className="mb-1 text-[11px]" style={{ color: "#666666", fontWeight: 600 }}>
                履歴書抜粋（{row.file_name}）
              </div>
              <p
                className="whitespace-pre-wrap text-[12px] leading-relaxed"
                style={{ color: "#888888" }}
              >
                {row.resume_excerpt}
              </p>
            </div>
          )}

          {/* 面接URL発行 */}
          <div className="mt-4 border-t pt-4" style={{ borderColor: "#2A2A2A" }}>
            {canIssueUrl ? (
              <button
                type="button"
                onClick={() => onIssueUrl(row)}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] transition-colors"
                style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 600 }}
              >
                🔗 面接URLを発行する
              </button>
            ) : (
              <div
                className="flex items-center justify-center gap-1 text-[12px]"
                style={{ color: "#888" }}
              >
                面接URL発行にはプラン加入が必要
                <Link to="/pricing" style={{ color: "#C8FF00", marginLeft: 4 }}>
                  プランを見る →
                </Link>
              </div>
            )}

            {issuedRowId === row.id && issuedUrl && (
              <div
                className="mt-4 rounded-xl p-4"
                style={{ background: "#0D1A0D", border: "1px solid #2a4a2a" }}
              >
                <div className="mb-3 text-[13px]" style={{ color: "#C8FF00", fontWeight: 600 }}>
                  🔗 面接URLを発行しました
                </div>

                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: "#1A1A1A", border: "1px solid #333" }}
                >
                  <span className="flex-1 truncate text-[12px]" style={{ color: "#888888" }}>
                    {issuedUrl}
                  </span>
                  <button
                    onClick={onCopyUrl}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
                    style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 600 }}
                  >
                    📋 コピー
                  </button>
                </div>

                <div className="mt-3">
                  <div className="mb-1 text-[12px]" style={{ color: "#888888" }}>
                    ✉️ メールで送る（任意）
                  </div>
                  <input
                    type="email"
                    value={issuedEmail}
                    onChange={(e) => onEmailChange(e.target.value)}
                    placeholder="candidate@example.com"
                    className="w-full rounded-lg px-3 py-2 text-[13px]"
                    style={{ background: "#1A1A1A", border: "1px solid #333", color: "#F0F0F0" }}
                  />
                  {issuedEmail === "" ? (
                    <p className="mt-1 text-[11px]" style={{ color: "#666" }}>
                      AIが読み取れませんでした。メールアドレスを入力してください。
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px]" style={{ color: "#666" }}>
                      AIが履歴書から自動入力しました（修正可能）
                    </p>
                  )}
                  <button
                    onClick={onSendEmail}
                    disabled={emailSending || emailSent || !issuedEmail}
                    className="mt-2 w-full rounded-xl py-2 text-[13px] disabled:opacity-50"
                    style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 600 }}
                  >
                    {emailSent ? "✅ 送信済み" : emailSending ? "送信中..." : "メールで送信する →"}
                  </button>
                </div>

                <button
                  onClick={onCloseIssued}
                  className="mt-2 w-full text-center text-[12px]"
                  style={{ color: "#666" }}
                >
                  閉じる
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CandidateSection({
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
    <div className="mb-3">
      <div className="mb-1.5 flex items-center gap-2">
        {icon}
        <span className="text-[12px]" style={{ color: "#F0F0F0", fontWeight: 600 }}>
          {title}
        </span>
      </div>
      <ul className="flex flex-col gap-1 pl-1">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex gap-2 text-[12px] leading-relaxed"
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
