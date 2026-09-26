import { Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { PrivateShell } from "@/components/ModeShell";

type SavedReport = {
  id: string;
  report_type: "basic" | "detailed";
  strengths: string[];
  weaknesses: string[];
  concerns: string;
  appeal_points: string[];
  suited_jobs: { name: string; reason: string }[];
  raw_content: { summary?: string };
  created_at: string;
};

export function SelfAnalysisContent({
  mode,
  backTo,
}: {
  mode: "individual" | "student";
  backTo: string;
}) {
  const { session, loading } = useAuth();
  const [generating, setGenerating] = useState<"basic" | "detailed" | null>(null);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [fetchingReports, setFetchingReports] = useState(true);

  const loadReports = async () => {
    if (!session) return;
    const { data } = await (supabase
      .from("self_analysis_reports")
      .select(
        "id, report_type, strengths, weaknesses, concerns, appeal_points, suited_jobs, raw_content, created_at",
      )
      .eq("user_id", session.user.id)
      .eq("mode", mode)
      .order("created_at", { ascending: false }) as any);
    setReports((data ?? []) as SavedReport[]);
    setFetchingReports(false);
  };

  useEffect(() => {
    void loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

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

  const handleGenerate = async (reportType: "basic" | "detailed") => {
    setGenerating(reportType);
    try {
      const res = await fetch(`/api/generate-self-analysis?_t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
        body: JSON.stringify({ reportType }),
      });
      if (res.status === 429) {
        const errBody = (await res.json().catch(() => null)) as { message?: string } | null;
        toast.error(errBody?.message ?? "利用上限に達しました");
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      toast.success("自己分析レポートを生成しました");
      void loadReports();
    } catch (e) {
      console.error(e);
      toast.error("生成に失敗しました。もう一度お試しください");
    } finally {
      setGenerating(null);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("self_analysis_reports").delete().eq("id", id);
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

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
          自己分析レポート
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "#999999" }}>
          プロフィールと「今日の質問」の回答をもとに、AIが自己分析をまとめます。
        </p>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => handleGenerate("basic")}
            disabled={generating !== null}
            className="flex-1 rounded-2xl p-4 text-left transition-opacity hover:opacity-90 disabled:opacity-50"
            style={cardStyle}
          >
            <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700 }}>基本分析</p>
            <p style={{ color: "#888888", fontSize: 12, marginTop: 4 }}>無料（月3回まで）</p>
            <p style={{ color: "#C8FF00", fontSize: 12, marginTop: 8 }}>
              {generating === "basic" ? "生成中..." : "生成する →"}
            </p>
          </button>
          <button
            onClick={() => handleGenerate("detailed")}
            disabled={generating !== null}
            className="flex-1 rounded-2xl p-4 text-left transition-opacity hover:opacity-90 disabled:opacity-50"
            style={cardStyle}
          >
            <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700 }}>詳細分析</p>
            <p style={{ color: "#888888", fontSize: 12, marginTop: 4 }}>プロ限定・無制限</p>
            <p style={{ color: "#C8FF00", fontSize: 12, marginTop: 8 }}>
              {generating === "detailed" ? "生成中..." : "生成する →"}
            </p>
          </button>
        </div>

        <h2 className="mt-10 text-[16px]" style={{ color: "#F0F0F0", fontWeight: 700 }}>
          過去のレポート
        </h2>
        {fetchingReports && (
          <p className="mt-2 text-[13px]" style={{ color: "#888888" }}>
            読み込み中...
          </p>
        )}
        {!fetchingReports && reports.length === 0 && (
          <p className="mt-2 text-[13px]" style={{ color: "#888888" }}>
            まだありません。
          </p>
        )}

        <div className="mt-3 space-y-3">
          {reports.map((r) => (
            <details key={r.id} className="rounded-xl p-4" style={cardStyle}>
              <summary
                className="flex cursor-pointer items-center justify-between"
                style={{ color: "#F0F0F0", fontSize: 14 }}
              >
                <span>
                  {r.report_type === "detailed" ? "詳細分析" : "基本分析"}
                  <span style={{ color: "#666666", fontSize: 11, marginLeft: 8 }}>
                    {new Date(r.created_at).toLocaleDateString("ja-JP")}
                  </span>
                </span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete(r.id);
                  }}
                  style={{ color: "#FF6B6B", fontSize: 12 }}
                >
                  削除
                </button>
              </summary>

              <div className="mt-4 space-y-4">
                {r.raw_content?.summary && (
                  <p style={{ color: "#CCCCCC", fontSize: 13, lineHeight: 1.8 }}>
                    {r.raw_content.summary}
                  </p>
                )}

                {r.strengths?.length > 0 && (
                  <div>
                    <p style={{ color: "#C8FF00", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                      強み
                    </p>
                    <ul className="list-disc pl-5">
                      {r.strengths.map((s, i) => (
                        <li key={i} style={{ color: "#CCCCCC", fontSize: 12, lineHeight: 1.7 }}>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {r.weaknesses?.length > 0 && (
                  <div>
                    <p style={{ color: "#FFB84D", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                      弱み・課題
                    </p>
                    <ul className="list-disc pl-5">
                      {r.weaknesses.map((w, i) => (
                        <li key={i} style={{ color: "#CCCCCC", fontSize: 12, lineHeight: 1.7 }}>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {r.concerns && (
                  <div>
                    <p style={{ color: "#FF6B6B", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                      懸念点
                    </p>
                    <p style={{ color: "#CCCCCC", fontSize: 12, lineHeight: 1.7 }}>{r.concerns}</p>
                  </div>
                )}

                {r.appeal_points?.length > 0 && (
                  <div>
                    <p style={{ color: "#7DDCF5", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                      アピールポイント
                    </p>
                    <ul className="list-disc pl-5">
                      {r.appeal_points.map((a, i) => (
                        <li key={i} style={{ color: "#CCCCCC", fontSize: 12, lineHeight: 1.7 }}>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {r.suited_jobs?.length > 0 && (
                  <div>
                    <p style={{ color: "#E29CFF", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                      {mode === "student" ? "向いている学校・学部の傾向" : "向いている職業・業界"}
                    </p>
                    <div className="space-y-2">
                      {r.suited_jobs.map((s, i) => (
                        <div
                          key={i}
                          className="rounded-lg p-2.5"
                          style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                        >
                          <p style={{ color: "#F0F0F0", fontSize: 12, fontWeight: 700 }}>
                            {s.name}
                          </p>
                          <p style={{ color: "#999999", fontSize: 11, marginTop: 2 }}>{s.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      </div>
    </PrivateShell>
  );
}
