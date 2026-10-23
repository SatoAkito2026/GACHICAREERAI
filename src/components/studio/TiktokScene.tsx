/**
 * TikTok 用の「ガチキャリAIを使ってみた」動画の画面（縦 540×960、2倍で撮って 1080×1920）。
 * scripts/tiktok/render.mjs が時計を止めたブラウザで開き、1コマずつ時間を進めて撮る。
 * 時間は performance.now()（撮影側が1コマずつ進める）だけを見るので、音声とずれない。
 *
 * 流れ：タイトル → 面接（面接官はアプリと同じアバター、受験者は吹き出し）→ 採点 → 締め
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { InterviewerAvatar } from "@/components/InterviewerAvatar";
import { analyzeSpeech, type MouthTrack, type VisemeShapes } from "@/lib/lipsync";
import type { AvatarVoice, MouthPose } from "@/lib/avatar-voice";

export type StudioJobData = {
  title: string;
  themeLabel: string;
  jobType: string;
  lines: { speaker: "interviewer" | "candidate"; text: string }[];
  result: { score: number; competencies: { label: string; score: number }[]; comment: string };
  offer?: { companyType: string; count: number; message: string; reaction: string };
  /** せりふの音声。最後の1つは、オファーを見た受験者のひとこと（offer があるとき） */
  audio: string[];
  sampleRate: number;
  interviewerRate: number;
};

const INTRO = 1.6;
const GAP = 0.35;
const RESULT = 5.5;
const OUTRO = 3;
export const ACCENT = "#C8FF00";
export const FONT = `"Noto Sans CJK JP", "Noto Sans JP", "Hiragino Sans", sans-serif`;

function decodePcm(b64: string): Float32Array {
  const bin = atob(b64);
  const n = Math.floor(bin.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    out[i] = v / 32768;
  }
  return out;
}

/** せりふごとの開始・長さ（秒）と、全体の長さ */
type TimelineLine = {
  speaker: "interviewer" | "candidate";
  text: string;
  start: number;
  dur: number;
  rate: number;
  /** オファーを見た受験者のひとこと（会話の吹き出しには出さない） */
  reaction: boolean;
};

/** オファーの通知が出てから、受験者が話し始めるまで（秒） */
const OFFER_LEAD = 1.6;

export function buildTimeline(job: StudioJobData) {
  let t = INTRO;
  const lines = job.lines.map((line, i) => {
    const samples = ((job.audio[i]?.length ?? 0) * 0.75) / 2; // base64 → バイト → 16bit
    const rate = line.speaker === "interviewer" ? job.interviewerRate : 1;
    const dur = Math.max(0.8, samples / job.sampleRate / rate);
    const item: TimelineLine = { ...line, start: t, dur, rate, reaction: false };
    t += dur + GAP;
    return item;
  });
  const resultStart = t + 0.2;
  // 採点のあと：企業から面談の申し込みが届き、受験者がひとこと言う
  const offerStart = resultStart + RESULT;
  let outroStart = offerStart;
  if (job.offer && job.audio[job.lines.length]) {
    const samples = (job.audio[job.lines.length].length * 0.75) / 2;
    const dur = Math.max(0.8, samples / job.sampleRate);
    lines.push({
      speaker: "candidate",
      text: job.offer.reaction,
      start: offerStart + OFFER_LEAD,
      dur,
      rate: 1,
      reaction: true,
    });
    outroStart = offerStart + OFFER_LEAD + dur + 1.2;
  }
  return { lines, resultStart, offerStart, outroStart, total: outroStart + OUTRO };
}

type Speaker = "interviewer" | "candidate" | "narrator";
type VoiceJob = {
  lines: { speaker: Speaker }[];
  audio: string[];
  sampleRate: number;
};
type VoiceTimeline = {
  /** rate は再生の速さ（口の動きを音声に合わせるのに使う） */
  lines: { speaker: Speaker; start: number; dur: number; rate: number }[];
};

/** 撮影用の「声」：決まった時刻に面接官のせりふが流れているものとして、口の形を返す */
export class StudioVoice {
  private tracks: (MouthTrack | null)[] = [];
  private samples: (Float32Array | null)[];
  constructor(
    private job: VoiceJob,
    private timeline: VoiceTimeline,
  ) {
    this.samples = job.lines.map((l, i) =>
      l.speaker === "interviewer" && job.audio[i] ? decodePcm(job.audio[i]) : null,
    );
  }
  setVisemeShapes(shapes: VisemeShapes) {
    this.tracks = this.samples.map((s) =>
      s ? analyzeSpeech(s, this.job.sampleRate, shapes) : null,
    );
  }
  private active() {
    const t = performance.now() / 1000;
    const i = this.timeline.lines.findIndex(
      (l) => l.speaker === "interviewer" && t >= l.start && t < l.start + l.dur,
    );
    return i < 0 ? null : { i, elapsed: t - this.timeline.lines[i].start };
  }
  isPlaying() {
    return this.active() !== null;
  }
  getMouth(): MouthPose {
    const a = this.active();
    const track = a ? this.tracks[a.i] : null;
    if (!a || !track) return { open: 0, width: 0 };
    const f = (a.elapsed * this.timeline.lines[a.i].rate) / track.hop;
    const i = Math.floor(f);
    if (i < 0 || i >= track.open.length - 1) return { open: 0, width: 0 };
    const k = f - i;
    return {
      open: track.open[i] * (1 - k) + track.open[i + 1] * k,
      width: track.width[i] * (1 - k) + track.width[i + 1] * k,
    };
  }
}

/** せりふを、字幕1回分（14文字くらい）ずつに区切る。句読点で切り、長ければさらに分ける */
function splitCaption(text: string): string[] {
  const raw = text
    .split(/(?<=[、。！？!?…])/)
    .map((p) => p.trim())
    .filter(Boolean);
  // 「正直、」のような短すぎる区切りは、次とつなげる
  const parts: string[] = [];
  for (const p of raw) {
    const last = parts[parts.length - 1];
    if (last !== undefined && (last.length < 7 || p.length < 4) && last.length + p.length <= 16) {
      parts[parts.length - 1] = last + p;
    } else parts.push(p);
  }
  const out: string[] = [];
  for (const p of parts) {
    if (p.length <= 16) {
      out.push(p);
      continue;
    }
    const n = Math.ceil(p.length / 14);
    const size = Math.ceil(p.length / n);
    for (let i = 0; i < p.length; i += size) out.push(p.slice(i, i + size));
  }
  return out.length ? out : [text];
}

/** いま出す字幕（せりふの長さを文字数で割り振って、話している部分を選ぶ） */
export function currentCaption(
  lines: {
    speaker: Speaker;
    text: string;
    start: number;
    dur: number;
    reaction?: boolean;
  }[],
  t: number,
) {
  const line = lines.find((l) => t >= l.start && t < l.start + l.dur);
  if (!line) return null;
  const chunks = splitCaption(line.text);
  const total = chunks.reduce((a, c) => a + c.length, 0);
  let at = line.start;
  for (const c of chunks) {
    const d = (line.dur * c.length) / total;
    if (t < at + d)
      return { text: c, speaker: line.speaker, age: t - at, reaction: !!line.reaction };
    at += d;
  }
  return null;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const ease = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

export function TiktokScene({ job, onReady }: { job: StudioJobData; onReady: () => void }) {
  const timeline = useMemo(() => buildTimeline(job), [job]);
  const voice = useMemo(() => new StudioVoice(job, timeline), [job, timeline]);
  const [t, setT] = useState(0);
  const raf = useRef(0);

  // 撮影側が進める時計（performance.now）に合わせて描き直す
  useEffect(() => {
    const loop = () => {
      setT(performance.now() / 1000);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const spoken = timeline.lines.filter((l) => t >= l.start && !l.reaction);
  const caption = currentCaption(timeline.lines, t);
  const inResult = t >= timeline.resultStart && t < timeline.offerStart;
  const inOffer = t >= timeline.offerStart && t < timeline.outroStart;
  const inOutro = t >= timeline.outroStart;
  const elapsed = Math.max(0, Math.min(t, timeline.resultStart) - INTRO);

  return (
    <div
      style={{
        position: "relative",
        width: 540,
        height: 960,
        overflow: "hidden",
        background: "#0F0F0F",
        fontFamily: FONT,
        color: "#F0F0F0",
      }}
    >
      {/* アプリの上のバー */}
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 18px",
          borderBottom: "1px solid #262626",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 16 }}>
          ガチキャリAI<span style={{ color: ACCENT }}>｜模擬面接</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span
            style={{ background: "#FF4444", borderRadius: 4, padding: "2px 7px", fontWeight: 700 }}
          >
            ● 面接中
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums", color: "#BBB" }}>
            {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
            {String(Math.floor(elapsed % 60)).padStart(2, "0")}
          </span>
        </span>
      </div>

      {/* 面接官（アプリと同じアバター） */}
      <div
        style={{
          position: "relative",
          height: 470,
          margin: "12px 14px 0",
          borderRadius: 20,
          overflow: "hidden",
        }}
      >
        <InterviewerAvatar voice={voice as unknown as AvatarVoice} onReady={onReady} />
        <span
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            background: "rgba(0,0,0,.6)",
            borderRadius: 8,
            padding: "4px 10px",
            fontSize: 13,
          }}
        >
          AI面接官 ・ {job.jobType}
        </span>
      </div>

      {/* 字幕（TikTok でよく見る、白い太字に黒いふち。せりふを短く区切って、話している部分だけ出す） */}
      {caption && !caption.reaction && (
        <div
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            top: 410,
            textAlign: "center",
          }}
        >
          <span
            style={{
              display: "inline-block",
              fontSize: 30,
              fontWeight: 900,
              lineHeight: 1.35,
              color: caption.speaker === "candidate" ? ACCENT : "#FFFFFF",
              WebkitTextStroke: "6px #000",
              paintOrder: "stroke fill",
              textShadow: "0 3px 10px rgba(0,0,0,.55)",
              transform: `scale(${0.92 + 0.08 * ease(caption.age / 0.12)})`,
            }}
          >
            {caption.text}
          </span>
        </div>
      )}

      {/* 会話の流れ（新しい3つ）。TikTok の右のボタンと下の投稿の文に隠れないよう、右と下をあける */}
      <div
        style={{
          padding: "14px 70px 0 18px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {spoken.slice(-3).map((l, i, arr) => {
          const mine = l.speaker === "candidate";
          const appear = ease((t - l.start) / 0.25);
          return (
            <div
              key={l.start}
              style={{
                display: "flex",
                justifyContent: mine ? "flex-end" : "flex-start",
                opacity: i === arr.length - 1 ? appear : 0.5,
                transform: `translateY(${(1 - appear) * 10}px)`,
              }}
            >
              <div
                style={{
                  maxWidth: "88%",
                  borderRadius: 18,
                  padding: "10px 14px",
                  fontSize: i === arr.length - 1 ? 17 : 14,
                  lineHeight: 1.5,
                  background: mine ? ACCENT : "#222",
                  color: mine ? "#0F0F0F" : "#F0F0F0",
                  fontWeight: i === arr.length - 1 ? 800 : mine ? 600 : 400,
                }}
              >
                {l.text}
              </div>
            </div>
          );
        })}
      </div>

      <p
        style={{
          position: "absolute",
          top: 506,
          right: 26,
          fontSize: 11,
          color: "rgba(255,255,255,.75)",
          background: "rgba(0,0,0,.45)",
          borderRadius: 6,
          padding: "2px 7px",
        }}
      >
        ※ 受験者もAIの演技です
      </p>

      {/* タイトル（最初に大きく、そのあと上に小さく残す） */}
      <div
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          top: t < INTRO ? 300 - ease(t / 0.4) * 20 : 70,
          textAlign: "center",
          opacity: t < INTRO ? ease(t / 0.3) : inResult || inOffer || inOutro ? 0 : 1,
          transition: "none",
        }}
      >
        <span
          style={{
            display: "inline-block",
            background: t < INTRO ? ACCENT : "rgba(0,0,0,.72)",
            color: t < INTRO ? "#0F0F0F" : "#fff",
            borderRadius: 14,
            padding: t < INTRO ? "16px 18px" : "6px 12px",
            fontSize: t < INTRO ? 34 : 16,
            fontWeight: 900,
            lineHeight: 1.35,
          }}
        >
          {job.title}
        </span>
      </div>

      {/* 採点 */}
      {inResult && <ResultCard job={job} t={t - timeline.resultStart} />}

      {/* 企業からのオファー（テーマに合わせた演出） */}
      {inOffer && job.offer && (
        <OfferCard job={job} offer={job.offer} t={t - timeline.offerStart} />
      )}

      {/* 締め */}
      {inOutro && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#0F0F0F",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
            opacity: ease((t - timeline.outroStart) / 0.3),
          }}
        >
          <img
            src="/brand/logo.webp"
            alt="ガチキャリAI"
            style={{ width: 300, height: 300, borderRadius: 24 }}
          />
          <p style={{ fontSize: 22, fontWeight: 700, textAlign: "center", lineHeight: 1.6 }}>
            AIの面接官と
            <br />
            本番さながらに練習できる
          </p>
          <p
            style={{
              background: ACCENT,
              color: "#0F0F0F",
              borderRadius: 999,
              padding: "12px 24px",
              fontSize: 20,
              fontWeight: 800,
            }}
          >
            無料ではじめる
          </p>
          <p style={{ fontSize: 16, color: ACCENT }}>gachicareer-ai.akitogroup.jp</p>
        </div>
      )}
    </div>
  );
}

function ResultCard({ job, t }: { job: StudioJobData; t: number }) {
  const k = ease(t / 1.2);
  const r = job.result;
  const avg = r.competencies.reduce((a, c) => a + c.score, 0) / r.competencies.length;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#0F0F0F",
        padding: "70px 30px 0",
        opacity: ease(t / 0.25),
      }}
    >
      <p style={{ fontSize: 16, color: "#888" }}>AIの評価</p>
      <p style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{job.jobType}の面接の結果</p>
      <div style={{ display: "flex", gap: 14, marginTop: 22 }}>
        <div style={{ flex: 1, background: "#1A1A1A", borderRadius: 18, padding: "16px 18px" }}>
          <p style={{ fontSize: 13, color: "#888" }}>総合</p>
          <p style={{ fontSize: 64, fontWeight: 900, color: ACCENT, lineHeight: 1.1 }}>
            {Math.round(r.score * k)}
            <span style={{ fontSize: 22 }}>点</span>
          </p>
        </div>
        <div style={{ flex: 1, background: "#1A1A1A", borderRadius: 18, padding: "16px 18px" }}>
          <p style={{ fontSize: 13, color: "#888" }}>7つの評価の平均</p>
          <p style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.1 }}>
            {(avg * k).toFixed(1)}
            <span style={{ fontSize: 22, color: "#888" }}> /5</span>
          </p>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 26 }}>
        {r.competencies.map((c, i) => {
          const kk = ease((t - 0.2 - i * 0.08) / 0.8);
          return (
            <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 132, fontSize: 15, color: "#CCC" }}>{c.label}</span>
              <div style={{ flex: 1, height: 14, borderRadius: 7, background: "#262626" }}>
                <div
                  style={{
                    width: `${(c.score / 5) * 100 * kk}%`,
                    height: 14,
                    borderRadius: 7,
                    background: ACCENT,
                  }}
                />
              </div>
              <span style={{ width: 34, textAlign: "right", fontSize: 15, fontWeight: 700 }}>
                {(c.score * kk).toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
      {r.comment && (
        <p
          style={{
            marginTop: 26,
            background: "#16200A",
            border: "1px solid #3A4A12",
            color: "#E6F7B0",
            borderRadius: 14,
            padding: "12px 16px",
            fontSize: 17,
            lineHeight: 1.6,
            opacity: ease((t - 1.4) / 0.4),
          }}
        >
          AIの講評：{r.comment}
        </p>
      )}
    </div>
  );
}

function OfferCard({
  job,
  offer,
  t,
}: {
  job: StudioJobData;
  offer: NonNullable<StudioJobData["offer"]>;
  t: number;
}) {
  const slide = ease(t / 0.45);
  const reactionOn = t >= OFFER_LEAD;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#0F0F0F", padding: "80px 26px 0" }}>
      <p style={{ fontSize: 16, color: "#888", opacity: ease(t / 0.3) }}>
        プロフィールを企業に公開すると…
      </p>
      {/* スマホの通知のような申し込み */}
      <div
        style={{
          marginTop: 22,
          transform: `translateY(${(1 - slide) * -60}px)`,
          opacity: slide,
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: 22,
          padding: "16px 18px",
          boxShadow: "0 10px 40px rgba(0,0,0,.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: ACCENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
            }}
          >
            🔔
          </span>
          <span style={{ fontSize: 14, color: "#AAA", flex: 1 }}>ガチキャリAI ・ たった今</span>
        </div>
        <p style={{ fontSize: 21, fontWeight: 800, marginTop: 12, lineHeight: 1.45 }}>
          {offer.companyType}から
          <br />
          面談の申し込みが届きました
          {offer.count > 1 && <span style={{ color: ACCENT }}>（ほか{offer.count - 1}件）</span>}
        </p>
        <p
          style={{
            marginTop: 10,
            fontSize: 17,
            color: "#DDD",
            lineHeight: 1.6,
            background: "#151515",
            borderRadius: 12,
            padding: "10px 12px",
          }}
        >
          「{offer.message}」
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <span
            style={{
              flex: 1,
              textAlign: "center",
              background: ACCENT,
              color: "#0F0F0F",
              borderRadius: 12,
              padding: "10px 0",
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            承諾する
          </span>
          <span
            style={{
              flex: 1,
              textAlign: "center",
              border: "1px solid #444",
              borderRadius: 12,
              padding: "10px 0",
              fontSize: 16,
              color: "#BBB",
            }}
          >
            あとで
          </span>
        </div>
      </div>

      {/* 受験者のひとこと（字幕） */}
      {reactionOn && (
        <p
          style={{
            marginTop: 40,
            textAlign: "center",
            fontSize: 34,
            fontWeight: 900,
            lineHeight: 1.35,
            color: ACCENT,
            WebkitTextStroke: "6px #000",
            paintOrder: "stroke fill",
            transform: `scale(${0.9 + 0.1 * ease((t - OFFER_LEAD) / 0.15)})`,
          }}
        >
          {offer.reaction}
        </p>
      )}
      <p
        style={{
          position: "absolute",
          bottom: 150,
          left: 0,
          right: 70,
          textAlign: "center",
          fontSize: 12,
          color: "#666",
        }}
      >
        ※ 演出です（{job.jobType}の面接・架空の会社）
      </p>
    </div>
  );
}
