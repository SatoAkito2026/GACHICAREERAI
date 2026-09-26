/**
 * この端末を識別するための永続UUIDを扱うヘルパー。
 * Supabaseのセッショントークンとは別物で、ブラウザ/端末ごとに
 * localStorageへ一度だけ生成して保存する。
 * ログアウトしても消さない(同じ端末からの再ログインを「同じ端末」として
 * 扱いたいため。ブラウザのデータ削除やシークレットモードでは別端末扱いになる)。
 */
const DEVICE_ID_KEY = "interview_ally_device_id";

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server";

  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;

    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    // localStorageが使えない環境(プライベートモード等)向けのフォールバック。
    // 永続化はできないが、最低限クラッシュはしない。
    return `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/** 表示用の簡易端末ラベル(例: "Chrome / Mac") */
export function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown device";

  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Safari\//.test(ua)
        ? "Safari"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : "ブラウザ";

  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows"
          : "OS不明";

  return `${browser} / ${os}`;
}
