import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { verifyApiUser, getSupabaseUrl, getServiceRoleKey } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/delete-account")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) {
          return new Response(JSON.stringify({ error: "Server config missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const adminClient = createClient(getSupabaseUrl(), serviceKey);

        // 練習面接の録画を消す（DBの行はアカウント削除で消えるが、ファイルは残るため）
        try {
          const folder = `practice/${auth.userId}`;
          const { data: files } = await adminClient.storage
            .from("interview-recordings")
            .list(folder, { limit: 100 });
          if (files?.length) {
            await adminClient.storage
              .from("interview-recordings")
              .remove(files.map((f) => `${folder}/${f.name}`));
          }
        } catch (e) {
          console.error("[delete-account] recording cleanup failed:", e);
        }

        const { error } = await adminClient.auth.admin.deleteUser(auth.userId);

        if (error) {
          console.error("[delete-account] error:", error);
          return new Response(
            JSON.stringify({
              error: "アカウントの削除に失敗しました。時間をおいて再度お試しください。",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      },
    },
  },
});
