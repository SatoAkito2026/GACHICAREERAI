/**
 * お知らせのベル（個人・企業の上のメニュー）。未読の数を出し、押すと一覧が開く。
 * 一覧の下から、この端末へのプッシュ通知をオンにできる。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, BellRing } from "lucide-react";
import { talentApi } from "@/components/talent/TalentUI";

type Item = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "たった今";
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}日前` : new Date(iso).toLocaleDateString("ja-JP");
}

function toUint8(base64url: string): Uint8Array<ArrayBuffer> {
  const s = atob(base64url.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function isIosBrowserTab(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [push, setPush] = useState<PushState>("unsupported");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await talentApi<{ items: Item[]; unread: number }>("/api/notifications");
    if (r.ok) {
      setItems(r.data.items);
      setUnread(r.data.unread);
    }
  }, []);

  // 1分ごとに未読を確かめる（画面を見ていないときは止める）
  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    return () => clearInterval(t);
  }, [load]);

  // この端末のプッシュ通知の状態
  useEffect(() => {
    if (!pushSupported() || !VAPID_PUBLIC_KEY) {
      setPush(typeof window !== "undefined" && isIosBrowserTab() ? "needs-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") return setPush("denied");
    void navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setPush(sub ? "on" : "off");
    });
  }, []);

  // 外を押したら閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      await talentApi("/api/notifications", { action: "read_all" });
    }
  };

  const enablePush = async () => {
    if (!VAPID_PUBLIC_KEY) return;
    setPushBusy(true);
    setPushError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPush(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toUint8(VAPID_PUBLIC_KEY),
        }));
      const r = await talentApi("/api/notifications", {
        action: "subscribe",
        subscription: sub.toJSON(),
      });
      if (!r.ok) throw new Error(r.data.error);
      setPush("on");
    } catch (e) {
      console.error(e);
      setPushError("通知をオンにできませんでした。もう一度お試しください");
    } finally {
      setPushBusy(false);
    }
  };

  const disablePush = async () => {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await talentApi("/api/notifications", { action: "unsubscribe", endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setPush("off");
    } finally {
      setPushBusy(false);
    }
  };

  const go = (item: Item) => {
    setOpen(false);
    if (!item.link) return;
    // ?id= などが付いた移動先もそのまま開く
    void navigate({ href: item.link });
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        className="relative flex h-10 w-10 items-center justify-center rounded-full active:bg-[#222]"
        aria-label={unread > 0 ? `お知らせ（未読${unread}件）` : "お知らせ"}
      >
        {unread > 0 ? <BellRing size={20} color="#F0F0F0" /> : <Bell size={20} color="#CCCCCC" />}
        {unread > 0 && (
          <span
            className="absolute right-1 top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px]"
            style={{ background: "#FF4D4D", color: "#fff", fontWeight: 700 }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-x-2 top-[56px] z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[360px]"
          style={{
            background: "#1A1A1A",
            border: "1px solid #333",
            boxShadow: "0 12px 40px rgba(0,0,0,.5)",
          }}
        >
          <p className="px-4 pt-3 pb-2 text-[13px]" style={{ color: "#F0F0F0", fontWeight: 700 }}>
            お知らせ
          </p>
          <div className="flex-1 overflow-y-auto">
            {items === null ? (
              <p className="px-4 py-6 text-center text-[13px]" style={{ color: "#888" }}>
                読み込み中...
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px]" style={{ color: "#888" }}>
                まだお知らせはありません
              </p>
            ) : (
              items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => go(it)}
                  className="flex w-full gap-2.5 px-4 py-3 text-left hover:bg-[#222]"
                  style={{ borderTop: "1px solid #262626" }}
                >
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: it.read_at ? "transparent" : "#C8FF00" }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-[13px]"
                      style={{ color: "#F0F0F0", fontWeight: 600 }}
                    >
                      {it.title}
                    </span>
                    {it.body && (
                      <span
                        className="mt-0.5 line-clamp-2 block text-[12px]"
                        style={{ color: "#AAA" }}
                      >
                        {it.body}
                      </span>
                    )}
                    <span className="mt-0.5 block text-[11px]" style={{ color: "#777" }}>
                      {timeAgo(it.created_at)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
          <div
            className="px-4 py-3 text-[12px]"
            style={{ borderTop: "1px solid #333", color: "#999" }}
          >
            {push === "on" && (
              <div className="flex items-center justify-between gap-2">
                <span>この端末に通知が届きます</span>
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() => void disablePush()}
                  style={{ color: "#888" }}
                >
                  オフにする
                </button>
              </div>
            )}
            {push === "off" && (
              <button
                type="button"
                disabled={pushBusy}
                onClick={() => void enablePush()}
                className="w-full rounded-lg py-2 text-[13px] disabled:opacity-50"
                style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
              >
                {pushBusy ? "設定中..." : "この端末にも通知を受け取る"}
              </button>
            )}
            {push === "denied" && (
              <span>
                通知がブロックされています。ブラウザの設定で、このサイトの通知を許可してください。
              </span>
            )}
            {push === "needs-install" && (
              <span>
                iPhoneで通知を受け取るには、共有ボタンから「ホーム画面に追加」して、追加したアプリから開いてください。
              </span>
            )}
            {push === "unsupported" && <span>この端末では通知を受け取れません。</span>}
            {pushError && (
              <p className="mt-1" style={{ color: "#FF6B6B" }}>
                {pushError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
