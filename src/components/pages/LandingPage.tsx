/**
 * トップページ（/）。はじめて来た人が「何ができて、どう使うのか」を1画面ずつ分かるようにする。
 * ログイン中の人には「マイページへ」を出す。
 */
import { Link } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Building2,
  Check,
  Eye,
  FileText,
  Mic,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { PRACTICE_RULES } from "@/lib/plan-rules";

const ACCENT = "#C8FF00";

export function LandingPage() {
  const { session } = useAuth();
  return (
    <div style={{ background: "#0B0B0B", color: "#F0F0F0", minHeight: "100vh" }}>
      <Header loggedIn={!!session} />
      <Hero loggedIn={!!session} />
      <Steps />
      <Features />
      <Pricing />
      <ForCompanies />
      <Faq />
      <FinalCta loggedIn={!!session} />
      <Footer />
    </div>
  );
}

function PrimaryCta({ loggedIn, big }: { loggedIn: boolean; big?: boolean }) {
  return loggedIn ? (
    <Link
      to="/private"
      className={`inline-flex items-center justify-center rounded-full ${big ? "h-14 px-8 text-[17px]" : "h-12 px-6 text-[15px]"}`}
      style={{ background: ACCENT, color: "#0F0F0F", fontWeight: 800 }}
    >
      マイページへ
    </Link>
  ) : (
    <Link
      to="/login"
      search={{ signup: "1" }}
      className={`inline-flex items-center justify-center rounded-full ${big ? "h-14 px-8 text-[17px]" : "h-12 px-6 text-[15px]"}`}
      style={{
        background: ACCENT,
        color: "#0F0F0F",
        fontWeight: 800,
        boxShadow: "0 10px 30px rgba(200,255,0,.25)",
      }}
    >
      無料ではじめる（1分）
    </Link>
  );
}

function Header({ loggedIn }: { loggedIn: boolean }) {
  return (
    <header
      className="sticky top-0 z-20 backdrop-blur"
      style={{ background: "rgba(11,11,11,.8)", borderBottom: "1px solid #1C1C1C" }}
    >
      <div className="mx-auto flex h-14 max-w-[1080px] items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/icons/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
          <span className="text-[16px]" style={{ fontWeight: 800 }}>
            ガチキャリAI
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {!loggedIn && (
            <Link
              to="/login"
              className="rounded-full px-4 py-2 text-[13px]"
              style={{ color: "#CCCCCC" }}
            >
              ログイン
            </Link>
          )}
          <Link
            to={loggedIn ? "/private" : "/login"}
            search={loggedIn ? undefined : { signup: "1" }}
            className="rounded-full px-4 py-2 text-[13px]"
            style={{ background: ACCENT, color: "#0F0F0F", fontWeight: 700 }}
          >
            {loggedIn ? "マイページ" : "無料ではじめる"}
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero({ loggedIn }: { loggedIn: boolean }) {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 75% 30%, rgba(200,255,0,.12) 0%, rgba(11,11,11,0) 70%)",
        }}
      />
      <div className="relative mx-auto grid max-w-[1080px] items-center gap-10 px-4 pb-14 pt-10 md:grid-cols-2 md:pt-16">
        <div>
          <span
            className="inline-block rounded-full px-3 py-1 text-[12px]"
            style={{ background: "#1A2208", color: ACCENT, fontWeight: 700 }}
          >
            就活・転職・入試の面接練習
          </span>
          <h1
            className="mt-4 text-[34px] leading-[1.25] md:text-[46px]"
            style={{ fontWeight: 900, letterSpacing: "-0.01em" }}
          >
            AIの面接官と、
            <br />
            <span style={{ color: ACCENT }}>本番さながら</span>に練習。
          </h1>
          <p
            className="mt-4 text-[15px] leading-relaxed md:text-[16px]"
            style={{ color: "#BBBBBB" }}
          >
            声で話すだけで、AIが質問を深掘り。終わるとすぐ、あなたの発言を根拠に採点します。
            評価が上がるほど、企業から面談の申し込みが届きやすくなります。
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <PrimaryCta loggedIn={loggedIn} big />
          </div>
          <ul
            className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px]"
            style={{ color: "#AAAAAA" }}
          >
            {["無料で月5回", "スマホでOK", "クレジットカード不要"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check size={15} color={ACCENT} />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* 面接中の画面のイメージ */}
        <div className="relative mx-auto w-full max-w-[420px]">
          <div
            className="overflow-hidden rounded-[28px]"
            style={{ border: "1px solid #2A2A2A", boxShadow: "0 30px 80px rgba(0,0,0,.6)" }}
          >
            <div className="relative aspect-[4/5]">
              <img
                src="/avatar/base.webp"
                alt="AIの面接官"
                className="h-full w-full object-cover"
                style={{ objectPosition: "50% 15%" }}
              />
              <span
                className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px]"
                style={{ background: "rgba(0,0,0,.65)" }}
              >
                ● AI面接官
              </span>
              <div
                className="absolute inset-x-3 bottom-3 rounded-2xl p-3"
                style={{ background: "rgba(10,10,10,.85)", border: "1px solid #2A2A2A" }}
              >
                <p className="text-[11px]" style={{ color: "#888" }}>
                  面接官
                </p>
                <p className="mt-0.5 text-[14px] leading-snug" style={{ fontWeight: 700 }}>
                  そのとき、あなたはどう工夫しましたか？
                </p>
              </div>
            </div>
          </div>
          {/* 浮かんだ結果カード */}
          <div
            className="absolute -left-4 top-8 rounded-2xl px-3.5 py-2.5 md:-left-10"
            style={{
              background: "#151515",
              border: "1px solid #2E2E2E",
              boxShadow: "0 12px 30px rgba(0,0,0,.5)",
            }}
          >
            <p className="text-[10.5px]" style={{ color: "#888" }}>
              AI採点
            </p>
            <p className="text-[24px] leading-none" style={{ color: ACCENT, fontWeight: 900 }}>
              86<span className="text-[12px]">点</span>
            </p>
          </div>
          <div
            className="absolute -right-3 bottom-24 rounded-2xl px-3.5 py-2.5 md:-right-8"
            style={{
              background: "#151515",
              border: "1px solid #2E2E2E",
              boxShadow: "0 12px 30px rgba(0,0,0,.5)",
            }}
          >
            <p className="text-[10.5px]" style={{ color: "#888" }}>
              練習した人の中で
            </p>
            <p className="text-[16px]" style={{ fontWeight: 900 }}>
              上位 <span style={{ color: ACCENT }}>12%</span>
            </p>
          </div>
          <p className="mt-3 text-center text-[11px]" style={{ color: "#666" }}>
            ※画面はイメージです
          </p>
        </div>
      </div>
    </section>
  );
}

function SectionTitle({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="text-center">
      <p className="text-[12px] tracking-widest" style={{ color: ACCENT, fontWeight: 700 }}>
        {kicker}
      </p>
      <h2 className="mt-2 text-[26px] md:text-[32px]" style={{ fontWeight: 900 }}>
        {title}
      </h2>
      {sub && (
        <p
          className="mx-auto mt-3 max-w-[560px] text-[14px] leading-relaxed"
          style={{ color: "#AAAAAA" }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function Steps() {
  const steps = [
    {
      icon: <Mic size={22} />,
      t: "練習する",
      d: "AIの面接官と声で話します。職種や時間も選べます。",
    },
    {
      icon: <BarChart3 size={22} />,
      t: "評価を見る",
      d: "7つの力を、あなたの発言を根拠に採点。直し方も分かります。",
    },
    {
      icon: <ShieldCheck size={22} />,
      t: "結果を公開",
      d: "名前は伏せて公開。企業に見せる結果は自分で選べます。",
    },
    {
      icon: <Building2 size={22} />,
      t: "申し込みが届く",
      d: "あなたの評価を見た企業から、面談の申し込みが届きます。",
    },
  ];
  return (
    <section className="mx-auto max-w-[1080px] px-4 py-14">
      <SectionTitle kicker="HOW IT WORKS" title="使い方は4ステップ" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <div
            key={s.t}
            className="rounded-2xl p-5"
            style={{ background: "#141414", border: "1px solid #232323" }}
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: ACCENT, color: "#0F0F0F" }}
              >
                {s.icon}
              </span>
              <span className="text-[12px]" style={{ color: "#777", fontWeight: 700 }}>
                STEP {i + 1}
              </span>
            </div>
            <p className="mt-3 text-[17px]" style={{ fontWeight: 800 }}>
              {s.t}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "#AAAAAA" }}>
              {s.d}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-5 text-center text-[13px]" style={{ color: "#AAB4A0" }}>
        企業は評価で絞り込んで人を探します。練習して評価が上がるほど、見つけてもらいやすくなります。
      </p>
    </section>
  );
}

function Feature({ icon, t, d }: { icon: ReactNode; t: string; d: string }) {
  return (
    <div
      className="flex gap-4 rounded-2xl p-5"
      style={{ background: "#121212", border: "1px solid #202020" }}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{ background: "#1C2410", color: ACCENT }}
      >
        {icon}
      </span>
      <div>
        <p className="text-[16px]" style={{ fontWeight: 800 }}>
          {t}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "#AAAAAA" }}>
          {d}
        </p>
      </div>
    </div>
  );
}

function Features() {
  return (
    <section
      style={{
        background: "#0F0F0F",
        borderTop: "1px solid #1A1A1A",
        borderBottom: "1px solid #1A1A1A",
      }}
    >
      <div className="mx-auto max-w-[1080px] px-4 py-14">
        <SectionTitle
          kicker="FEATURES"
          title="本番で困らないための、ぜんぶ"
          sub="答えの中身だけでなく、話し方・間・目線まで。練習のたびに、自分の現在地と課題が分かります。"
        />
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          <Feature
            icon={<Mic size={22} />}
            t="本番さながらのAI面接官"
            d="顔が動き、声で話すAIの面接官。あなたの答えに合わせて「なぜ？」「具体的には？」と深掘りします。"
          />
          <Feature
            icon={<BarChart3 size={22} />}
            t="根拠つきの評価"
            d="7つの力を5段階で。評価の理由として、あなたの実際の発言を引用します。よりよい答え方の例つき。"
          />
          <Feature
            icon={<Activity size={22} />}
            t="間・声の波・話し方"
            d="答え始めるまでの間、途中の沈黙、声の強弱、答えの長さ、「えー」「あの」の回数まで数字で分かります。"
          />
          <Feature
            icon={<Eye size={22} />}
            t="目線のチェック"
            d="カメラの映像から、画面を見て話せていたかを測ります。映像は保存も送信もしません。"
          />
          <Feature
            icon={<Trophy size={22} />}
            t="上位何%かが分かる"
            d="練習した人の中で、あなたの点数が上位何%か。伸びていく自分が見えるから続けられます。"
          />
          <Feature
            icon={<FileText size={22} />}
            t="書類と自己分析もAIで"
            d="履歴書・自己PR・志望理由書の作成と添削、面接の結果から作る自己分析レポートも。"
          />
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const plans = [
    { key: "free" as const, name: "無料", note: "まずはお試し" },
    { key: "individual_light" as const, name: "ライト", note: "週3〜4回の練習に" },
    { key: "individual_pro" as const, name: "プロ", note: "本番前に集中して", hot: true },
  ];
  return (
    <section className="mx-auto max-w-[1080px] px-4 py-14">
      <SectionTitle
        kicker="PRICING"
        title="料金"
        sub="評価の中身・プロフィール公開・企業からの申し込みは、どのプランでも同じです。変わるのは練習の回数と時間です。"
      />
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {plans.map((p) => {
          const r = PRACTICE_RULES[p.key];
          return (
            <div
              key={p.key}
              className="relative rounded-2xl p-6"
              style={{
                background: "#141414",
                border: `1px solid ${p.hot ? ACCENT : "#232323"}`,
              }}
            >
              {p.hot && (
                <span
                  className="absolute -top-3 left-6 rounded-full px-3 py-1 text-[11px]"
                  style={{ background: ACCENT, color: "#0F0F0F", fontWeight: 800 }}
                >
                  いちばん人気
                </span>
              )}
              <p className="text-[15px]" style={{ fontWeight: 800 }}>
                {p.name}
              </p>
              <p className="mt-1 text-[12px]" style={{ color: "#888" }}>
                {p.note}
              </p>
              <p className="mt-4 text-[32px] leading-none" style={{ fontWeight: 900 }}>
                ¥{r.priceJpy.toLocaleString()}
                <span className="ml-1 text-[13px]" style={{ color: "#888", fontWeight: 600 }}>
                  /月
                </span>
              </p>
              <ul className="mt-5 space-y-2 text-[13px]" style={{ color: "#CCCCCC" }}>
                <li className="flex items-center gap-2">
                  <Check size={15} color={ACCENT} /> 練習 月{r.perMonth}回（1日{r.perDay}回まで）
                </li>
                <li className="flex items-center gap-2">
                  <Check size={15} color={ACCENT} /> 1回 最大{r.maxMinutes}分
                </li>
                <li className="flex items-center gap-2">
                  <Check size={15} color={ACCENT} /> 結果{" "}
                  {r.results == null ? "すべて" : `${r.results}件`}まで表示
                </li>
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ForCompanies() {
  return (
    <section className="mx-auto max-w-[1080px] px-4 pb-14">
      <div
        className="grid items-center gap-6 rounded-3xl p-7 md:grid-cols-[1fr_auto] md:p-10"
        style={{
          background: "linear-gradient(135deg, #18200A 0%, #121212 60%)",
          border: "1px solid #2A3512",
        }}
      >
        <div>
          <p className="text-[12px] tracking-widest" style={{ color: ACCENT, fontWeight: 700 }}>
            FOR COMPANIES
          </p>
          <h2 className="mt-2 text-[24px] md:text-[28px]" style={{ fontWeight: 900 }}>
            採用担当の方へ
          </h2>
          <p
            className="mt-3 max-w-[560px] text-[14px] leading-relaxed"
            style={{ color: "#BBBBBB" }}
          >
            AI面接の結果と会話を見て、会いたい人に直接、面談を申し込めます。
            月額なし。見たい人の分だけコインで。求人の掲載は今は無料です。
          </p>
        </div>
        <Link
          to="/login"
          search={{ mode: "business" }}
          className="inline-flex h-12 items-center justify-center rounded-full px-6 text-[14px]"
          style={{ background: "#F0F0F0", color: "#0F0F0F", fontWeight: 800 }}
        >
          企業として登録する
        </Link>
      </div>
    </section>
  );
}

function Faq() {
  const items = [
    {
      q: "本当に無料で使えますか？",
      a: "はい。無料プランで月5回まで練習できます。クレジットカードの登録もいりません。",
    },
    {
      q: "スマホでも練習できますか？",
      a: "できます。マイクとカメラを使うので、静かな場所でお使いください。ホーム画面に追加するとアプリのように使えます。",
    },
    {
      q: "企業に名前や結果が勝手に見られませんか？",
      a: "プロフィールは最初は非公開です。公開しても名前は伏せて表示し、企業に見せる結果はあなたが選べます。",
    },
    {
      q: "カメラの映像は保存されますか？",
      a: "目線のチェックはあなたのブラウザの中だけで行い、映像は保存も送信もしません（録画を残すと選んだときだけ保存します）。",
    },
  ];
  return (
    <section className="mx-auto max-w-[760px] px-4 pb-14">
      <SectionTitle kicker="FAQ" title="よくある質問" />
      <div className="mt-8 space-y-2">
        {items.map((it) => (
          <details
            key={it.q}
            className="rounded-2xl px-5 py-4"
            style={{ background: "#141414", border: "1px solid #232323" }}
          >
            <summary className="cursor-pointer text-[15px]" style={{ fontWeight: 700 }}>
              {it.q}
            </summary>
            <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "#AAAAAA" }}>
              {it.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta({ loggedIn }: { loggedIn: boolean }) {
  return (
    <section className="px-4 pb-16">
      <div className="mx-auto max-w-[760px] text-center">
        <h2 className="text-[26px] md:text-[32px]" style={{ fontWeight: 900 }}>
          次の面接、ぶっつけ本番で行きますか？
        </h2>
        <p className="mt-3 text-[14px]" style={{ color: "#AAAAAA" }}>
          10分の練習で、今の自分の課題が分かります。
        </p>
        <div className="mt-6">
          <PrimaryCta loggedIn={loggedIn} big />
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ borderTop: "1px solid #1A1A1A" }}>
      <div
        className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-[12px]"
        style={{ color: "#777" }}
      >
        <span>© 合同会社AKITOグループ</span>
        <div className="flex gap-4">
          <Link to="/terms">利用規約</Link>
          <Link to="/privacy">プライバシーポリシー</Link>
          <Link to="/tokusho">特定商取引法に基づく表記</Link>
        </div>
      </div>
    </footer>
  );
}
