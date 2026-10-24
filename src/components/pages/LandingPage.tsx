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
import {
  DeliveryScreen,
  InterviewScreen,
  OfferScreen,
  PhoneFrame,
  ResultScreen,
} from "@/components/landing/Mockups";
import { COMPANY_INTERVIEW_PRICE_JPY, PRACTICE_RULES } from "@/lib/plan-rules";
import { COIN_EXPIRY_MONTHS, COIN_PACKS, PRICE_TIERS } from "@/lib/coins";

const ACCENT = "#C8FF00";

export function LandingPage() {
  const { session } = useAuth();
  return (
    <div style={{ background: "#0B0B0B", color: "#F0F0F0", minHeight: "100vh" }}>
      <Header loggedIn={!!session} />
      <Hero loggedIn={!!session} />
      <Steps />
      <Screens />
      <AdVideo loggedIn={!!session} />
      <Features />
      <ResultSample />
      <Pricing />
      <ForCompanies />
      <FairSafe />
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

        {/* アプリの画面のイメージ（面接中の画面と、評価の画面） */}
        <div className="relative mx-auto flex w-full max-w-[460px] justify-center">
          <div className="absolute right-0 top-10 hidden scale-[0.86] opacity-90 sm:block md:-right-6">
            <PhoneFrame tilt={6}>
              <ResultScreen />
            </PhoneFrame>
          </div>
          <div className="relative sm:-translate-x-16">
            <PhoneFrame tilt={-3}>
              <InterviewScreen />
            </PhoneFrame>
          </div>
        </div>
      </div>
      <p
        className="relative -mt-8 pb-6 text-center text-[11px] md:text-right md:pr-10"
        style={{ color: "#666" }}
      >
        ※画面はイメージです
      </p>
    </section>
  );
}

function Screens() {
  const items: { screen: ReactNode; t: string; d: string }[] = [
    {
      screen: <InterviewScreen />,
      t: "AIの面接官と話す",
      d: "声で答えるだけ。答えに合わせて深掘りされます",
    },
    { screen: <ResultScreen />, t: "すぐに評価が届く", d: "7つの力と、根拠になったあなたの発言" },
    { screen: <DeliveryScreen />, t: "間・声・目線まで", d: "話し方のくせが数字で分かります" },
    {
      screen: <OfferScreen />,
      t: "企業から申し込み",
      d: "結果を公開すると、面談の申し込みが届くことも",
    },
  ];
  return (
    <section style={{ background: "#0F0F0F", borderTop: "1px solid #1A1A1A" }}>
      <div className="mx-auto max-w-[1180px] py-14">
        <div className="px-4">
          <SectionTitle
            kicker="SCREENS"
            title="アプリの画面"
            sub="スマホでもパソコンでも。ホーム画面に追加すれば、アプリのように使えます。"
          />
        </div>
        <div className="mt-10 flex snap-x snap-mandatory gap-6 overflow-x-auto px-6 pb-4 lg:justify-center lg:overflow-visible">
          {items.map((it) => (
            <div key={it.t} className="flex w-[260px] shrink-0 snap-center flex-col items-center">
              <PhoneFrame>{it.screen}</PhoneFrame>
              <p className="mt-4 text-[16px]" style={{ fontWeight: 800 }}>
                {it.t}
              </p>
              <p
                className="mt-1 text-center text-[12.5px] leading-relaxed"
                style={{ color: "#AAAAAA" }}
              >
                {it.d}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[11px]" style={{ color: "#666" }}>
          ※画面はイメージです。数字や会社名は説明用のサンプルです
        </p>
      </div>
    </section>
  );
}

function AdVideo({ loggedIn }: { loggedIn: boolean }) {
  return (
    <section className="mx-auto max-w-[1080px] px-4 py-14">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <div className="order-2 md:order-1">
          <p className="text-[12px] tracking-widest" style={{ color: ACCENT, fontWeight: 700 }}>
            MOVIE
          </p>
          <h2 className="mt-2 text-[26px] leading-snug md:text-[32px]" style={{ fontWeight: 900 }}>
            20秒でわかる
            <br />
            ガチキャリAI
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "#AAAAAA" }}>
            面接の練習から、評価、企業からの申し込みまで。流れを動画で見てみてください。
          </p>
          <div className="mt-6">
            <PrimaryCta loggedIn={loggedIn} big />
          </div>
        </div>
        <div className="order-1 flex justify-center md:order-2">
          <div
            className="relative w-[270px] overflow-hidden rounded-[28px]"
            style={{ border: "1px solid #2A2A2A", boxShadow: "0 30px 70px rgba(0,0,0,.6)" }}
          >
            <video
              src="/videos/ad.mp4"
              poster="/videos/ad-poster.jpg"
              controls
              playsInline
              muted
              loop
              autoPlay
              preload="metadata"
              className="block aspect-[9/16] w-full bg-black"
            />
          </div>
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
    { key: "individual_light" as const, name: "ライト", note: "週3〜4回の練習に", hot: true },
    { key: "individual_pro" as const, name: "プロ", note: "本番前に集中して" },
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
                  おすすめ
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

function ResultSample() {
  const comps: [string, number | null][] = [
    ["伝える力", 3],
    ["論理的に考える力", 2],
    ["主体性", 4],
    ["協調性", 3],
    ["粘り強さ", 5],
    ["誠実さ", 3],
    ["学ぶ姿勢", null],
  ];
  return (
    <section className="mx-auto max-w-[1080px] px-4 py-14">
      <SectionTitle
        kicker="YOUR RESULT"
        title="評価は、こんなふうに届きます"
        sub="下はすべて説明用のサンプルです。実際の評価は、あなたが面接で話した内容から作られます。"
      />
      <div className="mt-8 grid gap-3 md:grid-cols-2">
        <div
          className="rounded-2xl p-5"
          style={{ background: "#141414", border: "1px solid #232323" }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[14px]" style={{ fontWeight: 800 }}>
              7つの力（5段階）
            </p>
            <span
              className="rounded-full px-2 py-0.5 text-[10.5px]"
              style={{ background: "#232323", color: "#999" }}
            >
              サンプル
            </span>
          </div>
          <div className="mt-4 space-y-2.5">
            {comps.map(([label, v]) => (
              <div key={label}>
                <div className="flex justify-between text-[13px]">
                  <span>{label}</span>
                  <span style={{ color: v == null ? "#777" : ACCENT, fontWeight: 800 }}>
                    {v == null ? "根拠なし" : `${v} / 5`}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full" style={{ background: "#232323" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${((v ?? 0) / 5) * 100}%`, background: ACCENT }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12px] leading-relaxed" style={{ color: "#888" }}>
            根拠になる発言がない力は評価しません。「なんとなく」の点数はつけない仕組みです。
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div
            className="rounded-2xl p-5"
            style={{ background: "#141414", border: "1px solid #232323" }}
          >
            <p className="text-[12px]" style={{ color: ACCENT, fontWeight: 700 }}>
              粘り強さ 5 / 5 ・ 根拠になった発言
            </p>
            <p className="mt-2 text-[15px] leading-relaxed">
              「目標に届かなかった月も、毎日10件の訪問だけは続けました」
            </p>
          </div>
          <div
            className="rounded-2xl p-5"
            style={{ background: "#141414", border: "1px solid #232323" }}
          >
            <p className="text-[12px]" style={{ color: "#FFB84D", fontWeight: 700 }}>
              伸びしろ
            </p>
            <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "#CCCCCC" }}>
              理由が「なんとなく」で終わっています。結論 → 理由 →
              具体例の順で話すと伝わりやすくなります。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["答え始めるまで", "1.8秒"],
              ["目線", "82%"],
              ["上位", "12%"],
            ].map(([k, v]) => (
              <div
                key={k}
                className="rounded-2xl p-3 text-center"
                style={{ background: "#141414", border: "1px solid #232323" }}
              >
                <p className="text-[10.5px]" style={{ color: "#888" }}>
                  {k}
                </p>
                <p className="mt-1 text-[18px]" style={{ fontWeight: 900 }}>
                  {v}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ForCompanies() {
  const rows: [string, string, string][] = [
    ["人材の一覧を見る", "無料", "名前は伏せて表示。評価・練習した職種・希望で絞り込めます"],
    [
      "面接の結果を見る",
      `${PRICE_TIERS[PRICE_TIERS.length - 1].coins}〜${PRICE_TIERS[0].coins}コイン／件`,
      "1コイン100円。評価が高い人ほど高め（よく見られている人は最大5割増し）。名前・評価・会話が見られ、そのまま面談を申し込めます",
    ],
    [
      "AI面接（URLを発行）",
      `¥${COMPANY_INTERVIEW_PRICE_JPY.toLocaleString()}／回`,
      "候補者が面接を始めた回だけ。月額なし",
    ],
    ["求人の掲載", "今は無料", "応募があると、応募者の練習の評価を見てメッセージできます"],
    ["書類選考AI", "掲載中は無料", "履歴書PDFをAIがまとめて判定します"],
  ];
  return (
    <section className="mx-auto max-w-[1080px] px-4 pb-14">
      <div
        className="rounded-3xl p-7 md:p-10"
        style={{
          background: "linear-gradient(135deg, #18200A 0%, #121212 60%)",
          border: "1px solid #2A3512",
        }}
      >
        <p className="text-[12px] tracking-widest" style={{ color: ACCENT, fontWeight: 700 }}>
          FOR COMPANIES
        </p>
        <h2 className="mt-2 text-[24px] md:text-[28px]" style={{ fontWeight: 900 }}>
          書類ではわからない「話す力」を、本人の発言で確かめてから会える
        </h2>
        <p className="mt-3 max-w-[640px] text-[14px] leading-relaxed" style={{ color: "#BBBBBB" }}>
          ガチキャリAIは求人メディアです。運営が人材を推薦・仲介することはありません。企業ご自身が評価を見て、会いたい人に面談を申し込みます。月額料金・成功報酬はありません。
        </p>
        <div className="mt-6 overflow-hidden rounded-2xl" style={{ border: "1px solid #2A2A2A" }}>
          {rows.map(([k, price, note], i) => (
            <div
              key={k}
              className="grid gap-1 px-4 py-3.5 md:grid-cols-[200px_180px_1fr] md:items-center md:gap-4"
              style={{ background: i % 2 ? "#121212" : "#161616" }}
            >
              <span className="text-[14px]" style={{ fontWeight: 700 }}>
                {k}
              </span>
              <span className="text-[15px]" style={{ color: ACCENT, fontWeight: 900 }}>
                {price}
              </span>
              <span className="text-[12.5px]" style={{ color: "#AAAAAA" }}>
                {note}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11.5px]" style={{ color: "#777" }}>
          表示は税込です。コインは{COIN_PACKS[0].coins}コイン（¥
          {COIN_PACKS[0].priceJpy.toLocaleString()}）からまとめて購入でき、有効期限は
          {COIN_EXPIRY_MONTHS}か月です。
        </p>
        <Link
          to="/login"
          search={{ mode: "business" }}
          className="mt-6 inline-flex h-12 items-center justify-center rounded-full px-6 text-[14px]"
          style={{ background: "#F0F0F0", color: "#0F0F0F", fontWeight: 800 }}
        >
          無料で企業登録する
        </Link>
      </div>
    </section>
  );
}

function FairSafe() {
  const items: [string, string][] = [
    [
      "年齢・性別などで絞り込めない",
      "企業は年齢や性別で人材を絞り込めません。評価は面接での発言にもとづくものだけです。",
    ],
    [
      "公開は本人の同意制",
      "プロフィールは最初は非公開。公開するかは本人が決め、いつでも非公開に戻せます。",
    ],
    [
      "運営は推薦・仲介をしない",
      "求人メディアとして、運営が人材を企業に推薦したり、取り次いだりはしません。",
    ],
    ["成功報酬はなし", "採用が決まっても、成功報酬はいただきません。"],
  ];
  return (
    <section className="mx-auto max-w-[1080px] px-4 pb-14">
      <SectionTitle kicker="FAIR & SAFE" title="安心・公正への取り組み" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {items.map(([t, d]) => (
          <div
            key={t}
            className="rounded-2xl p-5"
            style={{ background: "#141414", border: "1px solid #232323" }}
          >
            <p className="flex items-center gap-2 text-[15px]" style={{ fontWeight: 800 }}>
              <ShieldCheck size={18} color={ACCENT} />
              {t}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "#AAAAAA" }}>
              {d}
            </p>
          </div>
        ))}
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
      q: "使えば内定がもらえますか？",
      a: "内定や採用をお約束するサービスではありません。練習と評価で面接の準備を進め、評価を公開すれば企業から面談の申し込みが届くことがある、という仕組みです。",
    },
    {
      q: "（企業の方）運営が人材を紹介してくれるのですか？",
      a: "いいえ。ガチキャリAIは求人メディアで、運営が人材を推薦・仲介することはありません。企業ご自身が評価を見て、面談を申し込む相手を決めます。",
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
