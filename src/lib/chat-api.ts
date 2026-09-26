import { supabase } from "@/integrations/supabase/client";

/**
 * 現在のセッションの有効なアクセストークンを返す。
 * - セッションが無ければ null
 * - 期限切れ／期限間近なら refreshSession で更新を試みる
 */
async function getValidAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  if (!session) return null;

  // expires_at は「秒」単位の UNIX time。60秒以内に切れるなら更新する。
  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
  const isExpiringSoon = expiresAt > 0 && expiresAt - Date.now() < 60_000;
  if (isExpiringSoon) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session) session = refreshed.session;
  }

  return session.access_token ?? null;
}

/** 現在のセッションのアクセストークンを Authorization ヘッダ形式で返す */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type ChatApiPayload = {
  system: string;
  user: string;
  plan?: string;
};

export async function postChatApi(payload: ChatApiPayload) {
  const endpoint = "/api/chat";
  const token = await getValidAccessToken();
  if (!token) {
    // 未ログイン／セッション切れの状態では 401 を投げずに、明確なエラーで止める
    throw new Error("NOT_AUTHENTICATED");
  }
  const authHeaders = { Authorization: `Bearer ${token}` };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("APIレスポンスエラー:", endpoint, res.status, detail);
    throw new Error(`status ${res.status}`);
  }

  return await res.json();
}
