/**
 * TikTok の広告動画の画面（決まった台本・25秒くらい）。
 * つかみ → AI面接官の質問 → 採点（数字がくるくる・上位◯%）→ 根拠つきの評価 → 間・声・目線 → 企業からの申し込み（演出）→ 締め
 * 縦 540×960（2倍で撮って 1080×1920）。時間は performance.now()（撮影側が1コマずつ進める）だけを見る。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { InterviewerAvatar } from "@/components/InterviewerAvatar";
import type { AvatarVoice } from "@/lib/avatar-voice";
import { ACCENT, FONT, StudioVoice, currentCaption, ease } from "@/components/studio/TiktokScene";

type AdRole = "hook" | "ask" | "score" | "eval" | "delivery" | "offer" | "cta";

export type AdJobData = {
  format: "ad";
  title: string;
  lines: { speaker: "interviewer" | "candidate" | "narrator"; text: string }[];
  roles: AdRole[];
  audio: string[];
  sampleRate: number;
  interviewerRate: number;
  tempos?: number[];
};

const START = 0;
const GAP = 0.35;
const END = 2.6;
/** 採点の数字がくるくる上がる長さ */
const COUNT = 1.1;
const SCORE = 86;
const BG = "#0B0D10";

export function buildAdTimeline(job: AdJobData) {
  let t = START;
  const lines = job.lines.map((line, i) => {
    const samples = ((job.audio[i]?.length ?? 0) * 0.75) / 2;
    const pitchRate = line.speaker === "interviewer" ? job.interviewerRate : 1;
    const tempo = job.tempos?.[i] ?? 1;
    const rate = pitchRate * tempo;
    const dur = Math.max(0.6, samples / job.sampleRate / rate);
    const role = job.roles[i];
    const item = { ...line, start: t, dur, rate, pitchRate, tempo, role, itemIndex: -1 };
    // 採点の場面は、数字が上がりきるまで次に進まない
    t += role === "score" ? Math.max(dur, COUNT + 0.6) + GAP : dur + GAP;
    return item;
  });
  const endStart = t;
  const score = lines.find((l) => l.role === "score");
  const sfx = score ? [{ at: score.start + 0.15, dur: COUNT, kind: "ok" as const }] : [];
  return { lines, endStart, total: endStart + END, sfx };
}

export function AdScene({ job, onReady }: { job: AdJobData; onReady: () => void }) {
  const timeline = useMemo(() => buildAdTimeline(job), [job]);
  const voice = useMemo(() => new StudioVoice(job, timeline), [job, timeline]);
  const [t, setT] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const loop = () => {
      setT(performance.now() / 1000);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  // いまの場面＝最後に始まったせりふの役割（せりふの間も同じ場面のまま）
  const started = timeline.lines.filter((l) => t >= l.start);
  const current = started[started.length - 1] ?? timeline.lines[0];
  const inEnd = t >= timeline.endStart;
  const role: AdRole = inEnd ? "cta" : current.role;
  const local = t - (inEnd ? timeline.endStart : current.start);
  const caption = currentCaption(timeline.lines, t);
  const ctaLine = timeline.lines.find((l) => l.role === "cta");

  return (
    <div
      style={{
        position: "relative",
        width: 540,
        height: 960,
        overflow: "hidden",
        background: BG,
        fontFamily: FONT,
        color: "#F0F0F0",
      }}
    >
      {/* 背景の光 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(70% 45% at ${50 + Math.sin(t * 0.6) * 12}% 30%, rgba(200,255,0,.13) 0%, rgba(11,13,16,0) 70%)`,
        }}
      />

      {/* 上のロゴ（ずっと出しておく） */}
      <div
        style={{
          position: "absolute",
          top: 26,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 8,
        }}
      >
        <img src="/icons/icon-192.png" alt="" style={{ width: 30, height: 30, borderRadius: 8 }} />
        <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: 0.5 }}>ガチキャリAI</span>
      </div>

      {/* 面接官：1つだけ置いて、質問の場面で大きく・採点の場面で小さく右上に。ほかの場面は隠す
          （場面ごとに作り直すと、顔の読み込みが撮影に間に合わないため） */}
      <AvatarFrame role={role} local={local}>
        <InterviewerAvatar voice={voice as unknown as AvatarVoice} onReady={onReady} />
      </AvatarFrame>

      {role === "hook" && <Hook text={job.lines[0].text} local={local} />}
      {role === "score" && <ScoreCard local={local} />}
      {role === "eval" && <EvalCard local={local} />}
      {role === "delivery" && <DeliveryCards local={local} t={t} />}
      {role === "offer" && <Offer local={local} />}
      {role === "cta" && <Cta local={ctaLine ? t - ctaLine.start : local} />}

      {/* 字幕（つかみ以外） */}
      {caption && role !== "hook" && (
        <div
          style={{
            position: "absolute",
            left: 24,
            right: 64,
            bottom: 210,
            textAlign: "center",
          }}
        >
          <span
            style={{
              display: "inline-block",
              fontSize: 27,
              fontWeight: 900,
              lineHeight: 1.3,
              color: caption.speaker === "interviewer" ? "#FFFFFF" : "#FFE45C",
              WebkitTextStroke: "6px #000",
              paintOrder: "stroke fill",
              transform: `scale(${0.92 + 0.08 * ease(caption.age / 0.12)})`,
            }}
          >
            {caption.text}
          </span>
        </div>
      )}
    </div>
  );
}

function AvatarFrame({
  role,
  local,
  children,
}: {
  role: AdRole;
  local: number;
  children: ReactNode;
}) {
  // 質問：大きく真ん中 → 採点：小さく右上へ
  const k = role === "score" ? ease(local / 0.35) : 0;
  const w = 460 - 330 * k;
  const h = 560 - 400 * k;
  const left = 40 + (340 - 40) * k;
  const top = 90 + (80 - 90) * k;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: w,
        height: h,
        borderRadius: 24 - 8 * k,
        overflow: "hidden",
        border: "2px solid #2A2F36",
        boxShadow: "0 20px 60px rgba(0,0,0,.55)",
        opacity: role === "ask" ? ease(local / 0.25) : role === "score" ? 1 : 0,
        zIndex: 2,
      }}
    >
      {children}
      <span
        style={{
          position: "absolute",
          left: 10,
          top: 10,
          background: "rgba(0,0,0,.6)",
          borderRadius: 8,
          padding: "3px 9px",
          fontSize: 12 - 2 * k,
        }}
      >
        ● AI面接官
      </span>
    </div>
  );
}

function Hook({ text, local }: { text: string; local: number }) {
  const shake = local < 0.35 ? Math.sin(local * 80) * (1 - local / 0.35) * 4 : 0;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        paddingBottom: 80,
      }}
    >
      <span
        style={{
          background: "#FF4D5E",
          color: "#fff",
          fontWeight: 900,
          fontSize: 18,
          borderRadius: 8,
          padding: "5px 14px",
          opacity: ease(local / 0.2),
        }}
      >
        就活・転職の人へ
      </span>
      <p
        style={{
          margin: "0 34px",
          textAlign: "center",
          fontSize: 52,
          fontWeight: 900,
          lineHeight: 1.25,
          color: "#FFE45C",
          WebkitTextStroke: "8px #000",
          paintOrder: "stroke fill",
          transform: `translateX(${shake}px) scale(${1.15 - 0.15 * ease(local / 0.2)}) rotate(-2deg)`,
          whiteSpace: "pre-line",
        }}
      >
        {/* 読点で改行し、長い行はさらに「で」のあとで切る（言葉の途中で折り返さないように） */}
        {text.replace(/、/g, "、\n").replace(/(本番で)/, "$1\n")}
      </p>
    </div>
  );
}

function Panel({
  children,
  local,
  top = 270,
}: {
  children: ReactNode;
  local: number;
  top?: number;
}) {
  const k = ease(local / 0.3);
  return (
    <div
      style={{
        position: "absolute",
        left: 28,
        right: 28,
        top,
        background: "#14181D",
        border: "1px solid #2A313A",
        borderRadius: 24,
        padding: "22px 22px",
        boxShadow: "0 24px 70px rgba(0,0,0,.55)",
        opacity: k,
        transform: `translateY(${(1 - k) * 30}px)`,
      }}
    >
      {children}
    </div>
  );
}

function ScoreCard({ local }: { local: number }) {
  const k = ease((local - 0.15) / COUNT);
  const score = Math.round(SCORE * k);
  const done = local > 0.15 + COUNT;
  const pop = ease((local - 0.15 - COUNT) / 0.25);
  const r = 70;
  const c = 2 * Math.PI * r;
  return (
    <Panel local={local} top={260}>
      <p style={{ fontSize: 15, color: "#8FA0B3", fontWeight: 700 }}>AI面接官の採点</p>
      <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 10 }}>
        <svg width={170} height={170} viewBox="0 0 170 170">
          <circle cx={85} cy={85} r={r} stroke="#232A33" strokeWidth={14} fill="none" />
          <circle
            cx={85}
            cy={85}
            r={r}
            stroke={ACCENT}
            strokeWidth={14}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(c * score) / 100} ${c}`}
            transform="rotate(-90 85 85)"
          />
          <text x={85} y={98} textAnchor="middle" fontSize={50} fontWeight={900} fill="#F0F0F0">
            {score}
          </text>
          <text x={85} y={124} textAnchor="middle" fontSize={14} fill="#8FA0B3">
            / 100点
          </text>
        </svg>
        <div style={{ flex: 1 }}>
          <div
            style={{
              opacity: done ? pop : 0,
              transform: `scale(${0.7 + 0.3 * pop})`,
              transformOrigin: "left center",
              background: ACCENT,
              color: "#0F0F0F",
              borderRadius: 16,
              padding: "12px 14px",
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 700 }}>練習した人の中で</p>
            <p style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.1 }}>上位12%</p>
          </div>
          <p style={{ fontSize: 12, color: "#66717E", marginTop: 10 }}>※画面はイメージです</p>
        </div>
      </div>
    </Panel>
  );
}

function EvalCard({ local }: { local: number }) {
  const items: [string, number][] = [
    ["論理的に考える力", 4.5],
    ["主体性", 4.0],
    ["伝える力", 4.5],
    ["粘り強さ", 3.5],
  ];
  return (
    <Panel local={local} top={170}>
      <p style={{ fontSize: 15, color: "#8FA0B3", fontWeight: 700 }}>7つの力（5段階）</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        {items.map(([label, v], i) => {
          const k = ease((local - 0.25 - i * 0.12) / 0.5);
          return (
            <div key={label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16 }}>
                <span style={{ fontWeight: 700 }}>{label}</span>
                <span style={{ color: ACCENT, fontWeight: 900 }}>{(v * k).toFixed(1)}</span>
              </div>
              <div style={{ height: 10, background: "#232A33", borderRadius: 6, marginTop: 5 }}>
                <div
                  style={{
                    width: `${(v / 5) * 100 * k}%`,
                    height: "100%",
                    background: ACCENT,
                    borderRadius: 6,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 18,
          background: "#0F1317",
          border: "1px solid #2A313A",
          borderRadius: 14,
          padding: "12px 14px",
          opacity: ease((local - 0.9) / 0.3),
        }}
      >
        <p style={{ fontSize: 12, color: ACCENT, fontWeight: 700 }}>根拠：あなたの発言</p>
        <p style={{ fontSize: 16, marginTop: 4, lineHeight: 1.55 }}>
          「問い合わせが多い原因を調べて、よくある質問のページを作りました」
        </p>
      </div>
    </Panel>
  );
}

function DeliveryCards({ local, t }: { local: number; t: number }) {
  const tile = (i: number, label: string, body: ReactNode) => {
    const k = ease((local - i * 0.18) / 0.3);
    return (
      <div
        style={{
          background: "#14181D",
          border: "1px solid #2A313A",
          borderRadius: 20,
          padding: "16px 18px",
          opacity: k,
          transform: `translateX(${(1 - k) * 60}px)`,
        }}
      >
        <p style={{ fontSize: 14, color: "#8FA0B3", fontWeight: 700 }}>{label}</p>
        {body}
      </div>
    );
  };
  return (
    <div
      style={{
        position: "absolute",
        left: 28,
        right: 28,
        top: 150,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {tile(
        0,
        "答え始めるまでの間",
        <p style={{ fontSize: 34, fontWeight: 900, marginTop: 2 }}>
          1.8<span style={{ fontSize: 16, marginLeft: 4 }}>秒</span>
          <span style={{ fontSize: 14, color: ACCENT, marginLeft: 10 }}>ちょうど良い</span>
        </p>,
      )}
      {tile(
        1,
        "声の波（抑揚）",
        <svg viewBox="0 0 300 50" style={{ width: "100%", height: 50, marginTop: 6 }}>
          {Array.from({ length: 50 }, (_, i) => {
            const v =
              0.35 + 0.65 * Math.abs(Math.sin(i * 0.55 + t * 5) * Math.cos(i * 0.21 + t * 2));
            const h = 6 + v * 40;
            return (
              <rect key={i} x={i * 6} y={25 - h / 2} width={4} height={h} rx={2} fill="#5CC8FF" />
            );
          })}
        </svg>,
      )}
      {tile(
        2,
        "目線（画面を見て話せた割合）",
        <p style={{ fontSize: 34, fontWeight: 900, marginTop: 2 }}>
          {Math.round(82 * ease((local - 0.4) / 0.6))}
          <span style={{ fontSize: 16, marginLeft: 4 }}>%</span>
        </p>,
      )}
    </div>
  );
}

function Offer({ local }: { local: number }) {
  const slide = ease((local - 0.2) / 0.35);
  return (
    <div style={{ position: "absolute", left: 24, right: 24, top: 190 }}>
      <p
        style={{
          fontSize: 26,
          fontWeight: 900,
          textAlign: "center",
          opacity: ease(local / 0.25),
        }}
      >
        結果を公開しておくと…
      </p>
      <div
        style={{
          marginTop: 20,
          transform: `translateY(${(1 - slide) * -60}px)`,
          opacity: slide,
          background: "#1E242C",
          border: "1px solid #364150",
          borderRadius: 22,
          padding: "16px 18px",
          boxShadow: "0 14px 50px rgba(0,0,0,.55)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src="/icons/icon-192.png"
            alt=""
            style={{ width: 34, height: 34, borderRadius: 9 }}
          />
          <span style={{ fontSize: 14, color: "#AAB4C0", flex: 1 }}>ガチキャリAI ・ たった今</span>
        </div>
        <p style={{ fontSize: 23, fontWeight: 900, marginTop: 10, lineHeight: 1.45 }}>
          IT企業から
          <br />
          面談の申し込みが届きました
        </p>
        <p style={{ marginTop: 8, fontSize: 16, color: "#DDE3EA", lineHeight: 1.6 }}>
          「課題を自分で見つけて動ける点に惹かれました。ぜひ一度お話ししませんか？」
        </p>
      </div>
      <p style={{ marginTop: 12, fontSize: 12, color: "#66717E", textAlign: "center" }}>
        ※演出です。申し込みが届くことを約束するものではありません
      </p>
    </div>
  );
}

function Cta({ local }: { local: number }) {
  const k = ease(local / 0.35);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        paddingBottom: 120,
        opacity: k,
      }}
    >
      <img
        src="/brand/logo.webp"
        alt="ガチキャリAI"
        style={{ width: 230, height: 230, borderRadius: 26, transform: `scale(${0.9 + 0.1 * k})` }}
      />
      <p style={{ fontSize: 24, fontWeight: 900, textAlign: "center", lineHeight: 1.5 }}>
        AIの面接官と、
        <br />
        本番さながらに練習
      </p>
      <p
        style={{
          background: ACCENT,
          color: "#0F0F0F",
          fontWeight: 900,
          fontSize: 24,
          borderRadius: 999,
          padding: "12px 30px",
          transform: `scale(${1 + 0.04 * Math.sin(local * 6)})`,
        }}
      >
        無料ではじめる
      </p>
      <p style={{ fontSize: 16, color: "#AAB4C0" }}>プロフィールのリンクから</p>
    </div>
  );
}
