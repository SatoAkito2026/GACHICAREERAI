/**
 * 面談の申し込み
 *
 * GET  /api/talent/contacts?as=company|candidate     → 自分が送った / 受け取った申し込みの一覧
 * POST { action: "request", code, message }          → 企業が申し込む（チケット購入済みの人だけ）
 * POST { action: "respond", requestId, accept }      → ユーザーが承諾 / 辞退する
 * POST { action: "withdraw", requestId }             → 企業が取り下げる（承諾前だけ）
 *
 * 運営は仲介しない。承諾されたら、企業とユーザーがメッセージで直接やり取りする。
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import {
  COMPANY_REQUIRED_MESSAGE,
  getCompanyProfile,
  getUserEmail,
  jsonResponse,
  sendNotice,
  serviceClient,
} from "@/lib/talent";

export const Route = createFileRoute("/api/talent/contacts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const as =
          new URL(request.url).searchParams.get("as") === "company" ? "company" : "candidate";

        const { data: requests } = await supabase
          .from("contact_requests")
          .select("*")
          .eq(as === "company" ? "company_user_id" : "candidate_user_id", auth.userId)
          .order("created_at", { ascending: false })
          .limit(200);
        const list = requests ?? [];
        const ids = list.map((r) => r.id);

        // 未読の数（相手から届いたメッセージのうち、まだ開いていないもの）
        const { data: unread } = await supabase
          .from("contact_messages")
          .select("request_id")
          .in("request_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
          .neq("sender_user_id", auth.userId)
          .is("read_at", null);
        const unreadBy = new Map<string, number>();
        for (const m of unread ?? [])
          unreadBy.set(m.request_id, (unreadBy.get(m.request_id) ?? 0) + 1);

        if (as === "company") {
          const cids = list.map((r) => r.candidate_user_id);
          const { data: profiles } = await supabase
            .from("candidate_profiles")
            .select("user_id, public_code, display_name, headline")
            .in("user_id", cids.length ? cids : ["00000000-0000-0000-0000-000000000000"]);
          const by = new Map((profiles ?? []).map((p) => [p.user_id, p]));
          return jsonResponse({
            requests: list.map((r) => {
              const p = by.get(r.candidate_user_id);
              return {
                id: r.id,
                status: r.status,
                message: r.message,
                createdAt: r.created_at,
                respondedAt: r.responded_at,
                code: p?.public_code ?? null,
                name: p?.display_name || "（名前未登録）",
                headline: p?.headline ?? null,
                unread: unreadBy.get(r.id) ?? 0,
              };
            }),
          });
        }

        const companyIds = list.map((r) => r.company_user_id);
        const { data: companies } = await supabase
          .from("profiles")
          .select(
            "id, company_name, industry, employee_count, company_address, business_description, hiring_positions, remote_policy, salary_range",
          )
          .in("id", companyIds.length ? companyIds : ["00000000-0000-0000-0000-000000000000"]);
        const cby = new Map((companies ?? []).map((c) => [c.id, c]));
        return jsonResponse({
          requests: list
            .filter((r) => r.status !== "withdrawn")
            .map((r) => {
              const c = cby.get(r.company_user_id);
              return {
                id: r.id,
                status: r.status,
                message: r.message,
                createdAt: r.created_at,
                respondedAt: r.responded_at,
                unread: unreadBy.get(r.id) ?? 0,
                company: {
                  name: c?.company_name ?? "企業",
                  industry: c?.industry ?? null,
                  employeeCount: c?.employee_count ?? null,
                  address: c?.company_address ?? null,
                  description: c?.business_description ?? null,
                  positions: c?.hiring_positions ?? null,
                  remotePolicy: c?.remote_policy ?? null,
                  salaryRange: c?.salary_range ?? null,
                },
              };
            }),
        });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);

        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }

        if (body.action === "request") {
          const company = await getCompanyProfile(supabase, auth.userId);
          if (!company)
            return jsonResponse({ error: COMPANY_REQUIRED_MESSAGE, needsCompany: true }, 403);
          const message =
            typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
          if (message.length < 10) {
            return jsonResponse({ error: "メッセージを10文字以上で書いてください" }, 400);
          }
          const { data: p } = await supabase
            .from("candidate_profiles")
            .select("user_id, is_public")
            .eq("public_code", String(body.code ?? ""))
            .maybeSingle();
          if (!p) return jsonResponse({ error: "プロフィールが見つかりません" }, 404);
          if (!p.is_public)
            return jsonResponse({ error: "この方は現在プロフィールを非公開にしています" }, 400);
          const { data: unlock } = await supabase
            .from("profile_unlocks")
            .select("id")
            .eq("company_user_id", auth.userId)
            .eq("candidate_user_id", p.user_id)
            .maybeSingle();
          if (!unlock) return jsonResponse({ error: "先にチケットを購入してください" }, 402);

          const { data: existing } = await supabase
            .from("contact_requests")
            .select("id, status")
            .eq("company_user_id", auth.userId)
            .eq("candidate_user_id", p.user_id)
            .maybeSingle();
          if (existing && existing.status !== "withdrawn") {
            return jsonResponse({ error: "すでに申し込み済みです" }, 409);
          }
          const now = new Date().toISOString();
          const { data: created, error } = existing
            ? await supabase
                .from("contact_requests")
                .update({ status: "pending", message, created_at: now, responded_at: null })
                .eq("id", existing.id)
                .select("id")
                .maybeSingle()
            : await supabase
                .from("contact_requests")
                .insert({ company_user_id: auth.userId, candidate_user_id: p.user_id, message })
                .select("id")
                .maybeSingle();
          if (error || !created) return jsonResponse({ error: "申し込みに失敗しました" }, 500);

          await sendNotice(
            await getUserEmail(supabase, p.user_id),
            `${company.company_name} から面談の申し込みが届きました`,
            [
              `${company.company_name} から、面談の申し込みが届きました。`,
              `メッセージ：${message.slice(0, 300)}${message.length > 300 ? "…" : ""}`,
              "承諾すると、企業と直接メッセージでやり取りできます。興味がなければ辞退できます（辞退しても相手に理由は伝わりません）。",
            ],
            { label: "申し込みを確認する", path: "/private/individual/offers" },
          );
          return jsonResponse({ ok: true, id: created.id });
        }

        const requestId = typeof body.requestId === "string" ? body.requestId : "";
        const { data: r } = await supabase
          .from("contact_requests")
          .select("*")
          .eq("id", requestId)
          .maybeSingle();
        if (!r) return jsonResponse({ error: "申し込みが見つかりません" }, 404);

        if (body.action === "respond") {
          if (r.candidate_user_id !== auth.userId) return jsonResponse({ error: "Forbidden" }, 403);
          if (r.status !== "pending")
            return jsonResponse({ error: "この申し込みには回答済みです" }, 409);
          const accept = body.accept === true;
          await supabase
            .from("contact_requests")
            .update({
              status: accept ? "accepted" : "declined",
              responded_at: new Date().toISOString(),
            })
            .eq("id", r.id);
          if (accept) {
            const { data: p } = await supabase
              .from("candidate_profiles")
              .select("display_name, public_code")
              .eq("user_id", r.candidate_user_id)
              .maybeSingle();
            await sendNotice(
              await getUserEmail(supabase, r.company_user_id),
              `${p?.display_name || "候補者"} さんが面談の申し込みを承諾しました`,
              [
                `${p?.display_name || "候補者"} さんが、面談の申し込みを承諾しました。`,
                "メッセージで日程などを直接ご相談ください。",
              ],
              { label: "メッセージを開く", path: `/business/company/messages?id=${r.id}` },
            );
          }
          return jsonResponse({ ok: true, status: accept ? "accepted" : "declined" });
        }

        if (body.action === "withdraw") {
          if (r.company_user_id !== auth.userId) return jsonResponse({ error: "Forbidden" }, 403);
          if (r.status !== "pending")
            return jsonResponse({ error: "承諾・辞退の後は取り下げできません" }, 409);
          await supabase.from("contact_requests").update({ status: "withdrawn" }).eq("id", r.id);
          return jsonResponse({ ok: true });
        }

        return jsonResponse({ error: "Unknown action" }, 400);
      },
    },
  },
});
