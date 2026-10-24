/**
 * トップページで使う「アプリの画面のイメージ」（スマホの枠の中に、実際の画面に近い見た目を作る）。
 * 数字や文章はすべて説明用のサンプル。
 */
import type { ReactNode } from "react";

const ACCENT = "#C8FF00";

export function PhoneFrame({
  children,
  className = "",
  tilt = 0,
}: {
  children: ReactNode;
  className?: string;
  tilt?: number;
}) {
  return (
    <div
      className={`relative mx-auto w-[260px] shrink-0 ${className}`}
      style={{ transform: tilt ? `rotate(${tilt}deg)` : undefined }}
    >
      <div
        className="overflow-hidden rounded-[38px] p-[9px]"
        style={{
          background: "linear-gradient(160deg, #2C2C2E, #121212)",
          boxShadow: "0 30px 70px rgba(0,0,0,.6), inset 0 0 0 1px #3A3A3C",
        }}
      >
        <div
          className="relative flex h-[520px] flex-col overflow-hidden rounded-[30px]"
          style={{ background: "#0F0F0F" }}
        >
          {/* 上の切り欠き */}
          <div
            className="absolute left-1/2 top-2 z-10 h-[22px] w-[86px] -translate-x-1/2 rounded-full"
            style={{ background: "#000" }}
          />
          <div
            className="flex h-9 shrink-0 items-end justify-between px-6 pb-1 text-[10px]"
            style={{ color: "#DDD" }}
          >
            <span style={{ fontWeight: 700 }}>9:41</span>
            <span>●●● ▮</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Bar({ title }: { title: string }) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2"
      style={{ borderBottom: "1px solid #1E1E1E" }}
    >
      <img src="/icons/icon-192.png" alt="" className="h-5 w-5 rounded-md" />
      <span className="text-[12px]" style={{ color: "#F0F0F0", fontWeight: 800 }}>
        {title}
      </span>
    </div>
  );
}

/** 面接中の画面：面接官（小さめ）・質問・回答中の波形 */
export function InterviewScreen() {
  return (
    <>
      <Bar title="模擬面接" />
      <div className="relative mx-3 mt-3 overflow-hidden rounded-2xl" style={{ height: 210 }}>
        <img
          src="/avatar/base.webp"
          alt="AIの面接官"
          className="h-full w-full object-cover"
          style={{ objectPosition: "50% 22%" }}
        />
        <span
          className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[9px]"
          style={{ background: "rgba(0,0,0,.6)", color: "#fff" }}
        >
          ● AI面接官
        </span>
        <span
          className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px]"
          style={{ background: "rgba(0,0,0,.6)", color: ACCENT }}
        >
          08:12
        </span>
      </div>
      <div className="mx-3 mt-3 rounded-2xl p-3" style={{ background: "#1A1A1A" }}>
        <p className="text-[9.5px]" style={{ color: "#888" }}>
          面接官
        </p>
        <p
          className="mt-0.5 text-[12.5px] leading-snug"
          style={{ color: "#F0F0F0", fontWeight: 700 }}
        >
          そのとき、あなたはどう工夫しましたか？
        </p>
      </div>
      <div
        className="mx-3 mt-2 rounded-2xl p-3"
        style={{ background: "#16200A", border: "1px solid #3A4A12" }}
      >
        <p className="text-[9.5px]" style={{ color: ACCENT }}>
          🎤 回答中…
        </p>
        <svg viewBox="0 0 200 26" className="mt-1 h-6 w-full">
          {Array.from({ length: 40 }, (_, i) => {
            const h = 4 + Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) * 20;
            return (
              <rect key={i} x={i * 5} y={13 - h / 2} width={3} height={h} rx={1.5} fill={ACCENT} />
            );
          })}
        </svg>
      </div>
      <div className="mt-auto p-3">
        <div
          className="rounded-xl py-2.5 text-center text-[12px]"
          style={{ background: "#FF4444", color: "#fff", fontWeight: 800 }}
        >
          ■ 回答を終える
        </div>
      </div>
    </>
  );
}

/** 評価の画面：点数・上位%・7つの力 */
export function ResultScreen() {
  const comps: [string, number | null][] = [
    ["伝える力", 4],
    ["論理的に考える力", 3],
    ["主体性", 4],
    ["協調性", 3],
    ["粘り強さ", 5],
    ["誠実さ", 4],
    ["学ぶ姿勢", null],
  ];
  return (
    <>
      <Bar title="練習の結果" />
      <div
        className="mx-3 mt-3 flex items-center gap-3 rounded-2xl p-3"
        style={{
          background: "linear-gradient(135deg,#1F2A08,#141414)",
          border: "1px solid #3A4A12",
        }}
      >
        <div
          className="flex h-14 w-14 flex-col items-center justify-center rounded-xl"
          style={{ background: ACCENT, color: "#0F0F0F" }}
        >
          <span className="text-[8px]" style={{ fontWeight: 700 }}>
            上位
          </span>
          <span className="text-[17px] leading-none" style={{ fontWeight: 900 }}>
            12%
          </span>
        </div>
        <div>
          <p className="text-[9.5px]" style={{ color: "#888" }}>
            AI採点
          </p>
          <p className="text-[26px] leading-none" style={{ color: "#F0F0F0", fontWeight: 900 }}>
            86<span className="text-[11px]">点</span>
          </p>
        </div>
      </div>
      <div className="mx-3 mt-3 rounded-2xl p-3" style={{ background: "#161616" }}>
        <p className="text-[10px]" style={{ color: "#AAA", fontWeight: 700 }}>
          7つの力（5段階）
        </p>
        <div className="mt-2 space-y-1.5">
          {comps.map(([l, v]) => (
            <div key={l}>
              <div className="flex justify-between text-[9.5px]" style={{ color: "#DDD" }}>
                <span>{l}</span>
                <span style={{ color: v == null ? "#666" : ACCENT, fontWeight: 800 }}>
                  {v == null ? "根拠なし" : v}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full" style={{ background: "#262626" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${((v ?? 0) / 5) * 100}%`, background: ACCENT }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-3 mt-2 rounded-2xl p-3" style={{ background: "#161616" }}>
        <p className="text-[9.5px]" style={{ color: ACCENT, fontWeight: 700 }}>
          根拠になった発言
        </p>
        <p className="mt-1 text-[10.5px] leading-relaxed" style={{ color: "#DDD" }}>
          「目標に届かなかった月も、毎日10件の訪問だけは続けました」
        </p>
      </div>
    </>
  );
}

/** 間・声・目線の画面 */
export function DeliveryScreen() {
  return (
    <>
      <Bar title="間・声・目線" />
      <div className="mx-3 mt-3 grid grid-cols-2 gap-2">
        {[
          ["答え始めるまで", "1.8", "秒"],
          ["長い沈黙", "1", "回"],
          ["声の強弱", "ちょうど良い", ""],
          ["目線", "82", "%"],
        ].map(([k, v, u]) => (
          <div
            key={k}
            className="rounded-xl p-2.5"
            style={{ background: "#161616", border: "1px solid #232323" }}
          >
            <p className="text-[9px]" style={{ color: "#888" }}>
              {k}
            </p>
            <p
              className="mt-0.5 text-[16px] leading-tight"
              style={{ color: "#F0F0F0", fontWeight: 900 }}
            >
              {v}
              <span className="text-[9px]">{u}</span>
            </p>
          </div>
        ))}
      </div>
      <div
        className="mx-3 mt-2 rounded-xl p-3"
        style={{ background: "#161616", border: "1px solid #232323" }}
      >
        <p className="text-[9px]" style={{ color: "#888" }}>
          声の波
        </p>
        <svg viewBox="0 0 220 40" className="mt-1 h-10 w-full">
          {Array.from({ length: 55 }, (_, i) => {
            const h = 3 + Math.abs(Math.sin(i * 0.45) * Math.cos(i * 0.17)) * 34;
            return (
              <rect key={i} x={i * 4} y={20 - h / 2} width={2.5} height={h} rx={1} fill="#5CC8FF" />
            );
          })}
        </svg>
      </div>
      <div
        className="mx-3 mt-2 rounded-xl p-3"
        style={{ background: "#161616", border: "1px solid #232323" }}
      >
        <p className="text-[9.5px]" style={{ color: "#5CC8FF", fontWeight: 700 }}>
          アドバイス
        </p>
        <ul
          className="mt-1 list-disc space-y-1 pl-4 text-[10px] leading-relaxed"
          style={{ color: "#CCC" }}
        >
          <li>答えの長さはちょうど良いです（30〜60秒）。</li>
          <li>大事な言葉だけ少し強く言うと、もっと伝わります。</li>
        </ul>
      </div>
    </>
  );
}

/** 企業からの申し込みの画面 */
export function OfferScreen() {
  return (
    <>
      <Bar title="オファー" />
      <div
        className="mx-3 mt-3 rounded-2xl p-3"
        style={{ background: "#1E242C", border: "1px solid #364150" }}
      >
        <div className="flex items-center gap-2">
          <img src="/icons/icon-192.png" alt="" className="h-6 w-6 rounded-md" />
          <span className="text-[9.5px]" style={{ color: "#AAB4C0" }}>
            ガチキャリAI ・ たった今
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-snug" style={{ color: "#F0F0F0", fontWeight: 900 }}>
          IT企業から面談の申し込みが届きました
        </p>
        <p className="mt-1.5 text-[10.5px] leading-relaxed" style={{ color: "#DDE3EA" }}>
          「課題を自分で見つけて動ける点に惹かれました。ぜひ一度お話ししませんか？」
        </p>
        <div className="mt-3 flex gap-2">
          <span
            className="flex-1 rounded-lg py-2 text-center text-[11px]"
            style={{ background: ACCENT, color: "#0F0F0F", fontWeight: 800 }}
          >
            承諾する
          </span>
          <span
            className="flex-1 rounded-lg py-2 text-center text-[11px]"
            style={{ background: "#2A2F36", color: "#DDD" }}
          >
            あとで
          </span>
        </div>
      </div>
      <div className="mx-3 mt-3 space-y-2">
        {["メーカー（企画職）", "Web制作会社"].map((c) => (
          <div
            key={c}
            className="flex items-center justify-between rounded-xl p-3"
            style={{ background: "#161616" }}
          >
            <span className="text-[11px]" style={{ color: "#DDD" }}>
              {c}
            </span>
            <span className="text-[9.5px]" style={{ color: "#888" }}>
              メッセージ 2件
            </span>
          </div>
        ))}
      </div>
      <p className="mx-3 mt-auto pb-3 text-[9px]" style={{ color: "#666" }}>
        ※会社名・内容は説明用のサンプルです
      </p>
    </>
  );
}
