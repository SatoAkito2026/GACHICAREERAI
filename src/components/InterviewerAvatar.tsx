/**
 * AI面接官アバター（写真を WebGL で動かす）。外部サービスは使わない。
 * - 口パク: AvatarVoice の音量に合わせて、写真の唇の間を開き、あごを下げる
 * - まばたき・呼吸・首の小さな揺れ・話している間の軽いうなずき
 *
 * 写真を差し替えるときは public/avatar/ に置き、FACE の座標（写真内の目・口・あごの位置）を合わせる。
 */
import { useEffect, useRef } from "react";
import type { AvatarVoice } from "@/lib/avatar-voice";

const PHOTO_URL = "/avatar/interviewer.webp";

/** 写真内の顔パーツの位置（写真の幅・高さを 1 とした比率。y は上から） */
const FACE = {
  focus: [0.527, 0.43], // 画面が狭いときに中心に残す位置
  eyes: [
    [0.4466, 0.362, 0.04, 0.0128], // 左目 [中心x, 中心y, 半幅, 半高さ]
    [0.614, 0.362, 0.0375, 0.0128], // 右目
  ],
  mouth: [0.527, 0.5287, 0.0654], // 唇の合わせ目 [中心x, y, 半幅]
  chinY: 0.644,
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
        background: `#eef0f2 url(${PHOTO_URL}) 52.7% 40% / cover no-repeat`,
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
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uFocus;
uniform vec4 uEye0;
uniform vec4 uEye1;
uniform vec3 uMouth;
uniform float uChin;
uniform float uOpen;
uniform float uWide;
uniform float uBlink;
uniform float uZoom;
uniform vec2 uHead;
out vec4 outColor;

vec3 tex(vec2 p) { return texture(uTex, clamp(p, 0.001, 0.999)).rgb; }

// まぶたを閉じる（目の楕円の上側から、目の上の肌で覆う）
vec3 eyelid(vec3 col, vec2 p, vec4 e) {
  vec2 q = (p - e.xy) / e.zw;
  float inside = 1.0 - smoothstep(0.85, 1.15, length(q * vec2(1.0, 0.8)));
  float lid = -1.2 + 2.4 * uBlink;
  float cover = inside * (1.0 - smoothstep(lid - 0.15, lid + 0.15, q.y));
  // まつげの無い目の下の肌を横方向にぼかして、まぶたの色にする
  vec2 sp = vec2(p.x, e.y + e.w * 3.4);
  vec3 skin = vec3(0.0);
  for (int i = -3; i <= 3; i++) skin += tex(sp + vec2(float(i) * e.z * 0.12, 0.0));
  skin = skin / 7.0 * 0.94;
  float lash = inside * (1.0 - smoothstep(0.0, 0.35, abs(q.y - lid))) * step(0.05, uBlink);
  col = mix(col, skin, cover);
  return mix(col, col * 0.35, lash * 0.8);
}

void main() {
  vec2 frag = gl_FragCoord.xy / uRes;
  frag.y = 1.0 - frag.y;
  float ca = uRes.x / uRes.y;
  vec2 view = ca > 1.0 ? vec2(1.0, 1.0 / ca) : vec2(ca, 1.0);
  vec2 origin = clamp(uFocus - view * 0.5, vec2(0.0), vec2(1.0) - view);
  vec2 p = origin + frag * view;
  p = uFocus + (p - uFocus) / uZoom;

  // 頭だけ動かす（あごより下の体は動かさない）
  float headW = 1.0 - smoothstep(uChin, uChin + 0.12, p.y);
  vec2 s = p - uHead * headW;

  // ---- 口 ----
  float mw = uMouth.z * (1.0 + 0.2 * (uWide - 0.5));
  float dx = (s.x - uMouth.x) / mw;
  float prof = pow(max(0.0, 1.0 - dx * dx), 1.1);
  float jawProf = pow(max(0.0, 1.0 - dx * dx / 4.0), 1.5);
  float gapMax = uOpen * 0.026;
  float gap = gapMax * prof;
  float up = gap * 0.3;
  float dn = gap * 0.7;
  float y = s.y - uMouth.y;

  vec2 src = s;
  if (y < 0.0) {
    // 上唇を少し持ち上げる
    float f = 1.0 - smoothstep(0.0, 0.045, -y - up);
    src.y += up * f;
  } else {
    // 下唇とあごを下げる（唇のすぐ下は口の形、下に行くほどあご全体の形）
    float t = smoothstep(0.0, 0.04, y - dn);
    float d = mix(dn, gapMax * 0.7 * jawProf, t);
    float f = 1.0 - smoothstep(uChin - uMouth.y, uChin - uMouth.y + 0.08, y);
    src.y -= d * f;
  }
  vec3 col = tex(src);

  // 口の中（開いた隙間）。縁はぼかして唇になじませる
  float edge = max(0.0012, gap * 0.18);
  float band = smoothstep(-edge, edge * 0.6, y + up) * (1.0 - smoothstep(-edge * 0.6, edge, y - dn));
  float inMouth = band * smoothstep(0.0008, 0.004, gap) * smoothstep(0.0, 0.25, prof);
  if (inMouth > 0.0) {
    float t = clamp((y + up) / max(gap, 1e-4), 0.0, 1.0);
    // 奥ほど暗く、下側に少し舌の赤み
    vec3 dark = mix(vec3(0.13, 0.03, 0.04), vec3(0.36, 0.11, 0.12), smoothstep(0.45, 1.0, t));
    float teeth = (1.0 - smoothstep(0.12, 0.3, t)) * smoothstep(0.45, 0.8, prof) * smoothstep(0.006, 0.016, gap);
    vec3 inner = mix(dark, vec3(0.82, 0.78, 0.74), teeth * 0.85);
    inner *= 0.55 + 0.45 * prof;
    col = mix(col, inner, inMouth);
  }

  if (uBlink > 0.0) {
    col = eyelid(col, s, uEye0);
    col = eyelid(col, s, uEye1);
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
  gl.uniform2f(u("uFocus"), FACE.focus[0], FACE.focus[1]);
  gl.uniform4f(u("uEye0"), ...FACE.eyes[0]);
  gl.uniform4f(u("uEye1"), ...FACE.eyes[1]);
  gl.uniform3f(u("uMouth"), ...FACE.mouth);
  gl.uniform1f(u("uChin"), FACE.chinY);
  const uRes = u("uRes");
  const uOpen = u("uOpen");
  const uWide = u("uWide");
  const uBlink = u("uBlink");
  const uZoom = u("uZoom");
  const uHead = u("uHead");

  const texture = gl.createTexture();
  let loaded = false;
  let disposed = false;
  const img = new Image();
  img.decoding = "async";
  img.src = PHOTO_URL;
  img
    .decode()
    .then(() => {
      if (disposed) return;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      loaded = true;
      onReady();
    })
    .catch((e) => {
      console.error("Avatar photo failed to load:", e);
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

  let open = 0;
  let wide = 0.5;
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
    open += (target - open) * Math.min(1, dt * (target > open ? 26 : 13));
    wide += (v.brightness - wide) * Math.min(1, dt * 8);
    speakEnergy += ((v.level > 0.03 ? 1 : 0) - speakEnergy) * Math.min(1, dt * 3);

    // まばたき
    if (blinkStart < 0 && t > nextBlink) blinkStart = t;
    let blink = 0;
    if (blinkStart >= 0) {
      const p = (t - blinkStart) / 0.16;
      if (p >= 1) {
        blinkStart = -1;
        nextBlink = t + 2.5 + Math.random() * 3.5;
      } else {
        blink = 1 - Math.abs(1 - p * 2);
      }
    }

    // 呼吸・首の揺れ・話している間のうなずき（単位は写真サイズ比）
    const nod = speakEnergy * 0.0025 * (0.5 + 0.5 * Math.sin(t * 3.1));
    const headX = Math.sin(t * 0.45) * 0.0018 + Math.sin(t * 1.3) * 0.0008 * speakEnergy;
    const headY = Math.sin(t * 0.6) * 0.0012 + nod;

    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uOpen, open);
    gl.uniform1f(uWide, wide);
    gl.uniform1f(uBlink, blink);
    gl.uniform1f(uZoom, 1.0 + Math.sin(t * 1.5) * 0.003);
    gl.uniform2f(uHead, headX, headY);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  frame = requestAnimationFrame(tick);

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    ro.disconnect();
    gl.deleteTexture(texture);
    gl.deleteBuffer(buf);
    gl.deleteProgram(prog);
  };
}
