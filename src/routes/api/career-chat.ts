/**
 * AIチャット(キャリア相談・面接対策)API
 *
 * POST /api/career-chat
 *   body: { sessionId?: string, message: string }
 *   sessionIdが無ければ新規セッションを作成する。
 *   ユーザーのプロフィール・オンボーディング回答・毎日の質問回答を
 *   文脈として渡すことで、その人に合わせた返答をする。
 *
 * セッション一覧・メッセージ履歴の取得はRLSで直接読めるため、
 * クライアントから直接Supabaseに問い合わせればよく、専用APIは不要。
 * (career_chat_sessions/career_chat_messagesはFOR ALL/SELECT ownで
 *  本人に許可済み)
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  getSupabaseUrl,
  getServiceRoleKey,
  verifyApiUser,
  checkAndConsumeImageQuota,
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

export const Route = createFileRoute("/api/career-chat")({
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

        const body = (await request.json().catch(() => null)) as {
          sessionId?: string;
          message?: string;
          image?: { data: string; mediaType: string };
        } | null;
        const message = body?.message?.trim() ?? "";
        const image = body?.image;
        if (!message && !image) return json({ error: "message is required" }, 400);

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
        const isPro = plan === "individual_pro" || plan === "company_pro" || plan === "pro";
        const isLight =
          plan === "individual_light" || plan === "company_light" || plan === "standard";

        // プランごとにAIへ渡す文脈量を変える(free/lightはコスト削減のため絞り、
        // proは会話履歴を無制限、その他の参照範囲も最大にする)
        const dailyAnswerLimit = isPro ? 200 : isLight ? 30 : 10;
        const historyLimit = isLight ? 20 : 10; // proは無制限なので別扱い(下記参照)
        const generatedDocsLimit = isPro ? 10 : isLight ? 3 : 0;
        const selfAnalysisLimit = isPro ? 3 : 0;

        // 個人・受験生プランの画像添付回数制限は一時的に撤廃

        // セッション取得 or 新規作成
        let sessionId = body?.sessionId;
        if (sessionId) {
          const { data: existing } = await supabase
            .from("career_chat_sessions")
            .select("id")
            .eq("id", sessionId)
            .eq("user_id", userId)
            .maybeSingle();
          if (!existing) sessionId = undefined; // 他人のセッションIDが渡された場合等は新規扱いにする
        }
        if (!sessionId) {
          const { data: created, error: createError } = await supabase
            .from("career_chat_sessions")
            .insert({
              user_id: userId,
              mode: dbMode,
              title: (message || "画像の相談").slice(0, 30),
            })
            .select("id")
            .single();
          if (createError || !created) return json({ error: "session_create_failed" }, 500);
          sessionId = created.id as string;
        }

        // 直近の会話履歴(proは無制限=そのセッションの全メッセージ、free/lightは件数制限)
        const historyQuery = supabase
          .from("career_chat_messages")
          .select("role, content")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true });
        const { data: history } = isPro
          ? await historyQuery
          : await historyQuery.limit(historyLimit);

        // パーソナライズ用の文脈: この人について分かっていることを集める。
        // 志望校/職種だけでなく、強み・弱み・価値観・エピソード・自己PR・学歴・資格・
        // 職歴・課外活動・これまでの生成物まで、プランに応じた範囲で渡す
        // (free/lightはコスト削減のため参照量を絞る。limitが0のものは問い合わせ自体を省略する)。
        const [
          { data: careerProfile },
          { data: onboarding },
          { data: dailyAnswers },
          { data: generatedDocs },
          { data: selfAnalysis },
        ] = await Promise.all([
          supabase
            .from("user_career_profiles")
            .select("*")
            .eq("user_id", userId)
            .eq("mode", dbMode)
            .maybeSingle(),
          supabase
            .from("onboarding_answers")
            .select("answers")
            .eq("user_id", userId)
            .eq("mode", dbMode)
            .maybeSingle(),
          supabase
            .from("daily_question_responses")
            .select("question_text, category, answer_text")
            .eq("user_id", userId)
            .eq("mode", dbMode)
            .order("created_at", { ascending: false })
            .limit(dailyAnswerLimit),
          generatedDocsLimit > 0
            ? supabase
                .from("generated_documents")
                .select("doc_type, title, generated_content")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(generatedDocsLimit)
            : Promise.resolve({ data: null }),
          selfAnalysisLimit > 0
            ? supabase
                .from("self_analysis_reports")
                .select("report_type, strengths, weaknesses, concerns, appeal_points, suited_jobs")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(selfAnalysisLimit)
            : Promise.resolve({ data: null }),
        ]);

        const modeLabel = dbMode === "student" ? "受験生（入試対策）" : "社会人（就活・転職）";

        // careerProfileは丸ごと(*)取得しているので、余計なカラム(user_id等)を
        // 除いて中身をそのまま渡す。特定フィールドだけ抜き出すと漏れが出るため、
        // 意図的に全項目をそのままAIに渡す方針にしている。
        const profileSummary = careerProfile
          ? JSON.stringify({
              basic_info: careerProfile.basic_info,
              self_pr: careerProfile.self_pr,
              skills: careerProfile.skills,
              education_history: careerProfile.education_history,
              certifications: careerProfile.certifications,
              work_history: careerProfile.work_history,
              extracurricular_activities: careerProfile.extracurricular_activities,
              desired_conditions: careerProfile.desired_conditions,
              desired_schools: careerProfile.desired_schools,
              mock_exam_results: careerProfile.mock_exam_results,
              custom_fields: careerProfile.custom_fields,
            })
          : "(プロフィール未入力)";

        const qaHistory = (dailyAnswers ?? [])
          .map((r: any) => `Q(${r.category ?? "未分類"}): ${r.question_text}\nA: ${r.answer_text}`)
          .join("\n\n");

        const generatedDocsSummary = (generatedDocs ?? [])
          .map(
            (d: any) =>
              `[${d.doc_type}] ${d.title ?? ""}\n${(d.generated_content ?? "").slice(0, 300)}`,
          )
          .join("\n\n");

        const selfAnalysisSummary = (selfAnalysis ?? [])
          .map((r: any) =>
            JSON.stringify({
              type: r.report_type,
              strengths: r.strengths,
              weaknesses: r.weaknesses,
              concerns: r.concerns,
              appeal_points: r.appeal_points,
              suited_jobs: r.suited_jobs,
            }),
          )
          .join("\n");

        const focusHint =
          dbMode === "student"
            ? "志望校・志望学部が分かっている場合はその学校特有の入試傾向を踏まえて答え、得意/苦手科目の話が出たらそれに沿った学習アドバイスも添える。"
            : "希望する職種・業界が分かっている場合はその業界特有の面接傾向を踏まえて答え、自己PRや経歴の話が出たらこれまでの経験と結びつけて深掘りする。";

        const systemPrompt = `あなたは${modeLabel}向けの、親身で頼れるキャリアコーチAIです。
ユーザーの相談に寄り添いながら、具体的で実践的なアドバイスをしてください。

# 重要な方針
- 下記の情報は、志望校・志望職種に限らず「この人について分かっていること全て」である。プロフィールの一部だけでなく、強み・弱み・価値観・エピソード・自己PR・学歴・資格・職歴・課外活動・過去の生成物・自己分析結果まで、関連する範囲で会話に自然に反映すること
- 一般論ではなく、この人個人に向けた返答をすること
- ${focusHint}
- 過去の回答内容と矛盾しないよう気をつけ、話がつながっていることが伝わるようにする

# プロフィール(全項目)
${profileSummary}

# 登録時の回答
${onboarding?.answers ? JSON.stringify(onboarding.answers) : "(なし)"}

# これまでの「今日の質問」への回答(自己分析の材料。全件)
${qaHistory || "(まだ回答なし)"}

# これまでにAIが生成した書類(履歴書・志望理由書等)
${generatedDocsSummary || "(まだなし)"}

# これまでの自己分析レポート
${selfAnalysisSummary || "(まだなし)"}

会話のトーンは親しみやすく、かつ的確に。長すぎる返答は避け、要点を絞って答えてください。`;

        const userContent: any = image
          ? [
              {
                type: "image",
                source: { type: "base64", media_type: image.mediaType, data: image.data },
              },
              { type: "text", text: message || "この画像について教えてください" },
            ]
          : message;

        const messages = [
          ...((history ?? []) as { role: "user" | "assistant"; content: string }[]),
          { role: "user" as const, content: userContent },
        ];

        const anthropic = new Anthropic({ apiKey: anthropicKey });
        let replyText = "";
        try {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 1000,
            system: systemPrompt,
            messages,
          });
          replyText = response.content[0]?.type === "text" ? response.content[0].text : "";
        } catch (e) {
          console.error("[career-chat] anthropic call failed", e);
          return json({ error: "ai_call_failed" }, 502);
        }

        // ユーザーの発言とAIの返答、両方を保存
        // (画像そのものは永続化していないため、履歴には送信した事実だけを残す)
        const savedUserContent = image
          ? `📷 画像を送信しました${message ? `\n${message}` : ""}`
          : message;
        await supabase.from("career_chat_messages").insert([
          { session_id: sessionId, role: "user", content: savedUserContent },
          { session_id: sessionId, role: "assistant", content: replyText },
        ]);
        await supabase
          .from("career_chat_sessions")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", sessionId);

        return json({ sessionId, reply: replyText });
      },
    },
  },
});
