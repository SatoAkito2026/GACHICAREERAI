/**
 * はじめてホームを開いた人に見せる「使い方」のスライド（4〜5枚）。
 * 見終わったら（またはスキップしたら）その端末では出さない。ホームの「使い方を見る」からいつでも見直せる
 */
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, Building2, FileText, Mic, Rocket, ShieldCheck, X } from "lucide-react";

type Variant = "individual" | "student";

type Slide = { icon: ReactNode; title: string; body: string; image?: string };

const SLIDES: Record<Variant, Slide[]> = {
  individual: [
    {
      icon: <Mic size={30} />,
      image: "/avatar/base.webp",
      title: "AIの面接官と、本番さながらに練習",
      body: "マイクで話すだけ。面接官が質問を深掘りしてくれます。職種や時間も選べます。",
    },
    {
      icon: <BarChart3 size={30} />,
      title: "あなたの発言を根拠に評価",
      body: "7つの力を5段階で評価。答えの長さや「えー」の回数、よりよい答え方の例も分かります。",
    },
    {
      icon: <Building2 size={30} />,
      title: "評価が上がるほど、企業の目に留まる",
      body: "結果を公開すると、企業から面談の申し込みが届くことがあります。企業は評価で絞り込んで探すので、練習するほど見つけてもらいやすくなります。",
    },
    {
      icon: <ShieldCheck size={30} />,
      title: "名前は伏せて公開。見せる結果も自分で選べる",
      body: "公開・非公開はいつでも切り替えられます。名前が見えるのは、企業があなたの結果を見る手続きをしたときだけです。",
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
      body: "マイクで話すだけ。志望校に合わせて、面接官が質問を深掘りしてくれます。",
    },
    {
      icon: <BarChart3 size={30} />,
      title: "あなたの発言を根拠に評価",
      body: "良かった点・直すとよい点・よりよい答え方の例が、練習のたびに分かります。",
    },
    {
      icon: <FileText size={30} />,
      title: "志望理由書や想定質問もAIで",
      body: "書類生成AIで志望理由書を作ったり添削したり。自己分析レポートで強みも分かります。",
    },
    {
      icon: <Rocket size={30} />,
      title: "まずは1回、練習してみよう",
      body: "10分ほどで終わります。終わるとすぐに評価が見られます。",
    },
  ],
};

const storageKey = (variant: Variant) => `gc_tour_done_${variant}_v1`;

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
            className="mt-2.5 min-h-[72px] text-[14px] leading-relaxed"
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
