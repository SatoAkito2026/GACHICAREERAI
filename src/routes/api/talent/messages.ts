/**
 * 承諾された面談申し込みのメッセージ（企業とユーザーの直接のやり取り）
 *
 * GET  /api/talent/messages?requestId=   → メッセージ一覧（開いた側の未読を既読にする）
 * POST /api/talent/messages { requestId, body } → 送信（相手にメールで知らせる）
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import {
  getCompanyProfile,
  getUserEmail,
  jsonResponse,
  sendNotice,
  serviceClient,
} from "@/lib/talent";

// 同じ相手へのメール通知は、この間隔より短いときは送らない（連投でメールが大量に届かないように）
const NOTIFY_INTERVAL_MS = 10 * 60 * 1000;

async function loadRequest(supabase: any, requestId: string, userId: string) {
  const { data: r } = await supabase
    .from("contact_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!r || (r.company_user_id !== userId && r.candidate_user_id !== userId)) return null;
  return r as {
    id: string;
    company_user_id: string;
    candidate_user_id: string;
    status: string;
    message: string;
    created_at: string;
  };
}

export const Route = createFileRoute("/api/talent/messages")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const requestId = new URL(request.url).searchParams.get("requestId") ?? "";
        const r = await loadRequest(supabase, requestId, auth.userId);
        if (!r) return jsonResponse({ error: "見つかりません" }, 404);

        const { data: messages } = await supabase
          .from("contact_messages")
          .select("id, sender_user_id, body, created_at, read_at")
          .eq("request_id", r.id)
          .order("created_at", { ascending: true })
          .limit(500);
        await supabase
          .from("contact_messages")
          .update({ read_at: new Date().toISOString() })
          .eq("request_id", r.id)
          .neq("sender_user_id", auth.userId)
          .is("read_at", null);

        const isCompany = r.company_user_id === auth.userId;
        const company = await getCompanyProfile(supabase, r.company_user_id);
        const { data: p } = await supabase
          .from("candidate_profiles")
          .select("display_name, public_code")
          .eq("user_id", r.candidate_user_id)
          .maybeSingle();

        return jsonResponse({
          request: { id: r.id, status: r.status, message: r.message, createdAt: r.created_at },
          me: isCompany ? "company" : "candidate",
          companyName: company?.company_name ?? "企業",
          candidateName: p?.display_name || "候補者",
          candidateCode: p?.public_code ?? null,
          messages: (messages ?? []).map((m) => ({
            id: m.id,
            mine: m.sender_user_id === auth.userId,
            body: m.body,
            createdAt: m.created_at,
            read: !!m.read_at,
          })),
        });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        let body: { requestId?: unknown; body?: unknown };
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }
        const r = await loadRequest(supabase, String(body.requestId ?? ""), auth.userId);
        if (!r) return jsonResponse({ error: "見つかりません" }, 404);
        if (r.status !== "accepted") {
          return jsonResponse({ error: "面談の申し込みが承諾されてからメッセージを送れます" }, 400);
        }
        const text = typeof body.body === "string" ? body.body.trim().slice(0, 4000) : "";
        if (!text) return jsonResponse({ error: "メッセージを入力してください" }, 400);

        // 直前に自分が送ったメッセージ（メール通知を送るか決めるため）
        const { data: lastMine } = await supabase
          .from("contact_messages")
          .select("created_at")
          .eq("request_id", r.id)
          .eq("sender_user_id", auth.userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: saved, error } = await supabase
          .from("contact_messages")
          .insert({ request_id: r.id, sender_user_id: auth.userId, body: text })
          .select("id, created_at")
          .maybeSingle();
        if (error || !saved) return jsonResponse({ error: "送信に失敗しました" }, 500);

        const recent =
          lastMine && Date.now() - new Date(lastMine.created_at).getTime() < NOTIFY_INTERVAL_MS;
        if (!recent) {
          const fromCompany = r.company_user_id === auth.userId;
          const to = fromCompany ? r.candidate_user_id : r.company_user_id;
          let fromName = "候補者";
          if (fromCompany) {
            fromName =
              (await getCompanyProfile(supabase, r.company_user_id))?.company_name ?? "企業";
          } else {
            const { data: p } = await supabase
              .from("candidate_profiles")
              .select("display_name")
              .eq("user_id", r.candidate_user_id)
              .maybeSingle();
            fromName = p?.display_name ? `${p.display_name} さん` : "候補者";
          }
          await sendNotice(
            await getUserEmail(supabase, to),
            `${fromName} から新しいメッセージが届きました`,
            [
              `${fromName} から新しいメッセージが届きました。`,
              text.slice(0, 200) + (text.length > 200 ? "…" : ""),
            ],
            {
              label: "メッセージを開く",
              path: fromCompany
                ? `/private/individual/offers?id=${r.id}`
                : `/business/company/messages?id=${r.id}`,
            },
          );
        }
        return jsonResponse({ ok: true, id: saved.id, createdAt: saved.created_at });
      },
    },
  },
});
