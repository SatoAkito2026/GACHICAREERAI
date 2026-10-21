/**
 * スマホ・タブレット用のホーム画面（個人）。パソコンのカード一覧とは別の、アプリらしい形にする。
 * - 下のメニューと同じリンクを並べるのではなく、「次にやること」と「今の状況」を出す
 * - 練習・評価・公開・オファーへの移動は下のメニューに任せる
 */
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Briefcase,
  ChevronRight,
  Compass,
  FileText,
  Globe,
  IdCard,
  Mail,
  Mic,
  Search,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { talentApi } from "@/components/talent/TalentUI";

type Summary = {
  practiceCount: number;
  latest: { score: number | null; date: string; jobType: string | null } | null;
  profile: { is_public: boolean; average_score: number | null } | null;
};

type OfferInfo = { pending: number; unread: number };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "こんばんは";
  if (h < 11) return "おはようございます";
  if (h < 18) return "こんにちは";
  return "こんばんは";
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function MobileHome() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [offers, setOffers] = useState<OfferInfo | null>(null);

  useEffect(() => {
    void talentApi<Summary>("/api/talent/my-profile").then((r) => {
      if (r.ok) setSummary(r.data);
    });
    void talentApi<{ requests: { status: string; unread: number }[] }>(
      "/api/talent/contacts?as=candidate",
    ).then((r) => {
      if (!r.ok) return;
      const list = r.data.requests ?? [];
      setOffers({
        pending: list.filter((o) => o.status === "pending").length,
        unread: list.reduce((a, o) => a + (o.unread ?? 0), 0),
      });
    });
  }, []);

  const name = (user?.user_metadata?.full_name as string | undefined) ?? "";
  const latest = summary?.latest ?? null;
  const isPublic = !!summary?.profile?.is_public;
  const offerBadge = (offers?.pending ?? 0) + (offers?.unread ?? 0);

  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-4 px-4 pb-6 pt-5">
      <div>
        <p className="text-[13px]" style={{ color: "#888888" }}>
          {greeting()}
          {name ? `、${name}さん` : ""}
        </p>
        <h1 className="mt-0.5 text-[22px]" style={{ color: "#F0F0F0", fontWeight: 800 }}>
          今日も1回、練習しよう
        </h1>
      </div>

      {/* 次にやること：いちばん大きく */}
      <Link
        to="/private/individual/practice"
        className="relative overflow-hidden rounded-3xl p-5 active:scale-[0.99]"
        style={{ background: "#C8FF00", color: "#0F0F0F" }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: "#0F0F0F" }}
          >
            <Mic size={28} color="#C8FF00" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[19px] leading-tight" style={{ fontWeight: 800 }}>
              模擬面接をはじめる
            </p>
            <p className="mt-1 text-[12.5px]" style={{ opacity: 0.75 }}>
              {latest
                ? `前回 ${shortDate(latest.date)}${latest.jobType ? `・${latest.jobType}` : ""}`
                : "AIの面接官と、まずは1回やってみよう"}
            </p>
          </div>
          <ChevronRight size={24} />
        </div>
      </Link>

      {/* 今の状況 */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatTile
          to="/private/individual/history"
          icon={<TrendingUp size={18} />}
          label="前回の点数"
          value={latest?.score != null ? `${latest.score}` : "—"}
          unit={latest?.score != null ? "点" : ""}
        />
        <StatTile
          to="/private/individual/talent"
          icon={<Globe size={18} />}
          label="プロフィール"
          value={summary ? (isPublic ? "公開中" : "非公開") : "—"}
          accent={isPublic}
        />
        <StatTile
          to="/private/individual/offers"
          icon={<Mail size={18} />}
          label="オファー"
          value={offers ? `${offers.pending}` : "—"}
          unit={offers ? "件" : ""}
          badge={offerBadge}
        />
      </div>

      {/* 次の一歩のヒント（状況に合わせて1つだけ） */}
      {summary && <NextStep summary={summary} pendingOffers={offers?.pending ?? 0} />}

      {/* そのほかのツール：アプリの設定画面のような一覧 */}
      <section>
        <h2 className="mb-2 px-1 text-[12px]" style={{ color: "#888888", fontWeight: 600 }}>
          ツール
        </h2>
        <div
          className="overflow-hidden rounded-2xl"
          style={{ background: "#1A1A1A", border: "1px solid #262626" }}
        >
          <ToolRow
            to="/private/individual/jobs"
            icon={<Briefcase size={19} />}
            title="求人を探す"
            desc="掲載中の求人を見て、そのまま応募"
          />
          <ToolRow
            to="/private/individual/documents"
            icon={<FileText size={19} />}
            title="書類生成AI"
            desc="履歴書・自己PR・ES"
          />
          <ToolRow
            to="/private/individual/research"
            icon={<Search size={19} />}
            title="企業研究AI"
            desc="志望企業の想定質問（プロ）"
          />
          <ToolRow
            to="/private/individual/self-analysis"
            icon={<Compass size={19} />}
            title="自己分析レポート"
            desc="強み・弱み・向いている仕事"
          />
          <ToolRow
            to="/private/individual/profile"
            icon={<IdCard size={19} />}
            title="経歴・希望条件"
            desc="AIが質問を考えるときに使います"
            last
          />
        </div>
      </section>

      <p className="flex items-center justify-center gap-1.5 text-[11px]" style={{ color: "#555" }}>
        <BookOpen size={12} />
        練習を重ねるほど、評価と人物まとめが正確になります
      </p>
    </main>
  );
}

function StatTile({
  to,
  icon,
  label,
  value,
  unit,
  accent,
  badge,
}: {
  to: "/private/individual/history" | "/private/individual/talent" | "/private/individual/offers";
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className="relative flex flex-col gap-2 rounded-2xl p-3 active:scale-[0.98]"
      style={{ background: "#1A1A1A", border: "1px solid #262626" }}
    >
      <span style={{ color: "#888888" }}>{icon}</span>
      <span className="text-[11px]" style={{ color: "#888888" }}>
        {label}
      </span>
      <span
        className="text-[18px] leading-none"
        style={{ color: accent ? "#C8FF00" : "#F0F0F0", fontWeight: 800 }}
      >
        {value}
        {unit && (
          <span className="ml-0.5 text-[11px]" style={{ fontWeight: 600 }}>
            {unit}
          </span>
        )}
      </span>
      {!!badge && (
        <span
          className="absolute right-2.5 top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px]"
          style={{ background: "#FF4D4D", color: "#fff", fontWeight: 700 }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function NextStep({ summary, pendingOffers }: { summary: Summary; pendingOffers: number }) {
  let text = "";
  let to:
    | "/private/individual/practice"
    | "/private/individual/talent"
    | "/private/individual/offers"
    | "/private/individual/history" = "/private/individual/practice";
  let action = "";
  if (pendingOffers > 0) {
    text = `企業から面談の申し込みが ${pendingOffers} 件届いています`;
    to = "/private/individual/offers";
    action = "確認する";
  } else if (summary.practiceCount === 0) {
    text = "まずは模擬面接を1回受けて、自分の評価を見てみましょう";
    to = "/private/individual/practice";
    action = "はじめる";
  } else if (!summary.profile?.is_public) {
    text = "プロフィールを公開すると、企業から面談の申し込みが届くようになります";
    to = "/private/individual/talent";
    action = "公開の設定へ";
  } else {
    text = "評価の「伸びしろ」を意識して、もう1回練習してみましょう";
    to = "/private/individual/history";
    action = "評価を見る";
  }
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl px-4 py-3 active:scale-[0.99]"
      style={{ background: "#16200A", border: "1px solid #3A4A12" }}
    >
      <p className="flex-1 text-[13px] leading-relaxed" style={{ color: "#E6F7B0" }}>
        {text}
      </p>
      <span className="shrink-0 text-[12px]" style={{ color: "#C8FF00", fontWeight: 700 }}>
        {action} →
      </span>
    </Link>
  );
}

function ToolRow({
  to,
  icon,
  title,
  desc,
  last,
}: {
  to:
    | "/private/individual/jobs"
    | "/private/individual/documents"
    | "/private/individual/research"
    | "/private/individual/self-analysis"
    | "/private/individual/profile";
  icon: React.ReactNode;
  title: string;
  desc: string;
  last?: boolean;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3.5 active:bg-[#222]"
      style={{ borderBottom: last ? "none" : "1px solid #262626" }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: "#262626", color: "#C8FF00" }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px]" style={{ color: "#F0F0F0", fontWeight: 600 }}>
          {title}
        </span>
        <span className="block truncate text-[11.5px]" style={{ color: "#888888" }}>
          {desc}
        </span>
      </span>
      <ChevronRight size={18} color="#555" />
    </Link>
  );
}
