/**
 * AI面接官アバター（自前実装・外部サービスなし・完全無料）。
 * 写真の顔に「骨組み（網目）」を入れて WebGL で動かす。素材は scripts/avatar/build_rig.py で作る。
 * - 口: 音声から作った口の形（avatar-voice.ts / lipsync.ts）に合わせて網目を動かす。
 *   参考動画から学習した「口を開けたとき・横に広げたときの顔全体の動き方」を使うので、あご・ほっぺ・唇が一緒に動く
 *   開いた唇の間には、口を開けた写真から取った口の中（歯・舌）を貼る
 * - 首の傾き・位置: 参考動画の聞いている場面から取り出した動きの数値で動かす。話している間は、話している動画の首の動きを重ねる
 * - 表情: 話している動画から学習した「目を細める・口角を上げる・眉を上げる」ときの顔の動き方で網目を動かす。
 *   話している間は少し目を細めてほほえみ、話し始めや強調で眉を上げる。話し終わったあとも少しほほえみを残す
 * - まばたき: 人の動きに合わせて「さっと閉じて、ゆっくり開く」。閉じるときは目のまわりを目を閉じた写真に素早く切り替え、
 *   開くときは写真を戻してから、細めた目（網目）をゆっくり開いていく（写真を重ねたまま開くと目が二重に見えるため）
 * - 体と背景は動かさない
 */
import { useEffect, useRef } from "react";
import type { AvatarVoice } from "@/lib/avatar-voice";
import type { VisemeShapes } from "@/lib/lipsync";

const ASSETS = {
  rig: "/avatar/rig.json",
  base: "/avatar/base.webp",
  mouth: "/avatar/mouth-inside.webp",
  blink: "/avatar/eyes-closed.webp",
} as const;

/** 縦長の画面で中心に残す位置（写真の幅を 1 とした比率） */
const FOCUS_X = 0.524;
// まばたきで目を閉じた写真に切り替える範囲（顔の網目の点番号）
const EYES = [
  [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
  [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249],
];

type Rig = {
  size: [number, number];
  fps: number;
  vertices: [number, number][];
  weights: number[];
  openField: [number, number][];
  widthField: [number, number][];
  triangles: [number, number, number][];
  innerLips: number[];
  mouthUv: [number, number][];
  pivot: [number, number];
  blinkOffset: [number, number];
  visemes: VisemeShapes;
  /** [傾き(度), 拡大率, 横ずれ, 縦ずれ] */
  idle: [number, number, number, number][];
  /** 表情（目の開き具合の比率・口角の高さ・眉の高さ 1 あたりの点の動き） */
  eyeField?: [number, number][];
  smileField?: [number, number][];
  browField?: [number, number][];
  /** 話している間の首の動き */
  talk?: [number, number, number, number][];
  talkFps?: number;
};

type Props = {
  voice: AvatarVoice | null;
  /** 準備ができたら呼ばれる */
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
        background: `#e9ebef url(${ASSETS.base}) center / contain no-repeat`,
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
}

const MESH_VERT = `#version 300 es
in vec2 aRest;
in vec2 aOpen;
in vec2 aWidth;
in vec2 aEye;
in vec2 aSmile;
in vec2 aBrow;
in float aWeight;
in vec2 aTex;
uniform float uOpen;
uniform float uWidth;
uniform float uEye;
uniform float uSmile;
uniform float uBrow;
uniform vec2 uPivot;
uniform float uAng;
uniform float uScale;
uniform vec2 uTrans;
uniform float uAspect; // 写真の幅 / 高さ
uniform vec2 uView;    // 画面の左端に来る写真の x、画面に映る写真の幅
out vec2 vUv;
out vec2 vTex;
void main() {
  vec2 p = aRest + aOpen * uOpen + aWidth * uWidth + aEye * uEye + aSmile * uSmile + aBrow * uBrow;
  // 頭の傾き・拡大・ずれ（網目の点ごとの重みで、首から下はほとんど動かさない）
  vec2 d = (p - uPivot) * vec2(uAspect, 1.0);
  float c = cos(uAng);
  float s = sin(uAng);
  vec2 r = vec2(c * d.x - s * d.y, s * d.x + c * d.y) * uScale / vec2(uAspect, 1.0);
  p = mix(p, uPivot + r + uTrans, aWeight);
  vUv = aRest;
  vTex = aTex;
  gl_Position = vec4((p.x - uView.x) / uView.y * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`;

const FACE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uBase;
uniform sampler2D uBlinkTex;
uniform float uBlink;
uniform vec2 uBlinkOff;
uniform vec4 uEye0;
uniform vec4 uEye1;
out vec4 outColor;
float mask(vec2 p, vec4 e) {
  return 1.0 - smoothstep(0.55, 1.0, length((p - e.xy) / e.zw));
}
void main() {
  vec3 col = texture(uBase, vUv).rgb;
  if (uBlink > 0.0) {
    float m = max(mask(vUv, uEye0), mask(vUv, uEye1));
    col = mix(col, texture(uBlinkTex, vUv + uBlinkOff).rgb, m * uBlink);
  }
  outColor = vec4(col, 1.0);
}`;

const MOUTH_FRAG = `#version 300 es
precision highp float;
in vec2 vTex;
uniform sampler2D uMouth;
out vec4 outColor;
void main() {
  outColor = vec4(texture(uMouth, vTex).rgb * 0.92, 1.0);
}`;

// 写真の左右の余白を、ぼかした写真で埋める
const BG_VERT = `#version 300 es
in vec2 aPos;
out vec2 vPos;
void main() { vPos = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const BG_FRAG = `#version 300 es
precision highp float;
in vec2 vPos;
uniform sampler2D uBase;
uniform float uCanvasAspect;
out vec4 outColor;
void main() {
  vec2 uv = vec2(vPos.x, 0.5 + (0.5 - vPos.y) / uCanvasAspect);
  outColor = vec4(textureLod(uBase, clamp(uv, 0.0, 1.0), 6.5).rgb * 0.92, 1.0);
}`;

function startRenderer(
  canvas: HTMLCanvasElement,
  getVoice: () => AvatarVoice | null,
  onReady: () => void,
): () => void {
  const gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: false });
  // WebGL2 が使えない端末では背景の静止画だけを表示する
  if (!gl) {
    onReady();
    return () => {};
  }

  let running = true;
  let frame = 0;
  const cleanups: (() => void)[] = [];

  const program = (vs: string, fs: string) => {
    const p = gl.createProgram()!;
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vs],
      [gl.FRAGMENT_SHADER, fs],
    ] as const) {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    cleanups.push(() => gl.deleteProgram(p));
    return p;
  };
  const faceProg = program(MESH_VERT, FACE_FRAG);
  const mouthProg = program(MESH_VERT, MOUTH_FRAG);
  const bgProg = program(BG_VERT, BG_FRAG);

  const loadImage = async (url: string) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  };
  const texture = (img: HTMLImageElement) => {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    cleanups.push(() => gl.deleteTexture(tex));
    return tex;
  };

  const resize = () => {
    // スマホは画面が細かい（3倍など）ぶん描く量が増えて重くなるので、1.5倍までにする
    const maxDpr = window.matchMedia("(max-width: 1100px)").matches ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  Promise.all([
    fetch(ASSETS.rig).then((r) => r.json() as Promise<Rig>),
    loadImage(ASSETS.base),
    loadImage(ASSETS.mouth),
    loadImage(ASSETS.blink),
  ])
    .then(([rig, baseImg, mouthImg, blinkImg]) => {
      if (!running) return;
      getVoice()?.setVisemeShapes(rig.visemes);
      const textures = {
        base: texture(baseImg),
        mouth: texture(mouthImg),
        blink: texture(blinkImg),
      };
      const draw = setupScene(gl, rig, faceProg, mouthProg, bgProg, textures, cleanups);
      onReady();

      let mouthOpen = 0;
      let mouthWidth = 0;
      let speaking = 0; // 話している度合い（ゆっくり 0〜1 に近づける）
      let smile = 0; // 話し終わってもしばらく残すほほえみ
      let last = performance.now();
      const start = last;
      // スマホでは、話していない間（まばたき・首の動きだけ）は 30 コマ/秒に落として電池と処理を節約する
      const isSmall = window.matchMedia("(max-width: 1100px)").matches;
      const tick = (now: number) => {
        if (!running) return;
        frame = requestAnimationFrame(tick);
        if (isSmall && speaking < 0.02 && !getVoice()?.isPlaying() && now - last < 30) return;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const t = (now - start) / 1000;
        const voice = getVoice();
        const mouth = voice?.getMouth() ?? { open: 0, width: 0 };
        const k = Math.min(1, dt * 30);
        mouthOpen += (mouth.open - mouthOpen) * k;
        speaking += ((voice?.isPlaying() ? 1 : 0) - speaking) * Math.min(1, dt * 2.5);
        // ほほえみは話している間に強まり、話し終わってからゆっくり（3 秒ほどで）弱まる
        smile += (speaking - smile) * Math.min(1, dt * (speaking > smile ? 2 : 0.35));
        mouthWidth += (mouth.width - mouthWidth) * k;
        draw(canvas.width, canvas.height, t, dt, mouthOpen, mouthWidth, speaking, smile);
      };
      frame = requestAnimationFrame(tick);
    })
    .catch((e) => {
      console.error("Avatar failed to load:", e);
      onReady();
    });

  return () => {
    running = false;
    cancelAnimationFrame(frame);
    ro.disconnect();
    cleanups.forEach((c) => c());
  };
}

function setupScene(
  gl: WebGL2RenderingContext,
  rig: Rig,
  faceProg: WebGLProgram,
  mouthProg: WebGLProgram,
  bgProg: WebGLProgram,
  tex: { base: WebGLTexture; mouth: WebGLTexture; blink: WebGLTexture },
  cleanups: (() => void)[],
) {
  const [W, H] = rig.size;
  const aspect = W / H;

  // 網目の頂点データ（顔・外側）と、口の中（唇の内側の点 + 中心点）の頂点データ
  const vertexData = (
    ids: number[],
    extraCenter: boolean,
    texOf: (n: number) => [number, number],
  ) => {
    const zero: [number, number] = [0, 0];
    const rows = ids.map((i, n) => [
      ...rig.vertices[i],
      ...rig.openField[i],
      ...rig.widthField[i],
      ...(rig.eyeField?.[i] ?? zero),
      ...(rig.smileField?.[i] ?? zero),
      ...(rig.browField?.[i] ?? zero),
      rig.weights[i],
      ...texOf(n),
    ]);
    if (extraCenter) {
      const avg = rows[0].map((_, c) => rows.reduce((s, r) => s + r[c], 0) / rows.length);
      rows.push(avg);
    }
    return new Float32Array(rows.flat());
  };
  const makeVao = (prog: WebGLProgram, data: Float32Array, indices: Uint16Array) => {
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = 15 * 4;
    const attr = (name: string, size: number, offset: number) => {
      const loc = gl.getAttribLocation(prog, name);
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
    };
    attr("aRest", 2, 0);
    attr("aOpen", 2, 2);
    attr("aWidth", 2, 4);
    attr("aEye", 2, 6);
    attr("aSmile", 2, 8);
    attr("aBrow", 2, 10);
    attr("aWeight", 1, 12);
    attr("aTex", 2, 13);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    cleanups.push(() => {
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(vbo);
      gl.deleteBuffer(ibo);
    });
    return { vao, count: indices.length };
  };

  const all = rig.vertices.map((_, i) => i);
  const face = makeVao(
    faceProg,
    vertexData(all, false, (n) => rig.vertices[n]),
    new Uint16Array(rig.triangles.flat()),
  );
  const lips = rig.innerLips;
  const fan: number[] = [];
  for (let n = 0; n < lips.length; n++) fan.push(lips.length, n, (n + 1) % lips.length);
  const mouth = makeVao(
    mouthProg,
    vertexData(lips, true, (n) => rig.mouthUv[n]),
    new Uint16Array(fan),
  );

  const bgVao = gl.createVertexArray()!;
  gl.bindVertexArray(bgVao);
  const bgVbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, bgVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const bgLoc = gl.getAttribLocation(bgProg, "aPos");
  gl.enableVertexAttribArray(bgLoc);
  gl.vertexAttribPointer(bgLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  cleanups.push(() => {
    gl.deleteVertexArray(bgVao);
    gl.deleteBuffer(bgVbo);
  });

  const uniforms = (prog: WebGLProgram) => {
    const u = (n: string) => gl.getUniformLocation(prog, n);
    return {
      open: u("uOpen"),
      width: u("uWidth"),
      eye: u("uEye"),
      smile: u("uSmile"),
      brow: u("uBrow"),
      pivot: u("uPivot"),
      ang: u("uAng"),
      scale: u("uScale"),
      trans: u("uTrans"),
      aspect: u("uAspect"),
      view: u("uView"),
    };
  };
  const faceU = uniforms(faceProg);
  const mouthU = uniforms(mouthProg);
  // まばたきで切り替える目の範囲（目の輪郭を少し広げ、まつげが入るよう上にずらす）
  const eyeRect = (ids: number[]) => {
    const xs = ids.map((i) => rig.vertices[i][0]);
    const ys = ids.map((i) => rig.vertices[i][1]);
    const rx = ((Math.max(...xs) - Math.min(...xs)) / 2) * 1.45;
    const ry = ((Math.max(...ys) - Math.min(...ys)) / 2) * 2.8;
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2 - ry * 0.15;
    return [cx, cy, rx, ry] as const;
  };
  const [eye0, eye1] = EYES.map(eyeRect);
  gl.useProgram(faceProg);
  gl.uniform1i(gl.getUniformLocation(faceProg, "uBase"), 0);
  gl.uniform1i(gl.getUniformLocation(faceProg, "uBlinkTex"), 2);
  gl.uniform2f(gl.getUniformLocation(faceProg, "uBlinkOff"), ...rig.blinkOffset);
  gl.uniform4f(gl.getUniformLocation(faceProg, "uEye0"), ...eye0);
  gl.uniform4f(gl.getUniformLocation(faceProg, "uEye1"), ...eye1);
  const uBlink = gl.getUniformLocation(faceProg, "uBlink");
  gl.useProgram(mouthProg);
  gl.uniform1i(gl.getUniformLocation(mouthProg, "uMouth"), 1);
  gl.useProgram(bgProg);
  gl.uniform1i(gl.getUniformLocation(bgProg, "uBase"), 0);
  const uCanvasAspect = gl.getUniformLocation(bgProg, "uCanvasAspect");

  const sampleCurve = (curve: number[][], fps: number, t: number) => {
    const f = (((Math.max(0, t) * fps) % curve.length) + curve.length) % curve.length;
    const i = Math.floor(f);
    const k = f - i;
    const a = curve[i];
    const b = curve[(i + 1) % curve.length];
    return a.map((v, n) => v * (1 - k) + b[n] * k);
  };
  const talk = rig.talk;
  const talkFps = rig.talkFps ?? 25;
  const hasExpressions = !!(rig.eyeField && rig.smileField && rig.browField);
  const ease = (v: number) => v * v * (3 - 2 * v);

  // まばたき: 人の動き（話している動画で測ったもの）に合わせて、さっと閉じて少し止まり、ゆっくり開く。
  // 話している間は 2〜4 秒おき、黙っている間は 3〜6 秒おき
  const CLOSE = 0.06;
  const HOLD = 0.1;
  const SWAP_BACK = 0.04;
  const REOPEN = hasExpressions ? 0.26 : 0;
  const REOPEN_FROM = -0.2; // 写真を戻した直後の目の開き具合（網目で細めた目から開いていく）
  let nextBlink = 1.5 + Math.random() * 2;
  let blinkStart = -1;
  const blinkAt = (t: number, speaking: number) => {
    if (blinkStart < 0 && t > nextBlink) blinkStart = t;
    if (blinkStart < 0) return { photo: 0, eye: 0 };
    const p = t - blinkStart;
    if (p < CLOSE)
      return { photo: ease(p / CLOSE), eye: REOPEN ? REOPEN_FROM * ease(p / CLOSE) : 0 };
    if (p < CLOSE + HOLD) return { photo: 1, eye: REOPEN ? REOPEN_FROM : 0 };
    const q = p - CLOSE - HOLD;
    if (q < SWAP_BACK) return { photo: 1 - ease(q / SWAP_BACK), eye: REOPEN ? REOPEN_FROM : 0 };
    const r = q - SWAP_BACK;
    if (r < REOPEN) return { photo: 0, eye: REOPEN_FROM * (1 - r / REOPEN) ** 2 };
    blinkStart = -1;
    nextBlink = t + (speaking > 0.5 ? 2 + Math.random() * 2 : 3 + Math.random() * 3);
    return { photo: 0, eye: 0 };
  };

  // 眉: 話し始めと、ときどき強調するところで少し上げる
  let brow = 0;
  let browTarget = 0;
  let browUntil = 0;
  let nextBrow = 0;
  let wasSpeaking = false;

  return (
    cw: number,
    ch: number,
    t: number,
    dt: number,
    open: number,
    width: number,
    speaking: number,
    smile: number,
  ) => {
    gl.viewport(0, 0, cw, ch);
    const ca = cw / ch;
    // 写真の高さを画面に合わせる。横長なら左右に余白、縦長なら顔を中心に左右を切る
    const visible = ca / aspect;
    const left =
      visible >= 1 ? 0.5 - visible / 2 : Math.min(Math.max(FOCUS_X - visible / 2, 0), 1 - visible);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex.base);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tex.mouth);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, tex.blink);

    if (visible > 1) {
      gl.useProgram(bgProg);
      gl.uniform1f(uCanvasAspect, ca);
      gl.bindVertexArray(bgVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      gl.clearColor(0.91, 0.92, 0.94, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    let [ang, scale, tx, ty] = sampleCurve(rig.idle, rig.fps, t);
    if (talk && speaking > 0.001) {
      // 話している間の首の動き（話している動画のものを、少し控えめにして重ねる）
      const [ta, ts, tx2, ty2] = sampleCurve(talk, talkFps, t);
      ang += ta * 0.7 * speaking;
      scale += (ts - 1) * speaking;
      tx += tx2 * 0.5 * speaking;
      ty += ty2 * 0.5 * speaking;
    }
    // 話している間は、ゆっくり小さくうなずく（音節ごとに動かすと顔が小刻みに揺れて見えるため）
    const nod = speaking * 0.0012 * (0.5 + 0.5 * Math.sin(t * 2.4));

    const speakingNow = speaking > 0.5;
    if (speakingNow && !wasSpeaking) {
      browTarget = 0.012;
      browUntil = t + 0.7;
      nextBrow = t + 2 + Math.random() * 2;
    } else if (speakingNow && t > nextBrow && open > 0.12) {
      // 大きく口を開けたところ（強調）で、たまに眉を上げる
      browTarget = 0.007 + Math.random() * 0.005;
      browUntil = t + 0.5;
      nextBrow = t + 2.5 + Math.random() * 2.5;
    }
    wasSpeaking = speakingNow;
    if (t > browUntil) browTarget = 0;
    brow += (browTarget - brow) * Math.min(1, dt * (browTarget > brow ? 9 : 3));

    const blink = blinkAt(t, speaking);
    // 話している間は笑顔で頬が上がって目が少し細くなる（動画では目の開きが 0.39 → 0.28 ほど）
    const eye = -0.08 * Math.max(speaking, smile * 0.6) + blink.eye;
    const smileAmount = 0.003 + 0.011 * smile;

    const set = (u: ReturnType<typeof uniforms>) => {
      gl.uniform1f(u.open, open);
      gl.uniform1f(u.width, width);
      gl.uniform1f(u.eye, eye);
      gl.uniform1f(u.smile, smileAmount);
      gl.uniform1f(u.brow, brow);
      gl.uniform2f(u.pivot, ...rig.pivot);
      gl.uniform1f(u.ang, (ang * Math.PI) / 180);
      gl.uniform1f(u.scale, scale);
      gl.uniform2f(u.trans, tx, ty + nod);
      gl.uniform1f(u.aspect, aspect);
      gl.uniform2f(u.view, left, visible);
    };

    // 口の中 → 顔の網目（顔の網目は唇の間が穴になっているので、開くと口の中が見える）
    gl.useProgram(mouthProg);
    set(mouthU);
    gl.bindVertexArray(mouth.vao);
    gl.drawElements(gl.TRIANGLES, mouth.count, gl.UNSIGNED_SHORT, 0);

    gl.useProgram(faceProg);
    set(faceU);
    gl.uniform1f(uBlink, blink.photo);
    gl.bindVertexArray(face.vao);
    gl.drawElements(gl.TRIANGLES, face.count, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  };
}
