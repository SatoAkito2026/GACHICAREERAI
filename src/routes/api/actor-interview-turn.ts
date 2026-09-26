/**
 * 役者の経歴確認面接、会話ターン処理API（企業・練習用とは完全に独立）
 *
 * POST /api/actor-interview-turn
 *   body: { token, candidateText, conversationHistory }
 */
import { createFileRoute } from "@tanstack/react-router";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseUrl, getServiceRoleKey } from "@/lib/api-auth";
import { createClient } from "@supabase/supabase-js";

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

export const Route = createFileRoute("/api/actor-interview-turn")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            token: string;
            candidateText: string;
            conversationHistory: { role: "user" | "assistant"; content: string }[];
          };

          const anthropicKey = process.env.ANTHROPIC_API_KEY;
          const openaiKey = process.env.OPENAI_API_KEY;
          if (!anthropicKey || !openaiKey) {
            return json({ error: "API keys missing" }, 500);
          }

          if (!body.token || typeof body.token !== "string") {
            return json({ error: "Missing token" }, 401);
          }

          const MAX_TEXT_LEN = 5000;
          const MAX_HISTORY_ITEMS = 100;
          if (typeof body.candidateText !== "string" || body.candidateText.length > MAX_TEXT_LEN) {
            return json({ error: "Invalid candidateText" }, 400);
          }
          if (
            !Array.isArray(body.conversationHistory) ||
            body.conversationHistory.length > MAX_HISTORY_ITEMS
          ) {
            return json({ error: "Invalid conversationHistory" }, 400);
          }

          const serviceKey = getServiceRoleKey();
          const supabase = serviceKey ? createClient(getSupabaseUrl(), serviceKey) : null;
          if (!supabase) return json({ error: "Server config missing" }, 500);

          const { data: inv } = await supabase
            .from("interview_invitations")
            .select("actor_id, expires_at, production_title, synopsis")
            .eq("token", body.token)
            .eq("interview_purpose", "actor_verification")
            .maybeSingle();

          if (
            !inv ||
            (inv.expires_at && new Date(inv.expires_at as string).getTime() < Date.now())
          ) {
            return json({ error: "Invalid or expired token" }, 403);
          }

          let actorContext: Record<string, unknown> | null = null;
          if (inv.actor_id) {
            const { data: actor } = await supabase
              .from("actors")
              .select(
                "name, agency_name, follower_counts, past_works, influence_summary, suggested_roles",
              )
              .eq("id", inv.actor_id)
              .maybeSingle();
            actorContext = actor as Record<string, unknown> | null;
          }

          const productionTitle = (inv as any).production_title as string | null;
          const productionSynopsis = (inv as any).synopsis as string | null;

          const systemPrompt = `あなたはエンタメ業界の制作会社が実施する、役者の経歴確認面接を担当するAI面接官です。
これは演技力を審査する面接ではありません。演技力の評価は一切行わないでください。
このデータを最終的に見るのはプロデューサー・監督であり、彼らが知りたいのは「この人物を起用して興行的に稼げるか」です。
確認するのは次の2点だけです。
① 本人が語る経歴・実績が、データベース上の公開情報と食い違っていないか（虚偽は投資リスクに直結する）
② 実際にどの程度チケット販売・集客に貢献できそうか(SNSでの発信への取り組み方、過去の集客経験、ファンとの関わり方等)

${productionTitle ? `【今回の作品】\n作品名：${productionTitle}\n${productionSynopsis ? `あらすじ：${productionSynopsis}\n` : ""}この作品名を会話の中で自然に使い、実際のオーディション面接らしい臨場感を出すこと。\n` : ""}
【面接官としての性格】
落ち着いていて丁寧、かつ核心を突く質問を自然な流れで投げかける。

【必須カバー項目】
- 自己紹介・現在の活動状況
- 過去の出演作品の実績(データベースの情報と照合しながら深掘りする)
- SNSでの発信活動・フォロワーとの関わり方
- 過去の公演で実際にどの程度集客に貢献したか(具体的な数字があれば聞く)
- 今回の作品にどれだけ集客・話題性で貢献できそうか、本人の考え
- 今回の公演に懸けている意気込み

【会話のルール】
- データベースの情報と、本人の発言が食い違う場合は、責めるのではなく「そのあたり詳しく聞かせてください」というトーンで自然に深掘りする
- 演技力・演技プランについては一切質問しない(それは別途、人間による面接で確認される)
- 返答は簡潔に（2〜3文程度）
- テンプレート感を出さない・自然な会話にする

【終了条件】
- 必須カバー項目を一通り聞けたら「本日の面接はこれで終了です。お疲れ様でした」と言う
- 20分を超えたら終了を提案する

【データベース上のこの役者の公開情報(本人の発言との整合性チェックに使うこと)】
${actorContext ? JSON.stringify(actorContext, null, 2) : "（データベース未登録）"}

日本語で話してください。`;

          const messages: { role: "user" | "assistant"; content: string }[] = [
            ...body.conversationHistory,
            { role: "user", content: body.candidateText },
          ];

          const anthropic = new Anthropic({ apiKey: anthropicKey });
          let aiResponse;
          try {
            aiResponse = await anthropic.messages.create({
              model: "claude-sonnet-4-6",
              max_tokens: 300,
              system: systemPrompt,
              messages,
            });
          } catch (apiErr) {
            console.error("[actor-interview-turn] anthropic.messages.create failed", apiErr);
            return json({ error: "AI request failed" }, 502);
          }

          const textBlock = aiResponse.content.find((b: any) => b.type === "text") as any;
          if (!textBlock?.text) {
            console.error(
              "[actor-interview-turn] no text block in response",
              JSON.stringify(aiResponse.content),
            );
          }
          const aiText = textBlock?.text ?? "次の質問をお願いします。";

          const isEnded =
            aiText.includes("面接を終了") ||
            aiText.includes("以上で終了") ||
            aiText.includes("本日の面接はこれで") ||
            aiText.includes("面接は以上") ||
            aiText.includes("ありがとうございました。以上") ||
            aiText.includes("お疲れ様でした") ||
            aiText.includes("終了とさせていただきます") ||
            aiText.includes("面接を終わらせていただきます");

          const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "tts-1",
              input: aiText,
              voice: "shimmer",
              response_format: "pcm",
              speed: 1.3,
            }),
          });

          if (!ttsRes.ok) {
            console.error("OpenAI TTS status:", ttsRes.status);
            return json({ aiText, audioBase64: null, isEnded }, 200);
          }

          const audioBuffer = await ttsRes.arrayBuffer();
          const audioBase64 = Buffer.from(audioBuffer).toString("base64");

          await supabase
            .from("interview_invitations")
            .update({ status: isEnded ? "completed" : "started" })
            .eq("token", body.token);

          return json({ aiText, audioBase64, isEnded });
        } catch (e) {
          console.error(e);
          return json({ error: "Internal server error" }, 500);
        }
      },
    },
  },
});
