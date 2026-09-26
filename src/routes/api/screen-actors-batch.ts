/**
 * 役者データベース: 一括書類選考
 *
 * POST /api/screen-actors-batch
 *   body: {
 *     productionType, roleDescription, requiredConditions, preferredConditions,
 *     candidates: [{ fileName, resumeText }]
 *   }
 *
 * 候補者ごとに、履歴書から氏名を抽出→データベースに登録済みなら公開情報と突き合わせ、
 * 経歴の信頼度・集客力・役柄適合率を評価する。演技力は評価対象外。
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

function extractLikelyName(text: string): string | null {
  const m = text.match(/氏\s*名[:：]?\s*([^\s\n０-９0-9]{2,10})/);
  if (m) return m[1].trim();
  const firstLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length >= 2 && l.length <= 10);
  return firstLine ?? null;
}

export const Route = createFileRoute("/api/screen-actors-batch")({
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
          productionTitle?: string;
          synopsis?: string;
          productionType?: string;
          roleDescription?: string;
          requiredConditions?: string;
          preferredConditions?: string;
          candidates?: { fileName: string; resumeText: string }[];
        } | null;

        if (!body?.candidates || body.candidates.length === 0) {
          return json({ error: "candidates is required" }, 400);
        }

        const anthropic = new Anthropic({ apiKey: anthropicKey });
        const results: any[] = [];

        for (const candidate of body.candidates.slice(0, 20)) {
          try {
            const guessedName =
              extractLikelyName(candidate.resumeText) ?? candidate.fileName.replace(/\.pdf$/i, "");

            const { data: existingActor } = await supabase
              .from("actors")
              .select("*")
              .ilike("name", guessedName)
              .maybeSingle();

            const systemPrompt = `あなたはエンタメ業界の書類選考AIです。演技力は評価対象外とし、次の3点だけを評価してください。
1. 経歴の信頼度: 履歴書の記載内容が事実として確認できるか
2. 集客力の見込み: SNSフォロワー数・過去出演作品の規模・影響力から見た集客への貢献度
3. 今回の役柄・作品との適合率

【重要】社内データベースにこの人物の登録が無い場合、またはデータが不足している場合は、
必ずWeb検索を使って、履歴書に書かれている出演作品・SNSアカウント・経歴が実在するか
インターネット上の情報で確認すること。検索しても確認できなかった場合のみ「情報不足」とする。

【最重要・同姓同名への注意】
無名・新人の役者は、Web検索で「同じ名前の別人（有名人・別の芸能人）」がヒットすることが非常によくある。
検索結果の人物と履歴書の人物が同一かどうかは、年齢・所属事務所・具体的な作品名が一致するかで慎重に判断すること。
年齢や所属事務所が大きく異なる場合、それは「経歴詐称の証拠」ではなく「単なる同姓同名の別人がヒットしただけ」の
可能性が高い。この場合、検索結果の別人の情報を根拠に「不一致」「信頼度が低い」と断定してはならない。
該当する場合は discrepancies を空配列にし、reliability_summary には
「同姓同名の別人と思われる検索結果はあったが、本人の記載内容自体に矛盾は無い」という趣旨で記載すること。
本人の経歴が全く無名でWeb上に情報が無いこと自体は、経歴詐称の根拠にはならない(新人であれば当然のこと)。

必ず次のJSON形式のみで出力してください。前置きや説明は不要。
{
  "candidate_name": "履歴書から読み取った氏名",
  "rank": "A",
  "score": 78,
  "fit_percentage": 70,
  "reliability_summary": "経歴の信頼度についての評価(Web検索で確認した内容があれば触れること)",
  "discrepancies": ["データベース・Web検索の結果と食い違う記載があれば具体的に(無ければ空配列)"],
  "audience_draw_summary": "集客力の見込みについての評価",
  "strengths": ["良い点1", "良い点2"],
  "concerns": ["懸念点1", "懸念点2"]
}

# 今回の募集条件
作品名: ${body.productionTitle ?? "未設定"}
あらすじ: ${body.synopsis ?? "未設定"}
作品種別: ${body.productionType ?? "未設定"}
求める役柄・人物像: ${body.roleDescription ?? "未設定"}
必須条件: ${body.requiredConditions ?? "なし"}
歓迎条件: ${body.preferredConditions ?? "なし"}

# 社内データベース上の公開情報(登録が無ければ「未登録」。未登録・情報不足の場合はWeb検索で補うこと)
${
  existingActor
    ? `氏名: ${existingActor.name}\n所属: ${existingActor.agency_name ?? "不明"}\nSNSフォロワー数: ${JSON.stringify(existingActor.follower_counts ?? {})}\n過去出演作品: ${JSON.stringify(existingActor.past_works ?? [])}\n影響力の要約: ${existingActor.influence_summary ?? "情報なし"}`
    : "未登録"
}

# 履歴書の内容
${candidate.resumeText.slice(0, 3500)}`;

            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-6",
              max_tokens: 4000,
              system: systemPrompt,
              messages: [
                {
                  role: "user",
                  content:
                    "上記をもとに評価してください。データベースに情報が無い場合は必ずWeb検索で裏付けを取ってください。",
                },
              ],
              tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
            });
            const parsed = extractJson(lastTextBlock(response.content as any)) as any;

            const candidateName = parsed.candidate_name || guessedName;

            let actorId = existingActor?.id;
            if (!actorId) {
              const { data: created } = await supabase
                .from("actors")
                .insert({ name: candidateName, created_by: auth.userId })
                .select("id")
                .single();
              actorId = created?.id;
            }

            const { data: saved } = await supabase
              .from("screening_candidates")
              .insert({
                user_id: auth.userId,
                actor_id: actorId,
                batch_id: crypto.randomUUID(),
                job_type: body.productionType ?? "役者",
                production_title: body.productionTitle ?? null,
                synopsis: body.synopsis ?? null,
                required_conditions: { selected: [], freeText: body.requiredConditions ?? "" },
                preferred_conditions: { selected: [], freeText: body.preferredConditions ?? "" },
                ideal_person: { selected: [], freeText: body.roleDescription ?? "" },
                candidate_name: candidateName,
                file_name: candidate.fileName,
                resume_excerpt: candidate.resumeText.slice(0, 800),
                rank: parsed.rank ?? null,
                score: parsed.score ?? null,
                summary: parsed.reliability_summary ?? "",
                strengths: parsed.strengths ?? [],
                concerns: parsed.concerns ?? [],
                check_points: parsed.discrepancies ?? [],
                positive_evidence: [],
                negative_evidence: parsed.discrepancies ?? [],
              })
              .select("*")
              .single();

            results.push({
              ...saved,
              fit_percentage: parsed.fit_percentage ?? null,
              audience_draw_summary: parsed.audience_draw_summary ?? "",
            });
          } catch (e) {
            console.error(`[screen-actors-batch] failed for ${candidate.fileName}`, e);
            results.push({
              candidate_name: candidate.fileName.replace(/\.pdf$/i, ""),
              file_name: candidate.fileName,
              rank: null,
              score: null,
              summary: "AIによる評価に失敗しました。もう一度お試しください。",
              strengths: [],
              concerns: [],
              check_points: [],
              fit_percentage: null,
              audience_draw_summary: "",
              failed: true,
            });
          }
        }

        return json({ ok: true, results });
      },
    },
  },
});
