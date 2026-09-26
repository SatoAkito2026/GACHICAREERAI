/**
 * AI面接官の音声再生 + 口パク用の音量解析。
 * OpenAI TTS が返す PCM（24kHz / 16bit / mono）を Web Audio で再生し、
 * AnalyserNode から音量と声の明るさを取り出して 3D アバターの口の動きに使う。
 */

// 以前（Simli 利用時）と同じ話速・声の高さに揃える（24kHz を 14.7kHz 扱いで 16kHz 再生していた）
const PLAYBACK_RATE = 16000 / 14700;

export type VoiceLevel = {
  /** 0〜1。口の開き具合の元になる音量 */
  level: number;
  /** 0〜1。高い音ほど大きい（「い・え」は横長、「お・う」は丸い口にするため） */
  brightness: number;
};

export class AvatarVoice {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private current: AudioBufferSourceNode | null = null;
  private timeData: Float32Array<ArrayBuffer> = new Float32Array(1024);
  private freqData: Uint8Array<ArrayBuffer> = new Uint8Array(512);

  private ensure(): { ctx: AudioContext; analyser: AnalyserNode } {
    if (!this.ctx || !this.analyser) {
      const Ctor: typeof AudioContext =
        (typeof AudioContext !== "undefined" && AudioContext) ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.5;
      this.analyser.connect(this.ctx.destination);
      this.timeData = new Float32Array(this.analyser.fftSize);
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    }
    return { ctx: this.ctx, analyser: this.analyser };
  }

  /** ブラウザの自動再生制限を解除する。ユーザー操作（クリック等）の中で呼ぶと確実 */
  async unlock(): Promise<void> {
    const { ctx } = this.ensure();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  }

  /** PCM16 を再生し、再生し終わったら resolve する */
  async playPcm16(pcm: Uint8Array, sampleRate = 24000): Promise<void> {
    const { ctx, analyser } = this.ensure();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});

    const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    const samples = Math.floor(pcm.byteLength / 2);
    if (samples === 0) return;
    const buffer = ctx.createBuffer(1, samples, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples; i++) channel[i] = view.getInt16(i * 2, true) / 32768;

    this.stop();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = PLAYBACK_RATE;
    source.connect(analyser);
    this.current = source;

    return new Promise<void>((resolve) => {
      source.onended = () => {
        if (this.current === source) this.current = null;
        resolve();
      };
      source.start();
    });
  }

  stop(): void {
    const source = this.current;
    this.current = null;
    if (!source) return;
    try {
      source.stop();
    } catch {
      // 再生前・再生済みなら無視
    }
  }

  getLevel(): VoiceLevel {
    const analyser = this.analyser;
    if (!analyser || !this.current) return { level: 0, brightness: 0.5 };

    analyser.getFloatTimeDomainData(this.timeData);
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) sum += this.timeData[i] * this.timeData[i];
    const rms = Math.sqrt(sum / this.timeData.length);

    analyser.getByteFrequencyData(this.freqData);
    let weighted = 0;
    let total = 0;
    // 人の声の帯域（〜4kHz 付近）だけで重心を取る
    const maxBin = Math.min(this.freqData.length, 96);
    for (let i = 2; i < maxBin; i++) {
      weighted += i * this.freqData[i];
      total += this.freqData[i];
    }
    const centroid = total > 0 ? weighted / total / maxBin : 0.5;

    return {
      level: Math.min(1, rms * 4),
      brightness: Math.min(1, Math.max(0, (centroid - 0.15) * 2.5)),
    };
  }

  close(): void {
    this.stop();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analyser = null;
  }
}

let shared: AvatarVoice | null = null;

/** 面接画面で共有するインスタンス。入室ボタンのクリック時に unlock() しておくと iOS でも音が出る */
export function getAvatarVoice(): AvatarVoice {
  shared ??= new AvatarVoice();
  return shared;
}
