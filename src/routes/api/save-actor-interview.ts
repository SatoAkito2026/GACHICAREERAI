/**
 * 役者の経歴確認面接、結果保存の専用エンドポイント（企業・個人/受験生の面接とは完全に独立）
 *
 * POST /api/save-actor-interview
 */
import { extractJson, lastTextBlock } from "@/lib/ai-json";
import { createFileRoute } from "@tanstack/react-router";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey } from "@/lib/api-auth";

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

export const Route = createFileRoute("/api/save-actor-interview")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        const serviceKey = getServiceRoleKey();
        if (!anthropicKey || !serviceKey) {
          return json({ error: "Server config missing" }, 500);
        }

        const body = (await request.json()) as {
          token: string;
          messages: { role: "user" | "assistant"; content: string }[];
          elapsed: number;
          candidateName: string | null;
          jobType: string | null;
          isAbandoned: boolean;
        };

        const supabase = createClient(getSupabaseUrl(), serviceKey);

        const { data: invitation } = await supabase
          .from("interview_invitations")
          .select("user_id, actor_id, interview_purpose, screening_candidate_id")
          .eq("token", body.token)
          .maybeSingle();

        if (!invitation?.user_id || invitation.interview_purpose !== "actor_verification") {
          return json({ error: "Invalid token" }, 400);
        }
        const actorId = invitation.actor_id as string | null;

        // 1. interviewsテーブルに基本情報を保存
        const { data: interview, error: interviewError } = await supabase
          .from("interviews")
          .insert({
            user_id: invitation.user_id,
            candidate_name: body.candidateName ?? "不明",
            job_type: body.jobType ?? "",
            mode: "actor_verification",
            interviewer_name: "AI面接官",
            impression: body.isAbandoned ? "途中退出" : "完了",
            screening_candidate_id: invitation.screening_candidate_id ?? null,
            actor_id: actorId,
          })
          .select("id")
          .maybeSingle();

        if (interviewError || !interview) {
          console.error("interviews insert error:", interviewError);
          return json({ error: "Failed to save interview" }, 500);
        }

        const interviewId = interview.id;

        // 2. interview_turnsに会話ログを保存
        const turns = [];
        let turnNumber = 0;
        for (let i = 0; i < body.messages.length; i += 2) {
          const question =
            body.messages[i]?.role === "assistant" ? body.messages[i]?.content : null;
          const answer =
            body.messages[i + 1]?.role === "user" ? body.messages[i + 1]?.content : null;
          if (question) {
            turnNumber++;
            turns.push({
              interview_id: interviewId,
              turn_number: turnNumber,
              question,
              memo: answer ?? "",
            });
          }
        }
        if (turns.length > 0) {
          await supabase.from("interview_turns").insert(turns);
        }

        if (body.isAbandoned) {
          return json({ success: true, interviewId, skippedSummary: true });
        }

        // 3. Claudeで総評・スコアを生成(お金目線のスコア配点、DB不足時はWeb検索で裏取り)
        const anthropic = new Anthropic({ apiKey: anthropicKey });

        const conversationText = body.messages
          .map((m) => `${m.role === "assistant" ? "AI面接官" : "候補者"}：${m.content}`)
          .join("\n");

        const summaryPrompt = `以下は役者の経歴確認面接の会話記録です。演技力の評価は一切行わないでください。
評価するのは「本人の発言とデータベース情報の整合性」と「この作品でどれだけ稼げるか」の2点です。
このデータを見るのはプロデューサー・監督・キャスティング担当者であり、彼らが最終的に知りたいのは
「投資として成立するか＝興行的に稼げるか」です。抽象的な人柄評価より、集客・収益への貢献度を最優先で評価してください。
面接中に出てきた出演作品名・SNSアカウント・実績等について、社内データベースの情報だけで確認できない場合は、
Web検索を使って実在するか・記載内容が事実と一致するかを確認してください。

【最重要・同姓同名への注意】
無名・新人の役者は、Web検索で「同じ名前の別人（有名人）」がヒットすることが非常によくある。
検索結果の人物と本人が同一かどうかは、年齢・所属事務所・具体的な作品名が一致するかで慎重に判断すること。
年齢や所属事務所が大きく異なる場合、それは経歴詐称の証拠ではなく「同姓同名の別人がヒットしただけ」の
可能性が高い。この場合、別人の情報を根拠に discrepancies に含めてはならない。
本人の発言がWeb上で確認できないこと自体は、経歴詐称の根拠にはならない(新人であれば当然のこと)。

【面接会話】
${conversationText}

以下のJSON形式のみで返してください（前置き・説明不要）：
{
  "overall_impression": "面接全体の総評（250文字程度、興行的な見立てを中心に）",
  "consistency_check": "本人の発言とデータベース情報が一致しているかどうかの評価",
  "discrepancies": ["データベースと食い違っていた発言があれば具体的に(無ければ空配列)"],
  "audience_draw_assessment": "集客力の見込みについての評価（SNSでの発信姿勢・過去の集客実績等を踏まえて）",
  "score_breakdown": [
    {"category": "集客力・興行への貢献度", "score": 45, "comment": "その評価にした理由（1文、具体的な集客見込みの根拠）"},
    {"category": "経歴の信頼度（投資リスク）", "score": 25, "comment": "その評価にした理由（1文、虚偽が発覚した場合のリスクの大きさも踏まえる）"},
    {"category": "話題性・拡散力", "score": 12, "comment": "その評価にした理由（1文）"}
  ],
  "reliability_score": 78,
  "good_points": ["良かった点1", "良かった点2"],
  "concerns": ["懸念点1（具体的に）", "懸念点2"]
}
score_breakdownは「集客力・興行への貢献度」55点満点・「経歴の信頼度（投資リスク）」30点満点・「話題性・拡散力」15点満点の配分（合計100点）とし、reliability_scoreはその合計値と一致させること。`;

        let summaryData: any = {};
        try {
          const aiResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4500,
            messages: [{ role: "user", content: summaryPrompt }],
            tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
          });

          summaryData = extractJson(lastTextBlock(aiResponse.content as any));
        } catch (e) {
          console.error("Summary generation failed:", e);
        }

        // 4. interviewsを総評で更新(採用可否に関するスコア類は一切書き込まない)
        await supabase
          .from("interviews")
          .update({
            summary: summaryData.overall_impression ?? "",
            strengths: summaryData.good_points ?? [],
            concerns: summaryData.concerns ?? [],
          })
          .eq("id", interviewId);

        // 自社限定のオーディション記録に自動で1件追加する
        if (actorId) {
          await supabase.from("actor_audition_notes").insert({
            actor_id: actorId,
            company_user_id: invitation.user_id,
            audition_date: new Date().toISOString().slice(0, 10),
            note: `[AI経歴確認面接] ${summaryData.overall_impression ?? ""}${
              summaryData.discrepancies?.length
                ? `\n矛盾点: ${summaryData.discrepancies.join("、")}`
                : ""
            }`,
          });
        }

        // 5. interview_summariesに詳細を保存(役者専用のactor_verification列のみ使用)
        const { error: summaryInsertError } = await supabase.from("interview_summaries").insert({
          interview_id: interviewId,
          actor_verification: {
            overall_impression: summaryData.overall_impression ?? "",
            consistency_check: summaryData.consistency_check ?? "",
            discrepancies: summaryData.discrepancies ?? [],
            audience_draw_assessment: summaryData.audience_draw_assessment ?? "",
            score_breakdown: summaryData.score_breakdown ?? [],
            reliability_score: summaryData.reliability_score ?? null,
            good_points: summaryData.good_points ?? [],
            concerns: summaryData.concerns ?? [],
          },
        });

        if (summaryInsertError) {
          console.error("interview_summaries insert error:", JSON.stringify(summaryInsertError));
        }

        return json({ success: true, interviewId });
      },
    },
  },
});
