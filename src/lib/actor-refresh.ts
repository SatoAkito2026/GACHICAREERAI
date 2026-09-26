/**
 * 役者データベースの定期自動更新
 *
 * Cloudflare Cron Trigger(1時間ごと)から呼ばれる。
 * last_researched_at が30日以上前(または未調査)の役者を、1回の実行につき
 * 数件ずつ再調査する(大量に一気に処理してAPIコストが跳ねないよう制限する)。
 */
import { extractJson, lastTextBlock } from "@/lib/ai-json";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseUrl, getServiceRoleKey } from "@/lib/api-auth";

const REFRESH_INTERVAL_DAYS = 30;
const MAX_PER_RUN = 3;

export async function runActorRefreshJob(): Promise<{ refreshed: number }> {
  const serviceKey = getServiceRoleKey();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!serviceKey || !anthropicKey) {
    console.error("[actor-refresh] missing config");
    return { refreshed: 0 };
  }

  const supabase = createClient(getSupabaseUrl(), serviceKey);
  const cutoff = new Date(Date.now() - REFRESH_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: staleActors } = await supabase
    .from("actors")
    .select("id, name, agency_name")
    .or(`last_researched_at.is.null,last_researched_at.lt.${cutoff}`)
    .limit(MAX_PER_RUN);

  if (!staleActors || staleActors.length === 0) return { refreshed: 0 };

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  let refreshed = 0;

  for (const actor of staleActors) {
    try {
      const systemPrompt = `あなたは芸能・エンタメ業界のリサーチAIです。
Web検索を使って、俳優・役者「${actor.name}」${actor.agency_name ? `（所属事務所: ${actor.agency_name}）` : ""}について、
公開されている情報のみを調べてください。憶測やゴシップではなく、確認できる事実ベースの情報のみをまとめること。
無名・新人の役者は検索で「同じ名前の別人」がヒットすることが多いため、所属事務所等が一致しない情報は
別人の可能性が高いとみなし、past_works・sns_handles等に含めないこと。

必ず次のJSON形式のみで出力してください。前置きや説明、マークダウンのコードブロックは一切付けないこと。
{
  "agency_name": "所属事務所(不明ならnull)",
  "school": "出身の演劇スクール・養成所等(不明ならnull)",
  "sns_handles": {"x": "@xxx", "instagram": "xxx", "youtube": "xxx"},
  "follower_counts": {"x": 12000, "instagram": 30000},
  "past_works": [{"title": "作品名", "type": "映画/舞台/ドラマ等", "role": "役名・役柄", "year": 2024}],
  "influence_summary": "SNS上・社会的な影響力についての客観的な要約(3〜4文、根拠のある情報のみ)",
  "suggested_roles": [{"role_type": "向いていそうな役柄の傾向", "reason": "その理由"}]
}
情報が見つからない項目はnullまたは空配列にすること。存在しない情報を作り出さないこと。`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: "user", content: `「${actor.name}」について調べてください。` }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      });
      const parsed = extractJson(lastTextBlock(response.content as any)) as any;

      await supabase
        .from("actors")
        .update({
          agency_name: parsed.agency_name || actor.agency_name,
          school: parsed.school ?? null,
          sns_handles: parsed.sns_handles ?? {},
          follower_counts: parsed.follower_counts ?? {},
          past_works: parsed.past_works ?? [],
          influence_summary: parsed.influence_summary ?? null,
          suggested_roles: parsed.suggested_roles ?? [],
          last_researched_at: new Date().toISOString(),
        })
        .eq("id", actor.id);
      refreshed++;
    } catch (e) {
      console.error(`[actor-refresh] failed for ${actor.name}`, e);
    }
  }

  console.log(`[actor-refresh] refreshed=${refreshed}`);
  return { refreshed };
}
