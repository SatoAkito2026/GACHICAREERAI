/**
 * チャット形式の模擬面接(自己PR面接・ES面接・履歴書面接専用)
 *
 * 3Dアバター・音声合成(TTS)を使わない、テキストのみの会話。
 * 情報収集が目的の面接タイプはリアルな面接体験が不要なため、
 * コストを大幅に抑えたチャットAIで対応する。
 *
 * POST /api/chat-interview-turn
 *   body: { token, candidateText, conversationHistory }
 */
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

const COVERAGE: Record<string, string> = {
  self_pr: `- 自己紹介
- あなたの強みを一言で表すと何か
- その強みを裏付ける具体的なエピソード・実績(数字があれば深掘りする)
- その強みが仕事でどう活かせるか
- 周囲からどう評価されているか(第三者からの評価エピソード)
- 強みを発揮する上で工夫していること`,
  entry_sheet: `- お名前とふりがな(書類に記載するため、必ず確認する)
- 出身校の学校名・学部・学科
- 志望する業界・職種への興味を持ったきっかけ
- 学生時代・これまでの経験で最も力を入れたこと(具体的なエピソード・数字)
- その経験から得た学び・成長
- 入社後にやりたいこと・将来のビジョン
- なぜ数ある企業・業界の中でこの分野なのか
- 保有している資格(あれば)
- 趣味・部活動(あれば)`,
  resume: `- お名前とふりがな(書類に記載するため、必ず確認する)
- 最終学歴(学校名・学部学科・卒業/在学中の別)と、卒業(見込み)の年月(西暦・何月まで具体的に)
- これまでの職歴(会社名・担当業務を具体的に、実績は数字で)。それぞれ入社した年月・退職した年月(西暦・何月まで具体的に)
- 保有している資格・スキルと、取得した年月(分かれば)
- 転職理由・退職理由(あれば)
- 得意な業務・専門分野`,
  work_history: `- お名前
- これまでの職歴を会社ごとに区切って聞く。各社について:
  - 会社名・業種
  - 雇用形態(正社員/契約社員/アルバイト等)・従業員数の規模感(分かれば)
  - 入社した年月・退職した年月(在籍中なら「現在に至る」)(西暦・何月まで具体的に)
  - 担当業務の具体的な内容・実績(数字で)
- 自己PR(強み・実績)
- 業務で活かせる経験・知識・技術
- 保有資格・PCスキル・語学力`,
};

const TYPE_LABEL: Record<string, string> = {
  self_pr: "自己PR面接",
  entry_sheet: "ES面接",
  resume: "履歴書面接",
  work_history: "職務経歴書面接",
};

export const Route = createFileRoute("/api/chat-interview-turn")({
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
          if (!anthropicKey) return json({ error: "API key missing" }, 500);
          if (!body.token || typeof body.token !== "string")
            return json({ error: "Missing token" }, 401);

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
          if (!serviceKey) return json({ error: "Server config missing" }, 500);
          const supabase = createClient(getSupabaseUrl(), serviceKey);

          const { data: inv } = await supabase
            .from("interview_invitations")
            .select("practice_mode, practice_interview_type, expires_at, screening_data")
            .eq("token", body.token)
            .maybeSingle();

          if (
            !inv ||
            (inv.expires_at && new Date(inv.expires_at as string).getTime() < Date.now())
          ) {
            return json({ error: "Invalid or expired token" }, 403);
          }
          const interviewType = (inv as any).practice_interview_type as string;
          if ((inv as any).practice_mode !== "individual" || !COVERAGE[interviewType]) {
            return json({ error: "この面接タイプはチャット形式に対応していません" }, 400);
          }
          const screeningData = (inv as any).screening_data ?? {};

          const systemPrompt = `あなたはユーザーと一緒に「${TYPE_LABEL[interviewType]}」の書類を作っていくAIアシスタントです。
これは「面接」ではなく、書類作成のための雑談・ヒアリングです。「面接官」のように構えず、
「一緒に良い書類を作りましょう」という協力的なパートナーとして振る舞ってください。
自然な会話の中から、書類作成に必要な情報を聞き出すことが目的です。

【聞き出したい情報】
${COVERAGE[interviewType]}

【会話のルール】
- 「面接」「質問させていただきます」のような硬い言い回しは避け、雑談のように話す
- 一度に1つのことだけを聞く
- 既に話した内容は再度聞かない
- チャットらしく、簡潔で親しみやすい文章にする（2〜3文程度）
- 相槌や共感を交えながら自然に深掘りする
- 「それ、いいですね」「なるほど、それは書類に書けそうです」のように、一緒に作っている感覚を出す
- 回答へのフィードバック・評価はここでは行わない(書類生成時にまとめて反映される)

【終了条件】
- 聞き出したい情報を一通り聞けたら「ありがとうございました。これで大丈夫です、書類を作成しますね。」と言う

【この人のプロフィール(参考情報)】
${Object.keys(screeningData).length > 0 ? JSON.stringify(screeningData, null, 2) : "（プロフィール未入力）"}

日本語で話してください。`;

          const messages: { role: "user" | "assistant"; content: string }[] = [
            ...body.conversationHistory,
            { role: "user", content: body.candidateText },
          ];

          const anthropic = new Anthropic({ apiKey: anthropicKey });
          const aiResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 300,
            system: systemPrompt,
            messages,
          });

          const aiText =
            aiResponse.content[0]?.type === "text"
              ? aiResponse.content[0].text
              : "次の質問をお願いします。";
          const isEnded = aiText.includes("以上です") || aiText.includes("ありがとうございました");

          return json({ aiText, isEnded });
        } catch (e) {
          console.error("[chat-interview-turn] failed", e);
          return json({ error: "Internal server error" }, 500);
        }
      },
    },
  },
});
