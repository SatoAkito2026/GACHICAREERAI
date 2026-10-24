import { Link } from "@tanstack/react-router";
import { SafeNavigate } from "@/components/SafeNavigate";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { PrivateShell } from "@/components/ModeShell";
import { usePlan } from "@/hooks/use-plan";
import { practiceRule } from "@/lib/plan-rules";
import { talentApi } from "@/components/talent/TalentUI";
import { ShareResultButton } from "@/components/ShareResultButton";
import type { SpeechStats } from "@/lib/speech-stats";
import type { DeliveryStats } from "@/lib/delivery-tracker";
import {
  DeliveryCard,
  SpeechStatsCard,
  VerdictCard,
  competencyAvg,
} from "@/components/talent/ResultExtras";

type PracticeFeedback = {
  overall_impression?: string;
  score_breakdown?: { category: string; score: number; comment: string }[];
  good_points?: string[];
  improvement_points?: string[];
  sample_better_answers?: { question: string; better_answer: string }[];
  readiness_score?: number;
  personality_traits?: { trait: string; description: string }[] | null;
  detailed_analysis?: string | null;
  competencies?: {
    key: string;
    label: string;
    score: number | null;
    reason: string;
    evidence: string[];
  }[];
  speech_stats?: SpeechStats | null;
  delivery?: DeliveryStats | null;
  /** 企業（採用担当）向けの見立て。プロフィールを公開して、コインで見た企業にだけ見える */
  recruiter_view?: {
    summary: string;
    strengths: { point: string; evidence: string[] }[];
    workStyle: string;
    confirmPoints: string[];
    suggestedQuestions: string[];
  } | null;
};

type HistoryRow = {
  id: string;
  job_type: string | null;
  created_at: string;
  feedback: PracticeFeedback | null;
  /** 録画（本人が「録画を残す」を選んだ練習だけ。新しいものから3本まで） */
  recordingUrl?: string | null;
};

export function PracticeHistoryContent({
  mode,
  backTo,
}: {
  mode: "individual" | "student";
  backTo: string;
}) {
  const { session, loading } = useAuth();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const { plan, loading: planLoading } = usePlan();
  // 見られる結果の数はプランで決まる（古いものは消さずに隠すだけ。プランを上げれば見られる）
  const resultLimit = practiceRule(plan).results;

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data: interviews } = await (supabase
        .from("interviews")
        .select("id, job_type, created_at")
        .eq("user_id", session.user.id)
        .eq("mode", mode)
        .order("created_at", { ascending: false }) as any);

      const list = (interviews ?? []) as {
        id: string;
        job_type: string | null;
        created_at: string;
      }[];
      if (list.length === 0) {
        setRows([]);
        return;
      }

      const { data: summaries } = await (supabase
        .from("interview_summaries")
        .select("interview_id, practice_feedback")
        .in(
          "interview_id",
          list.map((i) => i.id),
        ) as any);

      const feedbackMap = new Map(
        (
          (summaries ?? []) as {
            interview_id: string;
            practice_feedback: PracticeFeedback | null;
          }[]
        ).map((s) => [s.interview_id, s.practice_feedback]),
      );

      // 録画はサーバーで見られるURLを作ってもらう（個人の練習だけ）
      const recordings = new Map<string, string | null>();
      if (mode === "individual") {
        const r = await talentApi<{ interviews: { id: string; recordingUrl: string | null }[] }>(
          "/api/talent/my-interviews",
        );
        if (r.ok) for (const iv of r.data.interviews) recordings.set(iv.id, iv.recordingUrl);
      }

      setRows(
        list.map((i) => ({
          id: i.id,
          job_type: i.job_type,
          created_at: i.created_at,
          feedback: feedbackMap.get(i.id) ?? null,
          recordingUrl: recordings.get(i.id) ?? null,
        })),
      );
    })();
  }, [session, mode]);

  const handleDelete = async (id: string) => {
    if (!window.confirm("この練習の結果を削除しますか？（録画も消え、元に戻せません）")) return;
    // 録画の削除・人物まとめの作り直しもサーバーで行う
    const r = await talentApi("/api/talent/my-interviews", { action: "delete", id });
    if (!r.ok) return void toast.error(r.data.error ?? "削除に失敗しました");
    setRows((prev) => (prev ? prev.filter((row) => row.id !== id) : prev));
  };

  if (loading || planLoading || rows === null) {
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
  if (!session) return <SafeNavigate to="/login" />;

  const cardStyle = {
    background: "#1A1A1A",
    border: "1px solid #2A2A2A",
    borderRadius: 16,
  } as const;

  const visibleRows = resultLimit == null ? rows : rows.slice(0, resultLimit);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <PrivateShell>
      <div className="mx-auto max-w-xl px-6 py-10">
        <Link to={backTo} style={{ color: "#888888", fontSize: 13 }}>
          ← 戻る
        </Link>
        <h1 className="mt-4 text-[22px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
          練習履歴
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "#999999" }}>
          {mode === "student" ? "入試面接練習" : "模擬面接AI"}の結果一覧です。
        </p>

        {rows.length === 0 && (
          <p className="mt-6 text-[13px]" style={{ color: "#888888" }}>
            まだ練習履歴がありません。
          </p>
        )}

        {rows.length > 0 && (
          <div className="mt-5">
            <RankBanner mode={mode} />
          </div>
        )}

        <div className="mt-6 space-y-3">
          {visibleRows.map((r) => (
            <details key={r.id} className="rounded-2xl p-4" style={cardStyle}>
              <summary
                className="flex cursor-pointer items-center justify-between"
                style={{ color: "#F0F0F0", fontSize: 14 }}
              >
                <span>
                  {r.job_type || (mode === "student" ? "入試面接練習" : "模擬面接")}
                  <span style={{ color: "#666666", fontSize: 11, marginLeft: 8 }}>
                    {new Date(r.created_at).toLocaleString("ja-JP")}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {r.recordingUrl && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px]"
                      style={{ background: "#3A1515", color: "#FF8A8A" }}
                    >
                      録画あり
                    </span>
                  )}
                  {competencyAvg(r.feedback?.competencies) != null ? (
                    <span style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700 }}>
                      {competencyAvg(r.feedback?.competencies)!.toFixed(1)} / 5
                    </span>
                  ) : (
                    r.feedback?.readiness_score != null && (
                      <span style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700 }}>
                        {r.feedback.readiness_score}点
                      </span>
                    )
                  )}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(r.id);
                    }}
                    style={{ color: "#FF6B6B", fontSize: 12 }}
                  >
                    削除
                  </button>
                </span>
              </summary>

              {r.recordingUrl && (
                <video
                  src={r.recordingUrl}
                  controls
                  preload="metadata"
                  className="mt-4 w-full rounded-xl"
                  style={{ background: "#000", maxHeight: 360 }}
                />
              )}
              {r.feedback && (
                <div className="mt-4 flex justify-end">
                  <ShareResultButton
                    jobType={r.job_type}
                    date={r.created_at}
                    score={r.feedback.readiness_score ?? null}
                    competencies={(r.feedback.competencies ?? []).map((c) => ({
                      label: c.label,
                      score: c.score,
                    }))}
                  />
                </div>
              )}
              {r.feedback ? (
                <div className="mt-4 space-y-4">
                  {competencyAvg(r.feedback.competencies) != null && (
                    <VerdictCard avg={competencyAvg(r.feedback.competencies)!} />
                  )}
                  {r.feedback.improvement_points && r.feedback.improvement_points.length > 0 && (
                    <div
                      className="rounded-2xl p-4"
                      style={{ background: "#1F1A0A", border: "1px solid #4A3A12" }}
                    >
                      <p
                        style={{ color: "#FFB84D", fontSize: 13, fontWeight: 800, marginBottom: 6 }}
                      >
                        次の練習で直すこと
                      </p>
                      <ol className="list-decimal pl-5">
                        {r.feedback.improvement_points.map((g, i) => (
                          <li key={i} style={{ color: "#E8E0CC", fontSize: 13, lineHeight: 1.75 }}>
                            {g}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {r.feedback.overall_impression && (
                    <div>
                      <p
                        style={{ color: "#C8FF00", fontSize: 12, fontWeight: 700, marginBottom: 4 }}
                      >
                        総評
                      </p>
                      <p style={{ color: "#CCCCCC", fontSize: 13, lineHeight: 1.7 }}>
                        {r.feedback.overall_impression}
                      </p>
                    </div>
                  )}
                  {r.feedback.score_breakdown && r.feedback.score_breakdown.length > 0 && (
                    <details
                      className="rounded-lg p-3"
                      style={{ background: "#141414", border: "1px solid #232323" }}
                    >
                      <summary
                        className="cursor-pointer"
                        style={{ color: "#CCCCCC", fontSize: 12, fontWeight: 700 }}
                      >
                        練習の点数の内訳（100点満点・{r.feedback.readiness_score ?? "—"}点）
                      </summary>
                      <div style={{ width: "100%", height: 220 }}>
                        <ResponsiveContainer>
                          <RadarChart data={r.feedback.score_breakdown} outerRadius="70%">
                            <PolarGrid stroke="#2A2A2A" />
                            <PolarAngleAxis
                              dataKey="category"
                              tick={{ fill: "#999999", fontSize: 10 }}
                            />
                            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                            <Radar
                              dataKey="score"
                              stroke="#C8FF00"
                              fill="#C8FF00"
                              fillOpacity={0.35}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-2 flex flex-col gap-2">
                        {r.feedback.score_breakdown.map((s, i) => (
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
                            <p style={{ color: "#999999", fontSize: 11, marginTop: 3 }}>
                              {s.comment}
                            </p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {mode === "individual" && r.feedback.recruiter_view && (
                    <RecruiterViewPreview view={r.feedback.recruiter_view} />
                  )}
                  {r.feedback.competencies && r.feedback.competencies.length > 0 && (
                    <div>
                      <p
                        style={{ color: "#C8FF00", fontSize: 12, fontWeight: 700, marginBottom: 4 }}
                      >
                        7つの評価（あなたの発言が根拠）
                      </p>
                      <div className="flex flex-col gap-2">
                        {r.feedback.competencies.map((c) => (
                          <div
                            key={c.key}
                            className="rounded-lg p-3"
                            style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                          >
                            <div className="flex items-center justify-between">
                              <span style={{ color: "#F0F0F0", fontSize: 12, fontWeight: 700 }}>
                                {c.label}
                              </span>
                              <span style={{ color: c.score ? "#C8FF00" : "#666", fontSize: 12 }}>
                                {c.score ? `${c.score} / 5` : "今回は根拠となる発言なし"}
                              </span>
                            </div>
                            {c.reason && (
                              <p style={{ color: "#999999", fontSize: 11, marginTop: 3 }}>
                                {c.reason}
                              </p>
                            )}
                            {c.evidence.map((q, i) => (
                              <p
                                key={i}
                                style={{
                                  color: "#CCCCCC",
                                  fontSize: 11,
                                  marginTop: 4,
                                  paddingLeft: 8,
                                  borderLeft: "2px solid #C8FF00",
                                }}
                              >
                                「{q}」
                              </p>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.feedback.personality_traits && r.feedback.personality_traits.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span style={{ color: "#E29CFF", fontSize: 12, fontWeight: 700 }}>
                          性格・特性分析
                        </span>
                        <span
                          style={{
                            background: "#E29CFF22",
                            color: "#E29CFF",
                            fontSize: 10,
                            fontWeight: 700,
                            borderRadius: 6,
                            padding: "1px 6px",
                          }}
                        >
                          PRO
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {r.feedback.personality_traits.map((t, i) => (
                          <div
                            key={i}
                            className="rounded-lg p-3"
                            style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                          >
                            <p style={{ color: "#F0F0F0", fontSize: 12, fontWeight: 700 }}>
                              {t.trait}
                            </p>
                            <p style={{ color: "#999999", fontSize: 11, marginTop: 3 }}>
                              {t.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.feedback.detailed_analysis && (
                    <div>
                      <p
                        style={{ color: "#E29CFF", fontSize: 12, fontWeight: 700, marginBottom: 4 }}
                      >
                        詳細分析
                      </p>
                      <p style={{ color: "#CCCCCC", fontSize: 13, lineHeight: 1.8 }}>
                        {r.feedback.detailed_analysis}
                      </p>
                    </div>
                  )}
                  {r.feedback.speech_stats && <SpeechStatsCard stats={r.feedback.speech_stats} />}
                  {r.feedback.delivery && <DeliveryCard d={r.feedback.delivery} />}
                  {r.feedback.good_points && r.feedback.good_points.length > 0 && (
                    <div>
                      <p
                        style={{ color: "#C8FF00", fontSize: 12, fontWeight: 700, marginBottom: 4 }}
                      >
                        良かった点
                      </p>
                      <ul className="list-disc pl-5">
                        {r.feedback.good_points.map((g, i) => (
                          <li key={i} style={{ color: "#CCCCCC", fontSize: 12, lineHeight: 1.7 }}>
                            {g}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.feedback.sample_better_answers &&
                    r.feedback.sample_better_answers.length > 0 && (
                      <div>
                        <p
                          style={{
                            color: "#F0F0F0",
                            fontSize: 12,
                            fontWeight: 700,
                            marginBottom: 6,
                          }}
                        >
                          より良い回答例
                        </p>
                        <div className="flex flex-col gap-2">
                          {r.feedback.sample_better_answers.map((qa, i) => (
                            <div
                              key={i}
                              className="rounded-lg p-3"
                              style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                            >
                              <p style={{ color: "#888888", fontSize: 11 }}>Q. {qa.question}</p>
                              <p style={{ color: "#CCCCCC", fontSize: 12, marginTop: 4 }}>
                                {qa.better_answer}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              ) : (
                <p className="mt-3 text-[12px]" style={{ color: "#888888" }}>
                  フィードバック生成中、または未生成です。
                </p>
              )}
            </details>
          ))}
        </div>

        {hiddenCount > 0 && (
          <div
            className="mt-4 rounded-2xl p-4 text-center"
            style={{ background: "#16200A", border: "1px solid #3A4A12" }}
          >
            <p style={{ color: "#E6F7B0", fontSize: 13 }}>
              いまのプランで見られるのは新しい{resultLimit}件までです。
              <br />
              古い結果{hiddenCount}件は消えずに残っていて、プランを上げると見られます。
            </p>
            <Link
              to="/pricing"
              className="mt-2 inline-block"
              style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700 }}
            >
              プランを見る →
            </Link>
          </div>
        )}
      </div>
    </PrivateShell>
  );
}

/** 企業に見える見立てを、本人も同じ内容で確認できるようにする */
/** いちばん新しい練習の点数が、練習した人の中で上位何%か */
function RankBanner({ mode }: { mode: "individual" | "student" }) {
  const [rank, setRank] = useState<{
    score: number | null;
    total?: number;
    rank?: number;
    percent?: number;
    notEnough?: boolean;
  } | null>(null);
  useEffect(() => {
    void talentApi<NonNullable<typeof rank>>(`/api/talent/my-rank?mode=${mode}`).then((r) => {
      if (r.ok) setRank(r.data);
    });
  }, [mode]);
  if (!rank || rank.score == null) return null;
  return (
    <div
      className="mb-4 flex items-center gap-4 rounded-2xl p-4"
      style={{
        background: "linear-gradient(135deg, #1F2A08 0%, #141414 70%)",
        border: "1px solid #3A4A12",
      }}
    >
      <div
        className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl"
        style={{ background: "#C8FF00", color: "#0F0F0F" }}
      >
        <span style={{ fontSize: 10, fontWeight: 700 }}>上位</span>
        <span style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
          {rank.percent != null ? `${rank.percent}%` : "—"}
        </span>
      </div>
      <div className="min-w-0">
        <p style={{ color: "#888", fontSize: 11 }}>前回の練習 {rank.score}点</p>
        {rank.percent != null ? (
          <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>
            練習した{rank.total!.toLocaleString()}人の中で {rank.rank!.toLocaleString()}位
          </p>
        ) : (
          <p style={{ color: "#CCCCCC", fontSize: 13, lineHeight: 1.6 }}>
            練習した人が集まると、あなたが上位何%か表示されます
          </p>
        )}
        <p style={{ color: "#888", fontSize: 11, marginTop: 2 }}>
          1人につき一番良い点数で比べています
        </p>
      </div>
    </div>
  );
}

function RecruiterViewPreview({ view }: { view: NonNullable<PracticeFeedback["recruiter_view"]> }) {
  return (
    <details
      className="rounded-xl p-3"
      style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
    >
      <summary style={{ color: "#AAAAAA", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        企業に表示される内容（この結果を公開していて、企業があなたの結果を見る手続きをしたときに見えます）
      </summary>
      <div
        className="mt-2 flex flex-col gap-2 text-[12px]"
        style={{ color: "#CCCCCC", lineHeight: 1.7 }}
      >
        {view.summary && <p>{view.summary}</p>}
        {view.strengths.map((s, i) => (
          <p key={i}>・{s.point}</p>
        ))}
        {view.workStyle && <p>傾向：{view.workStyle}</p>}
        {view.confirmPoints.length > 0 && <p>面談で確かめる点：{view.confirmPoints.join("／")}</p>}
      </div>
    </details>
  );
}
