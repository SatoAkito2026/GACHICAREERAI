import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";

type NameCount = { name: string; count: number };

type DashboardData = {
  planCounts: Record<string, number>;
  monthlyRevenue: number;
  individualRevenue: number;
  companyRevenue: number;
  meteredInterviewsThisMonth: number;
  signupTrend: { date: string; count: number }[];
  totalUsers: number;
  usageThisPeriod: Record<string, number>;
  interviewsThisMonth: number;
  estimatedMonthlyCostJpy: number;
  estimatedProfitJpy: number;
  jobTypeRanking: NameCount[];
  schoolRanking: NameCount[];
  prefectureRanking: NameCount[];
  companyJobTypeRanking: NameCount[];
  ageDistribution: NameCount[];
  genderDistribution: NameCount[];
  gradeDistribution: NameCount[];
  weakSubjectRanking: NameCount[];
  strongSubjectRanking: NameCount[];
  rankDistribution: NameCount[];
  featureAdoption: { name: string; count: number; rate: number }[];
  retentionRate7d: number;
  retentionRate30d: number;
  note: string;
};

const PLAN_LABELS: Record<string, string> = {
  free: "無料",
  individual_light: "個人ライト",
  individual_pro: "個人プロ",
  company_metered: "企業従量課金",
  company_light: "企業ライト",
  company_pro: "企業プロ",
};

const FEATURE_LABELS: Record<string, string> = {
  chat_image_upload: "チャット画像送信",
  doc_generation_resume: "履歴書生成",
  doc_generation_statement_of_purpose: "志望理由書生成",
  doc_generation_motivation_letter: "志望動機書生成",
  doc_generation_self_pr: "自己PR生成",
  doc_generation_es_review: "ES改稿",
  doc_generation_essay_review: "小論文改稿",
  self_analysis_basic: "自己分析(基本)",
  self_analysis_detailed: "自己分析(詳細)",
  daily_question_ai_generation: "今日の質問AI生成",
};

const RANK_COLORS: Record<string, string> = {
  A: "#C8FF00",
  B: "#7CD4FF",
  C: "#FFB84D",
  D: "#FF6B6B",
};

function fmtYen(n: number) {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

const cardStyle = { background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 16 } as const;

function RankingList({ items }: { items: NameCount[] }) {
  if (items.length === 0)
    return <p style={{ color: "#666666", fontSize: 12 }}>まだデータがありません。</p>;
  const max = items[0]?.count || 1;
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={item.name} className="flex items-center gap-3">
          <span style={{ color: "#666666", fontSize: 11, width: 16 }}>{i + 1}</span>
          <span style={{ color: "#F0F0F0", fontSize: 12, width: 140, flexShrink: 0 }}>
            {item.name}
          </span>
          <div className="flex-1 rounded-full" style={{ background: "#0F0F0F", height: 8 }}>
            <div
              className="rounded-full"
              style={{ background: "#C8FF00", height: 8, width: `${(item.count / max) * 100}%` }}
            />
          </div>
          <span style={{ color: "#999999", fontSize: 11, width: 28, textAlign: "right" }}>
            {item.count}
          </span>
        </div>
      ))}
    </div>
  );
}

const NAV_ITEMS = [
  { key: "overview", label: "概要" },
  { key: "individual", label: "個人・受験生分析" },
  { key: "company", label: "企業分析" },
  { key: "engagement", label: "エンゲージメント" },
  { key: "talent", label: "人材・チケット" },
] as const;
type NavKey = (typeof NAV_ITEMS)[number]["key"];

export const Route = createFileRoute("/private/admin")({
  head: () => ({ meta: [{ title: "管理ダッシュボード｜インタビアAI" }] }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { session, loading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NavKey>("overview");

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin-dashboard-data?_t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        setData((await res.json()) as DashboardData);
      } catch (e) {
        console.error(e);
      } finally {
        setFetching(false);
      }
    })();
  }, [session]);

  if (loading || fetching) {
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
  if (forbidden || !data) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "#0F0F0F" }}
      >
        <p className="text-sm" style={{ color: "#888888" }}>
          このページを見る権限がありません。
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "#0F0F0F", fontFamily: "'Inter', sans-serif" }}
    >
      {/* ヘッダー */}
      <div
        className="flex items-center gap-3 border-b px-6 py-4"
        style={{ borderColor: "#2A2A2A" }}
      >
        <button
          onClick={() => setNavOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", color: "#F0F0F0" }}
          aria-label="メニュー"
        >
          ☰
        </button>
        <h1 style={{ color: "#F0F0F0", fontSize: 18, fontWeight: 700 }}>社内管理ダッシュボード</h1>
      </div>

      <div className="flex">
        {/* サイドナビ */}
        {navOpen && (
          <div className="w-56 shrink-0 border-r px-3 py-4" style={{ borderColor: "#2A2A2A" }}>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className="mb-1 w-full rounded-lg px-3 py-2.5 text-left text-[13px]"
                style={{
                  background: activeTab === item.key ? "#C8FF00" : "transparent",
                  color: activeTab === item.key ? "#0F0F0F" : "#CCCCCC",
                  fontWeight: activeTab === item.key ? 700 : 500,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 px-6 py-6">
          <div className="mx-auto max-w-4xl">
            <p className="mb-4" style={{ color: "#666666", fontSize: 12 }}>
              {data.note}
            </p>

            {activeTab === "overview" && <OverviewTab data={data} />}
            {activeTab === "individual" && <IndividualTab data={data} />}
            {activeTab === "company" && <CompanyTab data={data} />}
            {activeTab === "engagement" && <EngagementTab data={data} />}
            {activeTab === "talent" && <TalentTab token={session.access_token} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ data }: { data: DashboardData }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl p-4" style={cardStyle}>
          <p style={{ color: "#888888", fontSize: 12 }}>総会員数</p>
          <p style={{ color: "#F0F0F0", fontSize: 24, fontWeight: 700 }}>{data.totalUsers}</p>
        </div>
        <div className="rounded-2xl p-4" style={cardStyle}>
          <p style={{ color: "#888888", fontSize: 12 }}>今月の推定売上</p>
          <p style={{ color: "#C8FF00", fontSize: 22, fontWeight: 700 }}>
            {fmtYen(data.monthlyRevenue)}
          </p>
        </div>
        <div className="rounded-2xl p-4" style={cardStyle}>
          <p style={{ color: "#888888", fontSize: 12 }}>今月の推定AIコスト</p>
          <p style={{ color: "#FFB84D", fontSize: 22, fontWeight: 700 }}>
            {fmtYen(data.estimatedMonthlyCostJpy)}
          </p>
        </div>
        <div className="rounded-2xl p-4" style={cardStyle}>
          <p style={{ color: "#888888", fontSize: 12 }}>今月の推定粗利</p>
          <p
            style={{
              color: data.estimatedProfitJpy >= 0 ? "#7CFFB2" : "#FF6B6B",
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            {fmtYen(data.estimatedProfitJpy)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-2xl p-4" style={cardStyle}>
          <p style={{ color: "#888888", fontSize: 12 }}>個人/受験生 今月の売上</p>
          <p style={{ color: "#7CD4FF", fontSize: 20, fontWeight: 700 }}>
            {fmtYen(data.individualRevenue)}
          </p>
        </div>
        <div className="rounded-2xl p-4" style={cardStyle}>
          <p style={{ color: "#888888", fontSize: 12 }}>企業/学校 今月の売上</p>
          <p style={{ color: "#E29CFF", fontSize: 20, fontWeight: 700 }}>
            {fmtYen(data.companyRevenue)}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl p-5" style={cardStyle}>
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          プラン別会員数
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(data.planCounts).map(([plan, count]) => (
            <div
              key={plan}
              className="rounded-lg p-3"
              style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
            >
              <p style={{ color: "#999999", fontSize: 11 }}>{PLAN_LABELS[plan] ?? plan}</p>
              <p style={{ color: "#F0F0F0", fontSize: 18, fontWeight: 700 }}>{count}人</p>
            </div>
          ))}
        </div>
        <p className="mt-3" style={{ color: "#666666", fontSize: 11 }}>
          今月の企業従量課金の発行数：{data.meteredInterviewsThisMonth}回
        </p>
      </div>

      <div className="mt-6 rounded-2xl p-5" style={cardStyle}>
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          新規登録の推移（直近30日）
        </p>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={data.signupTrend}>
              <CartesianGrid stroke="#2A2A2A" />
              <XAxis dataKey="date" tick={{ fill: "#888888", fontSize: 10 }} />
              <YAxis tick={{ fill: "#888888", fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }} />
              <Line type="monotone" dataKey="count" stroke="#C8FF00" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div
        className="mt-6 rounded-2xl p-4"
        style={{ background: "#1A1A1A", border: "1px solid #FFB84D55" }}
      >
        <p style={{ color: "#FFB84D", fontSize: 12, fontWeight: 700 }}>
          ⚠️ 実際の残クレジット・請求額の確認先
        </p>
        <p style={{ color: "#999999", fontSize: 12, marginTop: 4, lineHeight: 1.7 }}>
          Claude(Anthropic)：console.anthropic.com の Plans & Billing
          <br />
          OpenAI（Whisper・音声合成）：platform.openai.com の Billing
          <br />
          上記のコスト表示は、あくまでDB上の利用実績から計算した概算です。
        </p>
      </div>
    </>
  );
}

function IndividualTab({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-2xl p-5" style={cardStyle}>
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          希望職種ランキング（個人）
        </p>
        <RankingList items={data.jobTypeRanking} />
      </div>
      <div className="rounded-2xl p-5" style={cardStyle}>
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          志望校ランキング（受験生）
        </p>
        <RankingList items={data.schoolRanking} />
      </div>
      <div className="rounded-2xl p-5" style={cardStyle}>
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          都道府県別の登録者分布
        </p>
        <RankingList items={data.prefectureRanking} />
      </div>
      <div className="rounded-2xl p-5" style={cardStyle}>
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          年齢層分布
        </p>
        <RankingList items={data.ageDistribution} />
      </div>
      <div className="rounded-2xl p-5" style={cardStyle}>
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          性別分布（任意回答分のみ）
        </p>
        <RankingList items={data.genderDistribution} />
      </div>
      <div className="rounded-2xl p-5" style={cardStyle}>
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          学年分布（受験生）
        </p>
        <RankingList items={data.gradeDistribution} />
      </div>
      <div className="rounded-2xl p-5" style={cardStyle}>
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          苦手科目ランキング（受験生）
        </p>
        <RankingList items={data.weakSubjectRanking} />
      </div>
      <div className="rounded-2xl p-5" style={cardStyle}>
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          得意科目ランキング（受験生）
        </p>
        <RankingList items={data.strongSubjectRanking} />
      </div>
    </div>
  );
}

function CompanyTab({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-2xl p-5" style={cardStyle}>
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          企業の採用ニーズ（募集職種）
        </p>
        <RankingList items={data.companyJobTypeRanking} />
      </div>
      <div className="rounded-2xl p-5" style={cardStyle}>
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          書類選考ランク分布
        </p>
        {data.rankDistribution.length === 0 ? (
          <p style={{ color: "#666666", fontSize: 12 }}>まだデータがありません。</p>
        ) : (
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data.rankDistribution}
                  dataKey="count"
                  nameKey="name"
                  outerRadius={80}
                  label
                >
                  {data.rankDistribution.map((entry) => (
                    <Cell key={entry.name} fill={RANK_COLORS[entry.name] ?? "#888888"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function EngagementTab({ data }: { data: DashboardData }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl p-4" style={cardStyle}>
          <p style={{ color: "#888888", fontSize: 12 }}>7日継続率</p>
          <p style={{ color: "#C8FF00", fontSize: 22, fontWeight: 700 }}>{data.retentionRate7d}%</p>
        </div>
        <div className="rounded-2xl p-4" style={cardStyle}>
          <p style={{ color: "#888888", fontSize: 12 }}>30日継続率</p>
          <p style={{ color: "#7CD4FF", fontSize: 22, fontWeight: 700 }}>
            {data.retentionRate30d}%
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl p-5" style={cardStyle}>
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          機能利用率（会員全体のうち利用経験あり）
        </p>
        <div className="flex flex-col gap-3">
          {data.featureAdoption.map((f) => (
            <div key={f.name}>
              <div className="mb-1 flex justify-between">
                <span style={{ color: "#F0F0F0", fontSize: 12 }}>{f.name}</span>
                <span style={{ color: "#C8FF00", fontSize: 12, fontWeight: 700 }}>
                  {f.rate}%（{f.count}人）
                </span>
              </div>
              <div className="rounded-full" style={{ background: "#0F0F0F", height: 8 }}>
                <div
                  className="rounded-full"
                  style={{ background: "#C8FF00", height: 8, width: `${f.rate}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-2xl p-5" style={cardStyle}>
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          今月の機能利用状況（回数）
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div
            className="rounded-lg p-3"
            style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
          >
            <p style={{ color: "#999999", fontSize: 11 }}>面接実施数</p>
            <p style={{ color: "#F0F0F0", fontSize: 18, fontWeight: 700 }}>
              {data.interviewsThisMonth}回
            </p>
          </div>
          {Object.entries(data.usageThisPeriod).map(([key, count]) => (
            <div
              key={key}
              className="rounded-lg p-3"
              style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
            >
              <p style={{ color: "#999999", fontSize: 11 }}>{FEATURE_LABELS[key] ?? key}</p>
              <p style={{ color: "#F0F0F0", fontSize: 18, fontWeight: 700 }}>{count}回</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

type TalentStats = {
  profiles: { total: number; public: number; withRecording: number };
  tickets: {
    total: number;
    revenue: number;
    monthCount: number;
    monthRevenue: number;
    buyingCompanies: number;
  };
  contacts: { total: number; accepted: number; declined: number; pending: number };
  messages: number;
  topCompanies: { name: string; count: number; amount: number }[];
};

function TalentTab({ token }: { token: string }) {
  const [stats, setStats] = useState<TalentStats | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/talent/admin-stats", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        setStats((await r.json()) as TalentStats);
      })
      .catch(() =>
        setError("読み込みに失敗しました（データベースの準備ができていない可能性があります）"),
      );
  }, [token]);

  if (error) return <p style={{ color: "#FF5C5C", fontSize: 13 }}>{error}</p>;
  if (!stats) return <p style={{ color: "#888888", fontSize: 13 }}>読み込み中...</p>;
  const box = (label: string, value: string) => (
    <div
      key={label}
      className="rounded-xl p-4"
      style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
    >
      <p style={{ color: "#888888", fontSize: 12 }}>{label}</p>
      <p className="mt-1" style={{ color: "#F0F0F0", fontSize: 22, fontWeight: 700 }}>
        {value}
      </p>
    </div>
  );
  const acceptRate =
    stats.contacts.accepted + stats.contacts.declined
      ? Math.round(
          (stats.contacts.accepted / (stats.contacts.accepted + stats.contacts.declined)) * 100,
        )
      : null;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {box("今月のチケット売上", fmtYen(stats.tickets.monthRevenue))}
        {box("今月のチケット枚数", `${stats.tickets.monthCount}枚`)}
        {box("累計のチケット売上", fmtYen(stats.tickets.revenue))}
        {box("購入した企業", `${stats.tickets.buyingCompanies}社`)}
        {box("公開中のユーザー", `${stats.profiles.public}人`)}
        {box("録画も公開", `${stats.profiles.withRecording}人`)}
        {box("面談の申し込み", `${stats.contacts.total}件`)}
        {box("承諾率", acceptRate === null ? "-" : `${acceptRate}%`)}
      </div>
      <div
        className="rounded-xl p-4"
        style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
      >
        <p className="mb-3" style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700 }}>
          チケットをよく買っている企業
        </p>
        {stats.topCompanies.length === 0 ? (
          <p style={{ color: "#888888", fontSize: 13 }}>まだ購入はありません</p>
        ) : (
          stats.topCompanies.map((c) => (
            <div
              key={c.name}
              className="flex justify-between py-1.5 text-[13px]"
              style={{ color: "#CCCCCC" }}
            >
              <span>{c.name}</span>
              <span>
                {c.count}枚 ・ {fmtYen(c.amount)}
              </span>
            </div>
          ))
        )}
      </div>
      <p style={{ color: "#666666", fontSize: 12 }}>
        返事待ち {stats.contacts.pending}件 ・ メッセージ累計 {stats.messages}通 ・ プロフィール作成{" "}
        {stats.profiles.total}人
      </p>
    </div>
  );
}
