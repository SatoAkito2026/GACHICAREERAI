/**
 * 個人：求人に応募する
 *
 * POST /api/jobs/apply  body: { jobId, name, message }
 *
 * 応募すると、その企業は本人の練習の評価（採用担当者向け）を見られるようになり、
 * そのままメッセージでやりとりできる（本人が応募した＝その企業に見せることに同意した、とみなす）。
 * 運営は推薦・仲介をしない。料金はかからない（企業側も、今は求人掲載が無料）。
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

export const Route = createFileRoute("/api/jobs/apply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);

        const body = (await request.json().catch(() => null)) as {
          jobId?: unknown;
          name?: unknown;
          message?: unknown;
        } | null;
        const jobId = typeof body?.jobId === "string" ? body.jobId : "";
        const name = typeof body?.name === "string" ? body.name.trim().slice(0, 50) : "";
        const message = typeof body?.message === "string" ? body.message.trim().slice(0, 1000) : "";
        if (!jobId) return jsonResponse({ error: "求人が指定されていません" }, 400);
        if (!name) return jsonResponse({ error: "お名前を入力してください" }, 400);

        const { data: job } = await supabase
          .from("job_postings")
          .select("id, title, status, company_user_id")
          .eq("id", jobId)
          .maybeSingle();
        if (!job || job.status !== "open") {
          return jsonResponse({ error: "この求人は募集を終了しました" }, 404);
        }
        if (job.company_user_id === auth.userId) {
          return jsonResponse({ error: "自分の求人には応募できません" }, 400);
        }
        if (await getCompanyProfile(supabase, auth.userId)) {
          return jsonResponse({ error: "企業のアカウントでは応募できません" }, 400);
        }

        const { data: already } = await supabase
          .from("job_applications")
          .select("id")
          .eq("job_posting_id", jobId)
          .eq("applicant_user_id", auth.userId)
          .maybeSingle();
        if (already) return jsonResponse({ error: "この求人にはもう応募しています" }, 400);

        // 名前をプロフィールに保存（無ければ非公開のプロフィールを作る）
        const { error: profileError } = await supabase
          .from("candidate_profiles")
          .upsert(
            { user_id: auth.userId, display_name: name, updated_at: new Date().toISOString() },
            { onConflict: "user_id" },
          );
        if (profileError) {
          console.error("[jobs/apply] profile", profileError);
          return jsonResponse({ error: "応募に失敗しました" }, 500);
        }

        const { error: appError } = await supabase.from("job_applications").insert({
          job_posting_id: jobId,
          applicant_user_id: auth.userId,
          status: "pending",
          message,
        });
        if (appError) {
          console.error("[jobs/apply] insert", appError);
          return jsonResponse({ error: "応募に失敗しました" }, 500);
        }

        // 企業が評価を見られるようにする（0円。チケットの売上には数えない）
        await supabase
          .from("profile_unlocks")
          .upsert(
            { company_user_id: job.company_user_id, candidate_user_id: auth.userId, amount: 0 },
            { onConflict: "company_user_id,candidate_user_id", ignoreDuplicates: true },
          );

        // そのままメッセージでやりとりできるようにする
        const intro = `【求人「${job.title}」への応募】${message ? `\n${message}` : ""}`;
        const { data: contact } = await supabase
          .from("contact_requests")
          .select("id, status")
          .eq("company_user_id", job.company_user_id)
          .eq("candidate_user_id", auth.userId)
          .maybeSingle();
        if (!contact) {
          await supabase.from("contact_requests").insert({
            company_user_id: job.company_user_id,
            candidate_user_id: auth.userId,
            message: intro,
            status: "accepted",
            responded_at: new Date().toISOString(),
          });
        } else {
          if (contact.status !== "accepted") {
            await supabase
              .from("contact_requests")
              .update({ status: "accepted", responded_at: new Date().toISOString() })
              .eq("id", contact.id);
          }
          await supabase
            .from("contact_messages")
            .insert({ request_id: contact.id, sender_user_id: auth.userId, body: intro });
        }

        await sendNotice(
          await getUserEmail(supabase, job.company_user_id),
          `求人「${job.title}」に応募がありました`,
          [
            `${name} さんから、求人「${job.title}」に応募がありました。`,
            "練習の評価と、メッセージのやりとりは管理画面から確認できます。",
          ],
          { label: "応募者を見る", path: "/business/company/jobs" },
        );

        return jsonResponse({ ok: true });
      },
    },
  },
});
