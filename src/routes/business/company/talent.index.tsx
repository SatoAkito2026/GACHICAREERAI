import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Video } from "lucide-react";
import { BusinessShell } from "@/components/ModeShell";
import {
  C,
  CAREER_STAGE_LABELS,
  ErrorText,
  Loading,
  PageFrame,
  StatusBadge,
  Tag,
  inputStyle,
  talentApi,
} from "@/components/talent/TalentUI";
import { AVATAR_STYLE_LABELS, INDUSTRY_OPTIONS, PREFECTURE_OPTIONS } from "@/lib/career-options";
import { CoinBadge, CoinShopModal, type CoinBalance } from "@/components/talent/CoinShop";

export const Route = createFileRoute("/business/company/talent/")({
  head: () => ({ meta: [{ title: "人材を探す｜ガチキャリAI Business" }] }),
  component: TalentSearchPage,
});

/** 公開中の面接の結果1つ分（同じ人でも結果ごとに別のカード・別の評価・別の値段） */
type Result = {
  id: string;
  code: string;
  headline: string | null;
  careerStage: string | null;
  desiredJobs: string | null;
  desiredLocations: string | null;
  date: string;
  jobType: string | null;
  avatarStyle: string | null;
  overview: string;
  strengths: string[];
  competencies: { key: string; label: string; score: number | null }[];
  competencyAverage: number | null;
  priceCoins: number;
  hasRecording: boolean;
  unlocked: boolean;
  contactStatus: string | null;
};

function TalentSearchPage() {
  const [keyword, setKeyword] = useState("");
  const [stage, setStage] = useState("");
  const [minScore, setMinScore] = useState("");
  const [sort, setSort] = useState("recent");
  const [job, setJob] = useState("");
  const [area, setArea] = useState("");
  const [list, setList] = useState<Result[] | null>(null);
  const [coins, setCoins] = useState<CoinBalance | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [error, setError] = useState("");
  const [needsCompany, setNeedsCompany] = useState(false);

  const load = useCallback(async () => {
    setList(null);
    const q = new URLSearchParams({ keyword, stage, minScore, sort, job, area });
    const r = await talentApi<{ results: Result[]; coins: CoinBalance }>(`/api/talent/search?${q}`);
    if (r.ok) {
      setList(r.data.results);
      setCoins(r.data.coins);
      setError("");
    } else {
      setList([]);
      setError(r.data.error ?? "読み込みに失敗しました");
      setNeedsCompany(!!r.data.needsCompany);
    }
  }, [keyword, stage, minScore, sort, job, area]);

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
            AI模擬面接を受け、公開に同意した人の面接結果です。名前は伏せ、結果を1つずつ表示しています（同じ人の結果が複数並ぶこともあります）。
            気になる結果は、コインで詳しい評価・会話・録画を見られます。1つ買うと名前を見て面談を申し込めます（評価が高い結果・多くの企業に見られている人ほど必要なコインが多くなります）。
          </>
        }
      >
        <div className="flex justify-end">
          <CoinBadge coins={coins} onBuy={() => setShopOpen(true)} />
        </div>
        {shopOpen && (
          <CoinShopModal
            onClose={() => setShopOpen(false)}
            onDone={(c) => {
              setCoins(c);
              setShopOpen(false);
            }}
          />
        )}
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="キーワード（職種・強み・希望など）"
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
            value={job}
            onChange={(e) => setJob(e.target.value)}
            className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
            style={inputStyle}
          >
            <option value="">すべての職種</option>
            {INDUSTRY_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
            style={inputStyle}
          >
            <option value="">すべてのエリア</option>
            {PREFECTURE_OPTIONS.map((v) => (
              <option key={v} value={v}>
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
            <option value="score">評価の平均が高い順</option>
          </select>
          <select
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
            style={inputStyle}
          >
            <option value="">評価の平均：指定なし</option>
            {[3, 3.5, 4].map((n) => (
              <option key={n} value={n}>
                評価の平均 {n.toFixed(1)}以上
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
            条件に合う結果がまだありません。条件を変えてお試しください。
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((c) => (
              <ResultCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </PageFrame>
    </BusinessShell>
  );
}

function ResultCard({ c }: { c: Result }) {
  const top = [...c.competencies]
    .filter((x) => x.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3);
  const style = c.avatarStyle ? AVATAR_STYLE_LABELS[c.avatarStyle] : null;
  return (
    <Link
      to="/business/company/talent/$code"
      params={{ code: c.code }}
      search={{ iv: c.id }}
      className="flex flex-col gap-3 rounded-2xl p-5 transition-colors hover:border-[#C8FF00]"
      style={{ background: C.card, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p style={{ color: C.text, fontSize: 15, fontWeight: 700 }}>
            {c.jobType || "職種指定なし"}の面接
          </p>
          <p className="mt-1 text-[12px]" style={{ color: C.muted }}>
            {new Date(c.date).toLocaleDateString("ja-JP")}
            {style && ` ・ 面接官：${style}`}
          </p>
        </div>
        <div className="text-right">
          <p style={{ color: C.accent, fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
            {c.competencyAverage?.toFixed(1) ?? "-"}
          </p>
          <p className="text-[10px]" style={{ color: C.muted }}>
            評価の平均（5点満点）
          </p>
        </div>
      </div>
      <p className="text-[12px]" style={{ color: C.sub }}>
        {c.headline || "（ひとこと未登録）"} ・ No.{c.code.slice(0, 6).toUpperCase()} ・{" "}
        {c.careerStage ? CAREER_STAGE_LABELS[c.careerStage] : "状況未登録"}
      </p>
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
          {c.hasRecording && (
            <span className="flex items-center gap-1">
              <Video size={12} /> 録画あり
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {c.unlocked ? (
            <Tag color={C.accent}>購入済み</Tag>
          ) : (
            <Tag color={C.accent}>{c.priceCoins}コイン</Tag>
          )}
          <StatusBadge status={c.contactStatus} />
        </span>
      </div>
    </Link>
  );
}
