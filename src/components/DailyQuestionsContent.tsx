import { Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { PrivateShell } from "@/components/ModeShell";

type Question = {
  id: string;
  category: string;
  question_text: string;
  answer_text: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  strengths: "強み",
  weaknesses: "弱み・課題",
  values: "価値観",
  episode: "エピソード",
  motivation: "志望動機・志望理由",
  reflection: "ふりかえり",
};

export function DailyQuestionsContent({
  mode,
  backTo,
}: {
  mode: "individual" | "student";
  backTo: string;
}) {
  const { session, loading } = useAuth();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [allResponses, setAllResponses] = useState<
    | {
        id: string;
        question_id: string;
        question_text: string;
        category: string;
        answer_text: string;
      }[]
    | null
  >(null);
  const [historyDrafts, setHistoryDrafts] = useState<Record<string, string>>({});
  const [savingHistoryId, setSavingHistoryId] = useState<string | null>(null);

  const loadAllResponses = async () => {
    if (!session) return;
    const { data } = await (
      supabase
        .from("daily_question_responses")
        .select("id, question_id, question_text, category, answer_text")
        .eq("user_id", session.user.id) as any
    )
      .eq("mode", mode)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as {
      id: string;
      question_id: string;
      question_text: string;
      category: string;
      answer_text: string;
    }[];
    setAllResponses(rows);
    const initial: Record<string, string> = {};
    for (const r of rows) initial[r.id] = r.answer_text ?? "";
    setHistoryDrafts(initial);
  };

  const handleToggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && allResponses === null) void loadAllResponses();
  };

  const handleSaveHistoryAnswer = async (row: { id: string; question_id: string }) => {
    if (!session) return;
    const text = (historyDrafts[row.id] ?? "").trim();
    if (!text) {
      toast.error("回答を入力してください");
      return;
    }
    setSavingHistoryId(row.id);
    try {
      const { error } = await (supabase
        .from("daily_question_responses")
        .update({ answer_text: text } as any)
        .eq("id", row.id)
        .eq("user_id", session.user.id) as any);
      if (error) throw error;
      toast.success("更新しました");
      setAllResponses((prev) =>
        prev ? prev.map((r) => (r.id === row.id ? { ...r, answer_text: text } : r)) : prev,
      );
      // 今日の質問に同じquestion_idが含まれていれば、そちらの表示も更新する
      setQuestions((prev) =>
        prev ? prev.map((q) => (q.id === row.question_id ? { ...q, answer_text: text } : q)) : prev,
      );
    } catch (e) {
      console.error(e);
      toast.error("更新に失敗しました");
    } finally {
      setSavingHistoryId(null);
    }
  };

  const fetchQuestions = async (extra: boolean) => {
    if (!session) return;
    const url = extra
      ? `/api/daily-question?extra=1&_t=${Date.now()}`
      : `/api/daily-question?_t=${Date.now()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = (await res.json()) as { questions: Question[] };
    return data.questions;
  };

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const qs = await fetchQuestions(false);
        setQuestions(qs ?? []);
        const initialDrafts: Record<string, string> = {};
        for (const q of qs ?? []) {
          initialDrafts[q.id] = q.answer_text ?? "";
        }
        setDrafts(initialDrafts);
      } catch (e) {
        console.error(e);
        setFetchError(true);
      }
    })();
  }, [session]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const more = await fetchQuestions(true);
      if (more && more.length > 0) {
        setQuestions((prev) => [...(prev ?? []), ...more]);
        setDrafts((prev) => {
          const next = { ...prev };
          for (const q of more) next[q.id] = q.answer_text ?? "";
          return next;
        });
      } else {
        toast("今はこれ以上の質問がありません。また後で試してください");
      }
    } catch (e) {
      console.error(e);
      toast.error("追加の質問を取得できませんでした");
    } finally {
      setLoadingMore(false);
    }
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

  const handleSave = async (question: Question) => {
    const answerText = (drafts[question.id] ?? "").trim();
    if (!answerText) {
      toast.error("回答を入力してください");
      return;
    }
    setSavingId(question.id);
    try {
      const { error } = await (supabase.from("daily_question_responses").upsert(
        {
          user_id: session.user.id,
          question_id: question.id,
          answer_text: answerText,
          question_text: question.question_text,
          category: question.category,
          mode,
          answered_on: new Date().toISOString().slice(0, 10),
        } as any,
        { onConflict: "user_id,question_id" },
      ) as any);
      if (error) throw error;
      toast.success("保存しました");
      setQuestions((prev) =>
        prev
          ? prev.map((q) => (q.id === question.id ? { ...q, answer_text: answerText } : q))
          : prev,
      );
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました");
    } finally {
      setSavingId(null);
    }
  };

  const answeredCount = questions?.filter((q) => q.answer_text).length ?? 0;

  return (
    <PrivateShell>
      <div className="mx-auto max-w-lg px-6 py-10">
        <Link to={backTo} style={{ color: "#888888", fontSize: 13 }}>
          ← 戻る
        </Link>
        <h1 className="mt-4 text-[22px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
          今日の質問
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "#999999" }}>
          答えるほど、面接練習や自己分析の精度が上がります。今日の回答済み：{answeredCount} /{" "}
          {questions?.length ?? 5}
        </p>

        {fetchError && (
          <p className="mt-6 text-[13px]" style={{ color: "#FF6B6B" }}>
            質問の取得に失敗しました。時間をおいて再度お試しください。
          </p>
        )}

        {!questions && !fetchError && (
          <p className="mt-6 text-[13px]" style={{ color: "#888888" }}>
            読み込み中...
          </p>
        )}

        {questions?.length === 0 && (
          <p className="mt-6 text-[13px]" style={{ color: "#888888" }}>
            すべての質問に回答済みです！また新しい質問が追加されるまでお待ちください。
          </p>
        )}

        <div className="mt-8 space-y-6">
          {questions?.map((q) => (
            <div
              key={q.id}
              className="rounded-2xl p-5"
              style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
            >
              <span
                style={{
                  background: "#2A2A2A",
                  color: "#C8FF00",
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 6,
                  padding: "2px 8px",
                }}
              >
                {CATEGORY_LABELS[q.category] ?? q.category}
              </span>
              <p className="mt-3 text-[15px]" style={{ color: "#F0F0F0", fontWeight: 600 }}>
                {q.question_text}
              </p>
              <textarea
                value={drafts[q.id] ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="思いつく範囲で大丈夫です"
                className="mt-3 w-full"
                style={{
                  background: "#0F0F0F",
                  border: "1px solid #2A2A2A",
                  borderRadius: 8,
                  color: "#F0F0F0",
                  padding: "10px 12px",
                  fontSize: 14,
                  minHeight: 70,
                  resize: "vertical",
                }}
              />
              <button
                onClick={() => handleSave(q)}
                disabled={savingId === q.id}
                className="mt-3 rounded-full px-5 py-2 text-[13px] transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
              >
                {savingId === q.id ? "保存中..." : q.answer_text ? "更新する" : "保存する"}
              </button>
            </div>
          ))}
        </div>

        {questions && questions.length > 0 && (
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="mt-6 w-full rounded-full py-3 text-[14px] transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ border: "1px dashed #444444", color: "#CCCCCC" }}
          >
            {loadingMore ? "取得中..." : "＋もっと答える"}
          </button>
        )}

        <button
          onClick={handleToggleHistory}
          className="mt-8 flex w-full items-center justify-between rounded-xl px-4 py-3 text-[14px]"
          style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", color: "#F0F0F0" }}
        >
          <span>過去の回答を見る・編集する</span>
          <span style={{ color: "#888888" }}>{showHistory ? "▲" : "▼"}</span>
        </button>

        {showHistory && (
          <div className="mt-4 space-y-4">
            {allResponses === null && (
              <p className="text-[13px]" style={{ color: "#888888" }}>
                読み込み中...
              </p>
            )}
            {allResponses?.length === 0 && (
              <p className="text-[13px]" style={{ color: "#888888" }}>
                まだ回答がありません。
              </p>
            )}
            {allResponses?.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl p-5"
                style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
              >
                <span
                  style={{
                    background: "#2A2A2A",
                    color: "#C8FF00",
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 6,
                    padding: "2px 8px",
                  }}
                >
                  {CATEGORY_LABELS[r.category] ?? r.category}
                </span>
                <p className="mt-3 text-[14px]" style={{ color: "#F0F0F0", fontWeight: 600 }}>
                  {r.question_text}
                </p>
                <textarea
                  value={historyDrafts[r.id] ?? ""}
                  onChange={(e) =>
                    setHistoryDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                  }
                  className="mt-3 w-full"
                  style={{
                    background: "#0F0F0F",
                    border: "1px solid #2A2A2A",
                    borderRadius: 8,
                    color: "#F0F0F0",
                    padding: "10px 12px",
                    fontSize: 13,
                    minHeight: 60,
                    resize: "vertical",
                  }}
                />
                <button
                  onClick={() => handleSaveHistoryAnswer(r)}
                  disabled={savingHistoryId === r.id}
                  className="mt-2 rounded-full px-4 py-1.5 text-[12px] transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: "#2A2A2A", color: "#F0F0F0" }}
                >
                  {savingHistoryId === r.id ? "保存中..." : "更新する"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PrivateShell>
  );
}
