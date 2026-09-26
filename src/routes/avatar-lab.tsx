/**
 * アバターの試作確認ページ（リンクはどこにも置かない）。
 * マイクで録音した自分の声を再生し、アバターの口の動きが声に合っているかを確かめる。
 */
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { InterviewerAvatar } from "@/components/InterviewerAvatar";
import { getAvatarVoice } from "@/lib/avatar-voice";

export const Route = createFileRoute("/avatar-lab")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: AvatarLab,
});

function AvatarLab() {
  const voice = getAvatarVoice();
  const [state, setState] = useState<"idle" | "recording" | "playing">("idle");
  const recording = useRef<Float32Array | null>(null);
  const sampleRate = useRef(48000);

  const record = async () => {
    await voice.unlock();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await new Blob(chunks).arrayBuffer());
      recording.current = buf.getChannelData(0).slice();
      sampleRate.current = buf.sampleRate;
      void ctx.close();
      setState("idle");
    };
    recorder.start();
    setState("recording");
    window.setTimeout(() => recorder.stop(), 6000);
  };

  const play = async () => {
    if (!recording.current) return;
    setState("playing");
    await voice.playSamples(recording.current, sampleRate.current, 1);
    setState("idle");
  };

  return (
    <main style={{ minHeight: "100svh", background: "#0F0F0F", color: "#F0F0F0", padding: 16 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>アバター試作（口の動きの確認）</h1>
      <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
        「録音する」を押して6秒しゃべる
        →「再生する」で、アバターがあなたの声に合わせて口を動かします。
      </p>
      <div
        style={{
          marginTop: 12,
          width: "min(100%, 720px)",
          aspectRatio: "16 / 10",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid #333",
        }}
      >
        <InterviewerAvatar voice={voice} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          onClick={record}
          disabled={state !== "idle"}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            background: "#C8FF00",
            color: "#0F0F0F",
            fontWeight: 700,
          }}
        >
          {state === "recording" ? "録音中…（6秒）" : "録音する"}
        </button>
        <button
          onClick={play}
          disabled={state !== "idle" || !recording.current}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            background: "#2A2A2A",
            color: "#F0F0F0",
            border: "1px solid #444",
          }}
        >
          {state === "playing" ? "再生中…" : "再生する"}
        </button>
      </div>
    </main>
  );
}
