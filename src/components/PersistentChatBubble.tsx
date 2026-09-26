import { useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type ChatMessage = { role: "user" | "assistant"; content: string };

function ChatPanel({ mode, onClose }: { mode: "individual" | "student"; onClose: () => void }) {
  const { session } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [pendingImage, setPendingImage] = useState<{
    data: string;
    mediaType: string;
    previewUrl: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 開いた時に、このモードの最新セッションの続きを読み込む
  useEffect(() => {
    if (!session) return;
    setHistoryLoaded(false);
    (async () => {
      const { data: latestSession } = await (supabase
        .from("career_chat_sessions")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("mode", mode)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle() as any);

      if (latestSession?.id) {
        setSessionId(latestSession.id);
        const { data: history } = await (supabase
          .from("career_chat_messages")
          .select("role, content")
          .eq("session_id", latestSession.id)
          .order("created_at", { ascending: true }) as any);
        setMessages((history ?? []) as ChatMessage[]);
      } else {
        setSessionId(null);
        setMessages([]);
      }
      setHistoryLoaded(true);
    })();
  }, [session, mode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じファイルを連続で選んでも change が発火するようにする
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("画像ファイルを選んでください");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      setPendingImage({ data: base64, mediaType: file.type, previewUrl: result });
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if (!session) return;
    const text = input.trim();
    if (!text && !pendingImage) return;
    if (sending) return;
    setInput("");
    const imageToSend = pendingImage;
    setPendingImage(null);
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: imageToSend ? `📷 画像を送信しました${text ? `\n${text}` : ""}` : text,
      },
    ]);
    setSending(true);
    try {
      const res = await fetch(`/api/career-chat?_t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
        body: JSON.stringify({
          sessionId,
          message: text,
          ...(imageToSend
            ? { image: { data: imageToSend.data, mediaType: imageToSend.mediaType } }
            : {}),
        }),
      });
      if (res.status === 429) {
        const errBody = (await res.json().catch(() => null)) as { message?: string } | null;
        toast.error(errBody?.message ?? "本日の画像送信の上限に達しました");
        setMessages((prev) => prev.slice(0, -1));
        setInput(text);
        setPendingImage(imageToSend);
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { sessionId: string; reply: string };
      setSessionId(data.sessionId);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (e) {
      console.error(e);
      toast.error("送信に失敗しました。もう一度お試しください");
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
      setPendingImage(imageToSend);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed bottom-24 right-5 z-50 flex flex-col overflow-hidden rounded-2xl shadow-2xl"
      style={{ width: 340, height: 480, background: "#151515", border: "1px solid #2A2A2A" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: "#1A1A1A", borderBottom: "1px solid #2A2A2A" }}
      >
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700 }}>💬 AIチャット</p>
        <button onClick={onClose} style={{ color: "#888888", fontSize: 18 }} aria-label="閉じる">
          ×
        </button>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {!historyLoaded && <p style={{ color: "#666666", fontSize: 12 }}>読み込み中...</p>}
        {historyLoaded && messages.length === 0 && (
          <div
            className="rounded-xl p-3 text-[13px]"
            style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", color: "#999999" }}
          >
            こんにちは！面接の不安、自己PRの相談、なんでも聞いてください。
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed"
              style={
                m.role === "user"
                  ? { background: "#C8FF00", color: "#0F0F0F" }
                  : { background: "#1A1A1A", border: "1px solid #2A2A2A", color: "#F0F0F0" }
              }
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div
              className="rounded-xl px-3 py-2 text-[12px]"
              style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", color: "#888888" }}
            >
              考え中...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {pendingImage && (
        <div className="flex items-center gap-2 px-3 pt-2">
          <img
            src={pendingImage.previewUrl}
            alt="添付画像"
            className="h-10 w-10 rounded-lg object-cover"
          />
          <span style={{ color: "#999999", fontSize: 12 }}>画像を添付済み</span>
          <button onClick={() => setPendingImage(null)} style={{ color: "#FF6B6B", fontSize: 12 }}>
            取り消す
          </button>
        </div>
      )}
      <div className="flex gap-2 p-3" style={{ borderTop: "1px solid #2A2A2A" }}>
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 rounded-full px-3 text-[16px]"
          style={{ background: "#0F0F0F", border: "1px solid #2A2A2A", color: "#CCCCCC" }}
          aria-label="画像を添付"
          type="button"
        >
          📎
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(e) => {
            // 日本語入力中(漢字変換の確定等)のEnterでは送信しない。
            // isComposingのチェックだけだとブラウザによって確定直後の
            // Enterで反応しないことがあるため、composingRefも併用する。
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              !composingRef.current
            ) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="メッセージを入力..."
          className="flex-1"
          style={{
            background: "#0F0F0F",
            border: "1px solid #2A2A2A",
            borderRadius: 999,
            color: "#F0F0F0",
            padding: "8px 14px",
            fontSize: 13,
          }}
        />
        <button
          onClick={handleSend}
          disabled={sending || (!input.trim() && !pendingImage)}
          className="shrink-0 rounded-full px-4 text-[13px] transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
        >
          送信
        </button>
      </div>
    </div>
  );
}

/**
 * 個人/受験生配下のページでだけ表示する、右下固定のチャット吹き出し。
 * __root.tsx に置くことで、ページ移動・スクロールしても消えない。
 * パネル自体もこのコンポーネントの中でopen状態を持つため、
 * ページ遷移してもチャットが消えたりクリアされたりしない
 * (会話内容はDBに保存されており、開いた時に毎回最新の続きを読み込む)。
 */
export function PersistentChatBubble() {
  const { session } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const isIndividual = location.pathname.startsWith("/private/individual");
  const isStudent = location.pathname.startsWith("/private/student");

  if (!session || (!isIndividual && !isStudent)) return null;

  const mode: "individual" | "student" = isStudent ? "student" : "individual";

  return (
    <>
      {isOpen && <ChatPanel mode={mode} onClose={() => setIsOpen(false)} />}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full text-[24px] shadow-2xl transition-transform hover:scale-105"
        style={{ background: "#C8FF00", color: "#0F0F0F" }}
        aria-label="AIチャットを開く"
      >
        {isOpen ? "×" : "💬"}
      </button>
    </>
  );
}
