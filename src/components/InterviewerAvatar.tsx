/**
 * AI面接官アバター（自前実装・外部サービスなし・完全無料）。
 * リアルな写真の口だけを動かすと不自然に見えるので、口は動かさず、ビデオ通話のような見せ方にする。
 * - 写真（public/avatar/base.webp）を WebGL で表示し、まばたき・呼吸・首の小さな揺れで自然に見せる
 *   まばたきは、目のまわりだけを目を閉じた写真（eyes-closed.webp）に一瞬切り替える
 * - AIが話している間は、軽いうなずきと、音声の大きさに合わせた光と音の波で「話している」ことを示す
 *
 * 写真を差し替えるときは同じ構図の2枚（目を開けた／閉じた）を用意し、FACE の座標を合わせる。
 */
import { useEffect, useRef } from "react";
import type { AvatarVoice } from "@/lib/avatar-voice";

const PHOTOS = {
  base: "/avatar/base.webp",
  blink: "/avatar/eyes-closed.webp",
} as const;

/** 写真内の位置（写真の幅・高さを 1 とした比率。y は上から） */
const FACE = {
  focus: [0.524, 0.45], // 縦長の画面で中心に残す位置
  eyes: [
    [0.4466, 0.3517],
    [0.6077, 0.3517],
  ],
  eyeRadius: [0.064, 0.042],
  // 目を閉じた写真は少し下にずれているので、その分ずらして重ねる
  blinkOffset: [0, 0.0096],
  chinY: 0.64,
} as const;

/** 音の波のバーの本数 */
const BARS = 5;

type Props = {
  voice: AvatarVoice | null;
  /** 写真の読み込みが終わったら呼ばれる */
  onReady?: () => void;
  className?: string;
};

export function InterviewerAvatar({ voice, onReady, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startRenderer(
      canvas,
      glowRef.current!,
      barsRef.current!,
      () => voiceRef.current,
      () => onReadyRef.current?.(),
    );
  }, []);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: `#e9ebef url(${PHOTOS.base}) center / contain no-repeat`,
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      {/* 話している間の光（音声が大きいほど強く） */}
      <div
        ref={glowRef}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0,
          boxShadow: "inset 0 0 60px 12px rgba(200, 255, 0, 0.55)",
        }}
      />
      {/* 話している間の音の波 */}
      <div
        ref={barsRef}
        style={{
          position: "absolute",
          left: "50%",
          bottom: 14,
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 5,
          height: 34,
          padding: "0 12px",
          borderRadius: 17,
          background: "rgba(15, 15, 15, 0.55)",
          opacity: 0,
          transition: "opacity 0.25s ease",
          pointerEvents: "none",
        }}
      >
        {Array.from({ length: BARS }, (_, i) => (
          <span
            key={i}
            style={{
              width: 4,
              height: 6,
              borderRadius: 2,
              background: "#C8FF00",
              display: "block",
            }}
          />
        ))}
      </div>
    </div>
  );
}

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uBase;
uniform sampler2D uBlink;
uniform vec2 uRes;
uniform vec2 uFocus;
uniform vec2 uEye0;
uniform vec2 uEye1;
uniform vec2 uEyeR;
uniform vec2 uBlinkOff;
uniform float uChin;
uniform float uBlinkAmt;
uniform float uZoom;
uniform vec2 uHead;
out vec4 outColor;

// 楕円の中で 1、外側に向かってなめらかに 0
float mask(vec2 p, vec2 c, vec2 r) {
  return 1.0 - smoothstep(0.55, 1.0, length((p - c) / r));
}

vec3 photo(vec2 s) {
  vec3 col = texture(uBase, s).rgb;
  if (uBlinkAmt > 0.0) {
    vec2 up = vec2(0.0, uEyeR.y * 0.2);
    float e = max(mask(s, uEye0 - up, uEyeR), mask(s, uEye1 - up, uEyeR));
    col = mix(col, texture(uBlink, s + uBlinkOff).rgb, e * uBlinkAmt);
  }
  return col;
}

void main() {
  vec2 frag = gl_FragCoord.xy / uRes;
  frag.y = 1.0 - frag.y;
  float ca = uRes.x / uRes.y;

  // 横長: 写真全体を高さに合わせて表示し、左右の余白はぼかした写真で埋める
  // 縦長: 顔を中心に画面いっぱいに表示する
  vec2 p;
  vec2 bg;
  if (ca >= 1.0) {
    p = vec2(0.5 + (frag.x - 0.5) * ca, frag.y);
    bg = vec2(0.5 + (frag.x - 0.5), 0.5 + (frag.y - 0.5) / ca);
  } else {
    vec2 view = vec2(ca, 1.0);
    vec2 origin = clamp(uFocus - view * 0.5, vec2(0.0), vec2(1.0) - view);
    p = origin + frag * view;
    bg = p;
  }
  p = uFocus + (p - uFocus) / uZoom;

  // 頭だけ動かす（あごより下の体は動かさない）
  float headW = 1.0 - smoothstep(uChin, uChin + 0.12, p.y);
  vec2 s = p - uHead * headW;

  vec3 col = photo(clamp(s, 0.0, 1.0));
  float inside = smoothstep(0.0, 0.015, p.x) * smoothstep(0.0, 0.015, 1.0 - p.x);
  if (inside < 1.0) {
    vec3 blurred = textureLod(uBase, clamp(bg, 0.0, 1.0), 6.5).rgb * 0.92;
    col = mix(blurred, col, inside);
  }
  outColor = vec4(col, 1.0);
}`;

function startRenderer(
  canvas: HTMLCanvasElement,
  glow: HTMLDivElement,
  barsBox: HTMLDivElement,
  getVoice: () => AvatarVoice | null,
  onReady: () => void,
): () => void {
  const bars = Array.from(barsBox.children) as HTMLElement[];
  let running = true;
  let frame = 0;

  // 話している演出（WebGL が使えなくても動かす）
  let level = 0;
  let speakEnergy = 0;
  let lastFx = performance.now();
  const updateSpeakingFx = (now: number) => {
    const dt = Math.min((now - lastFx) / 1000, 0.05);
    lastFx = now;
    const v = getVoice()?.getLevel() ?? { level: 0, brightness: 0.5 };
    const target = Math.min(1, v.level * 3);
    level += (target - level) * Math.min(1, dt * (target > level ? 20 : 8));
    speakEnergy += ((v.level > 0.02 ? 1 : 0) - speakEnergy) * Math.min(1, dt * 4);
    glow.style.opacity = String(speakEnergy * (0.35 + 0.65 * level));
    barsBox.style.opacity = speakEnergy > 0.05 ? "1" : "0";
    const t = now / 1000;
    bars.forEach((bar, i) => {
      const wobble = 0.55 + 0.45 * Math.sin(t * (7 + i * 1.7) + i * 1.3);
      const center = 1 - Math.abs(i - (BARS - 1) / 2) / BARS;
      bar.style.height = `${Math.round(6 + 22 * level * wobble * center)}px`;
    });
    return speakEnergy;
  };

  const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false });
  // WebGL2 が使えない端末では背景の静止画 + 話している演出だけにする
  if (!gl) {
    onReady();
    const loop = (now: number) => {
      if (!running) return;
      frame = requestAnimationFrame(loop);
      updateSpeakingFx(now);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
    };
  }

  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(sh));
    return sh;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(prog, name);
  gl.uniform2f(u("uFocus"), ...FACE.focus);
  gl.uniform2f(u("uEye0"), ...FACE.eyes[0]);
  gl.uniform2f(u("uEye1"), ...FACE.eyes[1]);
  gl.uniform2f(u("uEyeR"), ...FACE.eyeRadius);
  gl.uniform2f(u("uBlinkOff"), ...FACE.blinkOffset);
  gl.uniform1f(u("uChin"), FACE.chinY);
  const uRes = u("uRes");
  const uBlinkAmt = u("uBlinkAmt");
  const uZoom = u("uZoom");
  const uHead = u("uHead");

  let loaded = false;
  const textures: WebGLTexture[] = [];
  const names = ["uBase", "uBlink"] as const;

  Promise.all(
    [PHOTOS.base, PHOTOS.blink].map(async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    }),
  )
    .then((imgs) => {
      if (!running) return;
      imgs.forEach((img, i) => {
        const tex = gl.createTexture()!;
        textures.push(tex);
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(u(names[i]), i);
      });
      loaded = true;
      onReady();
    })
    .catch((e) => {
      console.error("Avatar photos failed to load:", e);
      onReady();
    });

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let nextBlink = 1.5 + Math.random() * 3;
  let blinkStart = -1;
  const start = performance.now();

  const tick = (now: number) => {
    if (!running) return;
    frame = requestAnimationFrame(tick);
    const energy = updateSpeakingFx(now);
    const t = (now - start) / 1000;
    if (!loaded) return;

    // まばたき（0.15秒で閉じて開く）
    if (blinkStart < 0 && t > nextBlink) blinkStart = t;
    let blink = 0;
    if (blinkStart >= 0) {
      const p = (t - blinkStart) / 0.15;
      if (p >= 1) {
        blinkStart = -1;
        nextBlink = t + 2.5 + Math.random() * 3.5;
      } else {
        blink = Math.min(1, (1 - Math.abs(1 - p * 2)) * 1.6);
      }
    }

    // 呼吸・首の揺れ・話している間のうなずき（単位は写真サイズ比）
    const nod = energy * 0.0028 * (0.5 + 0.5 * Math.sin(t * 2.6));
    const headX = Math.sin(t * 0.45) * 0.0015 + Math.sin(t * 1.1) * 0.0008 * energy;
    const headY = Math.sin(t * 0.6) * 0.001 + nod;

    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uBlinkAmt, blink);
    gl.uniform1f(uZoom, 1.0 + Math.sin(t * 1.5) * 0.002);
    gl.uniform2f(uHead, headX, headY);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  frame = requestAnimationFrame(tick);

  return () => {
    running = false;
    cancelAnimationFrame(frame);
    ro.disconnect();
    textures.forEach((tex) => gl.deleteTexture(tex));
    gl.deleteBuffer(buf);
    gl.deleteProgram(prog);
  };
}
