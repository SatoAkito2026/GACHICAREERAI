/**
 * 営業ロープレの本番：AI のお客さん役と声で話す
 * - はじめる（マイクの確認・ボタンを押したときに声の再生を許可）→ お客さんの最初のひとこと
 * - 黙ってから3秒（よく話したあとは2.3秒）で一言を送る → お客さんの返事（または先生の助言で止まる）
 * - 電話の場面（反響・テレアポ）は電話の画面、訪問・商談はお客さんの名札の画面（面接官の顔は使わない）
 * - 「終わって評価する」で評価を作り、結果の画面へ
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, DoorClosed, Lightbulb, Phone } from "lucide-react";
import { Button, C, talentApi } from "@/components/talent/TalentUI";
import { getAvatarVoice } from "@/lib/avatar-voice";
import { getAuthHeaders } from "@/lib/chat-api";
import { timeStretch } from "@/lib/time-stretch";

type Scenario = "door" | "inbound" | "teleapo" | "b2b";
type Line = { role: "seller" | "customer" | "coach"; text: string; retracted?: boolean };

// お客さんの声は少しだけ速く（サーバーの CUSTOMER_TEMPO と同じ。声の長さから話す速さを計るのに使う）
const CUSTOMER_TEMPO = 1.15;

const SCENARIO_LABEL: Record<Scenario, string> = {
  door: "訪問販売",
  inbound: "反響営業",
  teleapo: "テレアポ",
  b2b: "法人営業（商談）",
};

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"]) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      // 調べられないブラウザは次へ
    }
  }
  return "";
}

export function SalesPlayPage({
  scenario,
  difficulty,
  coachMode,
}: {
  scenario: Scenario;
  difficulty: "easy" | "normal" | "hard";
  coachMode: "coach" | "full";
}) {
  const navigate = useNavigate();
  const voice = getAvatarVoice();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [id, setId] = useState<string | null>(null);
  const [persona, setPersona] = useState<{ name: string; profile: string } | null>(null);
  const [phone, setPhone] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [coach, setCoach] = useState<string | null>(null);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [ended, setEnded] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [notice, setNotice] = useState("");
  const voicedMsRef = useRef(0);
  const silentSinceRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, coach]);

  // 閉じたらマイクを止める。評価しないまま閉じたら「途中でやめた」にする
  useEffect(() => {
    const stop = () => {
      stream?.getTracks().forEach((t) => t.stop());
      voice.stop();
    };
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
    };
  }, [stream, voice]);

  const play = useCallback(
    async (audioBase64: string | null) => {
      if (!audioBase64) return;
      const pcm = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
      const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      const data = new Float32Array(Math.floor(pcm.byteLength / 2));
      for (let i = 0; i < data.length; i++) data[i] = view.getInt16(i * 2, true) / 32768;
      setAiSpeaking(true);
      try {
        await voice.playSamples(timeStretch(data, 24000, CUSTOMER_TEMPO), 24000);
      } finally {
        setAiSpeaking(false);
      }
    },
    [voice],
  );

  const start = async () => {
    setStarting(true);
    setError("");
    try {
      // ボタンを押した中で声の再生を許可する（スマホの自動再生の制限）
      await voice.unlock();
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const r = await talentApi<{
        id: string;
        persona: { name: string; profile: string };
        phone: boolean;
        reply: string;
        audioBase64: string | null;
      }>("/api/sales/roleplay", { action: "start", scenario, difficulty, coachMode });
      if (!r.ok) {
        s.getTracks().forEach((t) => t.stop());
        setError(r.data.error ?? "始められませんでした");
        return;
      }
      setStream(s);
      setId(r.data.id);
      idRef.current = r.data.id;
      setPersona(r.data.persona);
      setPhone(r.data.phone);
      setLines([{ role: "customer", text: r.data.reply }]);
      void play(r.data.audioBase64);
    } catch {
      setError("マイクが使えません。ブラウザの設定でマイクを許可してください。");
    } finally {
      setStarting(false);
    }
  };

  const finish = useCallback(async () => {
    if (!idRef.current || finishedRef.current) return;
    finishedRef.current = true;
    setFinishing(true);
    voice.stop();
    stream?.getTracks().forEach((t) => t.stop());
    const r = await talentApi("/api/sales/roleplay", { action: "finish", id: idRef.current });
    if (r.ok) {
      void navigate({ to: "/sales/result/$id", params: { id: idRef.current } });
      return;
    }
    if (r.status === 400) {
      // まだ何も話していない（評価なしで終わり）
      void navigate({ to: "/private/individual/sales" });
      return;
    }
    finishedRef.current = false;
    setFinishing(false);
    setNotice(r.data.error ?? "評価を作れませんでした。もう一度押してください");
  }, [navigate, stream, voice]);

  const quit = async () => {
    if (!window.confirm("やめますか？（評価はつきません）")) return;
    finishedRef.current = true;
    voice.stop();
    stream?.getTracks().forEach((t) => t.stop());
    if (idRef.current)
      await talentApi("/api/sales/roleplay", { action: "abandon", id: idRef.current });
    void navigate({ to: "/private/individual/sales" });
  };

  const send = useCallback(
    async (blob: Blob, type: string, sec: number) => {
      if (!idRef.current) return;
      setProcessing(true);
      setNotice("");
      try {
        const form = new FormData();
        form.append("audio", blob, `say.${type.includes("mp4") ? "mp4" : "webm"}`);
        form.append("id", idRef.current);
        const tr = await fetch("/api/sales/transcribe", {
          method: "POST",
          headers: await getAuthHeaders(),
          body: form,
          signal: AbortSignal.timeout(30000),
        });
        const { text } = (await tr.json().catch(() => ({}))) as { text?: string };
        if (!text?.trim()) return;
        setLines((l) => [...l, { role: "seller", text }]);
        setCoach(null);
        const r = await talentApi<{
          reply: string;
          coach: string | null;
          ended: boolean;
          outcome: string | null;
          audioBase64: string | null;
        }>("/api/sales/roleplay", {
          action: "turn",
          id: idRef.current,
          text,
          sec,
        });
        if (!r.ok) {
          setLines((l) => l.slice(0, -1));
          setNotice(r.data.error ?? "通信がうまくいきませんでした。もう一度話してください");
          return;
        }
        if (r.data.coach) {
          // 先生の助言：今の一言は取り消して、言い直してもらう
          setLines((l) => [
            ...l.slice(0, -1),
            { role: "seller", text, retracted: true },
            { role: "coach", text: r.data.coach! },
          ]);
          setCoach(r.data.coach);
          return;
        }
        if (r.data.reply) setLines((l) => [...l, { role: "customer", text: r.data.reply }]);
        await play(r.data.audioBase64);
        if (r.data.ended) setEnded(r.data.outcome ?? "話が終わりました");
      } catch {
        setNotice("通信がうまくいきませんでした。もう一度話してください");
      } finally {
        setProcessing(false);
      }
    },
    [play],
  );

  // 声を聞き取る（お客さんが話している間・処理中・助言を読んでいる間・終わったあとは聞かない）
  useEffect(() => {
    if (!stream || aiSpeaking || processing || ended || finishing || coach) return;
    const ctx = voice.context();
    const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let rec: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let stopping = false;
    let recStartedAt = 0;
    const mime = pickMime();
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
          recStartedAt = now;
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
      const wait = voicedMsRef.current < 4000 ? 3000 : 2300;
      if (!stopping && now - silentSinceRef.current >= wait) {
        stopping = true;
        const r = rec;
        const type = r.mimeType || mime || "audio/webm";
        r.onstop = () => {
          setListening(false);
          // 話しはじめから最後に声が出たときまでの時間（話す速さを見るため。終わりの無音は入れない）
          const spoken = (silentSinceRef.current - recStartedAt) / 1000;
          void send(new Blob(chunks, { type }), type, Math.max(0, spoken));
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
  }, [stream, aiSpeaking, processing, ended, finishing, coach]);

  // ---- はじめる前 ----
  if (!id) {
    return (
      <main
        className="flex min-h-[100svh] items-center justify-center px-4"
        style={{ background: C.bg }}
      >
        <div
          className="w-full max-w-[460px] rounded-2xl p-6"
          style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text }}
        >
          <p className="text-[12px]" style={{ color: C.muted }}>
            営業ロープレ
          </p>
          <h1 className="mt-1 text-[22px]" style={{ fontWeight: 800 }}>
            {SCENARIO_LABEL[scenario]}
          </h1>
          <ul
            className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-[14px]"
            style={{ color: C.sub, lineHeight: 1.7 }}
          >
            <li>AI のお客さんが先に話します。そのあと、あなたが声で話してください</li>
            <li>話し終わったら、そのまま少し待つと相手に伝わります</li>
            <li>
              {coachMode === "coach"
                ? "まずい一言のときは、先生が止めて言い直し方を教えます"
                : "止めずに最後までやります。終わったら評価します"}
            </li>
            <li>静かな場所で、イヤホンを使うと聞き取りやすくなります</li>
          </ul>
          {error && (
            <p className="mt-3 text-[13px]" style={{ color: C.danger }}>
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2">
            <Button onClick={() => void start()} loading={starting}>
              マイクを使ってはじめる
            </Button>
            <Link
              to="/private/individual/sales"
              className="py-2 text-center text-[13px]"
              style={{ color: C.muted }}
            >
              もどる
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const state = finishing
    ? "評価を作っています…（30秒ほど）"
    : ended
      ? `会話が終わりました（${ended}）`
      : coach
        ? "先生の助言を読んで、言い直してください"
        : aiSpeaking
          ? "お客さんが話しています"
          : processing
            ? "伝えています…"
            : listening
              ? "聞いています。話し終わったら、そのまま少し待ってください"
              : "どうぞ、話してください";

  const Icon = phone ? Phone : scenario === "door" ? DoorClosed : Building2;

  return (
    <main className="flex min-h-[100svh] flex-col" style={{ background: C.bg, color: C.text }}>
      <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between text-[13px]" style={{ color: C.muted }}>
          <span>営業ロープレ・{SCENARIO_LABEL[scenario]}</span>
          <button onClick={() => void quit()} style={{ color: C.muted }}>
            やめる
          </button>
        </div>

        {/* お客さん */}
        <div
          className="flex items-center gap-4 rounded-2xl p-4"
          style={{ background: C.card, border: `1px solid ${aiSpeaking ? C.accent : C.border}` }}
        >
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
            style={{
              background: aiSpeaking ? C.accent : C.card2,
              color: aiSpeaking ? "#000" : C.sub,
              transition: "background .2s",
              boxShadow: aiSpeaking ? `0 0 0 6px rgba(200,255,0,0.15)` : undefined,
            }}
          >
            <Icon size={28} />
          </div>
          <div className="min-w-0">
            <p className="text-[12px]" style={{ color: C.muted }}>
              {phone ? "通話中" : scenario === "door" ? "インターホン" : "商談中"}・お客さん
            </p>
            <p className="text-[18px]" style={{ fontWeight: 800 }}>
              {persona?.name}さん
            </p>
            <p className="text-[12px]" style={{ color: C.sub, lineHeight: 1.5 }}>
              {persona?.profile}
            </p>
          </div>
        </div>

        {/* 会話 */}
        <div
          ref={logRef}
          className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-2xl p-3"
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            minHeight: 240,
            maxHeight: "50svh",
          }}
        >
          {lines.map((l, i) =>
            l.role === "coach" ? (
              <div
                key={i}
                className="flex gap-2 rounded-xl p-3 text-[14px]"
                style={{
                  background: "rgba(255,200,0,0.12)",
                  border: "1px solid #B8860B",
                  lineHeight: 1.6,
                }}
              >
                <Lightbulb size={18} className="shrink-0" style={{ color: "#FFC800" }} />
                <span>
                  <b>先生の助言：</b>
                  {l.text}
                </span>
              </div>
            ) : (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[14px] ${l.role === "seller" ? "self-end" : "self-start"}`}
                style={{
                  background: l.role === "seller" ? "rgba(200,255,0,0.12)" : C.card2,
                  color: l.retracted ? C.muted : C.text,
                  textDecoration: l.retracted ? "line-through" : undefined,
                  lineHeight: 1.6,
                }}
              >
                {l.text}
              </div>
            ),
          )}
        </div>

        <div
          className="rounded-2xl px-4 py-3 text-[14px]"
          style={{
            background: listening ? "rgba(18,183,106,0.15)" : C.card,
            border: `1px solid ${listening ? "#12B76A" : C.border}`,
            fontWeight: 700,
          }}
        >
          {state}
        </div>
        {notice && (
          <p className="text-[13px]" style={{ color: C.danger }}>
            {notice}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          {coach && <Button onClick={() => setCoach(null)}>わかった、言い直す</Button>}
          <Button
            variant={ended ? "primary" : "ghost"}
            onClick={() => void finish()}
            loading={finishing}
            disabled={processing}
          >
            終わって評価する
          </Button>
        </div>
      </div>
    </main>
  );
}
