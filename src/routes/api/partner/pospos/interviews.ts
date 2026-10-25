/**
 * POSPOS のサーバーから呼ぶ入口：AI 一次面接の URL を作る・一覧を見る。
 * 認証は Authorization: Bearer <POSPOS_PARTNER_SECRET>（合わなければ 401）。お店は storeId で見分け、必ず絞り込む。
 *
 * POST /api/partner/pospos/interviews          → { interviewId, url, expiresAt }
 * GET  /api/partner/pospos/interviews?storeId= → [{ interviewId, candidateName, jobType, status, ... }]（新しい順・最大100件）
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, serviceClient } from "@/lib/talent";
import {
  PARTNER_EXPIRES_DAYS,
  PARTNER_JOB_TYPES,
  PARTNER_MONTHLY_LIMIT,
  type PartnerInterviewRow,
  jstMonthStartIso,
  newPartnerToken,
  partnerAppUrl,
  publicFields,
  verifyPartnerSecret,
} from "@/lib/partner-interview";

const CreateBody = z.object({
  storeId: z.string().uuid(),
  storeName: z.string().trim().min(1).max(60),
  businessType: z.enum(["night", "restaurant"]),
  jobType: z.enum(PARTNER_JOB_TYPES),
  customQuestions: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  candidateName: z.string().trim().max(30).optional(),
});

export const Route = createFileRoute("/api/partner/pospos/interviews")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!verifyPartnerSecret(request)) return jsonResponse({ error: "unauthorized" }, 401);
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return jsonResponse({ error: "invalid json" }, 400);
        }
        const parsed = CreateBody.safeParse(raw);
        if (!parsed.success) return jsonResponse({ error: "invalid input" }, 400);
        const b = parsed.data;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "server config missing" }, 500);

        // 1店あたり、日本時間の1か月で100回まで（作った数で数える。消したものも数える）
        const { count } = await supabase
          .from("partner_interviews")
          .select("id", { count: "exact", head: true })
          .eq("partner", "pospos")
          .eq("store_id", b.storeId)
          .gte("created_at", jstMonthStartIso());
        if ((count ?? 0) >= PARTNER_MONTHLY_LIMIT)
          return jsonResponse({ error: "今月の上限に届きました。お問い合わせください" }, 429);

        const token = newPartnerToken();
        const expiresAt = new Date(Date.now() + PARTNER_EXPIRES_DAYS * 86400000).toISOString();
        const { data, error } = await supabase
          .from("partner_interviews")
          .insert({
            partner: "pospos",
            store_id: b.storeId,
            store_name: b.storeName,
            business_type: b.businessType,
            job_type: b.jobType,
            custom_questions: b.customQuestions,
            candidate_name: b.candidateName || null,
            token,
            expires_at: expiresAt,
          })
          .select("id")
          .single();
        if (error || !data) {
          console.error("[partner/pospos] create failed", error);
          return jsonResponse({ error: "create failed" }, 500);
        }
        return jsonResponse(
          { interviewId: data.id, url: `${partnerAppUrl()}/partner-interview/${token}`, expiresAt },
          201,
        );
      },

      GET: async ({ request }) => {
        if (!verifyPartnerSecret(request)) return jsonResponse({ error: "unauthorized" }, 401);
        const storeId = z
          .string()
          .uuid()
          .safeParse(new URL(request.url).searchParams.get("storeId"));
        if (!storeId.success) return jsonResponse({ error: "invalid storeId" }, 400);
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "server config missing" }, 500);
        const { data } = await supabase
          .from("partner_interviews")
          .select(
            "id, candidate_name, job_type, status, created_at, started_at, finished_at, expires_at",
          )
          .eq("partner", "pospos")
          .eq("store_id", storeId.data)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(100);
        return jsonResponse(((data ?? []) as PartnerInterviewRow[]).map(publicFields));
      },
    },
  },
});
