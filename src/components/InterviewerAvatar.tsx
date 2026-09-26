/**
 * AI面接官アバター（自前実装・外部サービスなし）。
 * AIで生成した面接官の動画（Kling）を素材にして、ブラウザ内で合成する。
 * - 顔の動き: 聞いている動画（まばたき・小さなうなずき）をずっとループ再生
 * - 口: AIの音声の大きさに合わせて、同じ動画の話している場面から切り出した口の画像（4段階）を重ねる
 *   口の画像は、フレームごとの顔のずれ（interviewer-avatar-data.ts）に合わせて顔に追従させる
 *
 * 素材は scripts/avatar/build_avatar.py で元動画から作り直せる。
 */
import { useEffect, useRef } from "react";
import type { AvatarVoice } from "@/lib/avatar-voice";
import { AVATAR_DATA } from "./interviewer-avatar-data";

const ASSETS = {
  idle: "/avatar/idle",
  mouths: "/avatar/mouths.png",
  poster: "/avatar/poster.jpg",
} as const;

/** 画面が素材より横長・縦長のとき、どこを中心に切り取るか（0〜1） */
const FOCUS = [0.5, 0.3] as const;
/** 口の画像を切り替えるときに重ねる秒数 */
const MOUTH_FADE = 0.06;
/** 口の形を最低この秒数は保つ（細かく行ったり来たりしないように） */
const MOUTH_HOLD = 0.08;

type Props = {
  voice: AvatarVoice | null;
  /** 動画の再生準備ができたら呼ばれる */
  onReady?: () => void;
  className?: string;
};

export function InterviewerAvatar({ voice, onReady, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const mouths = new Image();
    mouths.src = ASSETS.mouths;

    let ready = false;
    const markReady = () => {
      if (ready) return;
      ready = true;
      onReadyRef.current?.();
    };
    video.addEventListener("canplay", markReady, { once: true });
    video.addEventListener("error", markReady, { once: true });
    video.muted = true; // iOS Safari は muted をプロパティで指定しないと自動再生しない
    void video.play().catch(() => {
      // 自動再生がブロックされた場合はポスター画像のまま
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const [vw, vh] = AVATAR_DATA.videoSize;
    const [bx, by, bw, bh] = AVATAR_DATA.mouthBox;
    const frameCount = AVATAR_DATA.offsets.length;

    let open = 0;
    let shown = 0; // 表示中の口（0 = 動画のまま、1〜4 = 口の画像）
    let prevShown = 0;
    let changedAt = -1;
    let last = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;
      if (video.readyState < 2) return;

      // object-fit: cover と同じ切り取り方で動画を描く
      const cw = canvas.width;
      const ch = canvas.height;
      const scale = Math.max(cw / vw, ch / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (cw - dw) * FOCUS[0];
      const dy = (ch - dh) * FOCUS[1];
      ctx.drawImage(video, dx, dy, dw, dh);

      // 口の開き（開くときは速く、閉じるときは少しゆっくり）
      const v = voiceRef.current?.getLevel() ?? { level: 0, brightness: 0.5 };
      const target = Math.min(1, Math.max(0, (v.level - 0.03) * 3));
      open += (target - open) * Math.min(1, dt * (target > open ? 24 : 12));
      const wanted = open < 0.12 ? 0 : open < 0.4 ? 1 : open < 0.62 ? 2 : open < 0.85 ? 3 : 4;
      if (wanted !== shown && t - changedAt > MOUTH_HOLD) {
        prevShown = shown;
        shown = wanted;
        changedAt = t;
      }
      if (!mouths.complete || (shown === 0 && prevShown === 0)) return;

      // 今のフレームの顔のずれに合わせて、口の画像を置く
      const idx = Math.min(frameCount - 1, Math.floor(video.currentTime * AVATAR_DATA.fps));
      const [ox, oy] = AVATAR_DATA.offsets[idx];
      const px = dx + (bx + ox) * scale;
      const py = dy + (by + oy) * scale;
      const fade = Math.min(1, (t - changedAt) / MOUTH_FADE);
      const drawMouth = (n: number, alpha: number) => {
        if (n === 0 || alpha <= 0) return;
        ctx.globalAlpha = alpha;
        ctx.drawImage(mouths, (n - 1) * bw, 0, bw, bh, px, py, bw * scale, bh * scale);
      };
      drawMouth(prevShown, 1 - fade);
      drawMouth(shown, fade);
      ctx.globalAlpha = 1;
      if (fade >= 1) prevShown = shown;
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      video.pause();
    };
  }, []);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: `#c9ccd1 url(${ASSETS.poster}) ${FOCUS[0] * 100}% ${FOCUS[1] * 100}% / cover no-repeat`,
      }}
    >
      {/* 動画は canvas の下に同じ切り取り方で置いておく（見えない動画はブラウザが止めることがあるため。
          canvas が使えないときはこの動画がそのまま見える） */}
      <video
        ref={videoRef}
        muted
        playsInline
        loop
        preload="auto"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: `${FOCUS[0] * 100}% ${FOCUS[1] * 100}%`,
        }}
      >
        <source src={`${ASSETS.idle}.mp4`} type="video/mp4" />
        <source src={`${ASSETS.idle}.webm`} type="video/webm" />
      </video>
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
}
