/**
 * 練習中の「話し方・態度」を測る（ブラウザだけで動く。音や映像はどこにも送らず、数字だけを結果に残す）
 * - 間：AIが話し終えてから答え始めるまでの秒数／答えの途中の長い沈黙の回数
 * - 声の波：答えている間の声の大きさの移り変わり（抑揚の大きさ・グラフ用）
 * - 目線：カメラの映像から顔の向きと黒目の位置を見て、画面の方を見て話せている割合
 */

export type DeliveryStats = {
  /** 答え始めるまでの間（秒、平均） */
  avgLatencySec: number | null;
  /** 答えの途中の1秒以上の沈黙 */
  midPauses: number;
  /** 答えの途中の3秒以上の沈黙 */
  longPauses: number;
  /** 声の強弱のばらつき（0〜100。大きいほど抑揚がある） */
  intonation: number | null;
  /** 声の波（0〜100 の数字を最大120個。グラフ用） */
  wave: number[];
  /** 画面の方を見て話せた割合（0〜100。カメラなしは null） */
  gazePercent: number | null;
};

const VOICE_THRESHOLD = 30;
const WAVE_POINTS = 120;

type FaceLandmarker = {
  detectForVideo: (
    video: HTMLVideoElement,
    ts: number,
  ) => { faceLandmarks?: { x: number; y: number; z: number }[][] };
  close: () => void;
};

const MP_VERSION = "0.10.14";
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export class DeliveryTracker {
  private latencies: number[] = [];
  private aiEndedAt: number | null = null;
  private midPauses = 0;
  private longPauses = 0;
  private volumes: number[] = [];
  private waveRaw: number[] = [];
  private silentSince: number | null = null;
  private voicedInAnswer = 0;
  private gazeSamples = 0;
  private gazeOn = 0;
  private gazeTimer: ReturnType<typeof setInterval> | null = null;
  private landmarker: FaceLandmarker | null = null;

  /** AIが話し終えたとき */
  aiEnded() {
    this.aiEndedAt = performance.now();
  }

  /** 回答の受付を始めた／終えたとき */
  answerStarted() {
    this.silentSince = null;
    this.voicedInAnswer = 0;
  }
  answerEnded() {
    this.silentSince = null;
  }

  /** この回答で、声が出ていた長さ（ミリ秒） */
  get answerVoicedMs() {
    return this.voicedInAnswer * 100;
  }

  /** いまの沈黙の長さ（ミリ秒。声が出ていれば 0） */
  get silentMs() {
    return this.silentSince == null ? 0 : performance.now() - this.silentSince;
  }

  /** 0.1秒ごとに、マイクの音量（0〜255の平均）を渡す */
  sample(level: number, listening: boolean) {
    const now = performance.now();
    const voiced = level > VOICE_THRESHOLD;
    if (voiced && this.aiEndedAt != null) {
      const ms = now - this.aiEndedAt;
      // AIの声を拾った・席を外していた等の極端な値は数えない
      if (ms > 150 && ms < 20000) this.latencies.push(ms);
      this.aiEndedAt = null;
    }
    if (!listening) return;
    this.waveRaw.push(Math.min(255, level));
    if (voiced) {
      if (this.silentSince != null && this.voicedInAnswer > 0) {
        const gap = now - this.silentSince;
        if (gap >= 1000) this.midPauses++;
        if (gap >= 3000) this.longPauses++;
      }
      this.silentSince = null;
      this.voicedInAnswer++;
      this.volumes.push(level);
    } else if (this.silentSince == null) {
      this.silentSince = now;
    }
  }

  /** カメラの映像で目線を測り始める（読み込めない端末では何もしない） */
  async startGaze(video: HTMLVideoElement, isActive: () => boolean) {
    if (this.gazeTimer || typeof window === "undefined") return;
    try {
      const mp = (await import(/* @vite-ignore */ `${MP_BASE}/vision_bundle.mjs`)) as {
        FilesetResolver: { forVisionTasks: (url: string) => Promise<unknown> };
        FaceLandmarker: {
          createFromOptions: (fs: unknown, opts: unknown) => Promise<FaceLandmarker>;
        };
      };
      const fileset = await mp.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      this.landmarker = await mp.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
      });
    } catch (e) {
      console.warn("[delivery] 目線の計測を使えません", e);
      return;
    }
    this.gazeTimer = setInterval(() => {
      if (!this.landmarker || !isActive() || video.readyState < 2 || video.videoWidth === 0) return;
      try {
        const r = this.landmarker.detectForVideo(video, performance.now());
        const lm = r.faceLandmarks?.[0];
        this.gazeSamples++;
        if (lm && lm.length >= 478 && lookingAtScreen(lm)) this.gazeOn++;
      } catch {
        // 1回失敗しても続ける
      }
    }, 500);
  }

  stop() {
    if (this.gazeTimer) clearInterval(this.gazeTimer);
    this.gazeTimer = null;
    try {
      this.landmarker?.close();
    } catch {
      // 閉じられなくても問題ない
    }
    this.landmarker = null;
  }

  summary(): DeliveryStats {
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    let intonation: number | null = null;
    if (this.volumes.length >= 30) {
      const m = avg(this.volumes);
      const sd = Math.sqrt(avg(this.volumes.map((v) => (v - m) ** 2)));
      // ばらつき（変動係数）を 0〜100 に。0.5 で 100 とする
      intonation = Math.round(Math.min(100, (sd / m / 0.5) * 100));
    }
    // 声の波：区間ごとの最大値を 0〜100 に
    const wave: number[] = [];
    const raw = this.waveRaw;
    if (raw.length > 0) {
      const n = Math.min(WAVE_POINTS, raw.length);
      const peak = Math.max(...raw, 1);
      for (let i = 0; i < n; i++) {
        const seg = raw.slice(
          Math.floor((i * raw.length) / n),
          Math.floor(((i + 1) * raw.length) / n),
        );
        wave.push(Math.round((Math.max(...seg, 0) / peak) * 100));
      }
    }
    return {
      avgLatencySec: this.latencies.length
        ? Math.round((avg(this.latencies) / 1000) * 10) / 10
        : null,
      midPauses: this.midPauses,
      longPauses: this.longPauses,
      intonation,
      wave,
      gazePercent:
        this.gazeSamples >= 10 ? Math.round((this.gazeOn / this.gazeSamples) * 100) : null,
    };
  }
}

/** 顔が正面を向き、黒目が目の真ん中あたりにあれば「画面の方を見ている」とする */
function lookingAtScreen(lm: { x: number; y: number }[]): boolean {
  const ratio = (p: number, a: number, b: number) =>
    (lm[p].x - lm[a].x) / (lm[b].x - lm[a].x || 1e-6);
  // 顔の左右の向き：鼻先が両ほおの間のどこにあるか（0.5 が正面）
  const yaw = ratio(1, 234, 454);
  // 顔の上下の向き：鼻先が額とあごの間のどこにあるか
  const pitch = (lm[1].y - lm[10].y) / (lm[152].y - lm[10].y || 1e-6);
  // 黒目の位置：目頭と目尻の間のどこにあるか（左右の目の平均）
  const iris = (ratio(468, 33, 133) + ratio(473, 362, 263)) / 2;
  return yaw > 0.33 && yaw < 0.67 && pitch > 0.3 && pitch < 0.75 && iris > 0.3 && iris < 0.7;
}

/** 結果の画面に出すひとこと */
export function deliveryAdvice(d: DeliveryStats): string[] {
  const tips: string[] = [];
  if (d.avgLatencySec != null) {
    if (d.avgLatencySec > 5)
      tips.push("答え始めるまでに時間がかかっています。「はい、」と受けてから考えると自然です。");
    else if (d.avgLatencySec < 0.6)
      tips.push("答え始めが早すぎるかもしれません。質問を聞き終えて一呼吸おきましょう。");
  }
  if (d.longPauses >= 3)
    tips.push(
      "答えの途中で長く止まることがありました。結論→理由→例の順で話すと止まりにくくなります。",
    );
  if (d.intonation != null && d.intonation < 25)
    tips.push("声の強弱が小さく、単調に聞こえやすいです。大事な言葉だけ少し強く言ってみましょう。");
  if (d.gazePercent != null && d.gazePercent < 60)
    tips.push(
      "目線が外れている時間が長めです。カメラ（画面）を見て話すと、自信があるように見えます。",
    );
  return tips;
}

/** サーバー側：送られてきた数字を確かめて、おかしな値は捨てる */
export function sanitizeDelivery(raw: unknown): DeliveryStats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : null;
  const wave = Array.isArray(r.wave)
    ? r.wave
        .slice(0, WAVE_POINTS)
        .map((v) => num(v, 100))
        .filter((v): v is number => v !== null)
        .map(Math.round)
    : [];
  return {
    avgLatencySec: num(r.avgLatencySec, 60),
    midPauses: Math.round(num(r.midPauses, 999) ?? 0),
    longPauses: Math.round(num(r.longPauses, 999) ?? 0),
    intonation: num(r.intonation, 100),
    wave,
    gazePercent: num(r.gazePercent, 100),
  };
}
