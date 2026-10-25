/**
 * POSPOS のサーバーから呼ぶ入口：AI 一次面接1件の中身を見る・消す。
 * 認証は Authorization: Bearer <POSPOS_PARTNER_SECRET>。storeId が違う面接は「見つからない」（404）。
 *
 * GET    /api/partner/pospos/interviews/<interviewId>?storeId= → 中身（選ぶ質問の答え・まとめ・会話・写真と録画の期限つき URL）
 * DELETE /api/partner/pospos/interviews/<interviewId>?storeId= → 録画・写真・会話もすべて消す
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, serviceClient } from "@/lib/talent";
import {
  PARTNER_BUCKET,
  type PartnerInterviewRow,
  publicFields,
  verifyPartnerSecret,
  wipePartnerInterview,
} from "@/lib/partner-interview";

/** 期限つき URL の長さ（1時間） */
const SIGNED_URL_SECONDS = 60 * 60;

async function load(request: Request, interviewId: string) {
  if (!verifyPartnerSecret(request)) return { error: jsonResponse({ error: "unauthorized" }, 401) };
  const storeId = z.string().uuid().safeParse(new URL(request.url).searchParams.get("storeId"));
  const id = z.string().uuid().safeParse(interviewId);
  if (!storeId.success || !id.success)
    return { error: jsonResponse({ error: "invalid input" }, 400) };
  const supabase = await serviceClient();
  if (!supabase) return { error: jsonResponse({ error: "server config missing" }, 500) };
  const { data } = await supabase
    .from("partner_interviews")
    .select("*")
    .eq("id", id.data)
    .eq("partner", "pospos")
    .eq("store_id", storeId.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return { error: jsonResponse({ error: "not found" }, 404) };
  return { supabase, row: data as PartnerInterviewRow };
}

export const Route = createFileRoute("/api/partner/pospos/interviews/$interviewId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const r = await load(request, params.interviewId);
        if ("error" in r) return r.error;
        const { supabase, row } = r;
        const sign = async (path: string) => {
          const { data } = await supabase.storage
            .from(PARTNER_BUCKET)
            .createSignedUrl(path, SIGNED_URL_SECONDS);
          return data?.signedUrl ?? null;
        };
        const photos = (await Promise.all((row.photo_paths ?? []).map(sign))).filter(
          (u): u is string => !!u,
        );
        const videoUrl = row.video_path ? await sign(row.video_path) : null;
        return jsonResponse({
          ...publicFields(row),
          // 選ぶ質問の答え（保存した順。古い面接は []）
          answers: (row.screening ?? []).map((a) => ({ label: a.label, value: a.value })),
          summary: row.summary ?? null,
          transcript: (row.transcript ?? []).map((l) => ({ role: l.role, text: l.text })),
          photos,
          videoUrl,
          consent: { video: true, agreedAt: row.consent_agreed_at },
        });
      },

      DELETE: async ({ request, params }) => {
        const r = await load(request, params.interviewId);
        if ("error" in r) return r.error;
        await wipePartnerInterview(r.supabase, r.row, "deleted");
        return jsonResponse({ ok: true });
      },
    },
  },
});
