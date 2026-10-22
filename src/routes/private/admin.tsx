import { createFileRoute } from "@tanstack/react-router";
import { SafeNavigate } from "@/components/SafeNavigate";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AdminModeSwitch } from "@/components/AdminModeSwitch";

type NameCount = { name: string; count: number };
type Daily = { date: string; count: number }[];

type DashboardData = {
  generatedAt: string;
  money: {
    revenue: number;
    subscription: number;
    coinSales: number;
    coinSalesPrev: number;
    meteredSales: number;
    meteredCount: number;
    meteredPrev: number;
    aiCost: number;
    pointsIssuedThisMonth: number;
    profit: number;
    unusedYen: number;
    expiringYen: number;
  };
  growth: {
    totalUsers: number;
    individuals: number;
    companies: number;
    newThisMonth: number;
    newPrevMonth: number;
    paid: number;
    lightCount: number;
    proCount: number;
    paidRate: number;
    signupsDaily: Daily;
    practicesDaily: Daily;
  };
  individual: {
    funnel: NameCount[];
    active7: number;
    active30: number;
    practicesThisMonth: number;
    practicesPrevMonth: number;
    perActive: number;
    features: NameCount[];
    jobRanking: NameCount[];
  };
  market: {
    publicUsers: number;
    shownResults: number;
    unlocksThisMonth: number;
    unlocksTotal: number;
    coinsSpentThisMonth: number;
    contacts: number;
    acceptRate: number | null;
    shownJobRanking: NameCount[];
  };
  company: {
    companies: number;
    meteredCompanies: number;
    openJobs: number;
    applicationsThisMonth: number;
    applicationsPrevMonth: number;
    buyingCompanies: number;
    topCompanies: { name: string; coins: number; yen: number; results: number }[];
  };
  points: { issued: number; used: number; balance: number };
  alerts: { pendingContactsOver3Days: number; staleSummaries: number; expiringYen: number };
};

// 画面の色（アプリと同じ暗い背景＋黄緑のアクセント）
const T = {
  bg: "#0F0F0F",
  card: "#1A1A1A",
  border: "#2A2A2A",
  grid: "#242424",
  text: "#F0F0F0",
  sub: "#BBBBBB",
  muted: "#888888",
  accent: "#C8FF00",
  warn: "#FFB84D",
  bad: "#FF6B6B",
};

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const num = (n: number) => n.toLocaleString("ja-JP");

export const Route = createFileRoute("/private/admin")({
  head: () => ({ meta: [{ title: "管理ダッシュボード｜ガチキャリAI" }] }),
  component: AdminDashboard,
});

const SECTIONS = [
  { id: "money", label: "お金" },
  { id: "growth", label: "伸び" },
  { id: "individual", label: "個人" },
  { id: "market", label: "人材の市場" },
  { id: "company", label: "企業" },
  { id: "points", label: "ポイント" },
  { id: "tiktok", label: "TikTok" },
] as const;

function AdminDashboard() {
  const { session, loading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setFetching(true);
    setError("");
    try {
      const res = await fetch("/api/admin-dashboard-data", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (res.status === 403) return setForbidden(true);
      if (!res.ok) throw new Error(`status ${res.status}`);
      setData((await res.json()) as DashboardData);
    } catch (e) {
      console.error(e);
      setError("読み込みに失敗しました。もう一度お試しください");
    } finally {
      setFetching(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loading && !session) return <SafeNavigate to="/login" />;
  if (forbidden) {
    return (
      <Center>
        <p style={{ color: T.bad, fontSize: 14 }}>このページは管理者だけが見られます。</p>
      </Center>
    );
  }
  if (!data) {
    return (
      <Center>
        <p style={{ color: error ? T.bad : T.muted, fontSize: 14 }}>{error || "読み込み中..."}</p>
      </Center>
    );
  }

  const { money, growth, individual, market, company, points, alerts } = data;
  const alertItems = [
    alerts.pendingContactsOver3Days > 0 &&
      `返事が3日以上ない面談の申し込み ${alerts.pendingContactsOver3Days}件`,
    alerts.expiringYen > 0 && `30日以内に期限が切れる企業のコイン ${yen(alerts.expiringYen)}分`,
    alerts.staleSummaries > 10 && `人物まとめの作り直し待ち ${alerts.staleSummaries}人`,
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-screen" style={{ background: T.bg, fontFamily: "'Inter', sans-serif" }}>
      <AdminModeSwitch />
      <header
        className="sticky top-0 z-10 border-b px-4 py-3 md:px-8"
        style={{ background: T.bg, borderColor: T.border }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 style={{ color: T.text, fontSize: 18, fontWeight: 700 }}>社内管理ダッシュボード</h1>
            <p className="text-[11px]" style={{ color: T.muted }}>
              {new Date(data.generatedAt).toLocaleString("ja-JP")} 時点 ・
              月は日本時間で区切っています
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={fetching}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] disabled:opacity-50"
            style={{ border: `1px solid ${T.border}`, color: T.sub }}
          >
            <RefreshCw size={13} className={fetching ? "animate-spin" : ""} /> 最新にする
          </button>
        </div>
        <nav className="mx-auto mt-2 flex max-w-6xl gap-1 overflow-x-auto">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="shrink-0 rounded-md px-2.5 py-1 text-[12px]"
              style={{ color: T.muted }}
            >
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-6 md:px-8">
        {alertItems.length > 0 && (
          <div
            className="flex flex-col gap-1.5 rounded-xl p-4"
            style={{ background: "#2A1F0A", border: `1px solid #5A4318` }}
          >
            {alertItems.map((a) => (
              <p key={a} className="flex items-center gap-2 text-[13px]" style={{ color: T.text }}>
                <AlertTriangle size={14} color={T.warn} aria-label="要対応" /> {a}
              </p>
            ))}
          </div>
        )}

        {/* ---- お金 ---- */}
        <Section id="money" title="お金（今月）">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <Panel>
              <p className="text-[12px]" style={{ color: T.muted }}>
                今月の売上（見込み）
              </p>
              <p style={{ color: T.text, fontSize: 40, fontWeight: 800, lineHeight: 1.15 }}>
                {yen(money.revenue)}
              </p>
              <div className="mt-5 flex flex-col gap-3">
                <BarRow
                  label="個人の月額（ライト・プロ）"
                  value={money.subscription}
                  max={money.revenue}
                  text={yen(money.subscription)}
                  note={`ライト${growth.lightCount}人・プロ${growth.proCount}人`}
                />
                <BarRow
                  label="企業のコイン購入"
                  value={money.coinSales}
                  max={money.revenue}
                  text={yen(money.coinSales)}
                  note={`前月 ${yen(money.coinSalesPrev)}`}
                />
                <BarRow
                  label="企業のAI面接（従量課金）"
                  value={money.meteredSales}
                  max={money.revenue}
                  text={yen(money.meteredSales)}
                  note={`${money.meteredCount}回（前月 ${money.meteredPrev}回）`}
                />
              </div>
            </Panel>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="AIのコスト（概算）" value={yen(money.aiCost)} />
              <Stat
                label="本人に渡したポイント"
                value={yen(money.pointsIssuedThisMonth)}
                hint="コイン売上の1/4"
              />
              <Stat
                label="粗利（概算）"
                value={yen(money.profit)}
                tone={money.profit < 0 ? "bad" : "accent"}
                hint="売上 − AIコスト − ポイント"
              />
              <Stat
                label="使われていないコイン"
                value={yen(money.unusedYen)}
                hint="前受けのお金（まだ人材を見ていない分）"
              />
            </div>
          </div>
          <p className="mt-3 text-[11px]" style={{ color: T.muted, lineHeight: 1.7 }}>
            月額はいま有効な会員数×料金の見込みです。AIのコストは利用回数からの概算です。正確な請求額は
            Anthropic（console.anthropic.com）・OpenAI（platform.openai.com）・Stripe
            の管理画面で確認してください。
          </p>
        </Section>

        {/* ---- 伸び ---- */}
        <Section id="growth" title="伸び">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="会員の合計"
              value={`${num(growth.totalUsers)}人`}
              hint={`個人 ${num(growth.individuals)}・企業 ${num(growth.companies)}`}
            />
            <Stat
              label="今月の新規登録"
              value={`${num(growth.newThisMonth)}人`}
              hint={`前月 ${num(growth.newPrevMonth)}人`}
            />
            <Stat
              label="有料会員"
              value={`${num(growth.paid)}人`}
              hint={`個人のうち ${growth.paidRate}%`}
            />
            <Stat label="登録企業" value={`${num(growth.companies)}社`} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <TrendChart title="新規登録（直近30日・人）" data={growth.signupsDaily} unit="人" />
            <TrendChart
              title="模擬面接の回数（直近30日・回）"
              data={growth.practicesDaily}
              unit="回"
            />
          </div>
        </Section>

        {/* ---- 個人 ---- */}
        <Section id="individual" title="個人・受験生">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="個人の流れ（これまでの合計・人）">
              <Funnel steps={individual.funnel} />
            </Panel>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="7日以内に練習した人" value={`${num(individual.active7)}人`} />
              <Stat label="30日以内に練習した人" value={`${num(individual.active30)}人`} />
              <Stat
                label="今月の模擬面接"
                value={`${num(individual.practicesThisMonth)}回`}
                hint={`前月 ${num(individual.practicesPrevMonth)}回`}
              />
              <Stat label="1人あたりの練習（30日）" value={`${individual.perActive}回`} />
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel title="今月の機能の利用（回）">
              <Bars items={individual.features} unit="回" />
            </Panel>
            <Panel title="今月よく練習された職種（回）">
              <Bars items={individual.jobRanking} unit="回" empty="今月の練習はまだありません" />
            </Panel>
          </div>
        </Section>

        {/* ---- 人材の市場 ---- */}
        <Section id="market" title="人材の市場">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Stat label="公開している人" value={`${num(market.publicUsers)}人`} />
            <Stat label="公開中の面接結果" value={`${num(market.shownResults)}件`} />
            <Stat
              label="今月買われた結果"
              value={`${num(market.unlocksThisMonth)}件`}
              hint={`累計 ${num(market.unlocksTotal)}件`}
            />
            <Stat label="今月使われたコイン" value={num(market.coinsSpentThisMonth)} />
            <Stat label="面談の申し込み" value={`${num(market.contacts)}件`} />
            <Stat
              label="承諾率"
              value={market.acceptRate === null ? "—" : `${market.acceptRate}%`}
              hint="返事があったもののうち"
            />
          </div>
          <div className="mt-4">
            <Panel title="公開中の結果の職種（件）">
              <Bars items={market.shownJobRanking} unit="件" empty="公開中の結果はまだありません" />
            </Panel>
          </div>
        </Section>

        {/* ---- 企業 ---- */}
        <Section id="company" title="企業">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="登録企業" value={`${num(company.companies)}社`} />
            <Stat
              label="カード登録済み"
              value={`${num(company.meteredCompanies)}社`}
              hint="AI面接のURLを出せる"
            />
            <Stat label="求人の掲載中" value={`${num(company.openJobs)}件`} />
            <Stat
              label="今月の応募"
              value={`${num(company.applicationsThisMonth)}件`}
              hint={`前月 ${num(company.applicationsPrevMonth)}件`}
            />
            <Stat label="コインを買った企業" value={`${num(company.buyingCompanies)}社`} />
          </div>
          <div className="mt-4">
            <Panel title="よく使っている企業（これまでの合計）">
              {company.topCompanies.length === 0 ? (
                <p className="text-[13px]" style={{ color: T.muted }}>
                  まだありません
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr style={{ color: T.muted }}>
                        <th className="py-2 text-left font-normal">会社名</th>
                        <th className="py-2 text-right font-normal">コイン購入</th>
                        <th className="py-2 text-right font-normal">買ったコイン</th>
                        <th className="py-2 text-right font-normal">買った結果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {company.topCompanies.map((c, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${T.border}`, color: T.text }}>
                          <td className="py-2">{c.name}</td>
                          <td className="py-2 text-right">{yen(c.yen)}</td>
                          <td className="py-2 text-right">{num(c.coins)}</td>
                          <td className="py-2 text-right">{num(c.results)}件</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </Section>

        {/* ---- ポイント ---- */}
        <Section id="points" title="本人のポイント（1pt＝1円）">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="これまでに渡した" value={`${num(points.issued)}pt`} />
            <Stat label="月額の支払いに使われた" value={`${num(points.used)}pt`} />
            <Stat
              label="まだ使われていない"
              value={`${num(points.balance)}pt`}
              tone="warn"
              hint="今後の月額から差し引く予定の額"
            />
          </div>
        </Section>

        {/* ---- TikTok ---- */}
        <Section id="tiktok" title="TikTok用の動画（毎日17時に自動で1本）">
          <p className="mb-3 text-[12px]" style={{ color: T.muted, lineHeight: 1.7 }}>
            投稿したら「投稿済みにする」を押し、数日後に再生数といいねを入れてください。伸びたテーマやタイトルを、次からの台本づくりで参考にします。
          </p>
          <TiktokVideos token={session?.access_token ?? ""} />
        </Section>
      </main>
    </div>
  );
}

type TiktokVideo = {
  id: string;
  themeLabel: string;
  title: string;
  caption: string;
  status: "rendering" | "ready" | "posted" | "failed";
  durationSec: number | null;
  error: string | null;
  createdAt: string;
  postedAt: string | null;
  url: string | null;
  views: number | null;
  likes: number | null;
};

const VIDEO_STATUS: Record<TiktokVideo["status"], string> = {
  rendering: "作成中",
  ready: "投稿待ち",
  posted: "投稿済み",
  failed: "失敗",
};

function TiktokVideos({ token }: { token: string }) {
  const [videos, setVideos] = useState<TiktokVideo[] | null>(null);

  const call = useCallback(
    async (body?: unknown) => {
      const res = await fetch("/api/tiktok-videos", {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      return res.ok ? res.json() : null;
    },
    [token],
  );
  const load = useCallback(async () => {
    const d = (await call()) as { videos: TiktokVideo[] } | null;
    setVideos(d?.videos ?? []);
  }, [call]);

  useEffect(() => {
    if (token) void load();
  }, [token, load]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("投稿の文をコピーしました");
    } catch {
      // コピーできない端末では何もしない
    }
  };

  if (!videos) return <p style={{ color: T.muted, fontSize: 13 }}>読み込み中...</p>;
  if (videos.length === 0) {
    return (
      <Panel>
        <p className="text-[13px]" style={{ color: T.muted, lineHeight: 1.8 }}>
          まだ動画はありません。毎日17時に自動で作られます（GitHub の Actions の「TikTok
          video」から、今すぐ作ることもできます）。
        </p>
      </Panel>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {videos.map((v) => (
        <div
          key={v.id}
          className="flex flex-col gap-3 rounded-2xl p-4"
          style={{ background: T.card, border: `1px solid ${T.border}` }}
        >
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span style={{ color: T.muted }}>
              {new Date(v.createdAt).toLocaleDateString("ja-JP")} ・ {v.themeLabel}
            </span>
            <span
              className="rounded-md px-2 py-0.5"
              style={{
                background: v.status === "ready" ? T.accent : "#262626",
                color: v.status === "ready" ? "#0F0F0F" : v.status === "failed" ? T.bad : T.sub,
                fontWeight: 700,
              }}
            >
              {VIDEO_STATUS[v.status]}
            </span>
          </div>
          <p className="text-[14px]" style={{ color: T.text, fontWeight: 700 }}>
            {v.title}
          </p>
          {v.url ? (
            <video
              src={v.url}
              controls
              preload="metadata"
              playsInline
              className="w-full rounded-xl"
              style={{ aspectRatio: "9 / 16", background: "#000" }}
            />
          ) : v.status === "failed" ? (
            <p className="text-[12px]" style={{ color: T.bad }}>
              作れませんでした：{(v.error ?? "").slice(0, 120)}
            </p>
          ) : (
            <p className="text-[12px]" style={{ color: T.muted }}>
              作成中です…
            </p>
          )}
          <p
            className="whitespace-pre-wrap rounded-lg p-2 text-[12px]"
            style={{ background: T.bg, color: T.sub }}
          >
            {v.caption}
          </p>
          <div className="flex flex-wrap gap-2 text-[12px]">
            {v.url && (
              <a
                href={v.url}
                download={`gachicareer-${v.id.slice(0, 8)}.mp4`}
                className="rounded-lg px-3 py-1.5"
                style={{ background: T.accent, color: "#0F0F0F", fontWeight: 700 }}
              >
                動画を保存
              </a>
            )}
            <button
              type="button"
              onClick={() => void copy(v.caption)}
              className="rounded-lg px-3 py-1.5"
              style={{ border: `1px solid ${T.border}`, color: T.sub }}
            >
              投稿の文をコピー
            </button>
            {v.status === "ready" && (
              <button
                type="button"
                onClick={() => void call({ action: "posted", id: v.id }).then(load)}
                className="rounded-lg px-3 py-1.5"
                style={{ border: `1px solid ${T.border}`, color: T.sub }}
              >
                投稿済みにする
              </button>
            )}
            {v.status === "posted" && (
              <MetricsForm
                video={v}
                onSave={(views, likes) =>
                  void call({ action: "metrics", id: v.id, views, likes }).then(load)
                }
              />
            )}
            <button
              type="button"
              onClick={() => {
                if (window.confirm("この動画を消しますか？")) {
                  void call({ action: "delete", id: v.id }).then(load);
                }
              }}
              className="rounded-lg px-3 py-1.5"
              style={{ color: T.bad }}
            >
              削除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 投稿した動画の再生数・いいねを入れる（伸びたテーマ・タイトルを、次の台本づくりで参考にする） */
function MetricsForm({
  video,
  onSave,
}: {
  video: TiktokVideo;
  onSave: (views: string, likes: string) => void;
}) {
  const [views, setViews] = useState(video.views?.toString() ?? "");
  const [likes, setLikes] = useState(video.likes?.toString() ?? "");
  const input = {
    background: T.bg,
    border: `1px solid ${T.border}`,
    color: T.text,
    borderRadius: 8,
    padding: "4px 8px",
    width: 90,
  } as const;
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <input
        inputMode="numeric"
        value={views}
        onChange={(e) => setViews(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="再生数"
        style={input}
      />
      <input
        inputMode="numeric"
        value={likes}
        onChange={(e) => setLikes(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="いいね"
        style={input}
      />
      <button
        type="button"
        onClick={() => onSave(views, likes)}
        className="rounded-lg px-3 py-1.5"
        style={{ border: `1px solid ${T.border}`, color: T.sub }}
      >
        結果を保存
      </button>
    </div>
  );
}

function Center({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: T.bg }}>
      <AdminModeSwitch />
      <div className="flex flex-1 items-center justify-center">{children}</div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="mb-3" style={{ color: T.text, fontSize: 16, fontWeight: 700 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: T.card, border: `1px solid ${T.border}` }}
    >
      {title && (
        <p className="mb-4 text-[13px]" style={{ color: T.sub, fontWeight: 600 }}>
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "accent" | "warn" | "bad";
}) {
  const color =
    tone === "accent" ? T.accent : tone === "warn" ? T.warn : tone === "bad" ? T.bad : T.text;
  return (
    <div className="rounded-xl p-4" style={{ background: T.card, border: `1px solid ${T.border}` }}>
      <p className="text-[11px]" style={{ color: T.muted }}>
        {label}
      </p>
      <p className="mt-1" style={{ color, fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[11px]" style={{ color: T.muted }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** 横棒1本（値はいつも文字でも出す） */
function BarRow({
  label,
  value,
  max,
  text,
  note,
}: {
  label: string;
  value: number;
  max: number;
  text: string;
  note?: string;
}) {
  const pct = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return (
    <div title={`${label}：${text}`}>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span style={{ color: T.sub }}>{label}</span>
        <span style={{ color: T.text, fontWeight: 700 }}>{text}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full" style={{ background: T.grid }}>
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: T.accent }} />
      </div>
      {note && (
        <p className="mt-1 text-[11px]" style={{ color: T.muted }}>
          {note}
        </p>
      )}
    </div>
  );
}

function Bars({ items, unit, empty }: { items: NameCount[]; unit: string; empty?: string }) {
  if (items.length === 0 || items.every((i) => i.count === 0)) {
    return (
      <p className="text-[13px]" style={{ color: T.muted }}>
        {empty ?? "まだありません"}
      </p>
    );
  }
  const max = Math.max(...items.map((i) => i.count));
  return (
    <div className="flex flex-col gap-3">
      {items.map((i) => (
        <BarRow
          key={i.name}
          label={i.name}
          value={i.count}
          max={max}
          text={`${num(i.count)}${unit}`}
        />
      ))}
    </div>
  );
}

/** 登録 → 練習 → 公開 → 買われた の流れ。次の段階へ進んだ割合も出す */
function Funnel({ steps }: { steps: NameCount[] }) {
  const max = Math.max(1, steps[0]?.count ?? 1);
  return (
    <div className="flex flex-col gap-3">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].count : null;
        const rate = prev ? Math.round((s.count / prev) * 100) : null;
        return (
          <BarRow
            key={s.name}
            label={s.name}
            value={s.count}
            max={max}
            text={`${num(s.count)}人`}
            note={rate === null ? undefined : `前の段階から ${rate}%`}
          />
        );
      })}
    </div>
  );
}

function TrendChart({ title, data, unit }: { title: string; data: Daily; unit: string }) {
  const total = data.reduce((a, d) => a + d.count, 0);
  return (
    <Panel>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-[13px]" style={{ color: T.sub, fontWeight: 600 }}>
          {title}
        </p>
        <p className="text-[12px]" style={{ color: T.muted }}>
          合計 {num(total)}
          {unit}
        </p>
      </div>
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id={`fill-${unit}-${title.length}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.accent} stopOpacity={0.25} />
                <stop offset="100%" stopColor={T.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={T.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: T.muted, fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: T.border }}
              interval={6}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: T.muted, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ stroke: T.muted, strokeDasharray: "3 3" }}
              contentStyle={{
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: T.muted }}
              itemStyle={{ color: T.text }}
              formatter={(v: number) => [`${num(v)}${unit}`, ""]}
              separator=""
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke={T.accent}
              strokeWidth={2}
              fill={`url(#fill-${unit}-${title.length})`}
              activeDot={{ r: 4, stroke: T.card, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
