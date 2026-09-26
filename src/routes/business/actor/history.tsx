import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { BusinessShell } from "@/components/ModeShell";
import { useActorPaywall, ActorPaywallScreen } from "@/components/ActorPaywall";

export const Route = createFileRoute("/business/actor/history")({
  head: () => ({ meta: [{ title: "面接履歴｜芸能・キャスティング" }] }),
  component: () => (
    <BusinessShell>
      <ActorHistoryPage />
    </BusinessShell>
  ),
});

type InterviewRow = {
  id: string;
  candidate_name: string | null;
  job_type: string | null;
  created_at: string;
  impression: string | null;
  screening_candidate_id: string | null;
  recording_path: string | null;
};

type ActorVerificationSummary = {
  overall_impression?: string;
  consistency_check?: string;
  discrepancies?: string[];
  audience_draw_assessment?: string;
  score_breakdown?: { category: string; score: number; comment: string }[];
  reliability_score?: number;
  good_points?: string[];
  concerns?: string[];
} | null;

type TurnRow = { turn_number: number | null; question: string | null; memo: string | null };

const cardStyle = { background: "#1A1A1A", border: "1px solid #333333", borderRadius: 16 } as const;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function ActorHistoryPage() {
  const { session, user, loading } = useAuth();
  const { isPaid, loading: paywallLoading } = useActorPaywall();
  const [rows, setRows] = useState<InterviewRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setFetching(false);
      return;
    }
    let active = true;
    (async () => {
      setFetching(true);
      const { data, error } = await supabase
        .from("interviews")
        .select(
          "id, candidate_name, job_type, created_at, impression, screening_candidate_id, recording_path",
        )
        .eq("user_id", user.id)
        .eq("mode", "actor_verification")
        .order("created_at", { ascending: false })
        .limit(500);
      if (!active) return;
      if (error) console.error(error);
      setRows((data as InterviewRow[]) ?? []);
      setFetching(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  if (loading) {
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
  if (paywallLoading) return null;
  if (!isPaid) return <ActorPaywallScreen />;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-1 text-[22px]" style={{ fontWeight: 600, color: "#F0F0F0" }}>
        経歴確認面接の履歴
      </h1>
      <p className="mb-6 text-[13px]" style={{ color: "#888888" }}>
        行をクリックすると、演技力を除いた「経歴の信頼度・集客力」の総評が表示されます。
      </p>

      {fetching ? (
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
          {rows.map((row) => (
            <ActorHistoryItem
              key={row.id}
              row={row}
              open={openId === row.id}
              onToggle={() => setOpenId(openId === row.id ? null : row.id)}
              onDelete={async () => {
                if (
                  !window.confirm(
                    `「${row.candidate_name || "この面接記録"}」を完全に削除します。よろしいですか？`,
                  )
                )
                  return;
                const { error } = await supabase.from("interviews").delete().eq("id", row.id);
                if (error) {
                  window.alert("削除に失敗しました。");
                  return;
                }
                setRows((prev) => prev.filter((r) => r.id !== row.id));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ActorHistoryItem({
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
  const [summary, setSummary] = useState<ActorVerificationSummary>(null);
  const [turns, setTurns] = useState<TurnRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [resumePath, setResumePath] = useState<string | null>(null);
  const [openTurn, setOpenTurn] = useState<number | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    let active = true;
    (async () => {
      setLoadingDetail(true);
      const [summaryRes, turnsRes] = await Promise.all([
        supabase
          .from("interview_summaries")
          .select("actor_verification")
          .eq("interview_id", row.id)
          .maybeSingle(),
        supabase
          .from("interview_turns")
          .select("turn_number, question, memo")
          .eq("interview_id", row.id)
          .order("turn_number", { ascending: true }),
      ]);
      if (!active) return;
      setSummary((summaryRes.data as any)?.actor_verification ?? null);
      setTurns((turnsRes.data as TurnRow[]) ?? []);
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
  }, [open, loaded, row.id, row.screening_candidate_id]);

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
              {row.job_type || "役者"} ・ {formatDate(row.created_at)}
            </div>
          </div>
        </button>
        {resumePath && (
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              const { data, error } = await supabase.storage
                .from("resumes")
                .createSignedUrl(resumePath, 60);
              if (error || !data) return;
              window.open(data.signedUrl, "_blank");
            }}
            className="shrink-0 rounded-md px-2 py-0.5 text-[11px]"
            style={{ color: "#6B9FFF", border: "1px solid #2A2A4A", fontWeight: 600 }}
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
              if (error || !data) return;
              window.open(data.signedUrl, "_blank");
            }}
            className="shrink-0 rounded-md px-2 py-0.5 text-[11px]"
            style={{ color: "#7CD98F", border: "1px solid #2A4A2A", fontWeight: 600 }}
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
          className="shrink-0 rounded-lg p-2"
          style={{ color: "#FF6B6B" }}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {open && (
        <div className="border-t px-4 py-4" style={{ borderColor: "#333333" }}>
          {loadingDetail ? (
            <p className="text-[13px]" style={{ color: "#888888" }}>
              読み込み中...
            </p>
          ) : !summary ? (
            <p className="text-[13px]" style={{ color: "#888888" }}>
              総評は保存されていません。
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {summary.reliability_score != null && (
                <div
                  className="rounded-xl p-4"
                  style={{ background: "#111", border: "1px solid #2A2A2A" }}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div style={{ fontSize: 48, fontWeight: 700, color: "#C8FF00", lineHeight: 1 }}>
                      {summary.reliability_score}
                    </div>
                    <div style={{ fontSize: 11, color: "#888" }}>信頼度・集客力スコア</div>
                  </div>
                </div>
              )}
              {summary.score_breakdown && summary.score_breakdown.length > 0 && (
                <div>
                  <p style={{ color: "#F0F0F0", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                    スコア内訳（合計100点）
                  </p>
                  <div className="flex flex-col gap-2">
                    {summary.score_breakdown.map((s, i) => (
                      <div
                        key={i}
                        className="rounded-lg p-3"
                        style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                      >
                        <div className="flex items-center justify-between">
                          <span style={{ color: "#F0F0F0", fontSize: 12, fontWeight: 700 }}>
                            {s.category}
                          </span>
                          <span style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700 }}>
                            {s.score}点
                          </span>
                        </div>
                        <p style={{ color: "#999999", fontSize: 11, marginTop: 3 }}>{s.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {summary.overall_impression && (
                <div>
                  <div className="mb-1 text-[12px]" style={{ fontWeight: 600, color: "#888888" }}>
                    総評
                  </div>
                  <p
                    className="whitespace-pre-wrap text-[13px] leading-relaxed"
                    style={{ color: "#F0F0F0" }}
                  >
                    {summary.overall_impression}
                  </p>
                </div>
              )}
              {summary.consistency_check && (
                <div>
                  <div className="mb-1 text-[12px]" style={{ fontWeight: 600, color: "#888888" }}>
                    データベースとの整合性
                  </div>
                  <p
                    className="whitespace-pre-wrap text-[13px] leading-relaxed"
                    style={{ color: "#F0F0F0" }}
                  >
                    {summary.consistency_check}
                  </p>
                </div>
              )}
              {summary.discrepancies && summary.discrepancies.length > 0 && (
                <div>
                  <div className="mb-1 text-[12px]" style={{ fontWeight: 600, color: "#FF6B6B" }}>
                    食い違っていた発言
                  </div>
                  <ul className="flex flex-col gap-1">
                    {summary.discrepancies.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-[13px]"
                        style={{ color: "#F0F0F0" }}
                      >
                        <span style={{ color: "#FF6B6B", flexShrink: 0 }}>●</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.audience_draw_assessment && (
                <div>
                  <div className="mb-1 text-[12px]" style={{ fontWeight: 600, color: "#888888" }}>
                    集客力の見込み
                  </div>
                  <p
                    className="whitespace-pre-wrap text-[13px] leading-relaxed"
                    style={{ color: "#F0F0F0" }}
                  >
                    {summary.audience_draw_assessment}
                  </p>
                </div>
              )}
              {summary.good_points && summary.good_points.length > 0 && (
                <div>
                  <div className="mb-1 text-[12px]" style={{ fontWeight: 600, color: "#C8FF00" }}>
                    良かった点
                  </div>
                  <ul className="flex flex-col gap-1">
                    {summary.good_points.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-[13px]"
                        style={{ color: "#F0F0F0" }}
                      >
                        <span style={{ color: "#C8FF00", flexShrink: 0 }}>●</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.concerns && summary.concerns.length > 0 && (
                <div>
                  <div className="mb-1 text-[12px]" style={{ fontWeight: 600, color: "#FFB84D" }}>
                    懸念点
                  </div>
                  <ul className="flex flex-col gap-1">
                    {summary.concerns.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-[13px]"
                        style={{ color: "#F0F0F0" }}
                      >
                        <span style={{ color: "#FFB84D", flexShrink: 0 }}>●</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {turns.length > 0 && (
                <div>
                  <div className="mb-2 text-[12px]" style={{ fontWeight: 600, color: "#888888" }}>
                    面接ログ（{turns.length}件）
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {turns.map((t, i) => {
                      const tn = t.turn_number ?? i + 1;
                      const isOpen = openTurn === tn;
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
                          {isOpen && t.memo && (
                            <div
                              className="border-t px-3 py-2.5 text-[13px]"
                              style={{ borderColor: "#333333", color: "#F0F0F0" }}
                            >
                              {t.memo}
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
