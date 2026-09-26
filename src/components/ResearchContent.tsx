import { Navigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { PrivateShell } from "@/components/ModeShell";
import { ProseTemplate, exportElementToPdf } from "@/components/DocumentTemplates";

type ResearchResult = {
  overview: string;
  recent_topics: string[];
  expected_questions: { question: string; point: string }[];
  advice: string;
};

type HistoryRow = { id: string; title: string; created_at: string; result: ResearchResult };

function resultToPlainText(targetLabel: string, r: ResearchResult): string {
  const lines: string[] = [];
  lines.push(`## 概要\n${r.overview}`);
  if (r.recent_topics?.length) {
    lines.push(`## 最近のトピック\n${r.recent_topics.map((t) => `- ${t}`).join("\n")}`);
  }
  if (r.expected_questions?.length) {
    lines.push(
      `## 想定質問\n${r.expected_questions.map((q) => `Q. ${q.question}\n${q.point}`).join("\n\n")}`,
    );
  }
  lines.push(`## あなたへのアドバイス\n${r.advice}`);
  return lines.join("\n\n");
}

export function ResearchContent({
  mode,
  backTo,
}: {
  mode: "individual" | "student";
  backTo: string;
}) {
  const { session, loading } = useAuth();
  const [targetName, setTargetName] = useState("");
  const [researching, setResearching] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [exportTarget, setExportTarget] = useState<HistoryRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const loadHistory = async () => {
    if (!session) return;
    const { data } = await (supabase
      .from("generated_documents")
      .select("id, title, generated_content, created_at")
      .eq("user_id", session.user.id)
      .eq("mode", mode)
      .eq("doc_type", "research")
      .order("created_at", { ascending: false }) as any);
    const rows: HistoryRow[] = ((data ?? []) as any[])
      .map((d) => {
        try {
          return {
            id: d.id,
            title: d.title,
            created_at: d.created_at,
            result: JSON.parse(d.generated_content),
          };
        } catch {
          return null;
        }
      })
      .filter((r): r is HistoryRow => r !== null);
    setHistory(rows);
  };

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, mode]);

  useEffect(() => {
    if (!exportTarget || !exportRef.current) return;
    (async () => {
      setExporting(true);
      try {
        await new Promise((r) => setTimeout(r, 150));
        if (exportRef.current) {
          await exportElementToPdf(exportRef.current, `${exportTarget.title || "研究結果"}.pdf`);
        }
      } catch (e) {
        console.error(e);
        toast.error("PDFの作成に失敗しました");
      } finally {
        setExporting(false);
        setExportTarget(null);
      }
    })();
  }, [exportTarget]);

  const handleDeleteHistory = async (id: string) => {
    await supabase.from("generated_documents").delete().eq("id", id);
    setHistory((prev) => prev.filter((h) => h.id !== id));
  };

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

  const targetLabel = mode === "student" ? "志望校" : "志望企業";

  const handleResearch = async () => {
    if (!targetName.trim()) {
      toast.error(`${targetLabel}名を入力してください`);
      return;
    }
    setResearching(true);
    setResult(null);
    try {
      const res = await fetch(`/api/research-target?_t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
        body: JSON.stringify({ targetName: targetName.trim() }),
      });
      if (res.status === 429) {
        const errBody = (await res.json().catch(() => null)) as { message?: string } | null;
        toast.error(errBody?.message ?? "利用上限に達しました");
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as ResearchResult;
      setResult(data);
      void loadHistory();
    } catch (e) {
      console.error(e);
      toast.error("調査に失敗しました。もう一度お試しください");
    } finally {
      setResearching(false);
    }
  };

  const inputStyle = {
    background: "#0F0F0F",
    border: "1px solid #2A2A2A",
    borderRadius: 8,
    color: "#F0F0F0",
    padding: "10px 12px",
    width: "100%",
    fontSize: 14,
  } as const;
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
          {mode === "student" ? "志望校研究AI" : "企業研究AI"}
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "#999999" }}>
          {targetLabel}名を入力すると、AIが調べて想定質問と対策をまとめます。
        </p>

        <div className="mt-6 flex gap-2">
          <input
            style={inputStyle}
            value={targetName}
            onChange={(e) => setTargetName(e.target.value)}
            placeholder={mode === "student" ? "例：東京大学 経済学部" : "例：株式会社〇〇"}
          />
          <button
            onClick={handleResearch}
            disabled={researching}
            className="shrink-0 rounded-lg px-5 text-[14px] transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
          >
            {researching ? "調査中..." : "調べる"}
          </button>
        </div>

        {result && (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl p-5" style={cardStyle}>
              <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                概要
              </p>
              <p style={{ color: "#F0F0F0", fontSize: 13, lineHeight: 1.8 }}>{result.overview}</p>
            </div>

            {result.recent_topics?.length > 0 && (
              <div className="rounded-2xl p-5" style={cardStyle}>
                <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  最近のトピック
                </p>
                <ul className="list-disc pl-5">
                  {result.recent_topics.map((t, i) => (
                    <li key={i} style={{ color: "#CCCCCC", fontSize: 13, lineHeight: 1.7 }}>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-2xl p-5" style={cardStyle}>
              <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                想定質問
              </p>
              <div className="space-y-3">
                {result.expected_questions?.map((q, i) => (
                  <div
                    key={i}
                    className="rounded-lg p-3"
                    style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                  >
                    <p style={{ color: "#F0F0F0", fontSize: 13, fontWeight: 700 }}>
                      Q. {q.question}
                    </p>
                    <p style={{ color: "#999999", fontSize: 12, marginTop: 4 }}>{q.point}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl p-5" style={cardStyle}>
              <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                あなたへのアドバイス
              </p>
              <p style={{ color: "#F0F0F0", fontSize: 13, lineHeight: 1.8 }}>{result.advice}</p>
            </div>
          </div>
        )}

        <h2 className="mt-10 text-[16px]" style={{ color: "#F0F0F0", fontWeight: 700 }}>
          過去の調査履歴
        </h2>
        {history.length === 0 && (
          <p className="mt-2 text-[13px]" style={{ color: "#888888" }}>
            まだありません。
          </p>
        )}
        <div className="mt-3 space-y-3">
          {history.map((h) => (
            <details key={h.id} className="rounded-xl p-4" style={cardStyle}>
              <summary
                className="flex cursor-pointer items-center justify-between"
                style={{ color: "#F0F0F0", fontSize: 14 }}
              >
                <span>
                  {h.title}
                  <span style={{ color: "#666666", fontSize: 11, marginLeft: 8 }}>
                    {new Date(h.created_at).toLocaleDateString("ja-JP")}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setExportTarget(h);
                    }}
                    disabled={exporting}
                    style={{ color: "#C8FF00", fontSize: 12 }}
                  >
                    {exporting && exportTarget?.id === h.id ? "PDF作成中..." : "PDFで保存"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDeleteHistory(h.id);
                    }}
                    style={{ color: "#FF6B6B", fontSize: 12 }}
                  >
                    削除
                  </button>
                </span>
              </summary>
              <div className="mt-3 space-y-3">
                <p style={{ color: "#CCCCCC", fontSize: 12, lineHeight: 1.7 }}>
                  {h.result.overview}
                </p>
                {h.result.expected_questions?.length > 0 && (
                  <div className="space-y-2">
                    {h.result.expected_questions.map((q, i) => (
                      <div
                        key={i}
                        className="rounded-lg p-2.5"
                        style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                      >
                        <p style={{ color: "#F0F0F0", fontSize: 12, fontWeight: 700 }}>
                          Q. {q.question}
                        </p>
                        <p style={{ color: "#888888", fontSize: 11, marginTop: 3 }}>{q.point}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>

        {/* PDF書き出し用の非表示テンプレート */}
        {exportTarget && (
          <div style={{ position: "fixed", top: 0, left: -99999 }}>
            <div ref={exportRef}>
              <ProseTemplate
                title={exportTarget.title}
                content={resultToPlainText(targetLabel, exportTarget.result)}
              />
            </div>
          </div>
        )}
      </div>
    </PrivateShell>
  );
}
