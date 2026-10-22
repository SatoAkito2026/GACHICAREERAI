/**
 * 友だち紹介
 *
 * GET  /api/referral                        → 自分の紹介コード・紹介リンク・紹介した人数・ボーナスの残り
 * POST /api/referral { action: "claim", code } → 紹介リンクから登録した人を、紹介した人に結びつける
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser } from "@/lib/api-auth";
import { jsonResponse, serviceClient } from "@/lib/talent";
import {
  REFERRAL_BONUS,
  claimReferral,
  getBonusBalance,
  getOrCreateReferralCode,
} from "@/lib/referral";

export const Route = createFileRoute("/api/referral")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const [code, bonus, { data: refs }] = await Promise.all([
          getOrCreateReferralCode(supabase, auth.userId),
          getBonusBalance(supabase, auth.userId),
          supabase.from("referrals").select("status").eq("referrer_id", auth.userId).limit(1000),
        ]);
        const appUrl = process.env.APP_URL || new URL(request.url).origin;
        return jsonResponse({
          code,
          link: code ? `${appUrl}/login?ref=${code}` : null,
          invited: (refs ?? []).length,
          rewarded: (refs ?? []).filter((r) => r.status === "rewarded").length,
          bonus,
          bonusPerReferral: REFERRAL_BONUS,
        });
      },

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);
        const body = (await request.json().catch(() => ({}))) as {
          action?: unknown;
          code?: unknown;
        };
        if (body.action !== "claim" || typeof body.code !== "string") {
          return jsonResponse({ error: "不正なリクエストです" }, 400);
        }
        return jsonResponse(await claimReferral(supabase, auth.userId, body.code));
      },
    },
  },
});
