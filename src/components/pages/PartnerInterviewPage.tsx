/**
 * 提携先（POSPOS）のお店の AI 一次面接：応募者が開く画面。会員登録・ログインなしで受けられる。
 * 準備（カメラ・マイクの確認と録画への同意）→ 面接 → 終わりの画面。
 * ガチキャリAI の練習・評価とは別物：応募者には評価・点数・改善点を一切見せず、ガチキャリAI の案内・宣伝も出さない。
 * 録画（はじめの60秒）と顔の写真3枚（はじめ・まん中・おわり）は必ず撮り、Storage へ直接送る。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { InterviewerAvatar } from "@/components/InterviewerAvatar";
import { getAvatarVoice } from "@/lib/avatar-voice";
import { supabase } from "@/integrations/supabase/client";
import { useCompactLayout } from "@/hooks/use-compact-layout";

const BUCKET = "partner-interviews";
const VIDEO_SECONDS = 60;
/** まん中の写真を撮る時刻（秒）。それより早く終わったときは、終わりに撮る */
const MIDDLE_PHOTO_AT = 240;

const C = {
  bg: "#F6F7F9",
  card: "#FFFFFF",
  text: "#1A1D21",
  sub: "#5B6470",
  border: "#E2E5EA",
  accent: "#2563EB",
  warn: "#B42318",
  warnBg: "#FEF3F2",
};

type Session = { available: true; storeName: string; jobLabel: string } | { available: false };

async function api<T>(body: Record<string, unknown>, timeoutMs = 45000): Promise<T> {
  const res = await fetch("/api/partner-interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return (await res.json()) as T;
}

function pickMime(kind: "audio" | "video"): string {
  if (typeof MediaRecorder === "undefined") return "";
  const list =
    kind === "audio"
      ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"]
      : ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  for (const t of list) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      // 調べられないブラウザは次へ
    }
  }
  return "";
}

export function PartnerInterviewPage({ token }: { token: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<"prep" | "live" | "done">("prep");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [greeting, setGreeting] = useState<{ aiText: string; audioBase64: string | null } | null>(
    null,
  );

  useEffect(() => {
    api<Session>({ action: "session", token })
      .then(setSession)
      .catch(() => setSession({ available: false }));
  }, [token]);

  if (!session) return <Center>読み込んでいます…</Center>;
  if (!session.available)
    return <Center>この面接の URL は使えません。お店にお問い合わせください。</Center>;
  if (phase === "done")
    return (
      <Center>
        面接は以上です。おつかれさまでした。
        <br />
        お店の担当者からの連絡をお待ちください。
      </Center>
    );
  if (phase === "live" && stream && greeting)
    return (
      <LiveScreen
        token={token}
        storeName={session.storeName}
        stream={stream}
        greeting={greeting}
        onEnd={() => setPhase("done")}
        onUnavailable={() => setSession({ available: false })}
      />
    );
  return (
    <PrepScreen
      token={token}
      storeName={session.storeName}
      jobLabel={session.jobLabel}
      onStart={(s, g) => {
        setStream(s);
        setGreeting(g);
        setPhase("live");
      }}
      onUnavailable={() => setSession({ available: false })}
    />
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="flex min-h-[100svh] items-center justify-center px-6 text-center"
      style={{ background: C.bg, color: C.text }}
    >
      <p className="text-[17px] leading-relaxed" style={{ fontWeight: 700 }}>
        {children}
      </p>
    </main>
  );
}

function Header({ storeName }: { storeName: string }) {
  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3">
      <p className="truncate text-[16px]" style={{ fontWeight: 800 }}>
        {storeName}
      </p>
      <span className="shrink-0 text-[11px]" style={{ color: C.sub }}>
        AI面接：ガチキャリAI
      </span>
    </header>
  );
}

function PrepScreen({
  token,
  storeName,
  jobLabel,
  onStart,
  onUnavailable,
}: {
  token: string;
  storeName: string;
  jobLabel: string;
  onStart: (stream: MediaStream, greeting: { aiText: string; audioBase64: string | null }) => void;
  onUnavailable: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<"checking" | "ok" | "error">("checking");
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      setCamera("error");
      return;
    }
    let cancelled = false;
    media
      .getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        // カメラかマイクのどちらかがなければ受けられない
        if (!s.getVideoTracks().length || !s.getAudioTracks().length) {
          s.getTracks().forEach((t) => t.stop());
          setCamera("error");
          return;
        }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setCamera("ok");
      })
      .catch(() => setCamera("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  const start = async () => {
    if (!streamRef.current || !agreed || starting) return;
    setStarting(true);
    setError("");
    // スマホで声を出せるよう、ボタンを押した中で音声の再生を許可しておく
    await getAvatarVoice().unlock();
    try {
      const r = await api<{ available: boolean; aiText?: string; audioBase64?: string | null }>({
        action: "start",
        token,
        consent: true,
      });
      if (!r.available || !r.aiText) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        onUnavailable();
        return;
      }
      onStart(streamRef.current, { aiText: r.aiText, audioBase64: r.audioBase64 ?? null });
    } catch {
      setError("通信がうまくいきませんでした。もう一度押してください。");
      setStarting(false);
    }
  };

  if (camera === "error")
    return (
      <Center>
        カメラを使えるようにしてから、もう一度開いてください。
        <br />
        <span className="text-[13px]" style={{ color: C.sub, fontWeight: 500 }}>
          （ブラウザの設定で、このページのカメラとマイクを「許可」にしてください）
        </span>
      </Center>
    );

  return (
    <main className="min-h-[100svh] pb-10" style={{ background: C.bg, color: C.text }}>
      <Header storeName={storeName} />
      <div className="mx-auto max-w-[560px] px-4">
        <h1 className="text-[20px]" style={{ fontWeight: 800 }}>
          {jobLabel}の面接
        </h1>
        <p className="mt-1 text-[14px] leading-relaxed" style={{ color: C.sub }}>
          AIの面接官と、声で話す10〜15分ほどの面接です。静かな場所で、顔が映るようにしてください。
        </p>

        <div
          className="mt-4 overflow-hidden rounded-2xl"
          style={{ background: "#000", aspectRatio: "4 / 3" }}
        >
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        </div>
        <p className="mt-2 text-[13px]" style={{ color: C.sub }}>
          {camera === "checking" ? "カメラとマイクを確認しています…" : "カメラとマイクが使えます。"}
        </p>

        <div
          className="mt-4 rounded-2xl p-4 text-[14px] leading-relaxed"
          style={{ background: C.warnBg, border: `2px solid ${C.warn}`, color: C.text }}
        >
          <p className="text-[16px]" style={{ fontWeight: 800, color: C.warn }}>
            この面接は録画されます（必須）。
          </p>
          <p className="mt-2">
            はじめの1分の録画と、面接中の顔の写真3枚を、応募先のお店の採用担当者が見ます。
          </p>
          <p className="mt-2">
            録画・写真・会話の内容は、このお店の採用の判断だけに使い、90日たったら自動で消します。
          </p>
          <p className="mt-2" style={{ fontWeight: 700 }}>
            録画されることに同意できない場合は、面接を受けることができません。
          </p>
        </div>

        <label className="mt-4 flex items-start gap-3 text-[15px]" style={{ fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0"
          />
          上のことに同意して面接をはじめる
        </label>

        <button
          onClick={start}
          disabled={!agreed || camera !== "ok" || starting}
          className="mt-4 h-12 w-full rounded-xl text-[16px] text-white disabled:opacity-40"
          style={{ background: C.accent, fontWeight: 800 }}
        >
          {starting ? "はじめています…" : "面接をはじめる"}
        </button>
        {error && (
          <p className="mt-2 text-[13px]" style={{ color: C.warn }}>
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

function LiveScreen({
  token,
  storeName,
  stream,
  greeting,
  onEnd,
  onUnavailable,
}: {
  token: string;
  storeName: string;
  stream: MediaStream;
  greeting: { aiText: string; audioBase64: string | null };
  onEnd: () => void;
  onUnavailable: () => void;
}) {
  const voice = getAvatarVoice();
  const compact = useCompactLayout();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [aiText, setAiText] = useState(greeting.aiText);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const aiSpeakingRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState("");
  const [ending, setEnding] = useState(false);
  const endedRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const uploadsRef = useRef<Promise<unknown>[]>([]);
  const photosTakenRef = useRef<Set<number>>(new Set());
  const startedAtRef = useRef(Date.now());
  // 声の大きさから、話しはじめ・話し終わりを見分ける
  const voicedMsRef = useRef(0);
  const silentSinceRef = useRef(0);

  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject !== stream)
      videoRef.current.srcObject = stream;
  }, [stream, compact]);

  // 写真・録画を Storage へ直接送る（署名つき URL をもらい、送れたらサーバーで確かめる）
  const upload = useCallback(
    (kind: "photo" | "video", index: number, ext: "jpg" | "webm" | "mp4", blob: Blob) => {
      const p = (async () => {
        const u = await api<{ path?: string; uploadToken?: string }>({
          action: "media-url",
          token,
          kind,
          index,
          ext,
        });
        if (!u.path || !u.uploadToken) return;
        const { error } = await supabase.storage
          .from(BUCKET)
          .uploadToSignedUrl(u.path, u.uploadToken, blob, {
            contentType: blob.type || (kind === "photo" ? "image/jpeg" : "video/webm"),
          });
        if (error) throw error;
        await api({ action: "media-done", token, kind, index, ext });
      })().catch((e) => console.error("[partner-interview] upload failed", kind, index, e));
      uploadsRef.current.push(p);
      return p;
    },
    [token],
  );

  const takePhoto = useCallback(
    (index: number) => {
      if (photosTakenRef.current.has(index)) return;
      const v = videoRef.current;
      if (!v || !v.videoWidth) return;
      photosTakenRef.current.add(index);
      const scale = Math.min(1, 960 / v.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => b && void upload("photo", index, "jpg", b), "image/jpeg", 0.85);
    },
    [upload],
  );

  // はじめの60秒だけ録画する（面接官の声と本人のマイクを混ぜて、両方の声を残す）
  useEffect(() => {
    const mime = pickMime("video");
    let recStream = stream;
    try {
      recStream = new MediaStream([...stream.getVideoTracks(), ...voice.recordingAudio(stream)]);
    } catch {
      // 混ぜられない端末は、カメラとマイクだけ
    }
    try {
      const rec = new MediaRecorder(recStream, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: 900_000,
        audioBitsPerSecond: 64_000,
      });
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        setRecording(false);
        const type = rec.mimeType || mime || "video/webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size > 0) void upload("video", 0, type.includes("mp4") ? "mp4" : "webm", blob);
      };
      rec.start(1000);
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      console.error("[partner-interview] recorder failed", e);
    }
    const stopTimer = setTimeout(() => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    }, VIDEO_SECONDS * 1000);
    // 写真：はじめ（5秒後）・まん中（4分後）
    const first = setTimeout(() => takePhoto(0), 5000);
    const middle = setTimeout(() => takePhoto(1), MIDDLE_PHOTO_AT * 1000);
    return () => {
      clearTimeout(stopTimer);
      clearTimeout(first);
      clearTimeout(middle);
      // 画面が作り直されたときは、この録画は捨てる（作り直した側で撮り直す）
      const rec = recorderRef.current;
      if (rec?.state === "recording") {
        rec.onstop = null;
        rec.stop();
      }
      recorderRef.current = null;
      chunksRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ページを閉じるときは、カメラ・マイクを止める（面接が終わったときは finish で止める）
  useEffect(() => {
    const stop = () => {
      stream.getTracks().forEach((t) => t.stop());
      voice.stop();
    };
    window.addEventListener("pagehide", stop);
    return () => window.removeEventListener("pagehide", stop);
  }, [stream, voice]);

  // 面接中にスマホの画面が消えないようにする
  useEffect(() => {
    type WakeLock = { release: () => Promise<void> };
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLock> };
    };
    let lock: WakeLock | null = null;
    nav.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, []);

  const play = useCallback(
    async (audioBase64: string | null) => {
      if (!audioBase64) return;
      const pcm = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
      aiSpeakingRef.current = true;
      setAiSpeaking(true);
      try {
        await voice.playPcm16(pcm);
      } finally {
        aiSpeakingRef.current = false;
        setAiSpeaking(false);
      }
    },
    [voice],
  );

  const finish = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    setEnding(true);
    // おわりの写真（まん中をまだ撮っていなければ、先に撮る）
    takePhoto(1);
    await new Promise((r) => setTimeout(r, 800));
    takePhoto(2);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    await new Promise((r) => setTimeout(r, 500));
    // 送り終わるのを待つ（長くても30秒）
    await Promise.race([
      Promise.allSettled(uploadsRef.current),
      new Promise((r) => setTimeout(r, 30000)),
    ]);
    // 雰囲気のまとめはサーバーで作る（待たない。失敗しても毎時の処理で作り直す）
    void fetch("/api/partner-interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finish", token }),
      keepalive: true,
    }).catch(() => {});
    stream.getTracks().forEach((t) => t.stop());
    onEnd();
  }, [onEnd, stream, takePhoto, token]);

  // 最初のあいさつ
  useEffect(() => {
    void play(greeting.audioBase64);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendAnswer = useCallback(
    async (blob: Blob, type: string) => {
      setProcessing(true);
      setNotice("");
      try {
        const form = new FormData();
        form.append("audio", blob, `answer.${type.includes("mp4") ? "mp4" : "webm"}`);
        form.append("token", token);
        const tr = await fetch("/api/partner-interview/transcribe", {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(30000),
        });
        if (tr.status === 403) return onUnavailable();
        const { text } = (await tr.json()) as { text?: string };
        if (!text?.trim()) return;
        let r: { aiText?: string; audioBase64?: string | null; isEnded?: boolean; error?: string };
        try {
          r = await api({ action: "turn", token, candidateText: text });
        } catch {
          r = await api({ action: "turn", token, candidateText: text });
        }
        if (r.error === "ended") return void finish();
        if (!r.aiText) throw new Error(r.error ?? "no reply");
        setAiText(r.aiText);
        await play(r.audioBase64 ?? null);
        if (r.isEnded) await finish();
      } catch (e) {
        console.error(e);
        setNotice("通信がうまくいきませんでした。もう一度、答えを話してください。");
      } finally {
        setProcessing(false);
      }
    },
    [finish, onUnavailable, play, token],
  );

  // 声を聞き取る（面接官が話している間・処理中は聞かない）
  useEffect(() => {
    if (aiSpeaking || processing || ending) return;
    const ctx = voice.context();
    const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let rec: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let stopping = false;
    const mime = pickMime("audio");
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const level = data.reduce((a, b) => a + b, 0) / data.length;
      const now = Date.now();
      if (!rec) {
        if (level > 30) {
          rec = mime
            ? new MediaRecorder(new MediaStream(stream.getAudioTracks()), { mimeType: mime })
            : new MediaRecorder(new MediaStream(stream.getAudioTracks()));
          chunks = [];
          rec.ondataavailable = (e) => chunks.push(e.data);
          rec.start();
          voicedMsRef.current = 0;
          silentSinceRef.current = now;
          setListening(true);
        }
        return;
      }
      if (level > 30) {
        voicedMsRef.current += 100;
        silentSinceRef.current = now;
      }
      // 少し考えて黙っただけで締めないよう、話しはじめは3秒、よく話したあとは2.3秒黙ったら答えを送る
      const wait = voicedMsRef.current < 4000 ? 3000 : 2300;
      if (!stopping && now - silentSinceRef.current >= wait) {
        stopping = true;
        const r = rec;
        const type = r.mimeType || mime || "audio/webm";
        r.onstop = () => {
          setListening(false);
          void sendAnswer(new Blob(chunks, { type }), type);
        };
        r.stop();
      }
    };
    const timer = setInterval(tick, 100);
    return () => {
      clearInterval(timer);
      source.disconnect();
      analyser.disconnect();
      if (rec && rec.state === "recording" && !stopping) {
        rec.onstop = null;
        rec.stop();
        setListening(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSpeaking, processing, ending]);

  const state = ending
    ? "面接を終えています…"
    : aiSpeaking
      ? "面接官が話しています。終わるまでお待ちください"
      : processing
        ? "答えを受け取っています…"
        : listening
          ? "聞いています。話し終わったら、そのまま少し待ってください"
          : "どうぞ、お話しください";

  return (
    <main className="flex min-h-[100svh] flex-col" style={{ background: C.bg, color: C.text }}>
      <Header storeName={storeName} />
      <div
        className={`mx-auto flex w-full max-w-[960px] flex-1 gap-3 px-3 pb-4 ${compact ? "flex-col" : "flex-row"}`}
      >
        <div
          className={`relative overflow-hidden rounded-2xl ${compact ? "" : "flex-1"}`}
          // スマホでは画面の半分ほどにして、下に質問の文字と状態が見えるようにする
          style={compact ? { height: "48svh", minHeight: 240 } : { minHeight: 460 }}
        >
          <InterviewerAvatar voice={voice} />
          {recording && (
            <span
              className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-white"
              style={{ background: "rgba(0,0,0,.6)", fontWeight: 700 }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: "#EF4444" }} />
              録画中
            </span>
          )}
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute bottom-3 right-3 rounded-xl object-cover"
            style={{
              width: compact ? 96 : 160,
              aspectRatio: "3 / 4",
              transform: "scaleX(-1)",
              border: "2px solid #fff",
              background: "#000",
            }}
          />
        </div>
        <div className={`flex flex-col gap-3 ${compact ? "" : "w-[340px]"}`}>
          <div
            className="rounded-2xl p-4"
            style={{ background: C.card, border: `1px solid ${C.border}` }}
          >
            <p className="text-[12px]" style={{ color: C.sub, fontWeight: 700 }}>
              面接官
            </p>
            <p className="mt-1 text-[16px] leading-relaxed" style={{ fontWeight: 600 }}>
              {aiText}
            </p>
          </div>
          <div
            className="rounded-2xl px-4 py-3 text-[14px]"
            style={{
              background: listening ? "#ECFDF3" : aiSpeaking ? "#FFF7ED" : C.card,
              border: `1px solid ${listening ? "#12B76A" : aiSpeaking ? "#F79009" : C.border}`,
              fontWeight: 700,
            }}
          >
            {state}
          </div>
          {notice && (
            <p className="text-[13px]" style={{ color: C.warn }}>
              {notice}
            </p>
          )}
          <p className="text-[12px] leading-relaxed" style={{ color: C.sub }}>
            面接官が話している間は話さず、話し終わってから答えてください。答え終わったら、そのまま少し待つと次の質問に進みます。
          </p>
        </div>
      </div>
    </main>
  );
}
