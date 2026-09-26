import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePlan } from "@/hooks/use-plan";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

type InterviewRow = {
  id: string;
  candidate_name: string | null;
  job_type: string | null;
  transfer_count: number | null;
  created_at: string;
  impression: string | null;
  interviewer_name: string | null;
  mode: string | null;
  screening_candidate_id: string | null;
  actor_id: string | null;
  recording_path: string | null;
};

type SummaryRow = {
  overview: string | null;
  positives: string[] | string | null;
  red_flags: string[] | string | null;
  check_next: string[] | null;
  onboarding: string | null;
  adoption_reasons: string[] | null;
  concerns: string[] | null;
  radar_scores: Record<string, number> | null;
  overall_score: number | null;
  risk_score: number | null;
  consistency_score: number | null;
  inconsistencies: string[] | null;
  personality_model: {
    decision_style?: string;
    org_adaptability?: string;
    achievement_mindset?: string;
    management_style?: string;
  } | null;
  company_fit_comment: string | null;
  ai_comment: string | null;
  next_steps: string[] | null;
  resignation_risk_percent: number | null;
  resignation_risk_level: string | null;
  resignation_risk_factors: string[] | null;
  practice_feedback: {
    overall_impression?: string;
    good_points?: string[];
    improvement_points?: string[];
    sample_better_answers?: { question: string; better_answer: string }[];
    readiness_score?: number;
  } | null;
};

type TurnRow = {
  turn_number: number | null;
  question: string | null;
  memo: string | null;
  analysis: string | null;
  risk_tags: string[] | null;
};

type RankingRow = {
  interview_id: string;
  candidate_name: string | null;
  job_type: string | null;
  created_at: string;
  overall_score: number;
  risk_level: string | null;
  consistency_score: number | null;
  risk_score: number | null;
};

const IMPRESSION_MAP: Record<string, { label: string; bg: string; fg: string; border: string }> = {
  good: { label: "良かった", bg: "#0A2A1A", fg: "#00CC88", border: "#00CC88" },
  neutral: { label: "迷っている", bg: "#1A1A1A", fg: "#C8FF00", border: "#C8FF00" },
  concern: { label: "気になる点あり", bg: "#2A1010", fg: "#FF6666", border: "#FF4444" },
};

const RISK_MAP: Record<string, { fg: string; bg: string; border: string }> = {
  低: { fg: "#00CC88", bg: "#0A2A1A", border: "#00CC88" },
  中: { fg: "#C8FF00", bg: "#1A1A1A", border: "#C8FF00" },
  高: { fg: "#FF6666", bg: "#2A1010", border: "#FF4444" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export function HistoryPage({
  showEntranceTab = true,
  showHeader = true,
}: {
  showEntranceTab?: boolean;
  showHeader?: boolean;
}) {
  const { session, user, loading } = useAuth();
  const { plan, limits, loading: planLoading } = usePlan();
  const [rows, setRows] = useState<InterviewRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rankings, setRankings] = useState<RankingRow[]>([]);

  const [historyTab, setHistoryTab] = useState<"hiring" | "entrance">("hiring");

  const [rankingLimit, setRankingLimit] = useState<number>(20);

  const [dateFrom, setDateFrom] = useState("");

  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!user || !limits.history) {
      setFetching(false);
      return;
    }
    let active = true;
    (async () => {
      setFetching(true);
      const { data, error } = await supabase
        .from("interviews")
        .select(
          "id, candidate_name, job_type, transfer_count, created_at, impression, interviewer_name, mode, screening_candidate_id, recording_path, actor_id",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (!active) return;
      if (error) console.error(error);
      setRows((data as InterviewRow[]) ?? []);
      setFetching(false);

      const { data: sumData, error: sumError } = await supabase
        .from("interview_summaries")
        .select(
          "interview_id, overall_score, risk_level, consistency_score, risk_score, interviews!inner(candidate_name, job_type, created_at, user_id, mode)",
        )
        .eq("interviews.user_id", user.id)
        .eq("interviews.mode", "hiring")
        .not("overall_score", "is", null);
      if (!active) return;
      if (sumError) {
        console.error(sumError);
      } else {
        const ranked: RankingRow[] = ((sumData as unknown[]) ?? [])
          .map((r) => {
            const row = r as {
              interview_id: string;
              overall_score: number | null;
              risk_level: string | null;
              consistency_score: number | null;
              risk_score: number | null;
              interviews: {
                candidate_name: string | null;
                job_type: string | null;
                created_at: string;
              } | null;
            };
            return {
              interview_id: row.interview_id,
              candidate_name: row.interviews?.candidate_name ?? null,
              job_type: row.interviews?.job_type ?? null,
              created_at: row.interviews?.created_at ?? "",
              overall_score: row.overall_score ?? 0,
              risk_level: row.risk_level ?? null,
              consistency_score: row.consistency_score ?? null,
              risk_score: row.risk_score ?? null,
            };
          })
          .filter((r) => typeof r.overall_score === "number")
          .sort((a, b) => b.overall_score - a.overall_score);
        setRankings(ranked);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, limits.history]);

  if (loading || planLoading) {
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

  return (
    <div
      className="min-h-screen"
      style={{ background: "#0F0F0F", fontFamily: "'Inter', sans-serif" }}
    >
      {showHeader && (
        <nav
          className="fixed inset-x-0 top-0 z-30 flex h-[52px] items-center justify-between border-b bg-[#0F0F0F] px-6"
          style={{ borderColor: "#333333" }}
        >
          <div className="text-[15px]" style={{ fontWeight: 500, color: "#F0F0F0" }}>
            面接コーチAI
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

      <main className={`mx-auto max-w-3xl px-6 pb-20 ${showHeader ? "pt-[84px]" : "pt-6"}`}>
        <h1 className="mb-1 text-[22px]" style={{ fontWeight: 600, color: "#F0F0F0" }}>
          過去の面接履歴
        </h1>
        <p className="mb-6 text-[13px]" style={{ color: "#888888" }}>
          行をクリックすると総評と面接ログが表示されます。
        </p>

        {/* 採用/入試タブ */}
        {showEntranceTab && (
          <div
            className="mb-6 flex items-center gap-2 rounded-xl p-1"
            style={{ background: "#1A1A1A", border: "1px solid #333333" }}
          >
            <button
              type="button"
              onClick={() => setHistoryTab("hiring")}
              className="flex-1 rounded-lg py-2 text-[13px] transition-colors"
              style={
                historyTab === "hiring"
                  ? { background: "#C8FF00", color: "#0F0F0F", fontWeight: 600 }
                  : { background: "transparent", color: "#888888" }
              }
            >
              採用面接
            </button>
            <button
              type="button"
              onClick={() => setHistoryTab("entrance")}
              className="flex-1 rounded-lg py-2 text-[13px] transition-colors"
              style={
                historyTab === "entrance"
                  ? { background: "#C8FF00", color: "#0F0F0F", fontWeight: 600 }
                  : { background: "transparent", color: "#888888" }
              }
            >
              入試面接
            </button>
          </div>
        )}

        {rankings.length >= 2 &&
          (!showEntranceTab || historyTab === "hiring") &&
          limits.historyRanking && (
            <section className="mb-8">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[14px]" style={{ color: "#C8FF00", fontWeight: 600 }}>
                    候補者ランキング
                  </div>
                  <div className="text-[11px]" style={{ color: "#888888" }}>
                    総合スコア順
                  </div>
                </div>
                {limits.historyRanking && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={rankingLimit}
                      onChange={(e) => setRankingLimit(Number(e.target.value))}
                      className="rounded-md px-2 py-1 text-[12px] outline-none"
                      style={{
                        background: "#1A1A1A",
                        border: "1px solid #333333",
                        color: "#F0F0F0",
                      }}
                    >
                      <option value={10}>10件</option>
                      <option value={20}>20件</option>
                      <option value={50}>50件</option>
                      <option value={9999}>全件</option>
                    </select>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="rounded-md px-2 py-1 text-[12px] outline-none"
                      style={{
                        background: "#1A1A1A",
                        border: "1px solid #333333",
                        color: "#F0F0F0",
                      }}
                    />
                    <span className="text-[12px]" style={{ color: "#888888" }}>
                      〜
                    </span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="rounded-md px-2 py-1 text-[12px] outline-none"
                      style={{
                        background: "#1A1A1A",
                        border: "1px solid #333333",
                        color: "#F0F0F0",
                      }}
                    />
                    {(dateFrom || dateTo) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDateFrom("");
                          setDateTo("");
                        }}
                        className="rounded-md px-2 py-1 text-[12px]"
                        style={{
                          background: "#2A1010",
                          border: "1px solid #FF4444",
                          color: "#FF6666",
                        }}
                      >
                        クリア
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col">
                {rankings
                  .filter((r) => {
                    if (!dateFrom && !dateTo) return true;
                    const d = r.created_at ? r.created_at.slice(0, 10) : "";
                    if (dateFrom && d < dateFrom) return false;
                    if (dateTo && d > dateTo) return false;
                    return true;
                  })
                  .slice(0, limits.historyRanking ? rankingLimit : rankings.length)
                  .map((r, i) => {
                    const rank = i + 1;
                    const rankBg = rank === 1 ? "#C8FF00" : rank === 2 ? "#888888" : "#333333";
                    const rankFg = rank <= 2 ? "#0F0F0F" : "#F0F0F0";
                    const risk = r.risk_level ? RISK_MAP[r.risk_level] : null;
                    return (
                      <div
                        key={r.interview_id}
                        className="rounded-lg border border-transparent transition-colors hover:border-[#C8FF00]"
                        style={{ background: "#1A1A1A", padding: "18px 24px", marginBottom: 8 }}
                      >
                        <div className="flex w-full items-center gap-4">
                          {/* Left: rank + name + job */}
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <span
                              className="flex shrink-0 items-center justify-center rounded-full text-[18px]"
                              style={{
                                width: 36,
                                height: 36,
                                background: rankBg,
                                color: rankFg,
                                fontWeight: 700,
                              }}
                            >
                              {rank}
                            </span>
                            <span
                              className="truncate text-[20px]"
                              style={{ color: "#F0F0F0", fontWeight: 600 }}
                            >
                              {r.candidate_name || "（名前なし）"}
                            </span>
                            {r.job_type && (
                              <span
                                className="hidden shrink-0 rounded-full px-3 py-1 text-[13px] sm:inline"
                                style={{ background: "#333333", color: "#AAAAAA" }}
                              >
                                {r.job_type}
                              </span>
                            )}
                          </div>
                          {/* Center: score + progress + consistency */}
                          <div
                            className="flex flex-col items-center gap-1"
                            style={{ minWidth: 120 }}
                          >
                            <span
                              className="text-[30px]"
                              style={{ color: "#C8FF00", fontWeight: 800, lineHeight: 1 }}
                            >
                              {r.overall_score}
                            </span>
                            <div
                              style={{
                                width: 100,
                                height: 8,
                                background: "#333333",
                                borderRadius: 4,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.max(0, Math.min(100, r.overall_score))}%`,
                                  height: "100%",
                                  background: "#C8FF00",
                                  borderRadius: 4,
                                }}
                              />
                            </div>
                            {r.consistency_score != null && (
                              <span className="text-[13px]" style={{ color: "#888888" }}>
                                一貫性 {r.consistency_score}
                              </span>
                            )}
                          </div>
                          {/* Right: risk badge + risk % + date */}
                          <div className="flex flex-col items-end gap-1" style={{ minWidth: 90 }}>
                            {r.risk_level ? (
                              <span
                                className="shrink-0 rounded-md border px-3 py-1 text-[13px]"
                                style={{
                                  background: risk?.bg ?? "#1A1A1A",
                                  color: risk?.fg ?? "#888888",
                                  borderColor: risk?.border ?? "#333333",
                                  fontWeight: 600,
                                }}
                              >
                                {r.risk_level}
                              </span>
                            ) : (
                              <span
                                className="shrink-0 rounded-md border px-3 py-1 text-[13px]"
                                style={{
                                  background: "#1A1A1A",
                                  color: "#666666",
                                  borderColor: "#333333",
                                  fontWeight: 600,
                                }}
                              >
                                未評価
                              </span>
                            )}
                            <span
                              className="text-[16px]"
                              style={{ color: "#F0F0F0", fontWeight: 700 }}
                            >
                              {r.risk_score != null ? `${r.risk_score}%` : "-%"}
                            </span>
                            <span
                              className="hidden text-[13px] sm:inline"
                              style={{ color: "#888888" }}
                            >
                              {r.created_at ? formatDate(r.created_at) : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

        {!limits.history ? (
          <div
            className="rounded-xl border p-10 text-center"
            style={{ borderColor: "#333333", background: "#1A1A1A" }}
          >
            <p className="text-[14px]" style={{ color: "#F0F0F0", fontWeight: 500 }}>
              履歴を見るにはスタンダードプラン以上が必要です
            </p>
            <Link
              to="/pricing"
              className="mt-4 inline-block rounded-lg px-4 py-2.5 text-[13px]"
              style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 500 }}
            >
              プランを見る
            </Link>
          </div>
        ) : fetching ? (
          <p className="text-[13px]" style={{ color: "#888888" }}>
            読み込み中...
          </p>
        ) : rows.length === 0 ? (
          <div
            className="rounded-xl border p-10 text-center text-[14px]"
            style={{ borderColor: "#333333", background: "#1A1A1A", color: "#888888" }}
          >
            まだ面接記録がありません
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows
              .filter((row) => {
                const mode = row.mode ?? "hiring";
                if (mode === "actor_verification" || row.actor_id) return false;
                if (!showEntranceTab) return mode !== "entrance";
                return historyTab === "entrance" ? mode === "entrance" : mode !== "entrance";
              })
              .map((row) => (
                <HistoryItem
                  key={row.id}
                  row={row}
                  open={openId === row.id}
                  onToggle={() => setOpenId(openId === row.id ? null : row.id)}
                  onDelete={async () => {
                    if (
                      !window.confirm(
                        `「${row.candidate_name || "この候補者"}」の面接履歴を完全に削除します。この操作は取り消せません。本当に削除しますか？`,
                      )
                    )
                      return;
                    const { error } = await supabase.from("interviews").delete().eq("id", row.id);
                    if (error) {
                      console.error(error);
                      window.alert("削除に失敗しました。もう一度お試しください。");
                      return;
                    }
                    setRows((prev) => prev.filter((r) => r.id !== row.id));
                  }}
                />
              ))}
          </div>
        )}
      </main>
    </div>
  );
}

function HistoryItem({
  row,
  open,
  onToggle,
  onDelete,
}: {
  row: InterviewRow;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [summary, setSummary] = useState<SummaryRow | null>(null);
  const [turns, setTurns] = useState<TurnRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [openTurn, setOpenTurn] = useState<number | null>(null);
  const [resumePath, setResumePath] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const detailRef = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    let active = true;
    (async () => {
      setLoadingDetail(true);
      const [summaryRes, turnsRes] = await Promise.all([
        supabase
          .from("interview_summaries")
          .select(
            "overview, positives, red_flags, check_next, onboarding, adoption_reasons, concerns, radar_scores, overall_score, risk_score, consistency_score, inconsistencies, personality_model, company_fit_comment, ai_comment, next_steps, resignation_risk_percent, resignation_risk_level, resignation_risk_factors, practice_feedback",
          )
          .eq("interview_id", row.id)
          .maybeSingle(),
        supabase
          .from("interview_turns")
          .select("turn_number, question, memo, analysis, risk_tags")
          .eq("interview_id", row.id)
          .order("turn_number", { ascending: true }),
      ]);
      if (!active) return;
      if (summaryRes.error) console.error(summaryRes.error);
      if (turnsRes.error) console.error(turnsRes.error);
      setSummary((summaryRes.data as SummaryRow) ?? null);
      setTurns((turnsRes.data as TurnRow[]) ?? []);

      // 書類選考と紐付いている場合は履歴書パスを取得
      if (row.screening_candidate_id) {
        const { data: scData } = await supabase
          .from("screening_candidates")
          .select("resume_storage_path")
          .eq("id", row.screening_candidate_id)
          .maybeSingle();
        if (active) setResumePath((scData as any)?.resume_storage_path ?? null);
      }

      setLoaded(true);
      setLoadingDetail(false);
    })();
    return () => {
      active = false;
    };
  }, [open, loaded, row.id]);

  const imp = row.impression ? IMPRESSION_MAP[row.impression] : null;

  return (
    <div className="rounded-xl border bg-[#1A1A1A]" style={{ borderColor: "#333333" }}>
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
          <div className="min-w-0 flex-1">
            <div className="text-[14px]" style={{ fontWeight: 600, color: "#F0F0F0" }}>
              {row.candidate_name || "（名前なし）"}
            </div>
            <div className="mt-0.5 text-[12px]" style={{ color: "#888888" }}>
              {row.mode === "entrance"
                ? `入試面接 ・ ${formatDate(row.created_at)}${row.interviewer_name ? ` ・ 面接官：${row.interviewer_name}` : ""}`
                : `${row.job_type || "職種未設定"} ・ 転職${row.transfer_count ?? 0}回 ・ ${formatDate(row.created_at)}${row.interviewer_name ? ` ・ 面接官：${row.interviewer_name}` : ""}`}
            </div>
          </div>
          {imp && (
            <span
              className="shrink-0 rounded-md border px-2.5 py-1 text-[11px]"
              style={{
                background: imp.bg,
                color: imp.fg,
                borderColor: imp.border,
                fontWeight: 600,
              }}
            >
              {imp.label}
            </span>
          )}
        </button>
        {resumePath && (
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              const { data, error } = await supabase.storage
                .from("resumes")
                .createSignedUrl(resumePath, 60);
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
        {row.recording_path && (
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              const { data, error } = await supabase.storage
                .from("interview-recordings")
                .createSignedUrl(row.recording_path as string, 300);
              if (error || !data) {
                alert("録画の取得に失敗しました。");
                return;
              }
              window.open(data.signedUrl, "_blank");
            }}
            className="shrink-0 rounded-md px-2 py-0.5 text-[11px] transition-colors hover:bg-[#1A2A1A]"
            style={{ color: "#7CD98F", border: "1px solid #2A4A2A", fontWeight: 600 }}
            title="面接の録画を再生"
          >
            🎥 録画
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="この面接履歴を削除"
          className="shrink-0 rounded-lg p-2 transition-colors hover:bg-[#3A1A1A]"
          style={{ color: "#FF6B6B" }}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {open && (
        <div
          id={`interview-detail-${row.id}`}
          className="border-t px-4 py-4"
          style={{ borderColor: "#333333" }}
        >
          {loadingDetail ? (
            <p className="text-[13px]" style={{ color: "#888888" }}>
              読み込み中...
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {summary ? (
                <div className="flex flex-col gap-5">
                  {/* 練習モード専用のフィードバック(採用可否に関する項目は一切含まない) */}
                  {summary.practice_feedback && (
                    <>
                      {summary.practice_feedback.readiness_score != null && (
                        <div
                          className="rounded-xl p-4"
                          style={{ background: "#111", border: "1px solid #2A2A2A" }}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <div
                              style={{
                                fontSize: 48,
                                fontWeight: 700,
                                color: "#C8FF00",
                                lineHeight: 1,
                              }}
                            >
                              {summary.practice_feedback.readiness_score}
                            </div>
                            <div style={{ fontSize: 11, color: "#888" }}>準備度スコア</div>
                          </div>
                        </div>
                      )}
                      {summary.practice_feedback.overall_impression && (
                        <DetailBlock
                          title="総評"
                          text={summary.practice_feedback.overall_impression}
                        />
                      )}
                      {summary.practice_feedback.good_points &&
                        summary.practice_feedback.good_points.length > 0 && (
                          <ArrayBlock
                            title="良かった点"
                            items={summary.practice_feedback.good_points}
                            color="#C8FF00"
                          />
                        )}
                      {summary.practice_feedback.improvement_points &&
                        summary.practice_feedback.improvement_points.length > 0 && (
                          <ArrayBlock
                            title="改善するとよい点"
                            items={summary.practice_feedback.improvement_points}
                            color="#FFB84D"
                          />
                        )}
                      {summary.practice_feedback.sample_better_answers &&
                        summary.practice_feedback.sample_better_answers.length > 0 && (
                          <div
                            className="rounded-xl p-4"
                            style={{ background: "#111", border: "1px solid #2A2A2A" }}
                          >
                            <div
                              style={{
                                fontSize: 13,
                                color: "#F0F0F0",
                                fontWeight: 600,
                                marginBottom: 10,
                              }}
                            >
                              より良い回答例
                            </div>
                            <div className="flex flex-col gap-3">
                              {summary.practice_feedback.sample_better_answers.map((qa, i) => (
                                <div
                                  key={i}
                                  className="rounded-lg p-3"
                                  style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                                >
                                  <p style={{ color: "#888888", fontSize: 12 }}>Q. {qa.question}</p>
                                  <p style={{ color: "#CCCCCC", fontSize: 12, marginTop: 4 }}>
                                    {qa.better_answer}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </>
                  )}
                  {/* 総合スコア + レーダーチャート */}
                  {summary.overall_score != null && (
                    <div
                      className="rounded-xl p-4"
                      style={{ background: "#111", border: "1px solid #2A2A2A" }}
                    >
                      <div className="flex items-center gap-6">
                        <div className="flex flex-col items-center gap-1">
                          <div
                            style={{
                              fontSize: 48,
                              fontWeight: 700,
                              color: "#C8FF00",
                              lineHeight: 1,
                            }}
                          >
                            {summary.overall_score}
                          </div>
                          <div style={{ fontSize: 11, color: "#888" }}>総合評価</div>
                        </div>
                        {summary.radar_scores && Object.keys(summary.radar_scores).length > 0 && (
                          <div className="flex-1">
                            <RadarChart scores={summary.radar_scores} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 企業適合性 */}
                  {(summary.overall_score != null || summary.company_fit_comment) && (
                    <div
                      className="rounded-xl p-4"
                      style={{ background: "#0F1A0F", border: "1px solid #2A3A2A" }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div style={{ fontSize: 13, color: "#F0F0F0", fontWeight: 600 }}>
                          企業への適合性
                        </div>
                        {summary.overall_score != null && (
                          <div style={{ fontSize: 20, fontWeight: 700, color: "#C8FF00" }}>
                            {summary.overall_score}点
                          </div>
                        )}
                      </div>
                      {summary.company_fit_comment && (
                        <p style={{ fontSize: 13, color: "#CCCCCC", lineHeight: 1.7 }}>
                          {summary.company_fit_comment}
                        </p>
                      )}
                    </div>
                  )}

                  {/* 離職リスク */}
                  {summary.resignation_risk_percent != null && (
                    <div
                      className="rounded-xl p-4"
                      style={{ background: "#1A1010", border: "1px solid #3A2A2A" }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div style={{ fontSize: 13, color: "#F0F0F0", fontWeight: 600 }}>
                          離職リスク
                        </div>
                        <div className="flex items-center gap-3">
                          <div style={{ fontSize: 28, fontWeight: 700, color: "#FF6B6B" }}>
                            {summary.resignation_risk_percent}%
                          </div>
                          {summary.resignation_risk_level && (
                            <span
                              className="rounded-full px-3 py-1 text-[11px] font-bold"
                              style={{
                                background:
                                  summary.resignation_risk_level === "低"
                                    ? "#0F2A0F"
                                    : summary.resignation_risk_level === "中"
                                      ? "#2A2A0F"
                                      : "#2A0F0F",
                                color:
                                  summary.resignation_risk_level === "低"
                                    ? "#C8FF00"
                                    : summary.resignation_risk_level === "中"
                                      ? "#FFD700"
                                      : "#FF6B6B",
                                border: `1px solid ${summary.resignation_risk_level === "低" ? "#2A4A2A" : summary.resignation_risk_level === "中" ? "#4A4A2A" : "#4A2A2A"}`,
                              }}
                            >
                              {summary.resignation_risk_level}
                            </span>
                          )}
                        </div>
                      </div>
                      <ArrayBlock
                        title=""
                        items={summary.resignation_risk_factors}
                        color="#FF6B6B"
                      />
                    </div>
                  )}

                  {/* 採用推薦理由 + 懸念点 横並び */}
                  {((summary.adoption_reasons && summary.adoption_reasons.length > 0) ||
                    (summary.concerns && summary.concerns.length > 0)) && (
                    <div className="grid grid-cols-2 gap-4">
                      {summary.adoption_reasons && summary.adoption_reasons.length > 0 && (
                        <div
                          className="rounded-xl p-4"
                          style={{ background: "#0F1A0F", border: "1px solid #2A4A2A" }}
                        >
                          <div
                            className="mb-2 text-[12px] font-semibold"
                            style={{ color: "#C8FF00" }}
                          >
                            ✓ 採用推薦理由
                          </div>
                          <ul className="flex flex-col gap-1.5">
                            {summary.adoption_reasons.map((item, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-[12px]"
                                style={{ color: "#CCCCCC" }}
                              >
                                <span style={{ color: "#C8FF00", flexShrink: 0 }}>✓</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {summary.concerns && summary.concerns.length > 0 && (
                        <div
                          className="rounded-xl p-4"
                          style={{ background: "#1A0F0F", border: "1px solid #4A2A2A" }}
                        >
                          <div
                            className="mb-2 text-[12px] font-semibold"
                            style={{ color: "#FF6B6B" }}
                          >
                            ⚠ 懸念点
                          </div>
                          <ul className="flex flex-col gap-1.5">
                            {summary.concerns.map((item, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-[12px]"
                                style={{ color: "#CCCCCC" }}
                              >
                                <span style={{ color: "#FF6B6B", flexShrink: 0 }}>△</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 回答一貫性 */}
                  {summary.consistency_score != null && (
                    <div
                      className="rounded-xl p-4"
                      style={{ background: "#0F0F1A", border: "1px solid #2A2A4A" }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div style={{ fontSize: 13, color: "#F0F0F0", fontWeight: 600 }}>
                          回答一貫性
                        </div>
                        <div className="flex items-center gap-2">
                          <div style={{ fontSize: 24, fontWeight: 700, color: "#6B9FFF" }}>
                            {summary.consistency_score}点
                          </div>
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={{
                              background: summary.consistency_score >= 80 ? "#0F2A1A" : "#2A1A0F",
                              color: summary.consistency_score >= 80 ? "#C8FF00" : "#FFB800",
                              border: "1px solid #333",
                            }}
                          >
                            {summary.consistency_score >= 80
                              ? "高"
                              : summary.consistency_score >= 60
                                ? "中"
                                : "低"}
                          </span>
                        </div>
                      </div>
                      {summary.inconsistencies && summary.inconsistencies.length > 0 ? (
                        <ArrayBlock title="" items={summary.inconsistencies} color="#FFB800" />
                      ) : (
                        <p style={{ fontSize: 12, color: "#888" }}>
                          回答に矛盾は検出されませんでした
                        </p>
                      )}
                    </div>
                  )}

                  {/* 人格モデル */}
                  {summary.personality_model &&
                    Object.keys(summary.personality_model).length > 0 && (
                      <div
                        className="rounded-xl p-4"
                        style={{ background: "#111", border: "1px solid #2A2A2A" }}
                      >
                        <div
                          className="mb-3 text-[13px] font-semibold"
                          style={{ color: "#F0F0F0" }}
                        >
                          人格モデル
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { key: "decision_style", label: "意思決定スタイル" },
                            { key: "org_adaptability", label: "組織適応性" },
                            { key: "achievement_mindset", label: "成果への考え方" },
                            { key: "management_style", label: "マネジメントスタイル" },
                          ].map(({ key, label }) => {
                            const val = (summary.personality_model as any)?.[key];
                            if (!val) return null;
                            return (
                              <div
                                key={key}
                                className="rounded-lg p-3"
                                style={{ background: "#1A1A1A", border: "1px solid #333" }}
                              >
                                <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>
                                  {label}
                                </div>
                                <div style={{ fontSize: 12, color: "#F0F0F0", lineHeight: 1.6 }}>
                                  {val}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  {/* AIの見立て */}
                  {summary.ai_comment && (
                    <div
                      className="rounded-xl p-4"
                      style={{ background: "#111", border: "1px solid #C8FF0033" }}
                    >
                      <div className="mb-2 text-[13px] font-semibold" style={{ color: "#C8FF00" }}>
                        AIの見立て
                      </div>
                      <p style={{ fontSize: 13, color: "#CCCCCC", lineHeight: 1.7 }}>
                        {summary.ai_comment}
                      </p>
                    </div>
                  )}

                  {/* 気になった点 + 良かった点 */}
                  {summary.red_flags && summary.red_flags.length > 0 && (
                    <div
                      className="rounded-xl p-4"
                      style={{ background: "#1A0F0F", border: "1px solid #FF6B6B44" }}
                    >
                      <div className="mb-2 text-[12px] font-semibold" style={{ color: "#FF6B6B" }}>
                        気になった点
                      </div>
                      <ArrayBlock title="" items={summary.red_flags} color="#FF6B6B" />
                    </div>
                  )}
                  {summary.positives && summary.positives.length > 0 && (
                    <div
                      className="rounded-xl p-4"
                      style={{ background: "#0F1A0F", border: "1px solid #C8FF0044" }}
                    >
                      <div className="mb-2 text-[12px] font-semibold" style={{ color: "#C8FF00" }}>
                        良かった点
                      </div>
                      <ArrayBlock title="" items={summary.positives} color="#C8FF00" />
                    </div>
                  )}

                  {/* 次回確認すること */}
                  {summary.next_steps && summary.next_steps.length > 0 && (
                    <div
                      className="rounded-xl p-4"
                      style={{ background: "#111", border: "1px solid #333" }}
                    >
                      <div className="mb-3 text-[13px] font-semibold" style={{ color: "#F0F0F0" }}>
                        次回確認すること
                      </div>
                      <ol className="flex flex-col gap-2">
                        {summary.next_steps.map((step, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-3 text-[13px]"
                            style={{ color: "#CCCCCC" }}
                          >
                            <span
                              className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                              style={{ background: "#C8FF00", color: "#0F0F0F" }}
                            >
                              {i + 1}
                            </span>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* 総評テキスト */}
                  <DetailBlock title="総評" text={summary.overview} />

                  {/* 次回担当者への申し送り */}
                  <DetailBlock title="次回担当者への申し送り" text={summary.onboarding} />
                </div>
              ) : (
                <p className="text-[13px]" style={{ color: "#888888" }}>
                  総評は保存されていません。
                </p>
              )}

              {/* PDF出力ボタン */}
              <div className="mt-4">
                <button
                  type="button"
                  disabled={generatingPdf}
                  onClick={async () => {
                    setGeneratingPdf(true);
                    // 全ターンを展開
                    const allTurnNumbers = turns.map((t, i) => t.turn_number ?? i + 1);
                    setOpenTurn(-999); // 全展開トリガー用の特殊値
                    try {
                      const el = document.getElementById(`interview-detail-${row.id}`);
                      if (!el) return;
                      // 全ターンを展開した状態でレンダリングを待つ
                      await new Promise((resolve) => setTimeout(resolve, 500));
                      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
                        import("html2canvas"),
                        import("jspdf"),
                      ]);
                      const canvas = await html2canvas(el, {
                        backgroundColor: "#1A1A1A",
                        scale: 2,
                        useCORS: true,
                      });
                      const imgData = canvas.toDataURL("image/png");
                      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
                      const pageWidth = pdf.internal.pageSize.getWidth();
                      const pageHeight = pdf.internal.pageSize.getHeight();
                      const imgHeight = (canvas.height * pageWidth) / canvas.width;
                      let heightLeft = imgHeight;
                      let position = 0;
                      pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
                      heightLeft -= pageHeight;
                      while (heightLeft > 0) {
                        position -= pageHeight;
                        pdf.addPage();
                        pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
                        heightLeft -= pageHeight;
                      }
                      const name = row.candidate_name ?? "候補者";
                      const date = new Date(row.created_at).toISOString().slice(0, 10);
                      pdf.save(`面接レポート_${name}_${date}.pdf`);
                    } catch (e) {
                      console.error("PDF生成エラー:", e);
                      alert("PDF出力に失敗しました。");
                    } finally {
                      setOpenTurn(null);
                      setGeneratingPdf(false);
                    }
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] transition-colors"
                  style={{
                    background: generatingPdf ? "#1A1A1A" : "#C8FF00",
                    color: generatingPdf ? "#888" : "#0F0F0F",
                    fontWeight: 600,
                    border: generatingPdf ? "1px solid #333" : "none",
                    cursor: generatingPdf ? "default" : "pointer",
                  }}
                >
                  {generatingPdf ? "📄 PDFを生成中..." : "📄 この面接レポートをPDFで出力"}
                </button>
              </div>

              {turns.length > 0 && (
                <div>
                  <div className="mb-2 text-[12px]" style={{ fontWeight: 600, color: "#888888" }}>
                    面接ログ（{turns.length}件）
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {turns.map((t, i) => {
                      const tn = t.turn_number ?? i + 1;
                      const isOpen = openTurn === tn || openTurn === -999;
                      return (
                        <div
                          key={tn}
                          className="rounded-lg border"
                          style={{ borderColor: "#333333", background: "#222222" }}
                        >
                          <button
                            type="button"
                            onClick={() => setOpenTurn(isOpen ? null : tn)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left"
                          >
                            {isOpen ? (
                              <ChevronDown size={14} color="#888888" />
                            ) : (
                              <ChevronRight size={14} color="#888888" />
                            )}
                            <span
                              className="text-[13px]"
                              style={{ color: "#F0F0F0", fontWeight: 500 }}
                            >
                              Q{tn}. {t.question || "（質問なし）"}
                            </span>
                          </button>
                          {isOpen && (
                            <div
                              className="border-t px-3 py-2.5 text-[13px]"
                              style={{ borderColor: "#333333", color: "#F0F0F0" }}
                            >
                              {t.memo && (
                                <p className="mb-2">
                                  <span style={{ color: "#888888" }}>メモ：</span>
                                  {t.memo}
                                </p>
                              )}
                              {t.analysis && (
                                <p className="mb-2">
                                  <span style={{ color: "#888888" }}>分析：</span>
                                  {t.analysis}
                                </p>
                              )}
                              {t.risk_tags && t.risk_tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {t.risk_tags.map((tag, j) => (
                                    <span
                                      key={j}
                                      className="rounded-md border px-2 py-0.5 text-[11px]"
                                      style={{ borderColor: "#333333", color: "#888888" }}
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailBlock({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <div className="mb-1 text-[12px]" style={{ fontWeight: 600, color: "#888888" }}>
        {title}
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: "#F0F0F0" }}>
        {text}
      </p>
    </div>
  );
}

function ArrayBlock({
  title,
  items,
  color = "#F0F0F0",
}: {
  title: string;
  items: string[] | string | null;
  color?: string;
}) {
  if (!items) return null;
  const arr = Array.isArray(items) ? items : typeof items === "string" ? [items] : [];
  if (arr.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-[12px]" style={{ fontWeight: 600, color: "#888888" }}>
        {title}
      </div>
      <ul className="flex flex-col gap-1">
        {arr.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: "#F0F0F0" }}>
            <span style={{ color, flexShrink: 0 }}>●</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RadarChart({ scores }: { scores: Record<string, number> }) {
  const LABELS: Record<string, string> = {
    proactiveness: "主体性",
    sincerity: "誠実さ",
    retention: "定着性",
    immediate_value: "即戦力",
    communication: "コミュ力",
    growth: "成長性",
    stress_tolerance: "ストレス耐性",
    motivation: "意欲",
    experience: "経験",
    personality: "人柄",
  };
  const keys = Object.keys(scores);
  const n = keys.length;
  if (n < 3) return null;
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 60;
  const points = keys.map((_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const val = Math.min(100, Math.max(0, scores[keys[i]])) / 100;
    return {
      x: cx + r * val * Math.cos(angle),
      y: cy + r * val * Math.sin(angle),
      lx: cx + (r + 20) * Math.cos(angle),
      ly: cy + (r + 20) * Math.sin(angle),
      label: LABELS[keys[i]] ?? keys[i],
      value: scores[keys[i]],
    };
  });
  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");
  const grid = [0.25, 0.5, 0.75, 1].map((ratio) => {
    const gpts = keys.map((_, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      return `${cx + r * ratio * Math.cos(angle)},${cy + r * ratio * Math.sin(angle)}`;
    });
    return gpts.join(" ");
  });

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <svg width={size + 60} height={size + 40} viewBox={`-30 -20 ${size + 60} ${size + 40}`}>
        {grid.map((g, i) => (
          <polygon key={i} points={g} fill="none" stroke="#333" strokeWidth="0.5" />
        ))}
        {points.map((p, i) => (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + r * Math.cos((Math.PI * 2 * i) / n - Math.PI / 2)}
            y2={cy + r * Math.sin((Math.PI * 2 * i) / n - Math.PI / 2)}
            stroke="#333"
            strokeWidth="0.5"
          />
        ))}
        <polygon points={polygon} fill="rgba(200,255,0,0.15)" stroke="#C8FF00" strokeWidth="1.5" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="#C8FF00" />
            <text
              x={p.lx}
              y={p.ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="9"
              fill="#888"
            >
              {p.label}
            </text>
            <text
              x={p.lx}
              y={p.ly + 10}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="9"
              fill="#C8FF00"
            >
              {p.value}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
