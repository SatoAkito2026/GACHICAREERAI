/**
 * AI面接官アバター（自前実装・外部サービスなし・完全無料）。
 * 写真の顔に「骨組み（網目）」を入れて WebGL で動かす。素材は scripts/avatar/build_rig.py で作る。
 * - 口: 音声から作った口の形（avatar-voice.ts / lipsync.ts）に合わせて網目を動かす。
 *   参考動画から学習した「口を開けたとき・横に広げたときの顔全体の動き方」を使うので、あご・ほっぺ・唇が一緒に動く
 *   開いた唇の間には、口を開けた写真から取った口の中（歯・舌）を貼る
 * - 首の傾き・位置・まばたき・眉: 参考動画の聞いている場面から取り出した動きの数値で動かす
 *   まばたきは写真を重ねず、上まぶたの網目を下まぶたまで下ろして閉じる
 * - 体と背景は動かさない
 */
import { useEffect, useRef } from "react";
import type { AvatarVoice } from "@/lib/avatar-voice";
import type { VisemeShapes } from "@/lib/lipsync";

const ASSETS = {
  rig: "/avatar/rig.json",
  base: "/avatar/base.webp",
  mouth: "/avatar/mouth-inside.webp",
} as const;

/** 縦長の画面で中心に残す位置（写真の幅を 1 とした比率） */
const FOCUS_X = 0.524;

type Rig = {
  size: [number, number];
  fps: number;
  vertices: [number, number][];
  weights: number[];
  openField: [number, number][];
  widthField: [number, number][];
  browField: [number, number][];
  blinkField: [number, number][];
  triangles: [number, number, number][];
  innerLips: number[];
  mouthUv: [number, number][];
  pivot: [number, number];
  visemes: VisemeShapes;
  /** [傾き(度), 拡大率, 横ずれ, 縦ずれ, まばたき 0〜1, 眉] */
  idle: [number, number, number, number, number, number][];
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
in vec2 aBrow;
in vec2 aBlink;
in float aWeight;
in vec2 aTex;
uniform float uOpen;
uniform float uWidth;
uniform float uBrow;
uniform float uBlink;
uniform vec2 uPivot;
uniform float uAng;
uniform float uScale;
uniform vec2 uTrans;
uniform float uAspect; // 写真の幅 / 高さ
uniform vec2 uView;    // 画面の左端に来る写真の x、画面に映る写真の幅
out vec2 vUv;
out vec2 vTex;
void main() {
  vec2 p = aRest + aOpen * uOpen + aWidth * uWidth + aBrow * uBrow + aBlink * uBlink;
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
out vec4 outColor;
void main() {
  outColor = vec4(texture(uBase, vUv).rgb, 1.0);
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
  ])
    .then(([rig, baseImg, mouthImg]) => {
      if (!running) return;
      getVoice()?.setVisemeShapes(rig.visemes);
      const textures = { base: texture(baseImg), mouth: texture(mouthImg) };
      const draw = setupScene(gl, rig, faceProg, mouthProg, bgProg, textures, cleanups);
      onReady();

      let mouthOpen = 0;
      let mouthWidth = 0;
      let last = performance.now();
      const start = last;
      const tick = (now: number) => {
        if (!running) return;
        frame = requestAnimationFrame(tick);
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const t = (now - start) / 1000;
        const voice = getVoice();
        const mouth = voice?.getMouth() ?? { open: 0, width: 0 };
        const k = Math.min(1, dt * 30);
        mouthOpen += (mouth.open - mouthOpen) * k;
        mouthWidth += (mouth.width - mouthWidth) * k;
        draw(canvas.width, canvas.height, t, mouthOpen, mouthWidth);
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
  tex: { base: WebGLTexture; mouth: WebGLTexture },
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
    const rows = ids.map((i, n) => [
      ...rig.vertices[i],
      ...rig.openField[i],
      ...rig.widthField[i],
      ...rig.browField[i],
      ...rig.blinkField[i],
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
    const stride = 13 * 4;
    const attr = (name: string, size: number, offset: number) => {
      const loc = gl.getAttribLocation(prog, name);
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
    };
    attr("aRest", 2, 0);
    attr("aOpen", 2, 2);
    attr("aWidth", 2, 4);
    attr("aBrow", 2, 6);
    attr("aBlink", 2, 8);
    attr("aWeight", 1, 10);
    attr("aTex", 2, 11);
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
      brow: u("uBrow"),
      blink: u("uBlink"),
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
  gl.useProgram(faceProg);
  gl.uniform1i(gl.getUniformLocation(faceProg, "uBase"), 0);
  gl.useProgram(mouthProg);
  gl.uniform1i(gl.getUniformLocation(mouthProg, "uMouth"), 1);
  gl.useProgram(bgProg);
  gl.uniform1i(gl.getUniformLocation(bgProg, "uBase"), 0);
  const uCanvasAspect = gl.getUniformLocation(bgProg, "uCanvasAspect");

  const idle = rig.idle;
  const sample = (t: number) => {
    const f = (((Math.max(0, t) * rig.fps) % idle.length) + idle.length) % idle.length;
    const i = Math.floor(f);
    const k = f - i;
    const a = idle[i];
    const b = idle[(i + 1) % idle.length];
    return a.map((v, n) => v * (1 - k) + b[n] * k);
  };

  return (cw: number, ch: number, t: number, open: number, width: number) => {
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

    if (visible > 1) {
      gl.useProgram(bgProg);
      gl.uniform1f(uCanvasAspect, ca);
      gl.bindVertexArray(bgVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      gl.clearColor(0.91, 0.92, 0.94, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    const [ang, scale, tx, ty, blink, brow] = sample(t);
    // 話している間は、口の開きに合わせてわずかにうなずく
    const nod = open * 0.012;
    const set = (u: ReturnType<typeof uniforms>) => {
      gl.uniform1f(u.open, open);
      gl.uniform1f(u.width, width);
      gl.uniform1f(u.brow, brow);
      gl.uniform1f(u.blink, blink);
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
    gl.bindVertexArray(face.vao);
    gl.drawElements(gl.TRIANGLES, face.count, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  };
}
