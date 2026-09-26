/**
 * 音声から口の動き（口の開き・横幅）を作る。外部サービスは使わない。
 * 10ms ごとに、音の大きさと声の響き（フォルマント F1/F2）を調べて「あ・い・う・え・お」の近さを判定し、
 * 母音ごとの口の形を混ぜ合わせる。再生前に音声全体を解析するので、口の動きは音声と同じ時計で進む。
 */

export type Viseme = "a" | "i" | "u" | "e" | "o";
export type VisemeShapes = Record<Viseme, readonly [open: number, width: number]>;

export type MouthTrack = {
  /** 1 コマの長さ（秒、元の音声の時間） */
  hop: number;
  open: Float32Array;
  width: Float32Array;
};

// 日本語の女性の声の母音のフォルマント（Hz）のおおよその値
const FORMANTS: Record<Viseme, [number, number]> = {
  a: [850, 1350],
  i: [330, 2750],
  u: [360, 1600],
  e: [560, 2350],
  o: [520, 950],
};
const VOWELS = Object.keys(FORMANTS) as Viseme[];

const HOP = 0.01;
const WIN = 0.025;
const ORDER = 12;
const BINS = 160;

export function analyzeSpeech(
  samples: Float32Array,
  sampleRate: number,
  shapes: VisemeShapes,
): MouthTrack {
  // 12kHz 前後に間引く（母音の響きは 4kHz 以下で十分わかる）
  const step = Math.max(1, Math.round(sampleRate / 12000));
  const fs = sampleRate / step;
  const n = Math.floor(samples.length / step);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < step; k++) s += samples[i * step + k];
    x[i] = s / step;
  }

  const hop = Math.round(HOP * fs);
  const win = Math.round(WIN * fs);
  const frames = Math.max(0, Math.floor((n - win) / hop) + 1);
  const rms = new Float32Array(frames);
  const f1 = new Float32Array(frames);
  const f2 = new Float32Array(frames);
  const buf = new Float32Array(win);
  const hamming = new Float32Array(win).map(
    (_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (win - 1)),
  );

  for (let f = 0; f < frames; f++) {
    const o = f * hop;
    let e = 0;
    for (let i = 0; i < win; i++) {
      const pre = x[o + i] - (i > 0 ? 0.97 * x[o + i - 1] : 0);
      buf[i] = pre * hamming[i];
      e += x[o + i] * x[o + i];
    }
    rms[f] = Math.sqrt(e / win);
    const [a, b] = formants(buf, fs);
    f1[f] = a;
    f2[f] = b;
  }

  // 音の大きさは、この発話の中での相対値にする
  const sorted = Array.from(rms).sort((p, q) => p - q);
  const loud = sorted[Math.floor(sorted.length * 0.95)] || 1e-6;

  const open = new Float32Array(frames);
  const width = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const level = rms[f] / loud;
    const voiced = smoothstep(0.06, 0.35, level);
    if (voiced <= 0) continue;
    let wsum = 0;
    let o = 0;
    let w = 0;
    if (f1[f] > 0 && f2[f] > 0) {
      for (const v of VOWELS) {
        const d1 = Math.log(f1[f] / FORMANTS[v][0]);
        const d2 = Math.log(f2[f] / FORMANTS[v][1]);
        const s = Math.exp(-(d1 * d1 * 1.6 + d2 * d2) / 0.06);
        wsum += s;
        o += s * shapes[v][0];
        w += s * shapes[v][1];
      }
    }
    if (wsum > 1e-4) {
      o /= wsum;
      w /= wsum;
    } else {
      // 響きがはっきりしない音（子音など）は、控えめに開く
      o = shapes.e[0] * 0.6;
      w = 0;
    }
    const loudness = Math.min(1.15, 0.55 + 0.6 * level);
    open[f] = o * voiced * loudness;
    width[f] = w * voiced;
  }

  // なめらかにする（開くのは速く、閉じるのは少しゆっくり）+ 口は音より少し先に動く
  smooth(open, 0.55, 0.3);
  smooth(width, 0.35, 0.35);
  const lead = 3; // 30ms
  return { hop: HOP, open: shiftEarlier(open, lead), width: shiftEarlier(width, lead) };
}

/** LPC（線形予測）のスペクトル包絡から、第1・第2フォルマントを探す */
function formants(frame: Float32Array, fs: number): [number, number] {
  const r = new Float64Array(ORDER + 1);
  for (let lag = 0; lag <= ORDER; lag++) {
    let s = 0;
    for (let i = lag; i < frame.length; i++) s += frame[i] * frame[i - lag];
    r[lag] = s;
  }
  if (r[0] <= 1e-9) return [0, 0];
  r[0] *= 1.0001;
  // Levinson-Durbin
  const a = new Float64Array(ORDER + 1);
  const tmp = new Float64Array(ORDER + 1);
  a[0] = 1;
  let err = r[0];
  for (let i = 1; i <= ORDER; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / err;
    tmp.set(a);
    for (let j = 1; j < i; j++) a[j] = tmp[j] + k * tmp[i - j];
    a[i] = k;
    err *= 1 - k * k;
    if (err <= 0) return [0, 0];
  }
  // 0〜4kHz の包絡の山を探す
  const maxHz = Math.min(4000, fs / 2);
  const env = new Float64Array(BINS);
  for (let b = 0; b < BINS; b++) {
    const w = (Math.PI * 2 * ((b + 0.5) / BINS) * maxHz) / fs;
    let re = 0;
    let im = 0;
    for (let j = 0; j <= ORDER; j++) {
      re += a[j] * Math.cos(w * j);
      im -= a[j] * Math.sin(w * j);
    }
    env[b] = 1 / (re * re + im * im);
  }
  const hz = (b: number) => ((b + 0.5) / BINS) * maxHz;
  const peaks: number[] = [];
  for (let b = 1; b < BINS - 1; b++) {
    if (env[b] > env[b - 1] && env[b] >= env[b + 1]) peaks.push(hz(b));
  }
  const p1 = peaks.find((h) => h >= 220 && h <= 1100);
  if (p1 === undefined) return [0, 0];
  const p2 = peaks.find((h) => h >= p1 + 250 && h <= 3300);
  return [p1, p2 ?? 0];
}

function smoothstep(a: number, b: number, v: number) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function smooth(v: Float32Array, up: number, down: number) {
  let prev = 0;
  for (let i = 0; i < v.length; i++) {
    const k = v[i] > prev ? up : down;
    prev += (v[i] - prev) * k;
    v[i] = prev;
  }
}

function shiftEarlier(v: Float32Array, n: number) {
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[Math.min(v.length - 1, i + n)];
  return out;
}
