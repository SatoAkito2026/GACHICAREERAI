import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Video } from "lucide-react";
import { BusinessShell } from "@/components/ModeShell";
import {
  C,
  CAREER_STAGE_LABELS,
  COMPETENCY_LABELS,
  ErrorText,
  Loading,
  PageFrame,
  StatusBadge,
  Tag,
  inputStyle,
  talentApi,
  type SummaryCompetency,
} from "@/components/talent/TalentUI";

export const Route = createFileRoute("/business/company/talent/")({
  head: () => ({ meta: [{ title: "人材を探す｜ガチキャリAI Business" }] }),
  component: TalentSearchPage,
});

type Candidate = {
  code: string;
  headline: string | null;
  careerStage: string | null;
  desiredJobs: string | null;
  desiredLocations: string | null;
  overview: string;
  strengths: string[];
  competencies: SummaryCompetency[];
  interviewCount: number;
  averageScore: number | null;
  hasRecording: boolean;
  updatedAt: string | null;
  unlocked: boolean;
  contactStatus: string | null;
};

function TalentSearchPage() {
  const [keyword, setKeyword] = useState("");
  const [stage, setStage] = useState("");
  const [minScore, setMinScore] = useState("");
  const [sort, setSort] = useState("recent");
  const [list, setList] = useState<Candidate[] | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [needsCompany, setNeedsCompany] = useState(false);

  const load = useCallback(async () => {
    setList(null);
    const q = new URLSearchParams({ keyword, stage, minScore, sort });
    const r = await talentApi<{ candidates: Candidate[]; ticketPrice: number }>(
      `/api/talent/search?${q}`,
    );
    if (r.ok) {
      setList(r.data.candidates);
      setPrice(r.data.ticketPrice);
      setError("");
    } else {
      setList([]);
      setError(r.data.error ?? "読み込みに失敗しました");
      setNeedsCompany(!!r.data.needsCompany);
    }
  }, [keyword, stage, minScore, sort]);

  useEffect(() => {
    const t = setTimeout(() => void load(), keyword ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, keyword]);

  return (
    <BusinessShell>
      <PageFrame
        width={1000}
        title="人材を探す"
        subtitle={
          <>
            AI模擬面接を受け、プロフィールの公開に同意した人たちです。名前は伏せて表示しています。
            {price !== null && (
              <>
                気になる人は、チケット（1人 {price.toLocaleString()}
                円・税込）で名前・面接ごとの詳しい評価・録画を見て、面談を申し込めます。
              </>
            )}
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="キーワード（職種・強みなど）"
            className="rounded-lg px-3 py-2.5 text-[14px] outline-none md:col-span-2"
            style={inputStyle}
          />
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
            style={inputStyle}
          >
            <option value="">すべての状況</option>
            {Object.entries(CAREER_STAGE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
            style={inputStyle}
          >
            <option value="recent">新しい順</option>
            <option value="score">総合点が高い順</option>
            {Object.entries(COMPETENCY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                「{v}」が高い順
              </option>
            ))}
          </select>
          <select
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
            style={inputStyle}
          >
            <option value="">総合点：指定なし</option>
            {[50, 60, 70, 80].map((n) => (
              <option key={n} value={n}>
                総合点 {n}点以上
              </option>
            ))}
          </select>
        </div>
        <p className="text-[11px]" style={{ color: C.muted }}>
          公正な採用のため、年齢・性別などでの絞り込みはできません。評価は模擬面接での発言にもとづくものです。
        </p>

        {!list ? (
          <Loading />
        ) : error ? (
          <div className="flex flex-col gap-2">
            <ErrorText>{error}</ErrorText>
            {needsCompany && (
              <Link to="/business/company/settings" style={{ color: C.accent, fontSize: 14 }}>
                設定画面へ →
              </Link>
            )}
          </div>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-[14px]" style={{ color: C.muted }}>
            条件に合う人がまだいません。条件を変えてお試しください。
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((c) => (
              <CandidateCard key={c.code} c={c} />
            ))}
          </div>
        )}
      </PageFrame>
    </BusinessShell>
  );
}

function CandidateCard({ c }: { c: Candidate }) {
  const top = [...c.competencies]
    .filter((x) => x.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3);
  return (
    <Link
      to="/business/company/talent/$code"
      params={{ code: c.code }}
      className="flex flex-col gap-3 rounded-2xl p-5 transition-colors hover:border-[#C8FF00]"
      style={{ background: C.card, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p style={{ color: C.text, fontSize: 15, fontWeight: 700 }}>
            {c.headline || "（ひとこと未登録）"}
          </p>
          <p className="mt-1 text-[12px]" style={{ color: C.muted }}>
            No.{c.code.slice(0, 6).toUpperCase()} ・{" "}
            {c.careerStage ? CAREER_STAGE_LABELS[c.careerStage] : "状況未登録"}
          </p>
        </div>
        <div className="text-right">
          <p style={{ color: C.accent, fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
            {c.averageScore ?? "-"}
          </p>
          <p className="text-[10px]" style={{ color: C.muted }}>
            総合点（直近）
          </p>
        </div>
      </div>
      {c.overview && (
        <p className="line-clamp-3 text-[13px]" style={{ color: C.sub, lineHeight: 1.7 }}>
          {c.overview}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {c.strengths.map((s) => (
          <Tag key={s} color={C.accent}>
            {s}
          </Tag>
        ))}
        {top.map((x) => (
          <Tag key={x.key}>
            {x.label} {x.score?.toFixed(1)}
          </Tag>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12px]" style={{ color: C.muted }}>
        {c.desiredJobs && <span>希望：{c.desiredJobs}</span>}
        {c.desiredLocations && <span>／ {c.desiredLocations}</span>}
      </div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[12px]" style={{ color: C.muted }}>
          面接 {c.interviewCount}回
          {c.hasRecording && (
            <span className="flex items-center gap-1">
              <Video size={12} /> 録画あり
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {c.unlocked && <Tag color={C.accent}>購入済み</Tag>}
          <StatusBadge status={c.contactStatus} />
        </span>
      </div>
    </Link>
  );
}
