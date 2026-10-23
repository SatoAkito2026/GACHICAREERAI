/**
 * TikTok 動画「言い換え型」の画面：「◯◯と聞かれた時の最高な答え方」
 * 伸びている面接動画の型（大きな見出し・落ちる／受かるの言い換え・保存してね）に、
 * AI面接官の点数が言い換えで上がるところを足した。縦 540×960（2倍で撮って 1080×1920）。
 * 時間は performance.now()（撮影側が1コマずつ進める）だけを見る。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { InterviewerAvatar } from "@/components/InterviewerAvatar";
import type { AvatarVoice } from "@/lib/avatar-voice";
import { ACCENT, FONT, StudioVoice, currentCaption, ease } from "@/components/studio/TiktokScene";

export type RewriteJobData = {
  format: "rewrite";
  title: string;
  hook: string;
  question: string;
  items: {
    label: string;
    ng: string;
    ngScore: number;
    ok: string;
    okScore: number;
    point: string;
  }[];
  offer?: { companyType: string; message: string };
  cta: string;
  lines: { speaker: "interviewer" | "candidate" | "narrator"; text: string }[];
  roles: ("hook" | "question" | "ng" | "ok" | "point" | "offer" | "cta")[];
  itemIndex: number[];
  audio: string[];
  sampleRate: number;
  interviewerRate: number;
  /** 音の高さを変えずに速くする倍率（せりふごと） */
  tempos?: number[];
};

const START = 0.15;
const GAP = 0.2;
/** 点数を見せる間（NG・OK のあと） */
const SCORE_HOLD = 0.8;
/** オファーの通知を見せる間 */
const OFFER_HOLD = 1.4;
const END = 3;
const RED = "#FF4D5E";
const GREEN = "#2BD67B";
const NUM = ["①", "②", "③", "④"];

export function buildRewriteTimeline(job: RewriteJobData) {
  let t = START;
  const lines = job.lines.map((line, i) => {
    const samples = ((job.audio[i]?.length ?? 0) * 0.75) / 2;
    const pitchRate = line.speaker === "interviewer" ? job.interviewerRate : 1;
    const tempo = job.tempos?.[i] ?? 1;
    const rate = pitchRate * tempo;
    const dur = Math.max(0.5, samples / job.sampleRate / rate);
    const role = job.roles[i];
    const item = {
      ...line,
      start: t,
      dur,
      rate,
      pitchRate,
      tempo,
      role,
      itemIndex: job.itemIndex[i],
    };
    t += dur + (role === "ng" || role === "ok" ? SCORE_HOLD : role === "offer" ? OFFER_HOLD : GAP);
    return item;
  });
  const endStart = t;
  return { lines, endStart, total: endStart + END };
}

export function RewriteScene({ job, onReady }: { job: RewriteJobData; onReady: () => void }) {
  const timeline = useMemo(() => buildRewriteTimeline(job), [job]);
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

  const caption = currentCaption(timeline.lines, t);
  // いま見せるパターン（最後に始まったせりふのパターン）
  const started = timeline.lines.filter((l) => t >= l.start);
  const lastItem = [...started].reverse().find((l) => l.itemIndex >= 0);
  const itemNo = lastItem?.itemIndex ?? -1;
  const lineOf = (role: string, i: number) =>
    timeline.lines.find((l) => l.role === role && l.itemIndex === i);
  const inEnd = t >= timeline.endStart;
  const hookLine = timeline.lines.find((l) => l.role === "hook");
  const inHook = !!hookLine && t < hookLine.start + hookLine.dur + GAP;
  const offerLine = timeline.lines.find((l) => l.role === "offer");
  const inOffer =
    !!offerLine && t >= offerLine.start && t < offerLine.start + offerLine.dur + OFFER_HOLD;

  return (
    <div
      style={{
        position: "relative",
        width: 540,
        height: 960,
        overflow: "hidden",
        background: "#0F1216",
        fontFamily: FONT,
        color: "#F0F0F0",
      }}
    >
      {/* いちばん上の大きな見出し（最初のコマから出しておく＝表紙になる） */}
      <div style={{ position: "absolute", top: 22, left: 20, right: 20, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 8 }}>
          <span
            style={{
              background: RED,
              color: "#fff",
              fontWeight: 900,
              fontSize: 15,
              borderRadius: 6,
              padding: "3px 10px",
            }}
          >
            保存必須
          </span>
          <span
            style={{
              background: "#1E2630",
              color: ACCENT,
              fontWeight: 800,
              fontSize: 15,
              borderRadius: 6,
              padding: "3px 10px",
            }}
          >
            AI面接官が採点
          </span>
        </div>
        <div
          style={{
            background: "#FFFFFF",
            color: "#111",
            borderRadius: 16,
            padding: "12px 14px",
            fontSize: 25,
            fontWeight: 900,
            lineHeight: 1.35,
            boxShadow: "0 6px 24px rgba(0,0,0,.35)",
          }}
        >
          {job.title}
        </div>
      </div>

      {/* AI面接官 */}
      <div
        style={{
          position: "absolute",
          top: 176,
          left: 20,
          right: 20,
          height: 262,
          borderRadius: 18,
          overflow: "hidden",
        }}
      >
        <InterviewerAvatar voice={voice as unknown as AvatarVoice} onReady={onReady} />
        <span
          style={{
            position: "absolute",
            left: 10,
            top: 10,
            background: "rgba(0,0,0,.6)",
            borderRadius: 8,
            padding: "3px 9px",
            fontSize: 12,
          }}
        >
          ガチキャリAI ・ AI面接官
        </span>
      </div>

      {/* 字幕（話している部分だけ） */}
      {caption && !inEnd && !inHook && !inOffer && (
        <div style={{ position: "absolute", top: 384, left: 24, right: 24, textAlign: "center" }}>
          <span
            style={{
              display: "inline-block",
              fontSize: 26,
              fontWeight: 900,
              lineHeight: 1.3,
              color: caption.speaker === "candidate" ? "#FFE45C" : "#FFFFFF",
              WebkitTextStroke: "6px #000",
              paintOrder: "stroke fill",
              transform: `scale(${0.92 + 0.08 * ease(caption.age / 0.12)})`,
            }}
          >
            {caption.text}
          </span>
        </div>
      )}

      {/* 下の段：質問 → パターンごとの「落ちる／受かる」と点数。右と下は TikTok のボタン・文のためにあける */}
      <div style={{ position: "absolute", top: 456, left: 18, right: 64 }}>
        {itemNo < 0 ? (
          <div
            style={{
              background: "#1A2029",
              border: "1px solid #2C3644",
              borderRadius: 16,
              padding: "16px 16px",
              opacity: ease((t - START) / 0.3),
            }}
          >
            <p style={{ fontSize: 13, color: "#8FA0B3", fontWeight: 700 }}>面接官の質問</p>
            <p style={{ fontSize: 25, fontWeight: 900, marginTop: 6, lineHeight: 1.45 }}>
              Q. {job.question}
            </p>
          </div>
        ) : (
          <ItemPanel
            key={itemNo}
            no={itemNo}
            item={job.items[itemNo]}
            t={t}
            ng={lineOf("ng", itemNo)}
            ok={lineOf("ok", itemNo)}
            point={lineOf("point", itemNo)}
          />
        )}
      </div>

      {/* 最初の1秒：ナレーターの強い一言を、画面いっぱいに大きく */}
      {inHook && hookLine && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 176,
            bottom: 0,
            background: "rgba(10,12,16,.92)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: 120,
          }}
        >
          <p
            style={{
              margin: "0 30px",
              textAlign: "center",
              fontSize: 38,
              fontWeight: 900,
              lineHeight: 1.3,
              color: "#FFE45C",
              WebkitTextStroke: "7px #000",
              paintOrder: "stroke fill",
              transform: `scale(${1.1 - 0.1 * ease((t - hookLine.start) / 0.18)}) rotate(-2deg)`,
              wordBreak: "keep-all",
              overflowWrap: "anywhere",
            }}
          >
            {job.hook}
          </p>
        </div>
      )}

      {/* オファー：練習の結果を公開しておくと、企業から面談の申し込みが届く */}
      {inOffer && offerLine && job.offer && (
        <OfferNotice offer={job.offer} t={t - offerLine.start} />
      )}

      {/* 締め：保存してね ＋ ロゴ */}
      {inEnd && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#0F1216",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            paddingBottom: 80,
            opacity: ease((t - timeline.endStart) / 0.3),
          }}
        >
          <p
            style={{
              background: RED,
              color: "#fff",
              fontWeight: 900,
              fontSize: 28,
              borderRadius: 12,
              padding: "10px 20px",
            }}
          >
            {job.cta}
          </p>
          <img
            src="/brand/logo.webp"
            alt="ガチキャリAI"
            style={{ width: 260, height: 260, borderRadius: 22 }}
          />
          <p style={{ fontSize: 20, fontWeight: 800, textAlign: "center", lineHeight: 1.6 }}>
            AIの面接官と、無料で
            <br />
            本番さながらに練習できる
          </p>
          <p style={{ fontSize: 15, color: ACCENT }}>gachicareer-ai.akitogroup.jp</p>
        </div>
      )}
    </div>
  );
}

type PlacedLine = { start: number; dur: number } | undefined;

function ItemPanel({
  no,
  item,
  t,
  ng,
  ok,
  point,
}: {
  no: number;
  item: RewriteJobData["items"][number];
  t: number;
  ng: PlacedLine;
  ok: PlacedLine;
  point: PlacedLine;
}) {
  const showOk = ok && t >= ok.start;
  const showPoint = point && t >= point.start;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 25, fontWeight: 900 }}>
        <span style={{ color: ACCENT }}>{NUM[no]}</span> {item.label}
      </p>
      <AnswerCard
        kind="ng"
        text={item.ng}
        score={item.ngScore}
        appear={ng ? ease((t - ng.start) / 0.25) : 1}
        reveal={ng ? (t - (ng.start + ng.dur)) / 0.5 : 1}
        dim={!!showOk}
      />
      {showOk && ok && (
        <AnswerCard
          kind="ok"
          text={item.ok}
          score={item.okScore}
          appear={ease((t - ok.start) / 0.25)}
          reveal={(t - (ok.start + ok.dur)) / 0.6}
          diff={item.okScore - item.ngScore}
        />
      )}
      {showPoint && point && (
        <p
          style={{
            fontSize: 19,
            fontWeight: 800,
            color: "#111",
            background: ACCENT,
            borderRadius: 10,
            padding: "8px 12px",
            opacity: ease((t - point.start) / 0.25),
          }}
        >
          ポイント：{item.point}
        </p>
      )}
    </div>
  );
}

function AnswerCard({
  kind,
  text,
  score,
  appear,
  reveal,
  dim,
  diff,
}: {
  kind: "ng" | "ok";
  text: string;
  score: number;
  appear: number;
  reveal: number;
  dim?: boolean;
  diff?: number;
}) {
  const color = kind === "ng" ? RED : GREEN;
  const k = ease(reveal);
  return (
    <div
      style={{
        position: "relative",
        background: kind === "ng" ? "#2A1418" : "#10291C",
        border: `2px solid ${color}`,
        borderRadius: 14,
        padding: "10px 12px 10px",
        opacity: appear * (dim ? 0.55 : 1),
        transform: `translateY(${(1 - appear) * 8}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            background: color,
            color: kind === "ng" ? "#fff" : "#062012",
            fontWeight: 900,
            fontSize: 15,
            borderRadius: 6,
            padding: "2px 9px",
          }}
        >
          {kind === "ng" ? "✕ 落ちる" : "○ 受かる"}
        </span>
        {reveal > 0 && (
          <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            {diff !== undefined && k > 0.6 && (
              <span style={{ color: ACCENT, fontWeight: 900, fontSize: 16 }}>+{diff}点</span>
            )}
            <span style={{ fontSize: 12, color: "#AAB4C0" }}>AI採点</span>
            <span style={{ fontSize: 36, fontWeight: 900, color, lineHeight: 1 }}>
              {Math.round(score * k)}
            </span>
            <span style={{ fontSize: 14, color }}>点</span>
          </span>
        )}
      </div>
      <p
        style={{
          marginTop: 6,
          fontSize: kind === "ok" ? 20 : 18,
          fontWeight: kind === "ok" ? 800 : 600,
          lineHeight: 1.5,
        }}
      >
        「{text}」
      </p>
    </div>
  );
}

function OfferNotice({ offer, t }: { offer: NonNullable<RewriteJobData["offer"]>; t: number }) {
  const slide = ease((t - 0.5) / 0.4);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 176,
        bottom: 0,
        background: "#0F1216",
        padding: "30px 64px 0 22px",
      }}
    >
      <p
        style={{
          fontSize: 24,
          fontWeight: 900,
          lineHeight: 1.45,
          color: "#FFFFFF",
          opacity: ease(t / 0.25),
        }}
      >
        練習の結果を公開しておくと…
      </p>
      <div
        style={{
          marginTop: 18,
          transform: `translateY(${(1 - slide) * -50}px)`,
          opacity: slide,
          background: "#1E242C",
          border: "1px solid #364150",
          borderRadius: 20,
          padding: "14px 16px",
          boxShadow: "0 10px 40px rgba(0,0,0,.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src="/icons/icon-192.png"
            alt=""
            style={{ width: 32, height: 32, borderRadius: 8 }}
          />
          <span style={{ fontSize: 13, color: "#AAB4C0", flex: 1 }}>ガチキャリAI ・ たった今</span>
        </div>
        <p style={{ fontSize: 21, fontWeight: 900, marginTop: 10, lineHeight: 1.45 }}>
          {offer.companyType}から
          <br />
          面談の申し込みが届きました
        </p>
        <p
          style={{
            marginTop: 8,
            fontSize: 16,
            color: "#DDE3EA",
            lineHeight: 1.6,
            background: "#151A20",
            borderRadius: 12,
            padding: "8px 12px",
          }}
        >
          「{offer.message}」
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <span
            style={{
              flex: 1,
              textAlign: "center",
              background: ACCENT,
              color: "#0F0F0F",
              borderRadius: 12,
              padding: "9px 0",
              fontWeight: 900,
              fontSize: 16,
            }}
          >
            承諾する
          </span>
          <span
            style={{
              flex: 1,
              textAlign: "center",
              border: "1px solid #4A5562",
              borderRadius: 12,
              padding: "9px 0",
              fontSize: 16,
              color: "#BBC4CE",
            }}
          >
            あとで
          </span>
        </div>
      </div>
      <p
        style={{
          marginTop: 18,
          fontSize: 22,
          fontWeight: 900,
          textAlign: "center",
          color: "#FFE45C",
          WebkitTextStroke: "5px #000",
          paintOrder: "stroke fill",
          opacity: ease((t - 1.2) / 0.3),
        }}
      >
        練習するだけで、企業の目に留まる
      </p>
      <p style={{ marginTop: 10, fontSize: 11, color: "#7C8794", textAlign: "center" }}>
        ※ 演出です（架空の会社）。申し込みを約束するものではありません
      </p>
    </div>
  );
}
