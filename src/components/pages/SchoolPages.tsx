/**
 * 学校・塾モード：生徒の練習状況
 * 生徒が招待コードで参加すると、先生はその生徒の模擬面接の回数・点数・フィードバックを見られる。
 */
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw } from "lucide-react";
import { BusinessShell } from "@/components/ModeShell";
import {
  Button,
  C,
  Card,
  ErrorText,
  Loading,
  PageFrame,
  talentApi,
} from "@/components/talent/TalentUI";

type Student = {
  id: string;
  name: string;
  joinedAt: string;
  practiceCount: number;
  monthCount: number;
  lastPracticeAt: string | null;
  latestScore: number | null;
  firstScore: number | null;
  recentAverage: number | null;
};

function date(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("ja-JP") : "—";
}

function daysSince(iso: string | null): number | null {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;
}

export function SchoolStudentsPage() {
  const [data, setData] = useState<{
    school: { name: string; joinCode: string };
    students: Student[];
  } | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<"name" | "recent" | "count" | "score">("recent");

  const load = useCallback(async () => {
    const r = await talentApi<{ school: { name: string; joinCode: string }; students: Student[] }>(
      "/api/school/students",
    );
    if (r.ok) setData(r.data);
    else setError(r.data.error ?? "読み込みに失敗しました");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const newCode = async () => {
    if (
      !window.confirm(
        "招待コードを作り直します。今のコードは使えなくなります（参加済みの生徒はそのままです）。",
      )
    )
      return;
    const r = await talentApi<{ joinCode: string }>("/api/school/students", { action: "new-code" });
    if (r.ok && data) setData({ ...data, school: { ...data.school, joinCode: r.data.joinCode } });
  };

  const students = [...(data?.students ?? [])].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ja");
    if (sort === "count") return b.practiceCount - a.practiceCount;
    if (sort === "score") return (b.recentAverage ?? -1) - (a.recentAverage ?? -1);
    return (b.lastPracticeAt ?? "").localeCompare(a.lastPracticeAt ?? "");
  });

  return (
    <BusinessShell>
      <PageFrame
        width={1000}
        title="生徒の練習状況"
        subtitle="生徒が招待コードを入力すると参加し、模擬面接の回数・点数・フィードバックが見られるようになります。生徒はいつでも抜けられます。"
      >
        {error ? (
          <ErrorText>{error}</ErrorText>
        ) : !data ? (
          <Loading />
        ) : (
          <>
            <Card>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[12px]" style={{ color: C.muted }}>
                    {data.school.name} の招待コード
                  </p>
                  <p style={{ color: C.accent, fontSize: 30, fontWeight: 800, letterSpacing: 4 }}>
                    {data.school.joinCode}
                  </p>
                  <p className="text-[12px]" style={{ color: C.sub, lineHeight: 1.7 }}>
                    生徒は「マイページ → 学校・塾とつながる」でこのコードを入力します。
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(data.school.joinCode)
                        .then(() => toast.success("コピーしました"));
                    }}
                  >
                    <Copy size={14} /> コピー
                  </Button>
                  <Button variant="ghost" onClick={() => void newCode()}>
                    <RefreshCw size={14} /> 作り直す
                  </Button>
                </div>
              </div>
            </Card>

            <div className="flex items-center justify-between">
              <p style={{ color: C.text, fontSize: 15, fontWeight: 700 }}>
                参加している生徒 {students.length}人
              </p>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="rounded-lg px-3 py-2 text-[13px] outline-none"
                style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text }}
              >
                <option value="recent">最近練習した順</option>
                <option value="count">練習回数が多い順</option>
                <option value="score">点数が高い順</option>
                <option value="name">名前順</option>
              </select>
            </div>

            {students.length === 0 ? (
              <p className="py-8 text-center text-[14px]" style={{ color: C.muted }}>
                まだ参加している生徒はいません。上の招待コードを生徒に伝えてください。
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {students.map((s) => {
                  const idle = daysSince(s.lastPracticeAt);
                  const growth =
                    s.latestScore !== null && s.firstScore !== null && s.practiceCount > 1
                      ? s.latestScore - s.firstScore
                      : null;
                  return (
                    <Link
                      key={s.id}
                      to="/business/school/students/$id"
                      params={{ id: s.id }}
                      className="flex flex-col gap-2 rounded-2xl p-4 transition-colors hover:border-[#C8FF00] md:flex-row md:items-center md:gap-6"
                      style={{ background: C.card, border: `1px solid ${C.border}` }}
                    >
                      <div className="min-w-0 flex-1">
                        <p style={{ color: C.text, fontSize: 15, fontWeight: 700 }}>{s.name}</p>
                        <p className="text-[12px]" style={{ color: C.muted }}>
                          最後の練習 {date(s.lastPracticeAt)}
                          {idle !== null && idle >= 14 && (
                            <span style={{ color: "#FFB84D" }}> ・ {idle}日練習していません</span>
                          )}
                          {s.lastPracticeAt === null && (
                            <span style={{ color: "#FFB84D" }}> ・ まだ練習していません</span>
                          )}
                        </p>
                      </div>
                      <div className="grid grid-cols-4 gap-3 text-center md:w-[420px]">
                        <Stat label="今月" value={`${s.monthCount}回`} />
                        <Stat label="合計" value={`${s.practiceCount}回`} />
                        <Stat
                          label="直近の平均"
                          value={s.recentAverage !== null ? `${s.recentAverage}点` : "—"}
                        />
                        <Stat
                          label="伸び"
                          value={growth !== null ? `${growth >= 0 ? "+" : ""}${growth}` : "—"}
                          color={growth !== null && growth > 0 ? C.accent : undefined}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </PageFrame>
    </BusinessShell>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[10px]" style={{ color: C.muted }}>
        {label}
      </p>
      <p style={{ color: color ?? C.text, fontSize: 15, fontWeight: 800 }}>{value}</p>
    </div>
  );
}

type PracticeDetail = {
  id: string;
  date: string;
  mode: string;
  target: string | null;
  score: number | null;
  overall: string;
  scoreBreakdown: { category: string; score: number; comment: string }[];
  goodPoints: string[];
  improvementPoints: string[];
};

export function SchoolStudentPage({ id }: { id: string }) {
  const [data, setData] = useState<{
    name: string;
    joinedAt: string;
    practice: PracticeDetail[];
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void talentApi<{ name: string; joinedAt: string; practice: PracticeDetail[] }>(
      `/api/school/student?id=${encodeURIComponent(id)}`,
    ).then((r) => {
      if (r.ok) setData(r.data);
      else setError(r.data.error ?? "読み込みに失敗しました");
    });
  }, [id]);

  const remove = async () => {
    if (!data || !window.confirm(`${data.name} さんを学校から外します。よろしいですか？`)) return;
    const r = await talentApi("/api/school/students", { action: "remove", studentId: id });
    if (r.ok) {
      toast.success("外しました");
      window.history.back();
    }
  };

  return (
    <BusinessShell>
      <PageFrame width={880} title={data ? `${data.name} さんの練習結果` : "生徒の練習結果"}>
        <Link to="/business/school/students" style={{ color: C.sub, fontSize: 13 }}>
          ← 生徒の一覧
        </Link>
        {error ? (
          <ErrorText>{error}</ErrorText>
        ) : !data ? (
          <Loading />
        ) : data.practice.length === 0 ? (
          <p className="py-8 text-center text-[14px]" style={{ color: C.muted }}>
            まだ練習していません。
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.practice.map((p, i) => (
              <details
                key={p.id}
                open={i === 0}
                className="rounded-2xl p-4"
                style={{ background: C.card, border: `1px solid ${C.border}` }}
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <span style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>
                    {date(p.date)} ・ {p.target || (p.mode === "student" ? "入試面接" : "就職面接")}
                  </span>
                  <span style={{ color: C.accent, fontWeight: 800 }}>
                    {p.score !== null ? `${p.score}点` : "—"}
                  </span>
                </summary>
                <div
                  className="mt-3 flex flex-col gap-3 text-[13px]"
                  style={{ color: C.sub, lineHeight: 1.8 }}
                >
                  {p.overall && <p style={{ color: C.text }}>{p.overall}</p>}
                  {p.scoreBreakdown.length > 0 && (
                    <div className="grid gap-2 md:grid-cols-2">
                      {p.scoreBreakdown.map((b) => (
                        <div
                          key={b.category}
                          className="rounded-lg p-2"
                          style={{ background: C.card2 }}
                        >
                          <p style={{ color: C.text, fontWeight: 600 }}>
                            {b.category} <span style={{ color: C.accent }}>{b.score}</span>
                          </p>
                          <p className="text-[12px]">{b.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <List title="良かった点" items={p.goodPoints} color={C.accent} />
                  <List title="伸ばしたい点" items={p.improvementPoints} color="#FFB84D" />
                </div>
              </details>
            ))}
          </div>
        )}
        {data && (
          <button
            type="button"
            onClick={() => void remove()}
            className="self-start text-[12px]"
            style={{ color: C.muted }}
          >
            この生徒を学校から外す
          </button>
        )}
      </PageFrame>
    </BusinessShell>
  );
}

function List({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[12px]" style={{ color, fontWeight: 700 }}>
        {title}
      </p>
      <ul className="list-disc pl-5">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
