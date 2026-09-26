/**
 * 役者データベースの自動発見バッチ
 *
 * Cloudflare Cron Trigger(1時間ごとに呼ばれるscheduledハンドラー内から、
 * 1日1回だけ実行される)。人間が名前を入力しなくても、AIが自らWeb検索して
 * 新しい役者を発見し、調査・登録する完全自動バッチ。
 *
 * 費用を抑えるため、1回の実行につき発見・登録するのは最大5名まで。
 */
import { extractJson, lastTextBlock } from "@/lib/ai-json";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseUrl, getServiceRoleKey } from "@/lib/api-auth";

const MAX_NEW_ACTORS_PER_RUN = 5;

const DISCOVERY_QUERIES = [
  "舞台俳優 プロフィール 所属事務所 2026",
  "若手俳優 デビュー作 プロフィール",
  "小劇場 舞台 出演 俳優 プロフィール",
  "声優 舞台 出演 プロフィール",
  "映画 助演 俳優 プロフィール 事務所",
  "ミュージカル俳優 プロフィール 出演歴",
  "新人俳優 オーディション 合格 プロフィール",
  "演劇 養成所 卒業生 俳優",
  "子役 プロフィール 出演作 事務所",
  "モデル プロフィール 所属事務所 雑誌",
  "読者モデル プロフィール SNS",
  "女優 プロフィール 出演ドラマ 事務所",
  "アイドル グループ メンバー プロフィール",
  "タレント プロフィール 所属事務所 テレビ出演",
  "お笑い芸人 コンビ プロフィール 事務所",
  "ピン芸人 プロフィール YouTube",
  "YouTuber プロフィール チャンネル登録者数",
  "インフルエンサー プロフィール SNSフォロワー数",
  "TikTokクリエイター プロフィール フォロワー数",
  "バラエティ番組 出演者 プロフィール タレント",
  "ナレーター 声優 プロフィール 事務所",
  "ダンサー パフォーマー プロフィール 所属",
];

function pickTodaysQuery(): string {
  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return DISCOVERY_QUERIES[dayIndex % DISCOVERY_QUERIES.length];
}

export async function runActorDiscoveryJob(): Promise<{ discovered: number }> {
  const serviceKey = getServiceRoleKey();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!serviceKey || !anthropicKey) {
    console.error("[actor-discovery] missing config");
    return { discovered: 0 };
  }

  const supabase = createClient(getSupabaseUrl(), serviceKey);
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const query = pickTodaysQuery();

  let candidateNames: string[] = [];
  try {
    const discoverPrompt = `Web検索を使って「${query}」というテーマで、実在する芸能人・タレントの人名を(俳優・女優・モデル・子役・アイドル・お笑い芸人・声優・YouTuber・インフルエンサー・ダンサー等、ジャンルを問わない)
できるだけ多く発見してください。有名人だけでなく、無名・新人も含めてよい。
架空の名前を作り出すことは絶対に禁止。検索結果に実際に登場した人名のみをリストアップすること。

必ず次のJSON形式のみで出力してください。前置きや説明は不要。
{ "names": ["氏名1", "氏名2"] }
最大15名まで。`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: discoverPrompt,
      messages: [{ role: "user", content: `「${query}」について調べて、人名を発見してください。` }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
    });
    const parsed = extractJson(lastTextBlock(response.content as any)) as any;
    candidateNames = Array.isArray(parsed.names) ? parsed.names : [];
  } catch (e) {
    console.error("[actor-discovery] discovery phase failed", e);
    return { discovered: 0 };
  }

  if (candidateNames.length === 0) return { discovered: 0 };

  const { data: existingRows } = await supabase
    .from("actors")
    .select("name")
    .in("name", candidateNames);
  const existingNames = new Set((existingRows ?? []).map((r: any) => r.name));
  const newNames = candidateNames
    .filter((n) => !existingNames.has(n))
    .slice(0, MAX_NEW_ACTORS_PER_RUN);

  if (newNames.length === 0) return { discovered: 0 };

  let discovered = 0;
  for (const name of newNames) {
    try {
      const systemPrompt = `あなたは芸能・エンタメ業界の専門リサーチAIです。
芸能人・タレント「${name}」について、Web検索を行い、できる限り徹底的に公開情報を調べてください。
- SNS(X/Instagram/TikTok/YouTube)のフォロワー数・登録者数
- 出演した舞台・映画・ドラマ・CM等の作品歴
- ニュース記事・インタビュー記事・公式プロフィールページでの言及
- 所属事務所
憶測やゴシップではなく、検索で確認できる事実ベースの情報のみをまとめること。
情報が見つからない項目はnullまたは空配列にすること。存在しない情報を作り出さないこと。

必ず次のJSON形式のみで出力してください。前置きや説明は不要。
{
  "agency_name": "所属事務所(不明ならnull)",
  "school": "出身校(不明ならnull)",
  "sns_handles": {"x": "@xxx"},
  "follower_counts": {"x": 12000},
  "past_works": [{"title": "作品名", "type": "映画/舞台/ドラマ等", "role": "役柄", "year": 2024}],
  "influence_summary": "影響力の要約(2〜3文)",
  "suggested_roles": [{"role_type": "向いている役柄", "reason": "理由"}]
}`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: "user", content: `「${name}」について調べてください。` }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      });
      const parsed = extractJson(lastTextBlock(response.content as any)) as any;

      await supabase.from("actors").insert({
        name,
        agency_name: parsed.agency_name ?? null,
        school: parsed.school ?? null,
        sns_handles: parsed.sns_handles ?? {},
        follower_counts: parsed.follower_counts ?? {},
        past_works: parsed.past_works ?? [],
        influence_summary: parsed.influence_summary ?? null,
        suggested_roles: parsed.suggested_roles ?? [],
        last_researched_at: new Date().toISOString(),
        created_by: null,
      });
      discovered++;
    } catch (e) {
      console.error(`[actor-discovery] research failed for ${name}`, e);
    }
  }

  console.log(`[actor-discovery] query="${query}" discovered=${discovered}`);
  return { discovered };
}
