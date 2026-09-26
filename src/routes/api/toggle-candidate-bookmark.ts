/**
 * 候補者のブックマーク(星)を切り替える
 *
 * POST /api/toggle-candidate-bookmark
 *   body: { candidateUserId: string }
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey, verifyApiUser } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/toggle-candidate-bookmark")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Server config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);

        const body = (await request.json().catch(() => null)) as {
          candidateUserId?: string;
        } | null;
        if (!body?.candidateUserId) return json({ error: "candidateUserId is required" }, 400);

        const { data: existing } = await supabase
          .from("candidate_bookmarks")
          .select("id")
          .eq("company_user_id", auth.userId)
          .eq("candidate_user_id", body.candidateUserId)
          .maybeSingle();

        if (existing) {
          await supabase.from("candidate_bookmarks").delete().eq("id", existing.id);
          return json({ ok: true, bookmarked: false });
        } else {
          await supabase.from("candidate_bookmarks").insert({
            company_user_id: auth.userId,
            candidate_user_id: body.candidateUserId,
          });
          return json({ ok: true, bookmarked: true });
        }
      },
    },
  },
});
