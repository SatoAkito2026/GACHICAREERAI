/**
 * 役者データベース: 事前一括収集
 *
 * POST /api/bulk-research-actors
 *   body: { names: string[] }  (最大20件)
 *
 * 誰かが検索するのを待たず、まとめて名前を登録・調査しておく「事前収集型」。
 * 個別に検索された際は、既存の research-actor.ts（🔄最新化ボタン等）で
 * さらに深く調査する「反応型」の強化が別途行われる。
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

const MAX_NAMES_PER_BATCH = 20;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/bulk-research-actors")({
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

        const body = (await request.json().catch(() => null)) as { names?: string[] } | null;
        const names = (body?.names ?? [])
          .map((n) => n.trim())
          .filter((n) => n.length > 0)
          .slice(0, MAX_NAMES_PER_BATCH);

        if (names.length === 0) return json({ error: "names is required" }, 400);

        const anthropic = new Anthropic({ apiKey: anthropicKey });
        const results: { name: string; ok: boolean; actorId?: string }[] = [];

        for (const name of names) {
          try {
            const { data: existing } = await supabase
              .from("actors")
              .select("id")
              .eq("name", name)
              .maybeSingle();
            if (existing) {
              results.push({ name, ok: true, actorId: existing.id });
              continue;
            }

            const systemPrompt = `あなたは芸能・エンタメ業界の専門リサーチAIです。
俳優・役者「${name}」について、複数回Web検索を行い、できる限り徹底的に公開情報を調べてください。
- 本人のSNS(X/Instagram/TikTok/YouTube)のフォロワー数・登録者数
- 出演した舞台・映画・ドラマ・CM等の作品歴
- ニュース記事・インタビュー記事・公式プロフィールページでの言及
- 受賞歴・ノミネート歴
- 所属事務所の公式サイトでのプロフィール情報
憶測やゴシップではなく、検索で確認できる事実ベースの情報のみをまとめること。

【最重要・同姓同名への注意】
無名・新人の役者は、検索すると「同じ名前の別人（有名人）」がヒットすることが非常によくある。
所属事務所名や、他に手がかりとなる情報が一致しない場合、それは別人である可能性が高い。
別人と思われる情報は past_works・sns_handles・follower_counts 等に含めないこと。
確認できる情報が少ない場合は、無理に埋めず null・空配列のままにすること。

必ず次のJSON形式のみで出力してください。前置きや説明、マークダウンのコードブロックは一切付けないこと。
{
  "agency_name": "所属事務所(不明ならnull)",
  "school": "出身の演劇スクール・養成所等(不明ならnull)",
  "sns_handles": {"x": "@xxx", "instagram": "xxx"},
  "follower_counts": {"x": 12000, "instagram": 30000},
  "past_works": [{"title": "作品名", "type": "映画/舞台/ドラマ等", "role": "役名・役柄", "year": 2024}],
  "awards": ["受賞歴があれば"],
  "influence_summary": "SNS上・社会的な影響力についての客観的な要約(3〜4文)",
  "suggested_roles": [{"role_type": "向いていそうな役柄の傾向", "reason": "その理由"}]
}`;

            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-6",
              max_tokens: 4000,
              system: systemPrompt,
              messages: [{ role: "user", content: `「${name}」について調べてください。` }],
              tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
            });
            const parsed = extractJson(lastTextBlock(response.content as any)) as any;

            const { data: created, error } = await supabase
              .from("actors")
              .insert({
                name,
                agency_name: parsed.agency_name ?? null,
                school: parsed.school ?? null,
                sns_handles: parsed.sns_handles ?? {},
                follower_counts: parsed.follower_counts ?? {},
                past_works: parsed.past_works ?? [],
                awards: parsed.awards ?? [],
                influence_summary: parsed.influence_summary ?? null,
                suggested_roles: parsed.suggested_roles ?? [],
                last_researched_at: new Date().toISOString(),
                created_by: auth.userId,
              })
              .select("id")
              .single();

            if (error) throw error;
            results.push({ name, ok: true, actorId: created.id });
          } catch (e) {
            console.error(`[bulk-research-actors] failed for ${name}`, e);
            results.push({ name, ok: false });
          }
        }

        return json({ ok: true, results });
      },
    },
  },
});
