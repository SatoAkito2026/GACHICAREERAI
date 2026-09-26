import { Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

type PracticeFeedback = {
  overall_impression?: string;
  score_breakdown?: { category: string; score: number; comment: string }[];
  good_points?: string[];
  improvement_points?: string[];
  sample_better_answers?: { question: string; better_answer: string }[];
  readiness_score?: number;
  personality_traits?: { trait: string; description: string }[] | null;
  detailed_analysis?: string | null;
};

type HistoryRow = {
  id: string;
  job_type: string | null;
  created_at: string;
  feedback: PracticeFeedback | null;
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

      setRows(
        list.map((i) => ({
          id: i.id,
          job_type: i.job_type,
          created_at: i.created_at,
          feedback: feedbackMap.get(i.id) ?? null,
        })),
      );
    })();
  }, [session, mode]);

  const handleDelete = async (id: string) => {
    await supabase.from("interviews").delete().eq("id", id);
    setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
  };

  if (loading || rows === null) {
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

  const cardStyle = {
    background: "#1A1A1A",
    border: "1px solid #2A2A2A",
    borderRadius: 16,
  } as const;

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

        <div className="mt-6 space-y-3">
          {rows.map((r) => (
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
                  {r.feedback?.readiness_score != null && (
                    <span style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700 }}>
                      {r.feedback.readiness_score}点
                    </span>
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

              {r.feedback ? (
                <div className="mt-4 space-y-4">
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
                    <div>
                      <p
                        style={{ color: "#F0F0F0", fontSize: 12, fontWeight: 700, marginBottom: 6 }}
                      >
                        スコア内訳
                      </p>
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
                  {r.feedback.improvement_points && r.feedback.improvement_points.length > 0 && (
                    <div>
                      <p
                        style={{ color: "#FFB84D", fontSize: 12, fontWeight: 700, marginBottom: 4 }}
                      >
                        改善するとよい点
                      </p>
                      <ul className="list-disc pl-5">
                        {r.feedback.improvement_points.map((g, i) => (
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
      </div>
    </PrivateShell>
  );
}
