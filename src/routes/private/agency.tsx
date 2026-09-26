import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

type DashboardData = {
  agencyName: string;
  referralCode: string;
  referralUrl: string;
  commissionLight: number;
  commissionPro: number;
  referredCompanies: {
    companyName: string;
    plan: string;
    active: boolean;
    commission: number;
    joinedAt: string;
  }[];
  activeCount: number;
  totalMonthlyCommission: number;
};

const PLAN_LABELS: Record<string, string> = {
  free: "未契約",
  company_metered: "従量課金",
  company_light: "ライト",
  company_pro: "プロ",
};

function fmtYen(n: number) {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

export const Route = createFileRoute("/private/agency")({
  head: () => ({ meta: [{ title: "代理店ダッシュボード｜インタビアAI" }] }),
  component: AgencyDashboard,
});

function AgencyDashboard() {
  const { session, loading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const res = await fetch(`/api/agency-dashboard-data?_t=${Date.now()}`, {
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

  const cardStyle = {
    background: "#1A1A1A",
    border: "1px solid #2A2A2A",
    borderRadius: 16,
  } as const;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.referralUrl);
      toast.success("紹介リンクをコピーしました");
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

  return (
    <div
      className="min-h-screen px-6 py-10"
      style={{ background: "#0F0F0F", fontFamily: "'Inter', sans-serif" }}
    >
      <div className="mx-auto max-w-2xl">
        <h1 className="text-[22px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
          代理店ダッシュボード
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "#999999" }}>
          {data.agencyName} 様
        </p>

        <div className="mt-6 rounded-2xl p-5" style={cardStyle}>
          <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            あなたの紹介リンク
          </p>
          <div
            className="flex items-center gap-2 rounded-lg p-3"
            style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
          >
            <span className="flex-1 truncate" style={{ color: "#F0F0F0", fontSize: 12 }}>
              {data.referralUrl}
            </span>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-full px-3 py-1.5 text-[12px]"
              style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
            >
              コピー
            </button>
          </div>
          <p className="mt-2" style={{ color: "#666666", fontSize: 11 }}>
            このリンクから企業に登録してもらうと、自動で紹介実績として記録されます。
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-2xl p-4" style={cardStyle}>
            <p style={{ color: "#888888", fontSize: 12 }}>契約中の紹介企業数</p>
            <p style={{ color: "#F0F0F0", fontSize: 24, fontWeight: 700 }}>{data.activeCount}社</p>
          </div>
          <div className="rounded-2xl p-4" style={cardStyle}>
            <p style={{ color: "#888888", fontSize: 12 }}>今月の報酬見込み</p>
            <p style={{ color: "#C8FF00", fontSize: 22, fontWeight: 700 }}>
              {fmtYen(data.totalMonthlyCommission)}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl p-4" style={{ ...cardStyle, background: "#151515" }}>
          <p style={{ color: "#888888", fontSize: 11 }}>
            報酬単価：ライト契約 {fmtYen(data.commissionLight)}/月・プロ契約{" "}
            {fmtYen(data.commissionPro)}/月（契約継続中は毎月発生）
          </p>
        </div>

        <h2 className="mt-8 text-[16px]" style={{ color: "#F0F0F0", fontWeight: 700 }}>
          紹介した企業一覧
        </h2>
        {data.referredCompanies.length === 0 && (
          <p className="mt-2 text-[13px]" style={{ color: "#888888" }}>
            まだ紹介実績がありません。
          </p>
        )}
        <div className="mt-3 space-y-2">
          {data.referredCompanies.map((c, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl p-4"
              style={cardStyle}
            >
              <div>
                <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700 }}>{c.companyName}</p>
                <p style={{ color: "#666666", fontSize: 11, marginTop: 2 }}>
                  登録日：{new Date(c.joinedAt).toLocaleDateString("ja-JP")}
                </p>
              </div>
              <div className="text-right">
                <span
                  className="rounded-full px-2.5 py-1 text-[11px]"
                  style={{
                    background: c.active ? "#1A3A1A" : "#2A2A2A",
                    color: c.active ? "#00CC88" : "#888888",
                  }}
                >
                  {PLAN_LABELS[c.plan] ?? c.plan}
                </span>
                {c.active && (
                  <p className="mt-1" style={{ color: "#C8FF00", fontSize: 12, fontWeight: 700 }}>
                    {fmtYen(c.commission)}/月
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
