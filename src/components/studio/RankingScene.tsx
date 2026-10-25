/**
 * TikTok 動画「ランキング型（掲示板風）」の画面。面接AIは出さず、就活・転職の役に立つ話題のランキングを見せる。
 * 伸びている掲示板風ランキング動画の型：暗い紫の背景・大きなタイトル → 「第5位」→ 名前 → 書き込み風のひとこと2つ。
 * 縦 540×960（2倍で撮って 1080×1920）。大事なものは TikTok のボタン・文に隠れない範囲（上130・下200・右74をあける）に置く。
 * 時間は performance.now()（撮影側が1コマずつ進める）だけを見る。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { FONT, ease } from "@/components/studio/TiktokScene";

export type RankingJobData = {
  format: "ranking";
  title: [string, string];
  items: { name: string; emoji: string; comments: [string, string] }[];
  lines: { speaker: "interviewer" | "candidate" | "narrator"; text: string }[];
  roles: ("hook" | "rank" | "comment" | "cta")[];
  itemIndex: number[];
  audio: string[];
  sampleRate: number;
  interviewerRate: number;
  tempos?: number[];
};

const RED = "#F0193F";
const GREEN = "#22C55E";
/** せりふのあとの間（早口でテンポよく進めるので短く） */
const GAP: Record<RankingJobData["roles"][number], number> = {
  hook: 0.35,
  rank: 0.15,
  comment: 0.2,
  cta: 0.2,
};
/** 項目の最後の書き込みのあと、次の順位に行くまでの間 */
const ITEM_GAP = 0.35;
const END = 2.6;

export function buildRankingTimeline(job: RankingJobData) {
  let t = 0;
  const lines = job.lines.map((line, i) => {
    const samples = ((job.audio[i]?.length ?? 0) * 0.75) / 2;
    const tempo = job.tempos?.[i] ?? 1;
    const dur = Math.max(0.5, samples / job.sampleRate / tempo);
    const role = job.roles[i];
    const item = {
      ...line,
      start: t,
      dur,
      rate: tempo,
      pitchRate: 1,
      tempo,
      role,
      itemIndex: job.itemIndex[i],
    };
    const lastOfItem = role === "comment" && job.itemIndex[i + 1] !== job.itemIndex[i];
    t += dur + (lastOfItem ? ITEM_GAP : GAP[role]);
    return item;
  });
  const cta = lines.find((l) => l.role === "cta");
  const endStart = cta ? cta.start : t;
  return { lines, endStart, total: (cta ? cta.start + cta.dur : t) + END, sfx: [] };
}

/** 赤いふちどり文字・白いふちどり文字（掲示板風ランキング動画の見出し） */
function Outlined({
  children,
  size,
  color,
  stroke,
  style,
}: {
  children: React.ReactNode;
  size: number;
  color: string;
  stroke: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: size,
        fontWeight: 900,
        lineHeight: 1.18,
        color,
        WebkitTextStroke: `${Math.round(size / 6)}px ${stroke}`,
        paintOrder: "stroke fill",
        textShadow: "0 4px 14px rgba(0,0,0,.55)",
        wordBreak: "keep-all",
        overflowWrap: "anywhere",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function RankingScene({ job, onReady }: { job: RankingJobData; onReady: () => void }) {
  const timeline = useMemo(() => buildRankingTimeline(job), [job]);
  const [t, setT] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    onReady();
    const loop = () => {
      setT(performance.now() / 1000);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstRank = timeline.lines.find((l) => l.role === "rank");
  const inHook = !firstRank || t < firstRank.start;
  const inEnd = t >= timeline.endStart;
  const started = timeline.lines.filter((l) => t >= l.start && l.itemIndex >= 0);
  const itemNo = started.length ? started[started.length - 1].itemIndex : -1;
  const item = itemNo >= 0 ? job.items[itemNo] : null;
  const rankLine = timeline.lines.find((l) => l.role === "rank" && l.itemIndex === itemNo);
  const comments = timeline.lines.filter((l) => l.role === "comment" && l.itemIndex === itemNo);
  const since = rankLine ? t - rankLine.start : 0;

  // 背景：暗い紫に、ゆっくり動く光のもや
  const drift = Math.sin(t * 0.6) * 40;
  const background = `radial-gradient(ellipse 70% 45% at ${30 + drift / 4}% ${35 + drift / 6}%, rgba(124,58,237,.55), transparent 70%),
    radial-gradient(ellipse 60% 40% at ${75 - drift / 5}% ${70 - drift / 8}%, rgba(76,29,149,.6), transparent 70%),
    linear-gradient(160deg, #1a0b3d 0%, #0d0524 55%, #1b0838 100%)`;

  return (
    <div
      style={{
        position: "relative",
        width: 540,
        height: 960,
        overflow: "hidden",
        background,
        fontFamily: FONT,
        color: "#fff",
      }}
    >
      {inHook && (
        <div
          style={{
            position: "absolute",
            top: 170,
            left: 20,
            right: 20,
            textAlign: "center",
            transform: `scale(${1.12 - 0.12 * ease(t / 0.25)})`,
          }}
        >
          <Outlined size={50} color={RED} stroke="#fff">
            {job.title[0]}
          </Outlined>
          <div style={{ height: 8 }} />
          <Outlined size={58} color="#fff" stroke="#111">
            {job.title[1]}
          </Outlined>
          <div style={{ fontSize: 150, marginTop: 70, lineHeight: 1 }}>🏆</div>
          <p style={{ marginTop: 26, fontSize: 22, fontWeight: 800, color: "#E9D5FF" }}>
            第{job.items.length}位から発表
          </p>
        </div>
      )}

      {!inHook && !inEnd && item && (
        <>
          {/* 上の小さなタイトル（途中から見た人にも何のランキングか分かるように） */}
          <div style={{ position: "absolute", top: 132, left: 24, right: 80, textAlign: "center" }}>
            <span
              style={{
                display: "inline-block",
                background: "rgba(0,0,0,.45)",
                border: "1px solid rgba(255,255,255,.25)",
                borderRadius: 10,
                padding: "4px 12px",
                fontSize: 16,
                fontWeight: 800,
              }}
            >
              {job.title[0]}
              {job.title[1]}
            </span>
          </div>
          <div style={{ position: "absolute", top: 178, left: 24, right: 80, textAlign: "center" }}>
            <Outlined size={50} color="#fff" stroke="#111">
              第{job.items.length - itemNo}位
            </Outlined>
          </div>
          <div
            style={{
              position: "absolute",
              top: 254,
              left: 20,
              right: 76,
              textAlign: "center",
              transform: `scale(${1.25 - 0.25 * ease(since / 0.18)})`,
              opacity: ease(since / 0.1),
            }}
          >
            <Outlined size={item.name.length > 8 ? 40 : 50} color={RED} stroke="#fff">
              {item.name}
            </Outlined>
          </div>
          <div style={{ position: "absolute", top: 400, left: 22, right: 80 }}>
            {comments.map((c, k) =>
              t >= c.start ? (
                <div
                  key={k}
                  style={{
                    marginTop: k ? 14 : 0,
                    background: "#fff",
                    color: "#111",
                    border: `4px solid ${k ? GREEN : RED}`,
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontSize: 22,
                    fontWeight: 800,
                    lineHeight: 1.45,
                    // 日本語を文節で改行する（「あ／るぞ」のような変な切れ方を防ぐ）
                    wordBreak: "auto-phrase" as React.CSSProperties["wordBreak"],
                    boxShadow: "0 6px 18px rgba(0,0,0,.4)",
                    opacity: ease((t - c.start) / 0.12),
                    transform: `translateY(${(1 - ease((t - c.start) / 0.15)) * 14}px)`,
                  }}
                >
                  {item.comments[k]}
                </div>
              ) : null,
            )}
          </div>
          <div
            style={{
              position: "absolute",
              top: 610,
              left: 0,
              right: 54,
              textAlign: "center",
              fontSize: 140,
              lineHeight: 1,
              transform: `translateY(${Math.sin(t * 3) * 6}px) scale(${0.6 + 0.4 * ease(since / 0.22)})`,
            }}
          >
            {item.emoji}
          </div>
        </>
      )}

      {/* 締め：さりげなくガチキャリAI */}
      {inEnd && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            paddingBottom: 90,
            opacity: ease((t - timeline.endStart) / 0.3),
          }}
        >
          <Outlined size={30} color="#fff" stroke="#111">
            保存して見返してね
          </Outlined>
          <img
            src="/brand/logo.webp"
            alt="ガチキャリAI"
            style={{ width: 220, height: 220, borderRadius: 22 }}
          />
          <p style={{ fontSize: 21, fontWeight: 800, textAlign: "center", lineHeight: 1.6 }}>
            面接の練習は
            <br />
            AIの面接官と無料で
          </p>
          <p style={{ fontSize: 15, color: "#C8FF00" }}>gachicareer-ai.akitogroup.jp</p>
        </div>
      )}
    </div>
  );
}
