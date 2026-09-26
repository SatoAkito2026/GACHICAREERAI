import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { InterviewerAvatar, type AvatarStyle } from "@/components/InterviewerAvatar";
import { getAvatarVoice } from "@/lib/avatar-voice";

export const Route = createFileRoute("/interview/$token")({
  component: InterviewTokenPage,
  // このページはカメラ/マイク/AudioContext/WebGL 等、ブラウザ専用APIに全面的に
  // 依存しており、サーバーサイドレンダリングする意味がない。SSRを無効化して
  // スマートフォン等での "This page didn't load" (SSR時のブラウザAPI参照) を防ぐ。
  ssr: false,
});

interface Invitation {
  candidate_name: string | null;
  job_type: string | null;
  status: string;
  expires_at: string | null;
  company_name?: string | null;
  practice_mode?: "individual" | "student" | null;
  practice_max_minutes?: number | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

// iOS Safari は audio/webm 非対応のため、対応する mimeType を選択する
function pickAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/aac",
  ];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // ignore
    }
  }
  return "";
}

function extForMimeType(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("aac")) return "m4a";
  return "webm";
}

// iOS Safari 等の webkitAudioContext フォールバック
function createAudioContext(options?: AudioContextOptions): AudioContext {
  const Ctor: typeof AudioContext =
    (typeof AudioContext !== "undefined" && AudioContext) ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor(options);
}

type Step = "prep" | "live" | "ended";

async function fetchCompanyName(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profileData?.company_id) return null;
    const { data: companyData } = await supabase
      .from("companies")
      .select("name")
      .eq("id", profileData.company_id)
      .maybeSingle();
    return (companyData?.name as string) ?? null;
  } catch (e) {
    console.error("company_name 取得失敗:", e);
    return null;
  }
}

function InterviewTokenPage() {
  const { token } = Route.useParams();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("prep");
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc("get_interview_invitation", {
          _token: token,
        });
        if (!active) return;
        if (!rpcError && rpcData) {
          const record = Array.isArray(rpcData) ? rpcData[0] : rpcData;
          if (record) {
            // 練習モード(個人/受験生)ではRPCが返したcompany_name(希望会社名/希望学部学科)を
            // そのまま使う。企業の本番面接の場合だけ、企業プロフィールから取得し直す。
            if (!(record as any).practice_mode) {
              const { data: inv } = await (supabase
                .from("interview_invitations")
                .select("user_id")
                .eq("token", token)
                .maybeSingle() as any);
              (record as any).company_name = await fetchCompanyName(inv?.user_id);
            }
          }
          setInvitation(record ?? null);
          setLoading(false);
          return;
        }
        const { data: directData } = await (supabase
          .from("interview_invitations")
          .select(
            "candidate_name, job_type, status, expires_at, user_id, practice_mode, practice_max_minutes, company_name",
          )
          .eq("token", token)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle() as any);
        if (!active) return;
        if (directData && !directData.practice_mode) {
          directData.company_name = await fetchCompanyName(directData.user_id);
        }
        setInvitation(directData ?? null);
      } catch (e) {
        console.error(e);
        if (active) setInvitation(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (step === "live") {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
      .toString()
      .padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  if (loading) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background: "#0F0F0F",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Inter',sans-serif",
        }}
      >
        <p style={{ color: "#555", fontSize: 14 }}>読み込み中...</p>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background: "#0F0F0F",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Inter',sans-serif",
          gap: 12,
        }}
      >
        <p style={{ color: "#F0F0F0", fontSize: 20, fontWeight: 600 }}>このURLは無効です</p>
        <p style={{ color: "#888", fontSize: 13 }}>
          リンクの有効期限が切れているか、URLが正しくありません。
        </p>
      </div>
    );
  }

  // 既に開始・完了・途中退出済みの場合
  if (
    invitation.status === "started" ||
    invitation.status === "completed" ||
    invitation.status === "abandoned"
  ) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background: "#0F0F0F",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Inter',sans-serif",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 48 }}>🔒</div>
        <p style={{ color: "#F0F0F0", fontSize: 20, fontWeight: 600 }}>
          {invitation.status === "abandoned"
            ? "この面接は途中退出されました"
            : "この面接は既に実施済みです"}
        </p>
        <p style={{ color: "#888", fontSize: 14 }}>
          {invitation.status === "abandoned"
            ? "途中退出のため、このURLは使用できません。"
            : "このURLは一度しか使用できません。"}
        </p>
        <p style={{ color: "#555", fontSize: 12 }}>
          ご不明な点は採用担当者にお問い合わせください。
        </p>
      </div>
    );
  }

  if (step === "ended") {
    const isPractice = !!invitation.practice_mode;
    const homeTo =
      invitation.practice_mode === "student" ? "/private/student" : "/private/individual";
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background: "#0F0F0F",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Inter',sans-serif",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 48 }}>✅</div>
        <p style={{ color: "#F0F0F0", fontSize: 22, fontWeight: 600 }}>
          {isPractice ? "模擬面接が終了しました" : "面接が終了しました"}
        </p>
        {isPractice ? (
          <>
            <p style={{ color: "#888", fontSize: 14 }}>
              お疲れ様でした。結果は「練習履歴」からすぐに確認できます。
            </p>
            <a
              href={homeTo}
              style={{
                marginTop: 8,
                padding: "10px 24px",
                borderRadius: 999,
                background: "#C8FF00",
                color: "#0F0F0F",
                fontWeight: 700,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              ホームに戻る
            </a>
          </>
        ) : (
          <>
            <p style={{ color: "#888", fontSize: 14 }}>
              お疲れ様でした。結果は後日ご連絡いたします。
            </p>
            <p style={{ color: "#555", fontSize: 12 }}>このウィンドウを閉じてください。</p>
          </>
        )}
      </div>
    );
  }

  if (step === "prep") {
    return (
      <PrepScreen
        invitation={invitation}
        token={token}
        onEnter={async () => {
          // クリック直後に音声再生を許可しておく（iOS Safari の自動再生制限対策）
          void getAvatarVoice().unlock();
          // 入室時にstatusをstartedに更新（二重開封防止）
          await supabase
            .from("interview_invitations")
            .update({ status: "started" } as any)
            .eq("token", token);
          setStep("live");
        }}
      />
    );
  }

  return (
    <LiveScreen
      invitation={invitation}
      token={token}
      elapsed={elapsed}
      formatTime={formatTime}
      onEnd={() => setStep("ended")}
    />
  );
}

function PrepScreen({
  invitation,
  token,
  onEnter,
}: {
  invitation: Invitation;
  token: string;
  onEnter: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraOk, setCameraOk] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraOk(true);
        setMicOk(true);
      })
      .catch(() => {
        setCameraOk(false);
        setMicOk(false);
      });
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleEnter = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onEnter();
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100svh",
        background: "#0F0F0F",
        display: "flex",
        flexDirection: "column",
        padding: "clamp(15px,2vh,16px) clamp(18px,2vw,20px)",
        gap: "clamp(6px,1.2vh,10px)",
        overflow: "hidden",
        fontFamily: "'Inter',sans-serif",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: "clamp(6px,1vh,10px)",
          borderBottom: "1px solid #222",
        }}
      >
        <div style={{ fontSize: "clamp(20px,2vw,16px)", fontWeight: 600, color: "#F0F0F0" }}>
          面接への準備
        </div>
        <div style={{ fontSize: "clamp(15px,1.3vw,12px)", color: "#555" }}>
          入室前にカメラ・マイクをご確認ください
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "clamp(8px,1.5vw,14px)",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div
            style={{
              flex: 1,
              background: "#0A0A0A",
              border: "1px solid #2A2A2A",
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                flexShrink: 0,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 10px",
                borderBottom: "1px solid #1A1A1A",
              }}
            >
              <span style={{ fontSize: 15, color: "#555" }}>カメラプレビュー</span>
              <span style={{ fontSize: 15, color: cameraOk ? "#C8FF00" : "#FF4444" }}>
                ● {cameraOk ? "ライブ" : "未接続"}
              </span>
            </div>
            <div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "hidden" }}>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: "scaleX(-1)",
                }}
              />
              {!cameraOk && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div style={{ fontSize: "clamp(28px,5vw,40px)" }}>👤</div>
                  <p style={{ fontSize: 15, color: "#444", marginTop: 4 }}>
                    カメラを許可してください
                  </p>
                </div>
              )}
              <div
                style={{
                  position: "absolute",
                  bottom: 8,
                  left: 8,
                  background: "#C8FF00",
                  color: "#0F0F0F",
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 4,
                }}
              >
                録画されます
              </div>
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "clamp(6px,1vh,8px)",
            minHeight: 0,
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              background: "#1A1A1A",
              border: "1px solid #252525",
              borderRadius: 10,
              padding: "clamp(8px,1.2vh,12px) clamp(15px,1.5vw,14px)",
            }}
          >
            <div
              style={{
                fontSize: 15,
                color: "#555",
                marginBottom: "clamp(5px,0.8vh,7px)",
                fontWeight: 500,
              }}
            >
              面接情報
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "clamp(4px,0.8vh,6px)",
              }}
            >
              {(invitation.practice_mode
                ? [
                    ["候補者名", invitation.candidate_name ?? "—"],
                    [
                      invitation.practice_mode === "student" ? "志望校" : "職種",
                      invitation.job_type ?? "—",
                    ],
                    ...(invitation.company_name
                      ? [
                          [
                            invitation.practice_mode === "student"
                              ? "希望学部・学科"
                              : "希望会社名",
                            invitation.company_name,
                          ],
                        ]
                      : []),
                    [
                      "所要時間",
                      invitation.practice_max_minutes
                        ? `最大${invitation.practice_max_minutes}分`
                        : "制限なし",
                    ],
                  ]
                : [
                    ["企業名", invitation.company_name ?? "—"],
                    ["候補者名", invitation.candidate_name ?? "—"],
                    ["職種", invitation.job_type ?? "—"],
                    ["所要時間", "20〜40分"],
                  ]
              ).map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 13, color: "#555" }}>{label}</div>
                  <div
                    style={{
                      fontSize: "clamp(16px,1.4vw,13px)",
                      color: label === "所要時間" ? "#C8FF00" : "#F0F0F0",
                      fontWeight: 500,
                    }}
                  >
                    {val}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: "clamp(4px,0.6vh,5px)",
            }}
          >
            {[
              {
                label: "カメラ",
                sub: cameraOk ? "正常に動作しています" : "許可してください",
                ok: cameraOk,
              },
              {
                label: "マイク",
                sub: micOk ? "正常に動作しています" : "許可してください",
                ok: micOk,
              },
              { label: "通信環境", sub: "接続確認済み", ok: true },
            ].map(({ label, sub, ok }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#1A1A1A",
                  border: "1px solid #252525",
                  borderRadius: 7,
                  padding: "clamp(5px,0.8vh,7px) clamp(8px,1vw,10px)",
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: ok ? "#C8FF00" : "#FFB800",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    color: "#0F0F0F",
                    fontWeight: 700,
                  }}
                >
                  {ok ? "✓" : "!"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, color: "#F0F0F0", fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: 13, color: "#666" }}>{sub}</div>
                </div>
                <span style={{ fontSize: 15, fontWeight: 500, color: ok ? "#C8FF00" : "#FFB800" }}>
                  {ok ? "OK" : "確認中"}
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              flexShrink: 0,
              background: "#1A1210",
              border: "1px solid #3A2010",
              borderRadius: 8,
              padding: "clamp(7px,1vh,10px) clamp(15px,1.5vw,14px)",
            }}
          >
            <div style={{ fontSize: 15, color: "#FFB800", fontWeight: 500, marginBottom: 5 }}>
              ⚠️ 注意事項
            </div>
            <ul style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              {[
                "面接中は画面全体が録画されます",
                "静かな場所でご参加ください",
                "途中退出は面接無効となる場合があります",
                "面接はAIが担当します",
              ].map((t) => (
                <li
                  key={t}
                  style={{ fontSize: 15, color: "#888", lineHeight: 1.8, marginLeft: 12 }}
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid #222",
          paddingTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, margin: 0 }}>
            入室することで
            <Link to="/terms" style={{ color: "#888", textDecoration: "underline" }}>
              利用規約
            </Link>
            に同意したものとみなします
          </p>
          <button
            onClick={handleEnter}
            style={{
              background: "#C8FF00",
              color: "#0F0F0F",
              border: "none",
              borderRadius: 9,
              padding: "12px 32px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
              width: "45%",
            }}
          >
            面接ルームに入室する →
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveScreen({
  invitation,
  token,
  elapsed,
  formatTime,
  onEnd,
}: {
  invitation: Invitation;
  token: string;
  elapsed: number;
  formatTime: (s: number) => string;
  onEnd: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingRef = useRef<MediaRecorder | null>(null);
  const screenChunksRef = useRef<Blob[]>([]);
  const voice = getAvatarVoice();
  const greetedRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const isAiSpeakingRef = useRef(false);
  const [isSavingResult, setIsSavingResult] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>("neutral");
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // タブを閉じた時にsendBeaconで保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      const payload = JSON.stringify({
        token,
        messages,
        elapsed,
        candidateName: invitation.candidate_name,
        jobType: invitation.job_type,
        companyName: invitation.company_name ?? null,
        isAbandoned: true,
      });
      navigator.sendBeacon(
        "/api/save-interview",
        new Blob([payload], { type: "application/json" }),
      );
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [token, messages, elapsed, invitation]);

  // 音声自動検出
  useEffect(() => {
    if (!mediaStreamRef.current || isProcessing || isAiSpeaking) return;
    const audioCtx = createAudioContext();
    const source = audioCtx.createMediaStreamSource(mediaStreamRef.current);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const THRESHOLD = 30;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;

    const check = () => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

      if (avg > THRESHOLD && !isListening && !isProcessing && !isAiSpeaking) {
        startListening();
        if (silenceTimer) clearTimeout(silenceTimer);
      } else if (avg <= THRESHOLD && isListening) {
        if (!silenceTimer) {
          silenceTimer = setTimeout(() => {
            stopListening();
            silenceTimer = null;
          }, 1500);
        }
      } else if (avg > THRESHOLD && silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    };

    const interval = setInterval(check, 100);
    return () => {
      clearInterval(interval);
      audioCtx.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessing, isAiSpeaking, isListening]);

  useEffect(() => {
    // カメラ・マイク起動
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        mediaStreamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(console.error);

    // 画面録画
    navigator.mediaDevices
      .getDisplayMedia({ video: true, audio: true })
      .then((screenStream) => {
        const recorder = new MediaRecorder(screenStream);
        recorder.ondataavailable = (e) => screenChunksRef.current.push(e.data);
        recorder.start(1000);
        recordingRef.current = recorder;
      })
      .catch(() => {
        // 画面録画許可なしでも続行
      });

    // 最初の挨拶（アバターはブラウザ内で描画するので接続待ちは不要）。二重送信しないよう一度だけ
    if (!greetedRef.current) {
      greetedRef.current = true;
      sendTurn("（面接開始）", []);
    }

    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      recordingRef.current?.stop();
      voice.stop();
    };
  }, []);

  const sendTurn = async (candidateText: string, history: Message[]) => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/interview-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, candidateText, conversationHistory: history }),
      });
      const data = (await res.json()) as {
        aiText: string;
        audioBase64: string | null;
        isEnded: boolean;
        avatarStyle?: AvatarStyle;
      };
      if (data.avatarStyle && data.avatarStyle !== avatarStyle) setAvatarStyle(data.avatarStyle);

      const newMessages: Message[] = [...history];
      if (candidateText !== "（面接開始）") {
        // 最初の挨拶はuserメッセージに追加しない
      }
      const withAi: Message[] = [...newMessages, { role: "assistant", content: data.aiText }];
      setMessages(withAi);

      if (data.audioBase64) {
        const pcmData = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
        // 再生が終わるまで「AI発話中」にしてマイクの自動検出を止める
        setIsAiSpeaking(true);
        isAiSpeakingRef.current = true;
        void voice.playPcm16(pcmData).finally(() => {
          setIsAiSpeaking(false);
          isAiSpeakingRef.current = false;
        });
      }

      if (data.isEnded) {
        // 総評生成・保存を待ってから画面遷移（確実に保存させる）
        setIsSavingResult(true);
        await saveInterview(false);
        // AIが話し終わるまで待ってから終了画面へ
        await new Promise<void>((resolve) => {
          const checkSpeaking = () => {
            if (!isAiSpeakingRef.current) {
              resolve();
            } else {
              setTimeout(checkSpeaking, 500);
            }
          };
          setTimeout(checkSpeaking, 2000);
        });
        onEnd();
      }
      return withAi;
    } catch (e) {
      console.error(e);
      return history;
    } finally {
      setIsProcessing(false);
    }
  };

  const startListening = useCallback(() => {
    if (!mediaStreamRef.current || isListening || isAiSpeaking || isProcessing) return;
    const audioStream = new MediaStream(mediaStreamRef.current.getAudioTracks());
    const mimeType = pickAudioMimeType();
    const recorder = mimeType
      ? new MediaRecorder(audioStream, { mimeType })
      : new MediaRecorder(audioStream);
    audioChunksRef.current = [];
    recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsListening(true);
  }, [isListening, isAiSpeaking, isProcessing]);

  const stopListening = useCallback(async () => {
    if (!mediaRecorderRef.current || !isListening) return;
    setIsListening(false);
    setIsProcessing(true);
    mediaRecorderRef.current.stop();

    await new Promise<void>((resolve) => {
      if (mediaRecorderRef.current) mediaRecorderRef.current.onstop = () => resolve();
    });

    try {
      const recordedType =
        mediaRecorderRef.current?.mimeType || pickAudioMimeType() || "audio/webm";
      const audioBlob = new Blob(audioChunksRef.current, { type: recordedType });
      const formData = new FormData();
      formData.append("audio", audioBlob, `audio.${extForMimeType(recordedType)}`);
      formData.append("token", token);

      const whisperRes = await fetch("/api/whisper-transcribe", { method: "POST", body: formData });
      const { text } = (await whisperRes.json()) as { text: string };

      if (!text?.trim()) {
        setIsProcessing(false);
        return;
      }

      const newMessages: Message[] = [...messages, { role: "user", content: text }];
      setMessages(newMessages);
      await sendTurn(text, newMessages);
    } catch (e) {
      console.error(e);
      setIsProcessing(false);
    }
  }, [isListening, messages, token]);

  const toggleMute = () => {
    mediaStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = isMuted;
    });
    setIsMuted(!isMuted);
  };

  const toggleCamera = () => {
    mediaStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = isCameraOff;
    });
    setIsCameraOff(!isCameraOff);
  };

  // 面接履歴を保存する関数
  const saveInterview = async (isAbandoned: boolean) => {
    try {
      let authHeaders: Record<string, string> = {};
      try {
        const { getAuthHeaders } = await import("@/lib/chat-api");
        authHeaders = await getAuthHeaders();
      } catch {
        // 候補者はログインしていないので認証ヘッダーなしで続行
      }
      await fetch("/api/save-interview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          token,
          messages,
          elapsed,
          candidateName: invitation.candidate_name,
          jobType: invitation.job_type,
          companyName: invitation.company_name ?? null,
          isAbandoned,
        }),
      });

      // 企業の本番面接の場合のみ、録画をアップロードする(個人/受験生の練習は対象外)
      if (!invitation.practice_mode && screenChunksRef.current.length > 0) {
        try {
          const recordingBlob = new Blob(screenChunksRef.current, { type: "video/webm" });
          const recordingForm = new FormData();
          recordingForm.append("video", recordingBlob, "recording.webm");
          recordingForm.append("token", token);
          await fetch("/api/save-interview-recording", { method: "POST", body: recordingForm });
        } catch (e) {
          console.error("録画のアップロードに失敗:", e);
        }
      }
    } catch (e) {
      console.error("面接履歴の保存に失敗:", e);
    }
  };

  const handleAbandon = async () => {
    if (!window.confirm("途中退出しますか？面接が無効になる場合があります。")) return;
    try {
      await supabase
        .from("interview_invitations")
        .update({ status: "abandoned" } as any)
        .eq("token", token);
      await saveInterview(true);
    } catch (e) {
      console.error("途中退出の記録に失敗:", e);
    }
    onEnd();
  };

  const statusText = isAiSpeaking
    ? "AIが話しています..."
    : isProcessing
      ? "処理中..."
      : isListening
        ? "聞いています..."
        : "話しかけてください（自動で検出します）";
  const statusColor = isAiSpeaking
    ? "#FFB800"
    : isProcessing
      ? "#888"
      : isListening
        ? "#C8FF00"
        : "#C8FF00";

  return (
    <div
      style={{
        width: "100vw",
        height: "100svh",
        background: "#0F0F0F",
        display: "grid",
        gridTemplateRows: "52vh auto auto minmax(80px,1fr) auto",
        padding: "8px 12px",
        gap: 6,
        overflow: "hidden",
        fontFamily: "'Inter',sans-serif",
        boxSizing: "border-box",
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "70px 1fr 1fr",
          gap: 6,
          borderBottom: "1px solid #1A1A1A",
          paddingBottom: 6,
          height: "52vh",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <div style={{ fontSize: "clamp(16px,2.2vw,22px)", color: "#C8FF00", fontWeight: 700 }}>
            {formatTime(elapsed)}
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "#FF4444",
              borderRadius: 4,
              padding: "2px 6px",
              width: "fit-content",
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />
            <span style={{ fontSize: 9, color: "#fff", fontWeight: 700 }}>録画中</span>
          </div>
        </div>

        {/* AIアバター */}
        <div
          style={{
            background: "#0A0A0A",
            border: `2px solid ${isAiSpeaking ? "#C8FF00" : "#1A1A1A"}`,
            borderRadius: 10,
            position: "relative",
            overflow: "hidden",
            transition: "border-color 0.3s",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              fontSize: 12,
              color: "#0F0F0F",
              zIndex: 1,
              fontWeight: 700,
              background: "rgba(255,255,255,0.92)",
              padding: "2px 8px",
              borderRadius: 6,
            }}
          >
            AI面接官
          </span>
          <InterviewerAvatar
            voice={voice}
            style={avatarStyle}
            onReady={() => setAvatarReady(true)}
          />
          {!avatarReady && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: "clamp(40px,8vmin,80px)", lineHeight: 1 }}>🤖</span>
              <span style={{ fontSize: 12, color: "#555" }}>準備中...</span>
            </div>
          )}
          {isAiSpeaking && (
            <div
              style={{
                position: "absolute",
                bottom: 8,
                left: 8,
                background: "#C8FF00",
                color: "#0F0F0F",
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              話しています
            </div>
          )}
        </div>

        {/* 候補者カメラ */}
        <div
          style={{
            background: "#0A0A0A",
            border: `2px solid ${isListening ? "#C8FF00" : "#1A1A1A"}`,
            borderRadius: 10,
            position: "relative",
            overflow: "hidden",
            transition: "border-color 0.3s",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              fontSize: 12,
              color: "#0F0F0F",
              zIndex: 1,
              fontWeight: 700,
              background: "rgba(255,255,255,0.92)",
              padding: "2px 8px",
              borderRadius: 6,
            }}
          >
            {invitation.candidate_name ?? "候補者"}
          </span>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
          />
          {isListening && (
            <div
              style={{
                position: "absolute",
                bottom: 8,
                left: 8,
                background: "#C8FF00",
                color: "#0F0F0F",
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              回答中
            </div>
          )}
        </div>
      </div>

      {/* ステータス・コントロール */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "clamp(6px,1vw,10px)" }}>
        <div
          style={{
            background: "#111",
            border: "1px solid #1A1A1A",
            borderRadius: 8,
            padding: "clamp(6px,1vh,8px) clamp(10px,1.5vw,14px)",
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          <div
            style={{
              fontSize: "clamp(20px,2.6vw,24px)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: statusColor,
            }}
          >
            <span>{isListening ? "🎤" : isAiSpeaking ? "🔊" : "💬"}</span>
            {statusText}
          </div>
          {isAiSpeaking && (
            <div style={{ fontSize: "clamp(9px,1.2vw,11px)", color: "#444" }}>
              ℹ️ AIが話している間は発言をお控えください。
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            onClick={toggleMute}
            style={{
              background: "#1A1A1A",
              border: `1px solid ${isMuted ? "#FF4444" : "#2A2A2A"}`,
              borderRadius: 7,
              padding: "clamp(5px,0.8vh,7px) clamp(10px,1.5vw,14px)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <span style={{ fontSize: "clamp(13px,2vw,16px)" }}>{isMuted ? "🔇" : "🎤"}</span>
            <span style={{ fontSize: 9, color: "#666" }}>ミュート</span>
          </button>
          <button
            onClick={toggleCamera}
            style={{
              background: "#1A1A1A",
              border: `1px solid ${isCameraOff ? "#FF4444" : "#2A2A2A"}`,
              borderRadius: 7,
              padding: "clamp(5px,0.8vh,7px) clamp(10px,1.5vw,14px)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <span style={{ fontSize: "clamp(13px,2vw,16px)" }}>{isCameraOff ? "📵" : "📷"}</span>
            <span style={{ fontSize: 9, color: "#666" }}>カメラ</span>
          </button>
          <button
            onClick={handleAbandon}
            style={{
              background: "#1A1010",
              border: "1px solid #FF4444",
              borderRadius: 7,
              padding: "clamp(5px,0.8vh,7px) clamp(10px,1.5vw,14px)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <span style={{ fontSize: "clamp(13px,2vw,16px)" }}>🚪</span>
            <span style={{ fontSize: 9, color: "#FF4444" }}>途中退出</span>
          </button>
        </div>
      </div>

      {/* 面接情報パネル（大きく見やすく） */}
      <div
        style={{
          flexShrink: 0,
          background: "#111",
          border: "1px solid #2A2A2A",
          borderRadius: 8,
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {(invitation.practice_mode
            ? [
                ["日時", new Date().toLocaleDateString("ja-JP")],
                ["候補者", invitation.candidate_name ?? "—"],
                [
                  invitation.practice_mode === "student" ? "志望校" : "職種",
                  invitation.job_type ?? "—",
                ],
              ]
            : [
                ["日時", new Date().toLocaleDateString("ja-JP")],
                ["企業", invitation.company_name ?? "—"],
                ["候補者", invitation.candidate_name ?? "—"],
                ["職種", invitation.job_type ?? "—"],
              ]
          ).map(([l, v]) => (
            <div key={l} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 11, color: "#666" }}>{l}</span>
              <span style={{ fontSize: 15, color: "#F0F0F0", fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#FFB800",
            textAlign: "right",
            lineHeight: 1.6,
            flexShrink: 0,
          }}
        >
          ⚠️ 面接終了まで画面を閉じないでください
          <br />
          自動で次の画面に切り替わります
        </div>
      </div>

      {/* 保存中オーバーレイ */}
      {isSavingResult && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,15,15,0.92)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            zIndex: 100,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              border: "4px solid #2A2A2A",
              borderTopColor: "#C8FF00",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <p style={{ fontSize: 18, color: "#F0F0F0", fontWeight: 600 }}>
            面接結果を作成しています
          </p>
          <p style={{ fontSize: 13, color: "#888", textAlign: "center", lineHeight: 1.7 }}>
            このまま少々お待ちください。
            <br />
            画面を閉じずにそのままお待ちいただくと、
            <br />
            自動的に終了画面へ切り替わります。
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* 会話ログ */}
      <div
        style={{
          minHeight: 0,
          background: "#0A0A0A",
          border: "1px solid #1A1A1A",
          borderRadius: 8,
          padding: "clamp(12px,2vh,20px) clamp(16px,2.4vw,24px)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          overflowY: "auto",
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#333",
              fontSize: 12,
            }}
          >
            面接を開始しています...
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: m.role === "assistant" ? "flex-start" : "flex-end",
              gap: 2,
            }}
          >
            <div style={{ fontSize: 9, color: "#444" }}>
              {m.role === "assistant" ? "AI面接官" : (invitation.candidate_name ?? "候補者")}
            </div>
            <div
              style={{
                fontSize: "clamp(14px,1.8vw,18px)",
                lineHeight: 1.5,
                padding: "7px 10px",
                maxWidth: "75%",
                borderRadius: m.role === "assistant" ? "0 8px 8px 8px" : "8px 0 8px 8px",
                background: m.role === "assistant" ? "#1A1A1A" : "#1E2A1E",
                color: "#F0F0F0",
                border: `1px solid ${m.role === "assistant" ? "#252525" : "#253525"}`,
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
}
