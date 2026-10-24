/**
 * 広告動画の画面（決まった台本・20秒くらい）。TikTok／リール用の縦 9:16 と、Instagram のフィード・広告用の 4:5 がある。
 * 面接官の顔と点数の動き＋つかみの一言（1コマ目から）→ 面接官の質問 → 採点・上位◯% → 根拠になった発言
 * → 間・声・目線 → 企業からの申し込み（演出）→ 締め（短く）
 * 大事なものは「安全な範囲」（9:16 は上の進行バー・下のキャプション・右のボタンを避ける）の中だけに置く。
 * 幅 540（2倍で撮って 1080）。時間は performance.now()（撮影側が1コマずつ進める）だけを見る。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { InterviewerAvatar } from "@/components/InterviewerAvatar";
import type { AvatarVoice } from "@/lib/avatar-voice";
import { ACCENT, FONT, StudioVoice, currentCaption, ease } from "@/components/studio/TiktokScene";

type AdRole = "hook" | "ask" | "score" | "eval" | "delivery" | "offer" | "cta";

export type AdJobData = {
  format: "ad";
  /** 画面の縦横（なければ 9:16） */
  aspect?: "9x16" | "4x5";
  title: string;
  lines: { speaker: "interviewer" | "candidate" | "narrator"; text: string }[];
  roles: AdRole[];
  audio: string[];
  sampleRate: number;
  interviewerRate: number;
  tempos?: number[];
};

const W = 540;
const START = 0;
const GAP = 0.3;
/** 締めの画面は、ナレーションのあと少しだけ */
const END = 0.7;
/** 1コマ目の点数がくるくる上がる長さ */
const COUNT = 1.1;
const SCORE = 86;
const BG = "#0B0D10";

/** 撮影する画面の高さ（幅は 540） */
export function adHeight(job: Pick<AdJobData, "aspect">) {
  return job.aspect === "4x5" ? 675 : 960;
}

/** 大事なものを置いてよい範囲 */
function stageOf(job: Pick<AdJobData, "aspect">) {
  return job.aspect === "4x5"
    ? { top: 26, bottom: 26, left: 24, right: 24 }
    : // 9:16：上は進行バーとアカウント名、下はキャプション、右はいいね等のボタン
      { top: 130, bottom: 200, left: 26, right: 74 };
}

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
    // 1コマ目は点数が上がりきるまで次に進まない
    t += role === "hook" ? Math.max(dur, COUNT + 0.25) + GAP : dur + GAP;
    return item;
  });
  const endStart = t;
  // 効果音：1コマ目の点数のカチカチ → ピロン
  const sfx = [{ at: 0.15, dur: COUNT, kind: "ok" as const }];
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

  const H = adHeight(job);
  const stage = stageOf(job);
  const stageW = W - stage.left - stage.right;
  const stageH = H - stage.top - stage.bottom;

  // いまの場面＝最後に始まったせりふの役割（せりふの間も同じ場面のまま）
  const started = timeline.lines.filter((l) => t >= l.start);
  const current = started[started.length - 1] ?? timeline.lines[0];
  const role: AdRole = current.role;
  const local = t - current.start;
  const caption = currentCaption(timeline.lines, t);
  const showFace = role === "hook" || role === "ask";

  return (
    <div
      style={{
        position: "relative",
        width: W,
        height: H,
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
          background: `radial-gradient(70% 45% at ${50 + Math.sin(t * 0.6) * 12}% 45%, rgba(200,255,0,.12) 0%, rgba(11,13,16,0) 70%)`,
        }}
      />

      {/* 大事なものは全部この中に置く */}
      <div
        style={{
          position: "absolute",
          left: stage.left,
          top: stage.top,
          width: stageW,
          height: stageH,
        }}
      >
        {/* 面接官：1つだけ置いて、つかみと質問の場面で見せる（作り直すと顔の読み込みが撮影に間に合わない） */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: stageW,
            height: stageH - (job.aspect === "4x5" ? 0 : 20),
            borderRadius: 26,
            overflow: "hidden",
            border: "2px solid #2A2F36",
            opacity: showFace ? 1 : 0,
          }}
        >
          <InterviewerAvatar voice={voice as unknown as AvatarVoice} onReady={onReady} />
          {/* 下を暗くして、文字を読みやすく */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,.55) 75%, rgba(0,0,0,.8) 100%)",
            }}
          />
          <span
            style={{
              position: "absolute",
              left: 12,
              top: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(0,0,0,.6)",
              borderRadius: 10,
              padding: "4px 10px",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            <img
              src="/icons/icon-192.png"
              alt=""
              style={{ width: 18, height: 18, borderRadius: 5 }}
            />
            ガチキャリAI ・ AI面接官
          </span>
          {role === "hook" && <ScoreChip local={local} />}
        </div>

        {role === "hook" && <Hook text={job.lines[0].text} local={local} />}
        {role === "score" && (
          <Center>
            <ScoreCard local={local} />
          </Center>
        )}
        {role === "eval" && (
          <Center>
            <Evidence local={local} />
          </Center>
        )}
        {role === "delivery" && (
          <Center>
            <DeliveryCards local={local} t={t} />
          </Center>
        )}
        {role === "offer" && (
          <Center>
            <Offer local={local} />
          </Center>
        )}
        {role === "cta" && <Cta local={local} />}

        {/* 字幕（つかみと締め以外）。範囲の下のほうに */}
        {caption && role !== "hook" && role !== "cta" && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 6, textAlign: "center" }}>
            <span
              style={{
                display: "inline-block",
                fontSize: 30,
                fontWeight: 900,
                lineHeight: 1.3,
                color: caption.speaker === "interviewer" ? "#FFFFFF" : "#FFE45C",
                WebkitTextStroke: "7px #000",
                paintOrder: "stroke fill",
                transform: `scale(${0.92 + 0.08 * ease(caption.age / 0.12)})`,
              }}
            >
              {caption.text}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** 字幕の分を下にあけて、真ん中に置く */
function Center({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%" }}>{children}</div>
    </div>
  );
}

function Card({ children, local, pad = 22 }: { children: ReactNode; local: number; pad?: number }) {
  const k = ease(local / 0.3);
  return (
    <div
      style={{
        background: "#14181D",
        border: "1px solid #2A313A",
        borderRadius: 26,
        padding: pad,
        boxShadow: "0 24px 70px rgba(0,0,0,.55)",
        opacity: k,
        transform: `translateY(${(1 - k) * 30}px) scale(${0.96 + 0.04 * k})`,
      }}
    >
      {children}
    </div>
  );
}

/** 1コマ目：顔の上で点数が 0→86 に上がる */
function ScoreChip({ local }: { local: number }) {
  const k = ease((local - 0.15) / COUNT);
  const done = local > 0.15 + COUNT;
  const pop = done ? 1 + 0.15 * (1 - ease((local - 0.15 - COUNT) / 0.25)) : 1;
  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        top: 12,
        background: "rgba(15,18,22,.92)",
        border: `2px solid ${done ? ACCENT : "#2A313A"}`,
        borderRadius: 18,
        padding: "8px 14px",
        textAlign: "center",
        transform: `scale(${pop})`,
      }}
    >
      <p style={{ fontSize: 13, color: "#AAB4C0", fontWeight: 700 }}>AI採点</p>
      <p style={{ fontSize: 46, fontWeight: 900, lineHeight: 1, color: done ? ACCENT : "#F0F0F0" }}>
        {Math.round(SCORE * k)}
        <span style={{ fontSize: 18 }}>点</span>
      </p>
    </div>
  );
}

function Hook({ text, local }: { text: string; local: number }) {
  const shake = local < 0.3 ? Math.sin(local * 80) * (1 - local / 0.3) * 4 : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 34,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
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
        }}
      >
        就活・転職の人へ
      </span>
      <p
        style={{
          margin: "0 10px",
          textAlign: "center",
          fontSize: 50,
          fontWeight: 900,
          lineHeight: 1.22,
          color: "#FFE45C",
          WebkitTextStroke: "8px #000",
          paintOrder: "stroke fill",
          transform: `translateX(${shake}px) scale(${1.12 - 0.12 * ease(local / 0.18)}) rotate(-2deg)`,
          whiteSpace: "pre-line",
        }}
      >
        {/* 読点で改行し、長い行は「で」のあとで切る（言葉の途中で折り返さないように） */}
        {text.replace(/、/g, "、\n").replace(/(本番で)/, "$1\n")}
      </p>
    </div>
  );
}

function ScoreCard({ local }: { local: number }) {
  const r = 78;
  const c = 2 * Math.PI * r;
  const fill = ease(local / 0.6);
  const pop = ease((local - 0.35) / 0.3);
  return (
    <Card local={local}>
      <p style={{ fontSize: 20, color: "#8FA0B3", fontWeight: 800, textAlign: "center" }}>
        AI面接官の採点
      </p>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
        <svg width={190} height={190} viewBox="0 0 190 190">
          <circle cx={95} cy={95} r={r} stroke="#232A33" strokeWidth={16} fill="none" />
          <circle
            cx={95}
            cy={95}
            r={r}
            stroke={ACCENT}
            strokeWidth={16}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(c * SCORE * fill) / 100} ${c}`}
            transform="rotate(-90 95 95)"
          />
          <text x={95} y={110} textAnchor="middle" fontSize={58} fontWeight={900} fill="#F0F0F0">
            {SCORE}
          </text>
          <text x={95} y={138} textAnchor="middle" fontSize={16} fill="#8FA0B3">
            / 100点
          </text>
        </svg>
      </div>
      <div
        style={{
          marginTop: 10,
          background: ACCENT,
          color: "#0F0F0F",
          borderRadius: 18,
          padding: "12px 16px",
          textAlign: "center",
          opacity: pop,
          transform: `scale(${0.8 + 0.2 * pop})`,
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 800 }}>練習した人の中で </span>
        <span style={{ fontSize: 34, fontWeight: 900 }}>上位12%</span>
      </div>
      <p style={{ fontSize: 13, color: "#66717E", marginTop: 10, textAlign: "center" }}>
        ※画面はイメージです
      </p>
    </Card>
  );
}

/** 根拠になった発言（1画面に1つだけ、大きく） */
function Evidence({ local }: { local: number }) {
  const bar = ease((local - 0.3) / 0.5);
  return (
    <Card local={local} pad={26}>
      <p style={{ fontSize: 18, color: ACCENT, fontWeight: 800 }}>根拠になった、あなたの発言</p>
      <p style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.45, marginTop: 10 }}>
        「毎日10件の訪問だけは、続けました」
      </p>
      <div style={{ marginTop: 22 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 24,
            fontWeight: 800,
          }}
        >
          <span>粘り強さ</span>
          <span style={{ color: ACCENT }}>{(5 * bar).toFixed(0)} / 5</span>
        </div>
        <div style={{ height: 14, background: "#232A33", borderRadius: 8, marginTop: 8 }}>
          <div
            style={{ width: `${100 * bar}%`, height: "100%", background: ACCENT, borderRadius: 8 }}
          />
        </div>
      </div>
      <p style={{ fontSize: 15, color: "#8FA0B3", marginTop: 16 }}>
        7つの力を、発言を根拠に5段階で評価
      </p>
    </Card>
  );
}

function DeliveryCards({ local, t }: { local: number; t: number }) {
  const tile = (i: number, label: string, body: ReactNode) => {
    const k = ease((local - i * 0.15) / 0.3);
    return (
      <div
        style={{
          background: "#14181D",
          border: "1px solid #2A313A",
          borderRadius: 22,
          padding: "14px 20px",
          opacity: k,
          transform: `translateX(${(1 - k) * 50}px)`,
        }}
      >
        <p style={{ fontSize: 18, color: "#8FA0B3", fontWeight: 800 }}>{label}</p>
        {body}
      </div>
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {tile(
        0,
        "答え始めるまでの間",
        <p style={{ fontSize: 40, fontWeight: 900 }}>
          1.8<span style={{ fontSize: 20, marginLeft: 4 }}>秒</span>
          <span style={{ fontSize: 18, color: ACCENT, marginLeft: 12 }}>ちょうど良い</span>
        </p>,
      )}
      {tile(
        1,
        "声の波（抑揚）",
        <svg viewBox="0 0 300 54" style={{ width: "100%", height: 54, marginTop: 4 }}>
          {Array.from({ length: 50 }, (_, i) => {
            const v =
              0.35 + 0.65 * Math.abs(Math.sin(i * 0.55 + t * 5) * Math.cos(i * 0.21 + t * 2));
            const h = 6 + v * 44;
            return (
              <rect key={i} x={i * 6} y={27 - h / 2} width={4} height={h} rx={2} fill="#5CC8FF" />
            );
          })}
        </svg>,
      )}
      {tile(
        2,
        "目線（画面を見て話せた割合）",
        <p style={{ fontSize: 40, fontWeight: 900 }}>
          {Math.round(82 * ease((local - 0.3) / 0.6))}
          <span style={{ fontSize: 20, marginLeft: 4 }}>%</span>
        </p>,
      )}
    </div>
  );
}

function Offer({ local }: { local: number }) {
  const slide = ease((local - 0.15) / 0.35);
  return (
    <div>
      <p style={{ fontSize: 26, fontWeight: 900, textAlign: "center", opacity: ease(local / 0.2) }}>
        結果を公開しておくと…
      </p>
      <div
        style={{
          marginTop: 18,
          transform: `translateY(${(1 - slide) * -60}px)`,
          opacity: slide,
          background: "#1E242C",
          border: "1px solid #364150",
          borderRadius: 24,
          padding: "18px 20px",
          boxShadow: "0 14px 50px rgba(0,0,0,.55)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src="/icons/icon-192.png"
            alt=""
            style={{ width: 36, height: 36, borderRadius: 9 }}
          />
          <span style={{ fontSize: 15, color: "#AAB4C0", flex: 1 }}>ガチキャリAI ・ たった今</span>
        </div>
        <p style={{ fontSize: 28, fontWeight: 900, marginTop: 12, lineHeight: 1.4 }}>
          IT企業から
          <br />
          面談の申し込みが届きました
        </p>
      </div>
      <p style={{ marginTop: 12, fontSize: 13, color: "#66717E", textAlign: "center" }}>
        ※演出です。申し込みが届くことを約束するものではありません
      </p>
    </div>
  );
}

function Cta({ local }: { local: number }) {
  const k = ease(local / 0.25);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        opacity: k,
      }}
    >
      <img
        src="/brand/logo.webp"
        alt="ガチキャリAI"
        style={{ width: 170, height: 170, borderRadius: 24, transform: `scale(${0.9 + 0.1 * k})` }}
      />
      <p style={{ fontSize: 28, fontWeight: 900, textAlign: "center", lineHeight: 1.4 }}>
        AIの面接官と、
        <br />
        本番さながらに練習
      </p>
      <p
        style={{
          background: ACCENT,
          color: "#0F0F0F",
          fontWeight: 900,
          fontSize: 28,
          borderRadius: 999,
          padding: "14px 34px",
          transform: `scale(${1 + 0.05 * Math.sin(local * 7)})`,
        }}
      >
        無料ではじめる
      </p>
      <p style={{ fontSize: 17, color: "#AAB4C0" }}>プロフィールのリンクから</p>
    </div>
  );
}
