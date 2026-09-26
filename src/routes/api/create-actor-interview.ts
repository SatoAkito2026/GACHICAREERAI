/**
 * 役者の経歴確認面接、URL発行
 *
 * POST /api/create-actor-interview
 *   body: { actorId: string }
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

export const Route = createFileRoute("/api/create-actor-interview")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Server config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);

        const body = (await request.json().catch(() => null)) as { actorId?: string } | null;
        if (!body?.actorId) return json({ error: "actorId is required" }, 400);

        const { data: actor } = await supabase
          .from("actors")
          .select("id, name")
          .eq("id", body.actorId)
          .maybeSingle();
        if (!actor) return json({ error: "actor_not_found" }, 404);

        // 直近の書類選考結果(履歴書)があれば紐付けておく。面接履歴から履歴書を閲覧できるようにするため
        const { data: latestScreening } = await supabase
          .from("screening_candidates")
          .select("id")
          .eq("actor_id", actor.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: created, error } = await supabase
          .from("interview_invitations")
          .insert({
            user_id: auth.userId,
            actor_id: actor.id,
            interview_purpose: "actor_verification",
            candidate_name: actor.name,
            job_type: "役者（経歴確認面接）",
            status: "pending",
            screening_candidate_id: latestScreening?.id ?? null,
          })
          .select("token")
          .single();

        if (error || !created) {
          console.error("[create-actor-interview] failed", error);
          return json({ error: "failed_to_create" }, 500);
        }

        return json({ token: created.token });
      },
    },
  },
});
