/**
 * AI面接官の音声再生 + 口の動き。
 * OpenAI TTS が返す PCM（24kHz / 16bit / mono）を Web Audio で再生する。
 * 再生前に音声全体を解析して口の動き（lipsync.ts）を作り、再生中の位置に合わせて返す。
 */
import { analyzeSpeech, type MouthTrack, type VisemeShapes } from "@/lib/lipsync";

// 以前（Simli 利用時）と同じ話速・声の高さに揃える（24kHz を 14.7kHz 扱いで 16kHz 再生していた）
const PLAYBACK_RATE = 16000 / 14700;

export type MouthPose = {
  /** 口の開き（参考動画で測った比率。0 = 閉じている） */
  open: number;
  /** 口の横幅の変化（+ で横に広がる、- ですぼまる） */
  width: number;
};

const CLOSED: MouthPose = { open: 0, width: 0 };

export class AvatarVoice {
  private ctx: AudioContext | null = null;
  private current: AudioBufferSourceNode | null = null;
  private track: MouthTrack | null = null;
  private startedAt = 0;
  private rate = PLAYBACK_RATE;
  private shapes: VisemeShapes | null = null;
  private playing: { data: Float32Array; sampleRate: number } | null = null;

  private ensure(): AudioContext {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        (typeof AudioContext !== "undefined" && AudioContext) ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  /**
   * 音声の再生に使っている AudioContext。入室ボタンのクリックで unlock() 済みなので、
   * スマホ（特に iPhone）でもマイクの音量の検出にそのまま使える
   */
  context(): AudioContext {
    const ctx = this.ensure();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  }

  /** アバターの母音ごとの口の形。アバターの準備ができたら設定される */
  setVisemeShapes(shapes: VisemeShapes): void {
    this.shapes = shapes;
    // アバターより先に音声が届いて再生中なら、ここで口の動きを作る
    if (this.playing && !this.track) {
      this.track = analyzeSpeech(this.playing.data, this.playing.sampleRate, shapes);
    }
  }

  /** ブラウザの自動再生制限を解除する。ユーザー操作（クリック等）の中で呼ぶと確実 */
  async unlock(): Promise<void> {
    const ctx = this.ensure();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  }

  /** PCM16 を再生し、再生し終わったら resolve する */
  async playPcm16(pcm: Uint8Array, sampleRate = 24000, rate = PLAYBACK_RATE): Promise<void> {
    const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    const samples = Math.floor(pcm.byteLength / 2);
    const data = new Float32Array(samples);
    for (let i = 0; i < samples; i++) data[i] = view.getInt16(i * 2, true) / 32768;
    return this.playSamples(data, sampleRate, rate);
  }

  /** -1〜1 の音声データを再生し、再生し終わったら resolve する */
  async playSamples(data: Float32Array, sampleRate: number, rate = 1): Promise<void> {
    const ctx = this.ensure();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    if (data.length === 0) return;

    const buffer = ctx.createBuffer(1, data.length, sampleRate);
    buffer.getChannelData(0).set(data);
    const track = this.shapes ? analyzeSpeech(data, sampleRate, this.shapes) : null;

    this.stop();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(ctx.destination);
    this.current = source;
    this.track = track;
    this.playing = { data, sampleRate };
    this.rate = rate;

    return new Promise<void>((resolve) => {
      source.onended = () => {
        if (this.current === source) {
          this.current = null;
          this.track = null;
          this.playing = null;
        }
        resolve();
      };
      this.startedAt = ctx.currentTime;
      source.start();
    });
  }

  stop(): void {
    const source = this.current;
    this.current = null;
    this.track = null;
    this.playing = null;
    if (!source) return;
    try {
      source.stop();
    } catch {
      // 再生前・再生済みなら無視
    }
  }

  /** 音声を再生中かどうか */
  isPlaying(): boolean {
    return this.current !== null;
  }

  /** いま再生している位置の口の形 */
  getMouth(): MouthPose {
    const track = this.track;
    if (!track || !this.ctx || !this.current) return CLOSED;
    const t = (this.ctx.currentTime - this.startedAt) * this.rate;
    const f = t / track.hop;
    const i = Math.floor(f);
    if (i < 0 || i >= track.open.length - 1) return CLOSED;
    const k = f - i;
    return {
      open: track.open[i] * (1 - k) + track.open[i + 1] * k,
      width: track.width[i] * (1 - k) + track.width[i + 1] * k,
    };
  }

  close(): void {
    this.stop();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

let shared: AvatarVoice | null = null;

/** 面接画面で共有するインスタンス。入室ボタンのクリック時に unlock() しておくと iOS でも音が出る */
export function getAvatarVoice(): AvatarVoice {
  shared ??= new AvatarVoice();
  return shared;
}
