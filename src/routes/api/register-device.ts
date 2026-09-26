/**
 * 端末登録・上限管理API
 *
 * POST /api/register-device
 *   ログイン成功直後に呼ぶ。device_id を有効化し、
 *   プラン上限(free/light=1台, pro=4台)を超えていれば
 *   最も last_seen_at が古い端末を自動的に無効化(is_active=false)する。
 *
 * GET /api/register-device?deviceId=...
 *   アプリ起動時・定期チェック用。書き込みは一切行わず、
 *   この device_id が現在 is_active かどうかだけを返す。
 *   (ここで active 化してしまうと、追い出された端末が
 *    自己申告だけで復活できてしまうため read-only にしている)
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey, getDeviceLimit, verifyApiUser } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  // GET /api/register-device は同じURL(同じdeviceId)に対して
  // Authorizationヘッダだけが変わる形で繰り返し呼ばれる。
  // CDN/ブラウザがURLだけを見てキャッシュすると、古いユーザーの
  // 401やactive状態を別ユーザー/別セッションに使い回してしまうため、
  // 明示的にキャッシュ禁止にする。
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/register-device")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      // ---- 読み取り専用: このdevice_idが今も有効か確認する ----
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const url = new URL(request.url);
        const deviceId = url.searchParams.get("deviceId");
        if (!deviceId) return json({ error: "deviceId is required" }, 400);

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Supabase config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);

        const { data, error } = await supabase
          .from("user_devices")
          .select("is_active")
          .eq("user_id", auth.userId)
          .eq("device_id", deviceId)
          .maybeSingle();

        if (error) return json({ error: "lookup_failed" }, 500);
        // 未登録のdeviceは「無効」として扱う(=ログアウトさせる)。
        // 正規のログインフローでは必ずPOSTで先に登録されているはずのため。
        return json({ active: data?.is_active ?? false });
      },

      // ---- 書き込みあり: ログイン時の端末登録+上限超過時の追い出し ----
      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const body = (await request.json().catch(() => null)) as {
          deviceId?: string;
          deviceLabel?: string;
        } | null;
        const deviceId = body?.deviceId?.trim();
        if (!deviceId) return json({ error: "deviceId is required" }, 400);

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Supabase config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);
        const userId = auth.userId;

        // この端末を有効化(新規登録 or 再ログイン)。
        // upsertなので、以前追い出されていた同じdeviceIdでの再ログインも問題なく通す。
        const { error: upsertError } = await supabase.from("user_devices").upsert(
          {
            user_id: userId,
            device_id: deviceId,
            device_label: body?.deviceLabel ?? null,
            is_active: true,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "user_id,device_id" },
        );
        if (upsertError) return json({ error: "register_failed" }, 500);

        // プラン別の上限台数を取得
        const limit = await getDeviceLimit(auth.token, userId);

        // 現在アクティブな端末を古い順に取得
        const { data: activeDevices, error: listError } = await supabase
          .from("user_devices")
          .select("id, device_id, device_label, last_seen_at")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("last_seen_at", { ascending: true });

        if (listError) return json({ error: "list_failed" }, 500);

        const devices = activeDevices ?? [];
        const excess = devices.length - limit;

        if (excess > 0) {
          // 今回ログインした端末自身は絶対に追い出さないよう除外してから、
          // 古い順に excess 件だけ無効化する
          const evictable = devices.filter((d) => d.device_id !== deviceId);
          const toEvict = evictable.slice(0, excess).map((d) => d.id);

          if (toEvict.length > 0) {
            const { error: evictError } = await supabase
              .from("user_devices")
              .update({ is_active: false })
              .in("id", toEvict);
            if (evictError) return json({ error: "evict_failed" }, 500);
          }
        }

        const { data: finalDevices } = await supabase
          .from("user_devices")
          .select("device_id, device_label, last_seen_at")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("last_seen_at", { ascending: false });

        return json({ ok: true, limit, devices: finalDevices ?? [] });
      },
    },
  },
});
