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

export const Route = createFileRoute("/api/interview-turn")({
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

          // 招待トークンを必須にし、有効な(未期限切れの)招待に紐づくリクエストのみ許可する。
          // これにより匿名ユーザーが Anthropic/OpenAI API を無料のプロキシとして悪用するのを防ぐ。
          if (!body.token || typeof body.token !== "string") {
            return json({ error: "Missing token" }, 401);
          }

          // 入力の妥当性チェック(プロンプトインジェクション・巨大ペイロードによる
          // コスト暴走を防ぐため、長さと件数に上限を設ける)。
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
          for (const turn of body.conversationHistory) {
            if (
              !turn ||
              (turn.role !== "user" && turn.role !== "assistant") ||
              typeof turn.content !== "string" ||
              turn.content.length > MAX_TEXT_LEN
            ) {
              return json({ error: "Invalid conversationHistory" }, 400);
            }
          }

          const serviceKey = getServiceRoleKey();
          if (!serviceKey) {
            return json({ error: "Server config missing" }, 500);
          }
          const supabase = createClient(getSupabaseUrl(), serviceKey);

          // tokenから招待情報・書類選考データ・企業情報・アバター設定を自動取得
          let screeningData: Record<string, unknown> = {};
          let companyContext = "";
          let avatarStyle = "neutral";
          let practiceMode: "individual" | "student" | null = null;
          let practiceMaxMinutes: number | null = null;
          let practiceDepth: "basic" | "standard" | "deep" = "standard";
          let practiceInterviewType: string = "general";
          let uploadedResumeText: string | null = null;
          let practiceAvatarStyleOverride: string | null = null;
          {
            const { data: inv } = await supabase
              .from("interview_invitations")
              .select(
                "user_id, screening_data, practice_mode, avatar_style, practice_max_minutes, practice_depth, uploaded_resume_text, expires_at, practice_interview_type",
              )
              .eq("token", body.token)
              .maybeSingle();

            // 有効な招待が存在しない、または期限切れの場合は拒否する。
            if (
              !inv ||
              ((inv as any).expires_at &&
                new Date((inv as any).expires_at as string).getTime() < Date.now())
            ) {
              return json({ error: "Invalid or expired token" }, 403);
            }

            if (inv?.screening_data) {
              screeningData = inv.screening_data as Record<string, unknown>;
            }
            practiceMode = (inv as any)?.practice_mode ?? null;
            practiceAvatarStyleOverride = (inv as any)?.avatar_style ?? null;
            practiceMaxMinutes = (inv as any)?.practice_max_minutes ?? null;
            uploadedResumeText = (inv as any)?.uploaded_resume_text ?? null;
            practiceDepth = (inv as any)?.practice_depth ?? "standard";
            practiceInterviewType = (inv as any)?.practice_interview_type ?? "general";

            // 個人/受験生の自己練習セッションでは、企業プロフィール・avatar_configの
            // 参照を一切行わない(そもそも本人の profiles に企業情報は無いため無意味)。
            // avatarStyleは招待作成時に指定されたものをそのまま使う。
            if (practiceMode) {
              if (practiceAvatarStyleOverride) avatarStyle = practiceAvatarStyleOverride;
            } else if (inv?.user_id) {
              const { data: profile } = await supabase
                .from("profiles")
                .select(
                  "company_name, business_description, hiring_positions, ideal_candidate, company_culture, company_strengths, competitive_advantage, competitors, successful_hire_traits, failed_hire_traits, first_job_description, interview_focus, company_id",
                )
                .eq("id", inv.user_id)
                .maybeSingle();

              if (profile) {
                const fields: [string, string][] = [
                  ["事業内容", (profile as any).business_description],
                  ["募集ポジション", (profile as any).hiring_positions],
                  ["求める人物像", (profile as any).ideal_candidate],
                  ["社風・カルチャー", (profile as any).company_culture],
                  ["自社の強み", (profile as any).company_strengths],
                  ["競合優位性", (profile as any).competitive_advantage],
                  ["競合・市場状況", (profile as any).competitors],
                  ["活躍している社員の特徴", (profile as any).successful_hire_traits],
                  ["早期退職・ミスマッチしやすい人の特徴", (profile as any).failed_hire_traits],
                  ["入社後の最初の業務内容", (profile as any).first_job_description],
                  ["選考で重視する評価軸", (profile as any).interview_focus],
                ];
                companyContext = fields
                  .filter(([, v]) => v && String(v).trim().length > 0)
                  .map(([label, v]) => `${label}：${v}`)
                  .join("\n");
              }

              if ((profile as any)?.company_id) {
                const { data: company } = await supabase
                  .from("companies")
                  .select("avatar_config")
                  .eq("id", (profile as any).company_id)
                  .maybeSingle();
                const cfg = (company?.avatar_config ?? {}) as Record<string, unknown>;
                if (typeof cfg.interview_style === "string") avatarStyle = cfg.interview_style;
              }
            }
          }

          const styleInstruction =
            avatarStyle === "strict"
              ? "厳しめ・鋭い質問を投げかける面接官として振る舞ってください。圧迫面接にはしませんが、深掘りは妥協しません。"
              : avatarStyle === "friendly"
                ? "親しみやすく、候補者がリラックスして話せるフレンドリーな面接官として振る舞ってください。"
                : "標準的でバランスの取れた面接官として振る舞ってください。";

          const anthropic = new Anthropic({ apiKey: anthropicKey });

          // 個人(模擬面接練習)・受験生(入試面接練習)は、企業の採用面接とは
          // 質問の観点も終了条件もまったく別物のため、専用のプロンプトを使う。
          // 企業面接(practiceMode === null)の場合はここに一切手を加えず、
          // 既存のsystemPromptをそのまま使う。
          let systemPrompt: string;

          // 練習モード用: プラン別の時間上限・深掘り度をプロンプトに反映する
          const practiceTimeInstruction = practiceMaxMinutes
            ? `${practiceMaxMinutes}分を超えたら終了を提案する`
            : "十分な情報が引き出せたと判断したら終了を提案する(時間上限なし)";
          const practiceDepthInstruction =
            practiceDepth === "deep"
              ? "回答が曖昧な場合は必ず「具体的には？」「なぜそう思いますか？」と2段階以上深掘りし、本番同様の緊張感で臨む"
              : practiceDepth === "basic"
                ? "深掘りは1段階程度に留め、必須カバー項目を一通り聞くことを優先する(短時間で終える)"
                : "回答が曖昧な場合は「具体的には？」と一度は深掘りする";

          const customQuestionsText = (screeningData as any).practice_custom_questions as
            string | undefined;
          const customQuestionsSection = customQuestionsText
            ? `\n【この人が特に聞いてほしいと希望している質問・観点(必ず会話の中で扱うこと)】\n${customQuestionsText}\n`
            : "";
          const resumeSection = uploadedResumeText
            ? `\n【アップロードされた書類(履歴書等)の内容。この内容についても深掘りして質問すること】\n${uploadedResumeText}\n`
            : "";

          const interviewTypeCoverage: Record<string, string> = {
            general: `- 自己紹介・自己PR
- 転職理由・志望動機（一般的な観点で）
- 強み・弱み
- これまでの経験・実績
- 今後のキャリアビジョン`,
            self_pr: `- 自己紹介
- あなたの強みを一言で表すと何か
- その強みを裏付ける具体的なエピソード・実績(数字があれば深掘りする)
- その強みが仕事でどう活かせるか
- 周囲からどう評価されているか(第三者からの評価エピソード)
- 強みを発揮する上で工夫していること`,
            entry_sheet: `- 自己紹介
- 志望する業界・職種への興味を持ったきっかけ
- 学生時代・これまでの経験で最も力を入れたこと(具体的なエピソード・数字)
- その経験から得た学び・成長
- 入社後にやりたいこと・将来のビジョン
- なぜ数ある企業・業界の中でこの分野なのか`,
            resume: `- 自己紹介
- 最終学歴・専攻内容
- これまでの職歴(担当した業務内容を具体的に、実績は数字で)
- 保有している資格・スキル
- 転職理由・退職理由(あれば)
- 得意な業務・専門分野`,
          };
          const coverageSection =
            interviewTypeCoverage[practiceInterviewType] ?? interviewTypeCoverage.general;
          const interviewTypeNote: Record<string, string> = {
            general: "",
            self_pr:
              "\n※この面接は「自己PR面接」です。強み・実績の深掘りを重点的に行い、後で自己PR文章の材料として使える具体的なエピソードを引き出すことを意識してください。",
            entry_sheet:
              "\n※この面接は「ES面接」です。志望動機・エピソードの深掘りを重点的に行い、後でエントリーシートの材料として使える具体的な内容を引き出すことを意識してください。",
            resume:
              "\n※この面接は「履歴書面接」です。職歴・スキルの整理を重点的に行い、後で履歴書の項目として使える具体的な内容を引き出すことを意識してください。",
          };

          if (practiceMode === "individual") {
            systemPrompt = `あなたは就職・転職activities向けの模擬面接官AIです。
これは実際の採用選考ではなく、練習のための模擬面接です。${interviewTypeNote[practiceInterviewType] ?? ""}

【面接官としての性格】
${styleInstruction}

【最初の挨拶の例】
「本日は模擬面接にご参加いただきありがとうございます。実際の面接のつもりで、リラックスしてお答えください。それではまず、簡単に自己紹介をお願いできますか？」

【必須カバー項目】
${coverageSection}

【会話のルール】
- 候補者が既に話した内容は再度聞かない
- ${practiceDepthInstruction}
- テンプレート感を出さない・自然な会話にする
- 返答は簡潔に（2〜3文程度）
- あくまで練習なので、候補者を委縮させすぎない範囲で本番同様の緊張感を持たせる
- 重要: あなたは面接官に徹すること。回答に対する評価・アドバイス・「良い点は〜」「改善するとよいのは〜」といったフィードバックは面接中に一切口に出さないこと。フィードバックは面接終了後にまとめて別途行われるため、面接中はあくまで次の質問・相槌・深掘りのみに徹する

【終了条件】
- 必須カバー項目を一通り聞けたら「本日の模擬面接はこれで終了です。お疲れ様でした」と言う
- ${practiceTimeInstruction}

【この人のプロフィール(練習の参考にする。深掘りに活用すること)】
${Object.keys(screeningData).length > 0 ? JSON.stringify(screeningData, null, 2) : "（プロフィール未入力）"}
${customQuestionsSection}${resumeSection}
日本語で話してください。`;
          } else if (practiceMode === "student") {
            systemPrompt = `あなたは大学・専門学校等の入試面接を担当する模擬面接官AIです。
これは実際の入試ではなく、練習のための模擬面接です。

【面接官としての性格】
${styleInstruction}

【最初の挨拶の例】
「本日は模擬面接にご参加いただきありがとうございます。実際の入試のつもりで、落ち着いてお答えください。それではまず、簡単に自己紹介をお願いできますか？」

【必須カバー項目】
- 自己紹介
- 志望理由（この学校・学部を選んだ理由）
- 高校時代に力を入れたこと・部活動等の経験
- 長所・短所
- 入学後にやりたいこと・将来の目標

【会話のルール】
- 受験生が既に話した内容は再度聞かない
- ${practiceDepthInstruction}
- 高圧的になりすぎず、受験生が持つ意欲や人柄を引き出すことを重視する
- 返答は簡潔に（2〜3文程度）
- 重要: あなたは面接官に徹すること。回答に対する評価・アドバイス・「良い点は〜」「改善するとよいのは〜」といったフィードバックは面接中に一切口に出さないこと。フィードバックは面接終了後にまとめて別途行われるため、面接中はあくまで次の質問・相槌・深掘りのみに徹する

【終了条件】
- 必須カバー項目を一通り聞けたら「本日の模擬面接はこれで終了です。お疲れ様でした」と言う
- ${practiceTimeInstruction}

【この受験生のプロフィール(練習の参考にする。深掘りに活用すること)】
${Object.keys(screeningData).length > 0 ? JSON.stringify(screeningData, null, 2) : "（プロフィール未入力）"}
${customQuestionsSection}${resumeSection}
日本語で話してください。`;
          } else {
            systemPrompt = `あなたはオンラインビデオ面接を担当するAI面接官です。
これは完全にオンライン（ビデオ通話）での面接です。

【面接官としての性格】
${styleInstruction}

【絶対に聞いてはいけないこと】
- 「道中いかがでしたか」「お時間はかかりませんでしたか」など移動に関すること
- 「今日はどちらからお越しになりましたか」など来訪に関すること
- オフラインでの対面を前提とした質問

【最初の挨拶の例】
「本日はオンラインでのご参加ありがとうございます。
画面越しではありますが、どうぞリラックスしてお話しいただければと思います。
それではまず、簡単に自己紹介をお願いできますか？」

以下のルールに従って面接を進めてください：

【必須カバー項目】
- 志望動機（必ず聞く）
- 強み・弱み（必ず触れる）
- 書類選考時の懸念点（下記データがあれば必ず深掘りする）
- 会社情報に関連する質問（下記の求める人物像・評価軸を踏まえる）

【会話のルール】
- 候補者が既に話した内容は絶対に再度聞かない
- 良い話が出たら深掘りする
- 気になる点・矛盾点は掘り下げる
- テンプレート感を出さない・自然な会話にする
- 世間話・アイスブレイクも織り交ぜる
- 返答は簡潔に（2〜3文程度）

【終了条件】
- 十分な情報が取れたと判断したら「面接を終了させていただきます」と言う
- 30分を超えたら終了を提案する

【書類選考データ（この候補者の書類選考結果。懸念点は必ず深掘りすること）】
${Object.keys(screeningData).length > 0 ? JSON.stringify(screeningData, null, 2) : "（書類選考データなし）"}

【企業情報（この会社の採用方針・求める人物像）】
${companyContext || "（企業情報未設定）"}

日本語で話してください。`;
          }

          const messages = [
            ...body.conversationHistory,
            { role: "user" as const, content: body.candidateText },
          ];

          const aiResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 300,
            system: systemPrompt,
            messages,
          });

          const aiText =
            aiResponse.content[0].type === "text"
              ? aiResponse.content[0].text
              : "次の質問をお願いします。";

          // 面接終了判定
          const isEnded =
            aiText.includes("面接を終了") ||
            aiText.includes("以上で終了") ||
            aiText.includes("本日の面接はこれで") ||
            aiText.includes("面接は以上") ||
            aiText.includes("ありがとうございました。以上") ||
            aiText.includes("お疲れ様でした") ||
            aiText.includes("終了とさせていただきます") ||
            aiText.includes("面接を終わらせていただきます");

          // OpenAI TTSで音声合成（日本語対応・自然な発音）
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
            const errText = await ttsRes.text();
            console.error("OpenAI TTS status:", ttsRes.status);
            console.error("OpenAI TTS error:", errText);
            return json({ aiText, audioBase64: null, isEnded }, 200);
          }

          const audioBuffer = await ttsRes.arrayBuffer();
          const audioBase64 = Buffer.from(audioBuffer).toString("base64");

          // Supabaseに会話を保存
          if (supabase && body.token) {
            await supabase
              .from("interview_invitations")
              .update({
                status: isEnded ? "completed" : "started",
              })
              .eq("token", body.token);
          }

          return json({ aiText, audioBase64, isEnded });
        } catch (e) {
          console.error(e);
          return json({ error: "Internal server error" }, 500);
        }
      },
    },
  },
});
