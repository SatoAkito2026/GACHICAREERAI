/**
 * お知らせ（サーバー専用）。
 * アプリ内のベル（notifications）に記録し、登録済みの端末にプッシュ通知を送る。
 *
 * プッシュは中身を載せない「合図だけ」で送り、端末側（public/sw.js）が
 * /api/notifications/peek から最新のお知らせを取りに来て表示する（暗号化の処理を持たずに済む）。
 * 送り元の証明は VAPID（ES256 の署名）。鍵は VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type NoticeKind =
  | "unlocked"
  | "contact_request"
  | "contact_accepted"
  | "message"
  | "application"
  | "practice_reminder"
  | "referral"
  | "studio";

export type Notice = { kind: NoticeKind; title: string; body?: string; link?: string };

/** お知らせを1件残して、その人の端末にプッシュを送る。失敗しても処理は止めない */
export async function notify(
  supabase: SupabaseClient,
  userId: string,
  notice: Notice,
  { push = true }: { push?: boolean } = {},
): Promise<void> {
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      kind: notice.kind,
      title: notice.title.slice(0, 120),
      body: (notice.body ?? "").slice(0, 300),
      link: notice.link ?? null,
    });
    if (push) await pushToUser(supabase, userId);
  } catch (e) {
    console.error("[notify] failed", e);
  }
}

async function pushToUser(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint")
    .eq("user_id", userId)
    .limit(10);
  for (const sub of subs ?? []) {
    const status = await sendPush(sub.endpoint);
    // 端末側で通知をやめた・アプリを消した登録は片づける
    if (status === 404 || status === 410) {
      await supabase.from("push_subscriptions").delete().eq("id", sub.id);
    }
  }
}

// ---- VAPID ------------------------------------------------------------------

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

let signingKey: Promise<CryptoKey> | null = null;
function vapidKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  if (!signingKey) {
    const pub = fromB64url(publicKey); // 0x04 + X(32) + Y(32)
    signingKey = crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        d: privateKey,
        x: b64url(pub.slice(1, 33)),
        y: b64url(pub.slice(33, 65)),
        ext: true,
      },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  }
  return signingKey;
}

/** 中身なしのプッシュを1件送る。送った先の HTTP ステータスを返す（鍵が無ければ 0） */
async function sendPush(endpoint: string): Promise<number> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return 0;
  try {
    const enc = new TextEncoder();
    const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
    const claims = b64url(
      enc.encode(
        JSON.stringify({
          aud: new URL(endpoint).origin,
          exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
          sub: process.env.APP_URL || "https://gachicareer-ai.akitogroup.jp",
        }),
      ),
    );
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      await vapidKey(publicKey, privateKey),
      enc.encode(`${header}.${claims}`),
    );
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${header}.${claims}.${b64url(signature)}, k=${publicKey}`,
        TTL: "86400",
        Urgency: "normal",
        "Content-Length": "0",
      },
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      console.error("[notify] push failed", res.status, await res.text().catch(() => ""));
    }
    return res.status;
  } catch (e) {
    console.error("[notify] push failed", e);
    return 0;
  }
}

// ---- 練習のリマインド（毎時の Cron から。日本時間の19時台だけ送る） ----------------

const REMIND_AFTER_DAYS = 3;
const REMIND_EVERY_DAYS = 7;

export async function runPracticeReminderJob(): Promise<void> {
  const jstHour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();
  if (jstHour !== 19) return;
  const { createClient } = await import("@supabase/supabase-js");
  const { getSupabaseUrl, getServiceRoleKey } = await import("@/lib/api-auth");
  const key = getServiceRoleKey();
  if (!key) return;
  const supabase = createClient(getSupabaseUrl(), key);

  const now = Date.now();
  const remindBefore = new Date(now - REMIND_AFTER_DAYS * 86400000).toISOString();
  // 対象：個人・受験生で、登録から3日以上たち、3日以上練習していない人
  const { data: users } = await supabase
    .from("profiles")
    .select("id, user_mode")
    .in("user_mode", ["private_individual", "private_student"])
    .lt("created_at", remindBefore)
    .limit(2000);
  const ids = (users ?? []).map((u) => u.id);
  if (ids.length === 0) return;

  const [{ data: recentPractice }, { data: recentReminders }] = await Promise.all([
    supabase
      .from("interviews")
      .select("user_id")
      .in("user_id", ids)
      .in("mode", ["individual", "student"])
      .gte("created_at", remindBefore)
      .limit(10000),
    supabase
      .from("notifications")
      .select("user_id")
      .in("user_id", ids)
      .eq("kind", "practice_reminder")
      .gte("created_at", new Date(now - REMIND_EVERY_DAYS * 86400000).toISOString())
      .limit(10000),
  ]);
  const skip = new Set([
    ...(recentPractice ?? []).map((r) => r.user_id),
    ...(recentReminders ?? []).map((r) => r.user_id),
  ]);
  const targets = (users ?? []).filter((u) => !skip.has(u.id)).slice(0, 300);
  for (const u of targets) {
    const student = u.user_mode === "private_student";
    await notify(supabase, u.id, {
      kind: "practice_reminder",
      title: "そろそろ模擬面接の練習をしませんか？",
      body: student
        ? "少しずつでも続けると、本番で落ち着いて話せるようになります。"
        : "続けるほど評価が上がり、企業の目にも留まりやすくなります。",
      link: student ? "/private/student/practice" : "/private/individual/practice",
    });
  }
}
