/**
 * 役者データベース: AI自動収集
 *
 * POST /api/research-actor
 *   body: { name: string, agencyName?: string }
 *
 * Web検索で公開情報(SNSフォロワー数・出演歴等)を調べ、
 * 役者プロフィールとして actors テーブルに保存(更新)する。
 * 企業アカウントなら誰でも実行・閲覧できる共有データベース。
 */
import { extractJson, lastTextBlock } from "@/lib/ai-json";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseUrl, getServiceRoleKey, verifyApiUser } from "@/lib/api-auth";

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

export const Route = createFileRoute("/api/research-actor")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        const serviceKey = getServiceRoleKey();
        if (!anthropicKey || !serviceKey) return json({ error: "Server config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);

        const body = (await request.json().catch(() => null)) as {
          name?: string;
          agencyName?: string;
        } | null;
        const name = body?.name?.trim();
        if (!name) return json({ error: "name is required" }, 400);
        const agencyName = body?.agencyName?.trim() || null;

        const systemPrompt = `あなたは芸能・エンタメ業界の専門リサーチAIです。
俳優・役者「${name}」${agencyName ? `（所属事務所: ${agencyName}）` : ""}について、複数回Web検索を行い、
できる限り徹底的に公開情報を調べてください。1回の検索で終わらせず、以下の観点それぞれについて検索を行うこと。
- 本人のSNS(X/Instagram/TikTok/YouTube)のフォロワー数・登録者数
- 出演した舞台・映画・ドラマ・CM等の作品歴（できるだけ多く、古いものも含めて）
- ニュース記事・インタビュー記事・公式プロフィールページでの言及
- 受賞歴・ノミネート歴
- 所属事務所の公式サイトでのプロフィール情報
- 過去の公演の興行成績・動員数に関する報道(あれば)
憶測やゴシップではなく、検索で確認できる事実ベースの情報のみをまとめること。

【最重要・同姓同名への注意】
無名・新人の役者は、検索すると「同じ名前の別人（有名人）」がヒットすることが非常によくある。
所属事務所名や、他に手がかりとなる情報が一致しない場合、それは別人である可能性が高い。
別人と思われる情報は past_works・sns_handles・follower_counts 等に含めないこと。
確認できる情報が少ない、またはヒットした情報が別人の可能性が高い場合は、無理に埋めず
null・空配列のままにすること。存在しない情報を作り出すことは絶対に避けること。

必ず次のJSON形式のみで出力してください。前置きや説明、マークダウンのコードブロックは一切付けないこと。
{
  "agency_name": "所属事務所(不明ならnull)",
  "school": "出身の演劇スクール・養成所等(不明ならnull)",
  "sns_handles": {"x": "@xxx", "instagram": "xxx", "youtube": "xxx", "tiktok": "xxx"},
  "follower_counts": {"x": 12000, "instagram": 30000, "youtube": 5000, "tiktok": 8000},
  "past_works": [{"title": "作品名", "type": "映画/舞台/ドラマ/CM等", "role": "役名・役柄", "year": 2024}],
  "awards": ["受賞歴・ノミネート歴があれば具体的に"],
  "influence_summary": "SNS上・社会的な影響力についての客観的な要約(4〜6文、根拠のある情報を具体的に引用)",
  "suggested_roles": [{"role_type": "向いていそうな役柄の傾向", "reason": "その理由"}]
}
past_worksは見つかる限りできるだけ多く(10件程度まで)、suggested_rolesは2〜4個程度。
情報が見つからない項目はnullまたは空配列にすること。存在しない情報を作り出さないこと。`;

        const anthropic = new Anthropic({ apiKey: anthropicKey });
        let parsed: Record<string, unknown> = {};
        try {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 5000,
            system: systemPrompt,
            messages: [{ role: "user", content: `「${name}」について調べてください。` }],
            tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
          });
          parsed = extractJson(lastTextBlock(response.content as any)) as any;
        } catch (e) {
          console.error("[research-actor] failed", e);
          return json(
            { error: "ai_call_failed", message: "調査に失敗しました。もう一度お試しください" },
            500,
          );
        }

        const record = {
          name,
          agency_name: (parsed.agency_name as string) || agencyName,
          school: (parsed.school as string) || null,
          sns_handles: parsed.sns_handles ?? {},
          follower_counts: parsed.follower_counts ?? {},
          past_works: parsed.past_works ?? [],
          awards: parsed.awards ?? [],
          influence_summary: (parsed.influence_summary as string) || null,
          suggested_roles: parsed.suggested_roles ?? [],
          last_researched_at: new Date().toISOString(),
          created_by: auth.userId,
        };

        const { data: existing } = await supabase
          .from("actors")
          .select("id")
          .eq("name", name)
          .eq("agency_name", record.agency_name)
          .maybeSingle();

        let actorId: string;
        if (existing) {
          await supabase.from("actors").update(record).eq("id", existing.id);
          actorId = existing.id;
        } else {
          const { data: created, error } = await supabase
            .from("actors")
            .insert(record)
            .select("id")
            .single();
          if (error || !created) {
            console.error("[research-actor] save failed", error);
            return json({ error: "save_failed" }, 500);
          }
          actorId = created.id;
        }

        return json({ ok: true, actorId, profile: record });
      },
    },
  },
});
