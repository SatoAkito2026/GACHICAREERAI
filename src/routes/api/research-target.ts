/**
 * 企業研究AI・志望校研究AI
 *
 * POST /api/research-target
 *   body: { targetName: string }
 *   指定した企業名/学校名について、Web検索で調べた上で
 *   想定質問・対策ポイントを生成する。
 */
import { extractJson, lastTextBlock } from "@/lib/ai-json";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  getSupabaseUrl,
  getServiceRoleKey,
  verifyApiUser,
  checkPlanFeatureAccess,
} from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/research-target")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) return json({ error: "API key missing" }, 500);

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Supabase config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);
        const userId = auth.userId;

        const body = (await request.json().catch(() => null)) as { targetName?: string } | null;
        const targetName = body?.targetName?.trim();
        if (!targetName) return json({ error: "targetName is required" }, 400);

        const { data: profile } = await supabase
          .from("profiles")
          .select("user_mode, plan, plan_expires_at")
          .eq("id", userId)
          .maybeSingle();
        const dbMode: "individual" | "student" =
          profile?.user_mode === "private_student" ? "student" : "individual";

        const isExpired = profile?.plan_expires_at
          ? new Date(profile.plan_expires_at).getTime() < Date.now()
          : false;
        const plan = profile?.plan && !isExpired ? (profile.plan as string) : "free";
        // 個人・受験生プランの機能制限は一時的に撤廃
        const { data: careerProfile } = await supabase
          .from("user_career_profiles")
          .select("*")
          .eq("user_id", userId)
          .eq("mode", dbMode)
          .maybeSingle();

        const profileSummary = careerProfile
          ? JSON.stringify({
              self_pr: careerProfile.self_pr,
              skills: careerProfile.skills,
              desired_conditions: careerProfile.desired_conditions,
              desired_schools: careerProfile.desired_schools,
            })
          : "(プロフィール未入力)";

        const targetLabel = dbMode === "student" ? "志望校" : "志望企業";
        const systemPrompt = `あなたは${dbMode === "student" ? "受験生" : "就活・転職者"}向けの面接対策AIです。
Web検索を使って「${targetName}」について調べ、面接対策として役立つ情報をまとめてください。

必ず次のJSON形式のみで出力してください。前置きや説明、マークダウンのコードブロックは一切付けないこと。
{
  "overview": "対象の概要(事業内容/教育理念など、2〜3文)",
  "recent_topics": ["最近のニュース・トピック1", "トピック2"],
  "expected_questions": [{"question": "想定質問", "point": "回答のポイント"}],
  "advice": "この人のプロフィールを踏まえた対策アドバイス(2〜3文)"
}
expected_questionsは6〜8問程度にすること。

# ユーザーのプロフィール
${profileSummary}`;

        const anthropic = new Anthropic({ apiKey: anthropicKey });
        let parsed: {
          overview?: string;
          recent_topics?: string[];
          expected_questions?: { question: string; point: string }[];
          advice?: string;
        } = {};
        try {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 2500,
            system: systemPrompt,
            messages: [
              {
                role: "user",
                content: `「${targetName}」について調べて、想定質問と対策をまとめてください。`,
              },
            ],
            tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
          });
          parsed = extractJson(lastTextBlock(response.content as any)) as any;
        } catch (e) {
          console.error("[research-target] failed", e);
          return json(
            { error: "ai_call_failed", message: "調査に失敗しました。もう一度お試しください" },
            500,
          );
        }

        const { data: saved, error: saveError } = await supabase
          .from("generated_documents")
          .insert({
            user_id: userId,
            mode: dbMode,
            doc_type: "research",
            title: `${targetLabel}研究：${targetName}`,
            input_data: { targetName },
            generated_content: JSON.stringify(parsed),
          })
          .select("id")
          .single();
        if (saveError) console.error("[research-target] save failed", saveError);

        return json({ id: saved?.id, targetName, ...parsed });
      },
    },
  },
});
