/**
 * はじめてホームを開いた人に見せる「使い方」のスライド（モードごとに7枚。就職・転職と受験で中身を分ける）。
 * 見終わったら（またはスキップしたら）その端末では出さない。ホームの「使い方を見る」からいつでも見直せる
 */
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  Building2,
  ClipboardList,
  FileText,
  GraduationCap,
  Mic,
  Rocket,
  Search,
  UserRound,
  X,
} from "lucide-react";

type Variant = "individual" | "student";

type Slide = { icon: ReactNode; title: string; body: string; image?: string };

// モードごとに、そのモードの使い方だけを説明する（就職・転職と受験は混ぜない）
const SLIDES: Record<Variant, Slide[]> = {
  individual: [
    {
      icon: <Mic size={30} />,
      image: "/avatar/base.webp",
      title: "AIの面接官と、就職・転職の面接練習",
      body: "AIの面接官が声で質問し、あなたの答えに合わせて深掘りします。本番のつもりで、マイクで話すだけです。",
    },
    {
      icon: <UserRound size={30} />,
      title: "① まずプロフィールを入れる",
      body: "ホームの「経歴・希望条件」に経歴・自己PR・希望の職種を入れておくと、面接官がその内容をもとに質問します。",
    },
    {
      icon: <ClipboardList size={30} />,
      title: "② 練習の設定をして、はじめる",
      body: "「練習」で面接官のスタイル（やさしい・ふつう・厳しめ）と職種を選んで「はじめる」。話し終わったら少し待つと、次の質問に進みます。",
    },
    {
      icon: <BarChart3 size={30} />,
      title: "③ 結果は「評価」で見る",
      body: "7つの力（5段階）と一次面接の目安、次の練習で直すこと、よりよい答え方の例、話し方（答えの長さ・「えー」の回数）が分かります。",
    },
    {
      icon: <Building2 size={30} />,
      title: "④ 結果を公開すると、企業から申し込みが届く",
      body: "「公開」で結果を公開すると、企業から面談の申し込みが届くことがあります。名前は伏せて公開され、企業に見せる結果も自分で選べます。",
    },
    {
      icon: <FileText size={30} />,
      title: "書類づくり・自己分析・求人も",
      body: "履歴書・職務経歴書をAIで作ったり、練習をもとに自己分析をしたり。求人を見て応募することもできます。",
    },
    {
      icon: <Rocket size={30} />,
      title: "まずは1回、練習してみよう",
      body: "10分ほどで終わります。終わるとすぐに評価が見られます。",
    },
  ],
  student: [
    {
      icon: <Mic size={30} />,
      image: "/avatar/base.webp",
      title: "AIの面接官と、入試面接の練習",
      body: "あなたの志望校の面接官になりきって、AIが声で質問します。高校・高専・大学・専門・看護・警察・消防・自衛隊など、どんな学校の面接にも対応しています。",
    },
    {
      icon: <GraduationCap size={30} />,
      title: "① 志望校を登録する（3校まで）",
      body: "ホームの「プロフィール」で志望校に学校名を入れると、全国の学校から候補が出ます。候補から選ぶと、同じ名前の別の学校と間違えずに練習できます。",
    },
    {
      icon: <Search size={30} />,
      title: "② 練習する志望校を選ぶ",
      body: "「練習」で志望校を選ぶと、AIがその学校の特色・求める生徒像・よく聞かれることを調べます（30秒〜1分）。学校の種類によって、聞かれることも変わります。",
    },
    {
      icon: <ClipboardList size={30} />,
      title: "③ 本番のつもりで答える",
      body: "面接官のスタイルを選んで「はじめる」。マイクで答えて、話し終わったら少し待つと次の質問に進みます。",
    },
    {
      icon: <BarChart3 size={30} />,
      title: "④ 結果は「履歴」で見る",
      body: "観点ごとの点数と、その根拠になったあなたの発言。志望校の求める生徒像と比べてどうだったか、次の練習でやること3つ、答えの直し方、前回からの伸びが分かります。",
    },
    {
      icon: <FileText size={30} />,
      title: "志望理由書・自己分析も",
      body: "志望理由書をAIで作ったり添削したり。「マイページ」で学校・塾の招待コードを入れると、先生があなたの練習の結果を見てアドバイスできます。",
    },
    {
      icon: <Rocket size={30} />,
      title: "まずは1回、練習してみよう",
      body: "10分ほどで終わります。何度でも練習して、本番までに伸ばしていきましょう。",
    },
  ],
};

// 中身を新しくしたら番号を上げて、もう一度見てもらう
const storageKey = (variant: Variant) => `gc_tour_done_${variant}_v2`;

/** まだ見ていなければ true（保存できない端末では毎回は出さない） */
export function shouldShowTour(variant: Variant): boolean {
  try {
    return !localStorage.getItem(storageKey(variant));
  } catch {
    return false;
  }
}

export function WelcomeTour({ variant, onClose }: { variant: Variant; onClose: () => void }) {
  const slides = SLIDES[variant];
  const [i, setI] = useState(0);
  const touchX = useRef<number | null>(null);
  const last = i === slides.length - 1;
  const slide = slides[i];

  const close = () => {
    try {
      localStorage.setItem(storageKey(variant), "1");
    } catch {
      // 保存できなくても閉じる
    }
    onClose();
  };
  const go = (d: number) => setI((v) => Math.min(slides.length - 1, Math.max(0, v + d)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      style={{ background: "rgba(0,0,0,.75)" }}
      role="dialog"
      aria-modal="true"
      aria-label="ガチキャリAIの使い方"
    >
      <div
        className="relative w-full max-w-[420px] overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={{ background: "#151515", border: "1px solid #2A2A2A" }}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touchX.current = null;
        }}
      >
        <button
          onClick={close}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: "rgba(0,0,0,.5)", color: "#AAA" }}
          aria-label="閉じる"
        >
          <X size={18} />
        </button>

        {/* 絵 */}
        <div
          className="relative flex h-[210px] items-center justify-center overflow-hidden"
          style={{
            background: "radial-gradient(circle at 50% 40%, #2A3A08 0%, #151515 70%)",
          }}
        >
          {slide.image ? (
            <img
              src={slide.image}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: "50% 20%", opacity: 0.9 }}
            />
          ) : (
            <span
              className="flex h-24 w-24 items-center justify-center rounded-[28px]"
              style={{
                background: "#C8FF00",
                color: "#0F0F0F",
                boxShadow: "0 12px 40px rgba(200,255,0,.25)",
              }}
            >
              {slide.icon}
            </span>
          )}
          <span
            className="absolute left-4 top-4 rounded-full px-2.5 py-1 text-[11px]"
            style={{ background: "rgba(0,0,0,.6)", color: "#C8FF00", fontWeight: 700 }}
          >
            使い方 {i + 1}/{slides.length}
          </span>
        </div>

        <div className="px-6 pb-6 pt-5">
          <h2 className="text-[20px] leading-snug" style={{ color: "#F0F0F0", fontWeight: 800 }}>
            {slide.title}
          </h2>
          <p
            className="mt-2.5 min-h-[96px] text-[14px] leading-relaxed"
            style={{ color: "#BBBBBB" }}
          >
            {slide.body}
          </p>

          <div className="mt-4 flex justify-center gap-1.5">
            {slides.map((_, k) => (
              <button
                key={k}
                onClick={() => setI(k)}
                aria-label={`${k + 1}枚目`}
                className="h-2 rounded-full transition-all"
                style={{ width: k === i ? 22 : 8, background: k === i ? "#C8FF00" : "#3A3A3A" }}
              />
            ))}
          </div>

          <div className="mt-5 flex gap-2">
            {i > 0 && (
              <button
                onClick={() => go(-1)}
                className="h-12 rounded-full px-5 text-[14px]"
                style={{ background: "#232323", color: "#CCCCCC", fontWeight: 700 }}
              >
                戻る
              </button>
            )}
            {last ? (
              <Link
                to={
                  variant === "student"
                    ? "/private/student/practice"
                    : "/private/individual/practice"
                }
                onClick={close}
                className="flex h-12 flex-1 items-center justify-center rounded-full text-[15px]"
                style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 800 }}
              >
                模擬面接をはじめる
              </Link>
            ) : (
              <button
                onClick={() => go(1)}
                className="h-12 flex-1 rounded-full text-[15px]"
                style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 800 }}
              >
                次へ
              </button>
            )}
          </div>
          {last ? (
            <button
              onClick={close}
              className="mt-3 w-full text-center text-[12.5px]"
              style={{ color: "#888" }}
            >
              あとで練習する
            </button>
          ) : (
            <button
              onClick={close}
              className="mt-3 w-full text-center text-[12.5px]"
              style={{ color: "#666" }}
            >
              スキップ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** ホームに置く：はじめてなら自動で開き、「使い方を見る」でいつでも開ける */
export function useWelcomeTour(variant: Variant) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (shouldShowTour(variant)) setOpen(true);
  }, [variant]);
  return {
    open: () => setOpen(true),
    node: open ? <WelcomeTour variant={variant} onClose={() => setOpen(false)} /> : null,
  };
}
