/**
 * AI面接官アバター。AIで生成した面接官の動画を2種類使い分ける。外部サービスは使わない。
 * - 聞いている動画（public/avatar/idle.mp4）: 口を閉じて、まばたき・小さなうなずき
 * - 話している動画（public/avatar/talk.mp4）: AIの音声を再生している間だけ重ねて表示
 * どちらも最後まで行ったら、もう1本の同じ動画に 0.35 秒かけて重ねながら頭に戻し、つなぎ目を目立たなくする。
 *
 * 動画を差し替えるときは、同じ構図・同じ背景で作り、public/avatar/ の同名ファイルを置き換える。
 */
import { useEffect, useRef } from "react";
import type { AvatarVoice } from "@/lib/avatar-voice";

// mp4(H.264) を優先し、再生できないブラウザ向けに webm(VP9) も置く
const CLIPS = {
  idle: "/avatar/idle",
  talk: "/avatar/talk",
  poster: "/avatar/poster.jpg",
} as const;

function Sources({ base }: { base: string }) {
  return (
    <>
      <source src={`${base}.mp4`} type="video/mp4" />
      <source src={`${base}.webm`} type="video/webm" />
    </>
  );
}

/** ループのつなぎ目で重ねる秒数 */
const LOOP_FADE = 0.35;
/** 聞いている ↔ 話している の切り替えにかける秒数 */
const SWITCH_FADE = 0.25;

type Props = {
  voice: AvatarVoice | null;
  /** 動画の再生準備ができたら呼ばれる */
  onReady?: () => void;
  className?: string;
};

export function InterviewerAvatar({ voice, onReady, className }: Props) {
  const idleRefs = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)];
  const talkRefs = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)];
  const talkLayerRef = useRef<HTMLDivElement>(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const idle = idleRefs.map((r) => r.current!);
    const talk = talkRefs.map((r) => r.current!);
    const talkLayer = talkLayerRef.current!;
    const loops = [createLoop(idle), createLoop(talk)];

    let ready = false;
    const markReady = () => {
      if (ready) return;
      ready = true;
      onReadyRef.current?.();
    };
    idle[0].addEventListener("canplay", markReady, { once: true });
    idle[0].addEventListener("error", markReady, { once: true });
    loops.forEach((l) => l.start());

    let talking = false;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      loops.forEach((l) => l.update());
      const now = voiceRef.current?.isPlaying() ?? false;
      if (now !== talking) {
        talking = now;
        talkLayer.style.opacity = talking ? "1" : "0";
      }
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      [...idle, ...talk].forEach((v) => v.pause());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const videoStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "50% 30%",
    transition: `opacity ${LOOP_FADE}s linear`,
  };
  const layerStyle: React.CSSProperties = { position: "absolute", inset: 0 };

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: `#c9ccd1 url(${CLIPS.poster}) 50% 30% / cover no-repeat`,
      }}
    >
      <div style={layerStyle}>
        {idleRefs.map((ref, i) => (
          <video
            key={i}
            ref={ref}
            poster={CLIPS.poster}
            muted
            playsInline
            preload="auto"
            style={videoStyle}
          >
            <Sources base={CLIPS.idle} />
          </video>
        ))}
      </div>
      <div
        ref={talkLayerRef}
        style={{ ...layerStyle, opacity: 0, transition: `opacity ${SWITCH_FADE}s ease` }}
      >
        {talkRefs.map((ref, i) => (
          <video key={i} ref={ref} muted playsInline preload="auto" style={videoStyle}>
            <Sources base={CLIPS.talk} />
          </video>
        ))}
      </div>
    </div>
  );
}

/**
 * 同じ動画を2つの <video> で交互に再生して、つなぎ目で重ねながらループさせる。
 * （loop 属性だと最後のコマから最初のコマへ一瞬で飛ぶので、顔がカクッと動いて見える）
 * 下の動画 a は常に表示したままにして、上の動画 b の透明度だけを切り替える。
 */
function createLoop([a, b]: HTMLVideoElement[]) {
  let active = a;
  let switching = false;

  const play = (v: HTMLVideoElement) => {
    v.muted = true; // iOS Safari は muted をプロパティで指定しないと自動再生しない
    void v.play().catch(() => {
      // 自動再生がブロックされた場合はポスター画像のまま
    });
  };

  return {
    start() {
      b.style.opacity = "0";
      play(a);
    },
    update() {
      const d = active.duration;
      if (!d || switching || active.currentTime < d - LOOP_FADE) return;
      switching = true;
      const next = active === a ? b : a;
      next.currentTime = 0;
      play(next);
      // a → b は上の b をフェードイン、b → a は上の b をフェードアウト
      b.style.opacity = next === b ? "1" : "0";
      const prev = active;
      active = next;
      window.setTimeout(
        () => {
          prev.pause();
          switching = false;
        },
        LOOP_FADE * 1000 + 50,
      );
    },
  };
}
