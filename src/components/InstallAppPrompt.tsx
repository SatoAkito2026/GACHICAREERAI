/**
 * スマホで「ホーム画面に追加（アプリとして使う）」を案内する。
 * - Android（Chrome など）：ブラウザのインストール機能をボタン1つで呼び出す
 * - iPhone / iPad（Safari）：仕組み上ボタンで追加できないので、共有ボタンからの手順を出す
 * すでにアプリとして開いているとき・閉じたあと（30日）は出さない。サービスワーカーの登録もここで行う。
 */
import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Share, SquarePlus, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "install-app-dismissed-at";
const DISMISS_DAYS = 30;
const HOME_PATHS = [
  "/private",
  "/private/individual",
  "/private/student",
  "/mypage",
  "/business/company",
];

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    // iPadOS はパソコン版の Safari と名乗るので、タッチ対応かどうかで見分ける
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function InstallAppPrompt() {
  const { session } = useAuth();
  const location = useLocation();
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (isStandalone() || recentlyDismissed()) return;
    const small = window.matchMedia("(max-width: 1100px)").matches;
    if (!small) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if (isIos()) {
      setIos(true);
      setShow(true);
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  // ログイン後のホーム画面とマイページだけで案内する（ほかの画面の作業のじゃまをしない）
  const path = location.pathname.replace(/\/$/, "");
  const allowed = !!session && HOME_PATHS.includes(path);
  if (!show || !allowed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // 保存できなくても閉じる
    }
    setShow(false);
  };

  const install = async () => {
    if (installEvent) {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice.catch(() => ({
        outcome: "dismissed" as const,
      }));
      if (outcome === "accepted") setShow(false);
      setInstallEvent(null);
    } else if (ios) {
      setIosHelp(true);
    }
  };

  return (
    <div
      className="fixed inset-x-3 z-[60] rounded-2xl p-4 shadow-2xl md:left-auto md:right-5 md:w-[360px]"
      style={{
        top: "max(12px, env(safe-area-inset-top))",
        background: "#1A1A1A",
        border: "1px solid #C8FF00",
      }}
      role="dialog"
      aria-label="アプリとして使う"
    >
      <div className="flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px]" style={{ color: "#F0F0F0", fontWeight: 700 }}>
            アプリとして使えます
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: "#AAAAAA" }}>
            ホーム画面に追加すると、アイコンからすぐ開けて、画面いっぱいに使えます。
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="閉じる"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: "#2A2A2A", color: "#888" }}
        >
          <X size={14} />
        </button>
      </div>

      {iosHelp ? (
        <ol className="mt-3 flex flex-col gap-2 text-[13px]" style={{ color: "#F0F0F0" }}>
          <li className="flex items-center gap-2">
            <span style={{ color: "#C8FF00", fontWeight: 700 }}>1.</span>
            画面の下（iPadは上）の
            <Share size={16} color="#4DA3FF" />
            共有ボタンを押す
          </li>
          <li className="flex items-center gap-2">
            <span style={{ color: "#C8FF00", fontWeight: 700 }}>2.</span>
            <SquarePlus size={16} />
            「ホーム画面に追加」を押す
          </li>
          <li className="flex items-center gap-2">
            <span style={{ color: "#C8FF00", fontWeight: 700 }}>3.</span>
            右上の「追加」を押す
          </li>
          <li className="text-[11px]" style={{ color: "#888" }}>
            ※ Safari で開いているときだけ追加できます（LINE などのアプリ内で開いている場合は、Safari
            で開き直してください）
          </li>
        </ol>
      ) : (
        <button
          type="button"
          onClick={() => void install()}
          className="mt-3 w-full rounded-xl py-2.5 text-[14px]"
          style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
        >
          {ios ? "追加のしかたを見る" : "ホーム画面に追加する"}
        </button>
      )}
    </div>
  );
}
