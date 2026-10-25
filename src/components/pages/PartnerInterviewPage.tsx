/**
 * 提携先（POSPOS）のお店の AI 一次面接：応募者が開く画面。会員登録・ログインなしで受けられる。
 * 準備（カメラ・マイクの確認と録画への同意）→ 選ぶ質問（画面で選ぶ。録画しない）→ AI との2〜3分の会話 → 終わりの画面。
 * ガチキャリAI の練習・評価とは別物：応募者には評価・点数・改善点を一切見せず、ガチキャリAI の案内・宣伝も出さない。
 * 会話の録画（はじめから終わりまで・5分まで）と顔の写真3枚（はじめ・まん中・おわり）は必ず撮り、Storage へ直接送る。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { InterviewerAvatar } from "@/components/InterviewerAvatar";
import { getAvatarVoice } from "@/lib/avatar-voice";
import { supabase } from "@/integrations/supabase/client";
import { useCompactLayout } from "@/hooks/use-compact-layout";

const BUCKET = "partner-interviews";
/** 録画の長さの上限（秒）。会話のはじめから終わりまで撮る */
const VIDEO_SECONDS = 300;
/** まん中の写真を撮る時刻（秒）。それより早く終わったときは、終わりに撮る */
const MIDDLE_PHOTO_AT = 30;

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

type Question =
  | { key: string; label: string; kind: "one" | "many"; options: string[]; note?: string }
  | { key: string; label: string; kind: "time"; from: string[]; to: string[] }
  | { key: string; label: string; kind: "minutes"; min: number; max: number }
  | { key: string; label: string; kind: "check"; text: string };

/** 時刻を並べて比べるための数（「翌2時」→ 26、「ラストまで」→ いちばん後）。サーバーと同じ決まり */
function hourValue(label: string): number {
  if (label === "ラストまで") return 99;
  const m = /^(翌)?(\d+)時$/.exec(label);
  return m ? Number(m[2]) + (m[1] ? 24 : 0) : NaN;
}
type Session =
  | { available: true; storeName: string; jobLabel: string; questions: Question[] }
  | { available: false };
type Greeting = { aiText: string; audioBase64: string | null };

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
  const [phase, setPhase] = useState<"prep" | "screening" | "live" | "done">("prep");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [greeting, setGreeting] = useState<Greeting | null>(null);

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
  if (phase === "screening" && stream)
    return (
      <ScreeningScreen
        token={token}
        storeName={session.storeName}
        questions={session.questions}
        onStart={(g) => {
          setGreeting(g);
          setPhase("live");
        }}
        onUnavailable={() => {
          stream.getTracks().forEach((t) => t.stop());
          setSession({ available: false });
        }}
      />
    );
  return (
    <PrepScreen
      storeName={session.storeName}
      jobLabel={session.jobLabel}
      onNext={(s) => {
        setStream(s);
        setPhase("screening");
      }}
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
  storeName,
  jobLabel,
  onNext,
}: {
  storeName: string;
  jobLabel: string;
  onNext: (stream: MediaStream) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<"checking" | "ok" | "error">("checking");
  const [agreed, setAgreed] = useState(false);

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

  const next = () => {
    if (streamRef.current && agreed) onNext(streamRef.current);
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
          AIの面接官と、声で話す1分ほどの面接です。静かな場所で、顔が映るようにしてください。
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
            AIとの会話の録画と、会話中の顔の写真3枚を、応募先のお店の採用担当者が見ます。
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
          onClick={next}
          disabled={!agreed || camera !== "ok"}
          className="mt-4 h-12 w-full rounded-xl text-[16px] text-white disabled:opacity-40"
          style={{ background: C.accent, fontWeight: 800 }}
        >
          次へ
        </button>
      </div>
    </main>
  );
}

/** 選ぶ質問（短い答えで済む質問は、声ではなく画面で選んでもらう。ここではまだ録画しない） */
function ScreeningScreen({
  token,
  storeName,
  questions,
  onStart,
  onUnavailable,
}: {
  token: string;
  storeName: string;
  questions: Question[];
  onStart: (greeting: Greeting) => void;
  onUnavailable: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[] | true>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const done = (q: Question) => {
    const a = answers[q.key];
    if (q.kind === "check") return a === true;
    if (q.kind === "time")
      return Array.isArray(a) && !!a[0] && !!a[1] && hourValue(a[1]) > hourValue(a[0]);
    if (q.kind === "minutes") {
      const n = typeof a === "string" && /^\d{1,3}$/.test(a) ? Number(a) : NaN;
      return n >= q.min && n <= q.max;
    }
    if (q.kind === "one") return typeof a === "string";
    return Array.isArray(a) && a.length > 0;
  };
  const complete = questions.every(done);

  const pick = (q: Question, option: string) => {
    setAnswers((prev) => {
      if (q.kind === "one") return { ...prev, [q.key]: option };
      const cur = Array.isArray(prev[q.key]) ? (prev[q.key] as string[]) : [];
      return {
        ...prev,
        [q.key]: cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option],
      };
    });
  };

  const submit = async () => {
    if (!complete || sending) return;
    setSending(true);
    setError("");
    // スマホで声を出せるよう、ボタンを押した中で音声の再生を許可しておく
    await getAvatarVoice().unlock();
    try {
      // 選んだ答えをサーバーに保存してから、会話をはじめる
      const saved = await api<{ ok?: boolean; available?: boolean }>({
        action: "screening",
        token,
        answers,
      });
      if (saved.available === false) return onUnavailable();
      if (!saved.ok) throw new Error("not saved");
      const r = await api<{ available?: boolean; aiText?: string; audioBase64?: string | null }>({
        action: "start",
        token,
        consent: true,
      });
      if (r.available === false) return onUnavailable();
      if (!r.aiText) throw new Error("not started");
      onStart({ aiText: r.aiText, audioBase64: r.audioBase64 ?? null });
    } catch {
      setError("通信がうまくいきませんでした。もう一度押してください。");
      setSending(false);
    }
  };

  return (
    <main className="min-h-[100svh] pb-10" style={{ background: C.bg, color: C.text }}>
      <Header storeName={storeName} />
      <div className="mx-auto max-w-[560px] px-4">
        <h1 className="text-[20px]" style={{ fontWeight: 800 }}>
          かんたんな質問
        </h1>
        <p className="mt-1 text-[14px] leading-relaxed" style={{ color: C.sub }}>
          あてはまるものを押してください。全部答えると、AIの面接官との会話に進みます。
        </p>
        <div className="mt-4 flex flex-col gap-4">
          {questions.map((q) => (
            <section
              key={q.key}
              className="rounded-2xl p-4"
              style={{ background: C.card, border: `1px solid ${C.border}` }}
            >
              {q.kind === "check" ? (
                <button
                  onClick={() =>
                    setAnswers((prev) => {
                      const nextAnswers = { ...prev };
                      if (prev[q.key] === true) delete nextAnswers[q.key];
                      else nextAnswers[q.key] = true;
                      return nextAnswers;
                    })
                  }
                  className="flex w-full items-center gap-3 text-left text-[16px]"
                  style={{ fontWeight: 800 }}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[18px] text-white"
                    style={{
                      background: answers[q.key] === true ? C.accent : "#fff",
                      border: `2px solid ${answers[q.key] === true ? C.accent : "#9AA3AE"}`,
                    }}
                  >
                    {answers[q.key] === true ? "✓" : ""}
                  </span>
                  {q.text}
                </button>
              ) : q.kind === "minutes" ? (
                <>
                  <p className="text-[16px]" style={{ fontWeight: 800 }}>
                    {q.label}
                  </p>
                  <div
                    className="mt-3 flex items-center gap-2 text-[15px]"
                    style={{ fontWeight: 700 }}
                  >
                    <span className="shrink-0">片道</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={3}
                      placeholder="例：30"
                      aria-label={q.label}
                      value={typeof answers[q.key] === "string" ? (answers[q.key] as string) : ""}
                      onChange={(e) => {
                        // 数字だけにする（全角の数字は半角に直す）
                        const v = e.target.value
                          .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
                          .replace(/\D/g, "")
                          .slice(0, 3);
                        setAnswers((prev) => ({ ...prev, [q.key]: v }));
                      }}
                      className="h-12 w-28 rounded-xl px-3 text-[18px]"
                      style={{ border: `2px solid ${C.border}`, fontWeight: 700 }}
                    />
                    <span className="shrink-0">分くらい</span>
                  </div>
                </>
              ) : q.kind === "time" ? (
                <TimeRange
                  q={q}
                  value={Array.isArray(answers[q.key]) ? (answers[q.key] as string[]) : ["", ""]}
                  onChange={(v) => setAnswers((prev) => ({ ...prev, [q.key]: v }))}
                />
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[16px]" style={{ fontWeight: 800 }}>
                      {q.label}
                    </p>
                    <span className="shrink-0 text-[12px]" style={{ color: C.sub }}>
                      {q.kind === "one" ? "1つ選ぶ" : "いくつでも選ぶ"}
                    </span>
                  </div>
                  {q.note && (
                    <p className="mt-1 text-[12px]" style={{ color: C.sub }}>
                      {q.note}
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {q.options.map((o) => {
                      const a = answers[q.key];
                      const on = q.kind === "one" ? a === o : Array.isArray(a) && a.includes(o);
                      return (
                        <button
                          key={o}
                          onClick={() => pick(q, o)}
                          className="min-h-12 rounded-xl px-2 py-2 text-[15px]"
                          style={{
                            background: on ? C.accent : "#fff",
                            color: on ? "#fff" : C.text,
                            border: `2px solid ${on ? C.accent : C.border}`,
                            fontWeight: 700,
                          }}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          ))}
        </div>
        <button
          onClick={submit}
          disabled={!complete || sending}
          className="mt-5 h-12 w-full rounded-xl text-[16px] text-white disabled:opacity-40"
          style={{ background: C.accent, fontWeight: 800 }}
        >
          {sending ? "はじめています…" : "次へ（AIの面接官と話す）"}
        </button>
        {!complete && (
          <p className="mt-2 text-center text-[12px]" style={{ color: C.sub }}>
            すべての質問に答えると押せます
          </p>
        )}
        {error && (
          <p className="mt-2 text-[13px]" style={{ color: C.warn }}>
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

/** 希望の時間帯（何時から・何時まで）。「まで」は「から」より後の時刻だけ選べる */
function TimeRange({
  q,
  value,
  onChange,
}: {
  q: Extract<Question, { kind: "time" }>;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [from, to] = value;
  const selectStyle = {
    border: `2px solid ${C.border}`,
    background: "#fff",
    color: C.text,
    fontWeight: 700,
  } as const;
  return (
    <>
      <p className="text-[16px]" style={{ fontWeight: 800 }}>
        {q.label}
      </p>
      <div className="mt-3 flex items-center gap-2 text-[15px]" style={{ fontWeight: 700 }}>
        <select
          aria-label="何時から"
          value={from}
          onChange={(e) => {
            const f = e.target.value;
            // 「まで」が「から」より前になったら、選び直してもらう
            onChange([f, to && hourValue(to) > hourValue(f) ? to : ""]);
          }}
          className="h-12 min-w-0 flex-1 rounded-xl px-3 text-[16px]"
          style={selectStyle}
        >
          <option value="">選ぶ</option>
          {q.from.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span className="shrink-0">から</span>
        <select
          aria-label="何時まで"
          value={to}
          onChange={(e) => onChange([from, e.target.value])}
          className="h-12 min-w-0 flex-1 rounded-xl px-3 text-[16px]"
          style={selectStyle}
        >
          <option value="">選ぶ</option>
          {q.to
            .filter((o) => !from || hourValue(o) > hourValue(from))
            .map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
        </select>
        <span className="shrink-0">まで</span>
      </div>
    </>
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
  greeting: Greeting;
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

  // 会話のはじめから終わりまで録画する（5分まで。面接官の声と本人のマイクを混ぜて、両方の声を残す）
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
    // 写真：はじめ（5秒後）・まん中（30秒後）
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
