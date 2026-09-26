/**
 * AI面接官アバター。同じ構図の写真4枚（口を閉じた／少し開けた／大きく開けた／目を閉じた）を
 * WebGL で部分的に重ねて、声に合わせた口パクとまばたきを作る。外部サービスは使わない。
 * - 口: 音量に応じて、口まわりだけ 閉じ → 少し開け → 大きく開け の写真へ切り替える
 * - 目: まばたきの瞬間だけ、目のまわりを目を閉じた写真に切り替える
 * - 呼吸・首の小さな揺れ・話している間の軽いうなずき
 *
 * 写真を差し替えるときは public/avatar/ の4枚を同じ構図で作り直し、FACE の座標を合わせる。
 */
import { useEffect, useRef } from "react";
import type { AvatarVoice } from "@/lib/avatar-voice";

const PHOTOS = {
  base: "/avatar/base.webp",
  half: "/avatar/mouth-half.webp",
  open: "/avatar/mouth-open.webp",
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
  // 目を閉じた写真は他の3枚より少し下にずれているので、その分ずらして重ねる
  blinkOffset: [0, 0.0096],
  // 唇だけを切り替える範囲（ほっぺ・あごは口を閉じた写真のまま）
  mouth: [0.52, 0.528],
  mouthRadius: [0.076, 0.05],
  chinY: 0.64,
} as const;

type Props = {
  voice: AvatarVoice | null;
  /** 写真の読み込みが終わったら呼ばれる */
  onReady?: () => void;
  className?: string;
};

export function InterviewerAvatar({ voice, onReady, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startRenderer(
      canvas,
      () => voiceRef.current,
      () => onReadyRef.current?.(),
    );
  }, []);

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        background: `#e9ebef url(${PHOTOS.base}) center / contain no-repeat`,
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
}

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uBase;
uniform sampler2D uHalf;
uniform sampler2D uOpen;
uniform sampler2D uBlink;
uniform vec2 uRes;
uniform vec2 uFocus;
uniform vec2 uEye0;
uniform vec2 uEye1;
uniform vec2 uEyeR;
uniform vec2 uBlinkOff;
uniform vec2 uMouth;
uniform vec2 uMouthR;
uniform float uChin;
uniform float uOpenAmt;
uniform float uBlinkAmt;
uniform float uZoom;
uniform vec2 uHead;
out vec4 outColor;

// 楕円の中で 1、外側に向かってなめらかに 0（inner より内側は完全に 1）
float mask(vec2 p, vec2 c, vec2 r, float inner) {
  return 1.0 - smoothstep(inner, 1.0, length((p - c) / r));
}

vec3 photo(vec2 s) {
  vec3 col = texture(uBase, s).rgb;
  // 口まわり: 閉じ → 少し開け → 大きく開け
  float m = mask(s, uMouth, uMouthR, 0.72);
  if (m > 0.0 && uOpenAmt > 0.0) {
    vec3 half_ = texture(uHalf, s).rgb;
    vec3 mouth = uOpenAmt < 0.5
      ? mix(col, half_, uOpenAmt * 2.0)
      : mix(half_, texture(uOpen, s).rgb, (uOpenAmt - 0.5) * 2.0);
    col = mix(col, mouth, m);
  }
  // 目まわり: まばたき
  if (uBlinkAmt > 0.0) {
    float e = max(mask(s, uEye0 - vec2(0.0, uEyeR.y * 0.2), uEyeR, 0.55), mask(s, uEye1 - vec2(0.0, uEyeR.y * 0.2), uEyeR, 0.55));
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
  getVoice: () => AvatarVoice | null,
  onReady: () => void,
): () => void {
  const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false });
  // WebGL2 が使えない端末では背景の静止画だけを表示する
  if (!gl) {
    onReady();
    return () => {};
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
  gl.uniform2f(u("uMouth"), ...FACE.mouth);
  gl.uniform2f(u("uMouthR"), ...FACE.mouthRadius);
  gl.uniform1f(u("uChin"), FACE.chinY);
  const uRes = u("uRes");
  const uOpenAmt = u("uOpenAmt");
  const uBlinkAmt = u("uBlinkAmt");
  const uZoom = u("uZoom");
  const uHead = u("uHead");

  let disposed = false;
  let loaded = false;
  const textures: WebGLTexture[] = [];
  const names = ["uBase", "uHalf", "uOpen", "uBlink"] as const;
  const urls = [PHOTOS.base, PHOTOS.half, PHOTOS.open, PHOTOS.blink];

  Promise.all(
    urls.map(async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    }),
  )
    .then((imgs) => {
      if (disposed) return;
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

  // 口の写真: 0=閉じ, 1=少し開け, 2=大きく開け。半透明で重ねると唇が二重に見えるので、
  // 表示する写真はパッと切り替え（0.07秒だけ重ねる）、短時間で行ったり来たりしないようにする
  let open = 0;
  let frameTarget = 0;
  let frameShown = 0;
  let frameSince = 0;
  let speakEnergy = 0;
  let nextBlink = 1.5 + Math.random() * 3;
  let blinkStart = -1;
  let last = performance.now();
  const start = last;
  let frame = 0;

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = (now - start) / 1000;
    if (!loaded) return;

    // 口パク（開くときは速く、閉じるときは少しゆっくり）
    const v = getVoice()?.getLevel() ?? { level: 0, brightness: 0.5 };
    const target = Math.min(1, Math.max(0, (v.level - 0.03) * 3));
    open += (target - open) * Math.min(1, dt * (target > open ? 22 : 12));
    const wanted = open > 0.62 ? 2 : open > 0.2 ? 1 : 0;
    if (wanted !== frameTarget && t - frameSince > 0.09) {
      frameTarget = wanted;
      frameSince = t;
    }
    const step = dt / 0.07;
    frameShown =
      frameShown < frameTarget
        ? Math.min(frameTarget, frameShown + step)
        : Math.max(frameTarget, frameShown - step);
    speakEnergy += ((v.level > 0.03 ? 1 : 0) - speakEnergy) * Math.min(1, dt * 3);

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
    const nod = speakEnergy * 0.0022 * (0.5 + 0.5 * Math.sin(t * 3.1));
    const headX = Math.sin(t * 0.45) * 0.0015 + Math.sin(t * 1.3) * 0.0007 * speakEnergy;
    const headY = Math.sin(t * 0.6) * 0.001 + nod;

    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uOpenAmt, frameShown / 2);
    gl.uniform1f(uBlinkAmt, blink);
    gl.uniform1f(uZoom, 1.0 + Math.sin(t * 1.5) * 0.002);
    gl.uniform2f(uHead, headX, headY);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  frame = requestAnimationFrame(tick);

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    ro.disconnect();
    textures.forEach((tex) => gl.deleteTexture(tex));
    gl.deleteBuffer(buf);
    gl.deleteProgram(prog);
  };
}
