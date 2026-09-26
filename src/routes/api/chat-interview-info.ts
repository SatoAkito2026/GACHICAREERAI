/**
 * チャット形式面接の初期情報取得
 *
 * GET /api/chat-interview-info?token=xxx
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

const TYPE_LABEL: Record<string, string> = {
  self_pr: "自己PR面接",
  entry_sheet: "ES面接",
  resume: "履歴書面接",
  work_history: "職務経歴書面接",
};

export const Route = createFileRoute("/api/chat-interview-info")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        if (!token) return json({ error: "Missing token" }, 401);

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Server config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);

        const { data: inv } = await supabase
          .from("interview_invitations")
          .select("candidate_name, job_type, practice_mode, practice_interview_type, expires_at")
          .eq("token", token)
          .maybeSingle();

        if (!inv || (inv.expires_at && new Date(inv.expires_at as string).getTime() < Date.now())) {
          return json({ error: "Invalid or expired token" }, 403);
        }
        const interviewType = (inv as any).practice_interview_type as string;
        if ((inv as any).practice_mode !== "individual" || !TYPE_LABEL[interviewType]) {
          return json({ error: "invalid_type" }, 400);
        }

        return json({
          candidateName: inv.candidate_name,
          jobType: inv.job_type,
          interviewType,
          typeLabel: TYPE_LABEL[interviewType],
        });
      },
    },
  },
});
