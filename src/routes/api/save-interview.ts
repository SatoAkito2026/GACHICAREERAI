import { createFileRoute } from "@tanstack/react-router";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey } from "@/lib/api-auth";
import { extractJson, lastTextBlock } from "@/lib/ai-json";

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

export const Route = createFileRoute("/api/save-interview")({
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
          companyName: string | null;
          isAbandoned: boolean;
        };

        const supabase = createClient(getSupabaseUrl(), serviceKey);

        // tokenからuser_id・練習モードかどうかを取得
        const { data: invitation } = await supabase
          .from("interview_invitations")
          .select("user_id, practice_mode, practice_interview_type")
          .eq("token", body.token)
          .maybeSingle();

        if (!invitation?.user_id) {
          return json({ error: "Invalid token" }, 400);
        }
        const practiceMode: "individual" | "student" | null =
          (invitation as any).practice_mode ?? null;
        const practiceInterviewType: string =
          (invitation as any).practice_interview_type ?? "general";

        // プロプランかどうかで、練習モードの総評の充実度を変える
        let isPro = false;
        if (practiceMode) {
          const { data: practicerProfile } = await supabase
            .from("profiles")
            .select("plan, plan_expires_at")
            .eq("id", invitation.user_id)
            .maybeSingle();
          const isExpired = practicerProfile?.plan_expires_at
            ? new Date(practicerProfile.plan_expires_at).getTime() < Date.now()
            : false;
          const plan =
            practicerProfile?.plan && !isExpired ? (practicerProfile.plan as string) : "free";
          isPro = plan === "individual_pro" || plan === "company_pro" || plan === "pro";
        }

        // screening_candidate_idを取得
        const { data: invFull } = await supabase
          .from("interview_invitations")
          .select("screening_candidate_id")
          .eq("token", body.token)
          .maybeSingle();

        // 1. interviewsテーブルに基本情報を保存
        const { data: interview, error: interviewError } = await supabase
          .from("interviews")
          .insert({
            user_id: invitation.user_id,
            candidate_name: body.candidateName ?? "不明",
            job_type: body.jobType ?? "",
            company_name: body.companyName ?? "",
            mode: practiceMode ?? "hiring",
            interviewer_name: "AI面接官",
            impression: body.isAbandoned ? "途中退出" : "完了",
            screening_candidate_id: (invFull as any)?.screening_candidate_id ?? null,
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

        // 途中退出の場合は総評生成をスキップ
        if (body.isAbandoned) {
          return json({ success: true, interviewId, skippedSummary: true });
        }

        // 3. Claudeで総評・スコアを生成
        const anthropic = new Anthropic({ apiKey: anthropicKey });

        const conversationText = body.messages
          .map(
            (m) =>
              `${m.role === "assistant" ? "AI面接官" : practiceMode ? "受験者" : "候補者"}：${m.content}`,
          )
          .join("\n");

        const summaryPrompt = practiceMode
          ? `以下は${practiceMode === "student" ? "入試の模擬面接" : "就職・転職の模擬面接"}の会話記録です。
これは採用選考ではなく練習であるため、「採用可否」「離職リスク」「企業フィット度」等の評価は一切行わず、
本人の練習に役立つ具体的なフィードバックのみを行ってください。

【面接会話】
${conversationText}

以下のJSON形式のみで返してください（前置き・説明不要）：
{
  "overall_impression": "面接全体の印象・総評（250文字程度）",
  "score_breakdown": [
    {"category": "自己PR・強みの伝え方", "score": 70, "comment": "その評価にした理由（1文）"},
    {"category": "志望動機の説得力", "score": 60, "comment": "その評価にした理由（1文）"},
    {"category": "事前準備・企業/学校研究度", "score": 50, "comment": "その評価にした理由（1文）"},
    {"category": "回答の具体性", "score": 65, "comment": "その評価にした理由（1文）"}
  ],
  "good_points": ["良かった点1（具体的に）", "良かった点2", "良かった点3"],
  "improvement_points": ["改善するとよい点1（具体的に）", "改善するとよい点2", "改善するとよい点3"],
  "sample_better_answers": [
    {"question": "会話中で出た質問", "better_answer": "より良い回答例"}
  ],
  "readiness_score": 72${
    isPro
      ? `,
  "personality_traits": [
    {"trait": "特性名(例:粘り強さ・慎重さ・社交性など)", "description": "会話から読み取れた根拠と説明(1〜2文)"}
  ],
  "detailed_analysis": "話し方の癖・思考の傾向・コミュニケーションスタイルなどを踏まえた、より深い分析(400字程度)"`
      : ""
  }
}
score_breakdownの各scoreは0-100。readiness_scoreはscore_breakdownの平均値と一致させること(勘や印象だけで別の数字を出さない)。sample_better_answersは2〜3個程度。${
              isPro
                ? "personality_traitsは3〜4個、その人の会話の端々から読み取れる性格的特徴を具体的根拠とともに示すこと。"
                : ""
            }`
          : `以下は採用面接の会話記録です。候補者を詳細に評価してJSONで返してください。

【面接会話】
${conversationText}

【職種】${body.jobType ?? "不明"}
【企業名】${body.companyName ?? "不明"}

以下のJSON形式のみで返してください（前置き・説明不要）：
{
  "summary": "総評（300文字程度）",
  "total_score": 75,
  "risk_score": 28,
  "consistency_score": 82,
  "company_fit_score": 80,
  "overview": "面接全体の印象（200文字程度）",
  "positives": ["良かった点1", "良かった点2", "良かった点3"],
  "red_flags": ["気になった点1", "気になった点2"],
  "adoption_reasons": ["採用推薦理由1（具体的に）", "採用推薦理由2"],
  "concerns": ["懸念点1（具体的に）", "懸念点2"],
  "next_questions": ["次回確認すべき質問1", "質問2", "質問3"],
  "radar_scores": {
    "proactiveness": 80,
    "sincerity": 75,
    "retention": 70,
    "immediate_value": 78,
    "communication": 72,
    "growth": 65,
    "stress_tolerance": 68
  },
  "company_fit_comment": "企業との適合性についての詳細コメント（150文字程度）",
  "resignation_risk_percent": 30,
  "resignation_risk_level": "低",
  "resignation_risk_factors": ["離職リスク要因1", "離職リスク要因2"],
  "personality_model": {
    "decision_style": "意思決定スタイルの説明（50文字程度）",
    "org_adaptability": "組織適応性の説明（50文字程度）",
    "achievement_mindset": "成果への考え方の説明（50文字程度）",
    "management_style": "マネジメントスタイルの説明（50文字程度）"
  },
  "ai_comment": "AIの見立て・総合コメント（200文字程度）",
  "next_steps": [
    "次回確認すること1（具体的なアクション）",
    "次回確認すること2（具体的なアクション）",
    "次回確認すること3（具体的なアクション）"
  ],
  "inconsistencies": ["回答の矛盾点1", "回答の矛盾点2"],
  "strengths": ["強み1", "強み2", "強み3"]
}

注意：resignation_risk_levelは「低」「中」「高」のいずれか。radar_scoresの値は0-100。`;

        let summaryData: any = {};
        try {
          const aiResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 3000,
            messages: [{ role: "user", content: summaryPrompt }],
          });

          const textBlock = aiResponse.content.filter((b: any) => b.type === "text").pop() as any;
          const raw = textBlock?.text ?? "{}";
          const content = raw
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```\s*$/i, "")
            .trim();
          summaryData = JSON.parse(content);
        } catch (e) {
          console.error("Summary generation failed:", e);
        }

        // 4. interviewsを総評・スコアで更新
        //    練習モード・役者経歴確認では採用可否に関するスコア類は一切書き込まない
        await supabase
          .from("interviews")
          .update(
            practiceMode
              ? {
                  summary: summaryData.overall_impression ?? "",
                  strengths: summaryData.good_points ?? [],
                  concerns: summaryData.improvement_points ?? [],
                }
              : {
                  summary: summaryData.summary ?? "",
                  strengths: summaryData.strengths ?? [],
                  concerns: summaryData.concerns ?? [],
                  next_questions: summaryData.next_questions ?? [],
                  total_score: summaryData.total_score ?? null,
                  risk_score: summaryData.risk_score ?? null,
                  consistency_score: summaryData.consistency_score ?? null,
                  company_fit_score: summaryData.company_fit_score ?? null,
                },
          )
          .eq("id", interviewId);

        // 5. interview_summariesに詳細を保存
        //    練習モードは practice_feedback にのみ保存し、採用可否関連の列は
        //    一切埋めない(NULL/空のまま)。企業面接の場合は従来通り。
        const { error: summaryInsertError } = await supabase.from("interview_summaries").insert(
          practiceMode
            ? {
                interview_id: interviewId,
                practice_feedback: {
                  overall_impression: summaryData.overall_impression ?? "",
                  score_breakdown: summaryData.score_breakdown ?? [],
                  good_points: summaryData.good_points ?? [],
                  improvement_points: summaryData.improvement_points ?? [],
                  sample_better_answers: summaryData.sample_better_answers ?? [],
                  readiness_score: summaryData.readiness_score ?? null,
                  personality_traits: summaryData.personality_traits ?? null,
                  detailed_analysis: summaryData.detailed_analysis ?? null,
                },
              }
            : {
                interview_id: interviewId,
                overview: summaryData.overview ?? "",
                positives: summaryData.positives ?? [],
                red_flags: summaryData.red_flags ?? [],
                adoption_reasons: Array.isArray(summaryData.adoption_reasons)
                  ? summaryData.adoption_reasons
                  : summaryData.adoption_reasons
                    ? [summaryData.adoption_reasons]
                    : [],
                concerns: summaryData.concerns ?? [],
                radar_scores: summaryData.radar_scores ?? {},
                overall_score: summaryData.total_score ?? null,
                risk_score: summaryData.risk_score ?? null,
                consistency_score: summaryData.consistency_score ?? null,
                inconsistencies: summaryData.inconsistencies ?? [],
                personality_model: summaryData.personality_model ?? {},
                company_fit_comment: summaryData.company_fit_comment ?? "",
                ai_comment: summaryData.ai_comment ?? "",
                next_steps: summaryData.next_steps ?? [],
                resignation_risk_percent: summaryData.resignation_risk_percent ?? null,
                resignation_risk_level: summaryData.resignation_risk_level ?? null,
                resignation_risk_factors: summaryData.resignation_risk_factors ?? [],
                check_next: summaryData.next_questions ?? [],
                onboarding: summaryData.onboarding ?? null,
              },
        );

        if (summaryInsertError) {
          console.error("interview_summaries insert error:", JSON.stringify(summaryInsertError));
        } else {
          console.log("interview_summaries saved successfully for:", interviewId);
        }

        // 面接タイプが指定されている個人モードの練習面接なら、会話内容から書類を自動生成する
        let generatedDocId: string | null = null;
        if (practiceMode === "individual" && practiceInterviewType !== "general") {
          try {
            if (practiceInterviewType === "work_history") {
              const whPrompt = `以下は職務経歴書作成をテーマにした模擬面接の会話記録です。
この会話の中で語られた内容だけをもとに、構造化データを作成してください。
会話で語られていない情報は絶対に作り出さず、該当項目は空配列/空文字列のままにしてください。
年月は西暦4桁+月の形式で、できるだけ具体的に埋めること(会話で明言されていなければ空文字列のままでよい)。

【面接会話】
${conversationText}

必ず次のJSON形式のみで出力してください。前置きや説明は不要。
{
  "careerBlocks": [
    { "period": "2020年4月〜2023年3月", "company_name": "会社名", "industry": "業種", "employment_type": "雇用形態", "employee_count": "従業員数", "duties": "担当業務・実績(箇条書き風の文章で)" }
  ],
  "selfPr": "自己PR文章(300字程度)",
  "usableExperience": "活かせる経験・知識・技術(200字程度)",
  "qualifications": "保有資格(会話に出てきたもののみ)",
  "pcSkills": "PCスキル(会話に出てきたもののみ)",
  "languageSkills": "語学力(会話に出てきたもののみ)"
}`;
              const whResponse = await anthropic.messages.create({
                model: "claude-sonnet-4-6",
                max_tokens: 2500,
                messages: [{ role: "user", content: whPrompt }],
              });
              const whParsed = extractJson(lastTextBlock(whResponse.content as any)) as any;

              const { data: genDocWh } = await supabase
                .from("generated_documents")
                .insert({
                  user_id: invitation.user_id,
                  mode: "individual",
                  doc_type: "work_history_resume",
                  title: "職務経歴書（模擬面接から自動生成）",
                  input_data: { source: "practice_interview", interviewId },
                  generated_content: JSON.stringify({
                    careerBlocks: whParsed.careerBlocks ?? [],
                    selfPr: whParsed.selfPr ?? "",
                    usableExperience: whParsed.usableExperience ?? "",
                    qualifications: whParsed.qualifications ?? "",
                    pcSkills: whParsed.pcSkills ?? "",
                    languageSkills: whParsed.languageSkills ?? "",
                  }),
                  final_draft: null,
                })
                .select("id")
                .single();
              generatedDocId = genDocWh?.id ?? null;
              console.log("auto-generated work history resume saved for interview:", interviewId);
            } else if (practiceInterviewType === "resume") {
              // 履歴書は基本情報・学歴・職歴・資格・自己PRをまとめて1つのJSONとして保存する。
              // 完成画面でその場編集し、そのまま保存できるようにするため。
              // 氏名等の基本情報はプロフィールの既存値を初期値として使う(面接では住所等は聞かない)。
              const { data: existingProfile } = await supabase
                .from("user_career_profiles")
                .select("basic_info")
                .eq("user_id", invitation.user_id)
                .eq("mode", "individual")
                .maybeSingle();
              const existingBasicInfo = (existingProfile?.basic_info ?? {}) as any;

              const resumePrompt = `以下は履歴書作成をテーマにした模擬面接の会話記録です。
この会話の中で語られた内容だけをもとに、構造化データを作成してください。
会話で語られていない情報は絶対に作り出さず、該当項目は空配列/空文字列のままにしてください。
年・月は分かれば西暦4桁・数字のみで分けて出力すること(例: year:"2020", month:"4")。分からなければ空文字列のままでよい。

【面接会話】
${conversationText}

必ず次のJSON形式のみで出力してください。前置きや説明は不要。
{
  "name": "氏名(会話で確認できた場合のみ、無ければ空文字列)",
  "furigana": "ふりがな(会話で確認できた場合のみ、無ければ空文字列)",
  "education": [{ "year": "", "month": "", "content": "学校名 学部学科 卒業/在学中等" }],
  "workHistory": [{ "year": "", "month": "", "content": "会社名 役職・担当業務・実績" }],
  "qualifications": [{ "year": "", "month": "", "content": "資格名" }],
  "selfPr": "会話から作成した自己PR文章(300〜400字程度)"
}`;

              const docResponse = await anthropic.messages.create({
                model: "claude-sonnet-4-6",
                max_tokens: 2000,
                messages: [{ role: "user", content: resumePrompt }],
              });
              const parsed = extractJson(lastTextBlock(docResponse.content as any)) as any;

              const resumeDocContent = {
                basicInfo: {
                  name: existingBasicInfo.name || parsed.name || "",
                  furigana: existingBasicInfo.furigana || parsed.furigana || "",
                  birthdate: existingBasicInfo.birthdate || "",
                  gender: existingBasicInfo.gender || "",
                  postalCode: existingBasicInfo.postal_code || "",
                  address: existingBasicInfo.address || "",
                  phone: existingBasicInfo.phone || "",
                  email: existingBasicInfo.email || "",
                  contactFurigana: "",
                  contactPostalCode: "",
                  contactAddress: "",
                  contactPhone: "",
                  contactEmail: "",
                },
                education: parsed.education ?? [],
                workHistory: parsed.workHistory ?? [],
                qualifications: parsed.qualifications ?? [],
                selfPr: parsed.selfPr ?? "",
                requestColumn: "",
              };

              const { data: genDoc1 } = await supabase
                .from("generated_documents")
                .insert({
                  user_id: invitation.user_id,
                  mode: "individual",
                  doc_type: "resume",
                  title: "履歴書（模擬面接から自動生成）",
                  input_data: { source: "practice_interview", interviewId },
                  generated_content: JSON.stringify(resumeDocContent),
                  final_draft: null,
                })
                .select("id")
                .single();
              generatedDocId = genDoc1?.id ?? null;
              console.log("auto-generated resume doc saved for interview:", interviewId);
            } else if (practiceInterviewType === "entry_sheet") {
              // カスタムテンプレートが登録されていれば、その項目構成に合わせて生成する
              const { data: customTemplate } = await supabase
                .from("user_document_templates")
                .select("id, fields")
                .eq("user_id", invitation.user_id)
                .eq("doc_type", "entry_sheet")
                .maybeSingle();

              if (
                customTemplate &&
                Array.isArray(customTemplate.fields) &&
                customTemplate.fields.length > 0
              ) {
                const fieldList = (customTemplate.fields as any[])
                  .map((f) => `- key:"${f.key}" label:"${f.label}" type:${f.type ?? "long_text"}`)
                  .join("\n");
                const customPrompt = `以下はES面接の会話記録です。ユーザー専用のテンプレートには次の項目があります。
${fieldList}

会話の中で語られた内容だけをもとに、各項目を埋めてください。会話に無い内容を勝手に作り出さないこと。
語られていない項目は空文字列にすること。

【面接会話】
${conversationText}

必ず、各項目のkeyをそのままJSONのキーとして使い、値のみを埋めたJSON形式で出力してください。前置きや説明は不要。`;
                const customResponse = await anthropic.messages.create({
                  model: "claude-sonnet-4-6",
                  max_tokens: 1500,
                  messages: [{ role: "user", content: customPrompt }],
                });
                const customParsed = extractJson(
                  lastTextBlock(customResponse.content as any),
                ) as any;

                const { data: genDoc2 } = await supabase
                  .from("generated_documents")
                  .insert({
                    user_id: invitation.user_id,
                    mode: "individual",
                    doc_type: "entry_sheet",
                    title: "エントリーシート（模擬面接から自動生成・自分専用テンプレート）",
                    input_data: {
                      source: "practice_interview",
                      interviewId,
                      templateId: customTemplate.id,
                    },
                    generated_content: JSON.stringify({
                      customFields: true,
                      values: customParsed,
                      fields: customTemplate.fields,
                    }),
                    final_draft: null,
                  })
                  .select("id")
                  .single();
                generatedDocId = genDoc2?.id ?? null;
                console.log(
                  "auto-generated custom-template entry sheet saved for interview:",
                  interviewId,
                );
              } else {
                // ESは「志望動機・強み特技・資格・趣味部活」を構造化データで生成する。
                // 氏名・ふりがな・学校名等も会話から聞き取り、プロフィールに反映する
                const esPrompt = `以下はES面接の会話記録です。この会話の中で語られた内容だけをもとに、
エントリーシート用の構造化データを作成してください。会話に無い内容を勝手に作り出さないこと。

【面接会話】
${conversationText}

必ず次のJSON形式のみで出力してください。前置きや説明は不要。
{
  "name": "氏名(会話で確認できた場合のみ、無ければ空文字列)",
  "furigana": "ふりがな(会話で確認できた場合のみ、無ければ空文字列)",
  "schoolName": "学校名(無ければ空文字列)",
  "faculty": "学部(無ければ空文字列)",
  "department": "学科(無ければ空文字列)",
  "motivation": "志望動機(300字程度、そのまま提出できる文章で)",
  "strengths": "強み・特技(150字程度)",
  "qualifications": "所有資格(会話に出てきたもののみ、無ければ空文字列)",
  "hobbies": "趣味・部活(会話に出てきたもののみ、無ければ空文字列)"
}`;
                const esResponse = await anthropic.messages.create({
                  model: "claude-sonnet-4-6",
                  max_tokens: 1500,
                  messages: [{ role: "user", content: esPrompt }],
                });
                const esParsed = extractJson(lastTextBlock(esResponse.content as any)) as any;

                // 氏名・ふりがな・学校名等をプロフィールに反映(既存の値は上書きせず、未入力の場合のみ補完)
                if (esParsed.name || esParsed.furigana || esParsed.schoolName) {
                  const { data: existingProfile } = await supabase
                    .from("user_career_profiles")
                    .select("basic_info")
                    .eq("user_id", invitation.user_id)
                    .eq("mode", "individual")
                    .maybeSingle();
                  const existingBasicInfo = existingProfile?.basic_info ?? {};
                  await supabase.from("user_career_profiles").upsert(
                    {
                      user_id: invitation.user_id,
                      mode: "individual",
                      basic_info: {
                        ...existingBasicInfo,
                        name: existingBasicInfo.name || esParsed.name || "",
                        furigana: existingBasicInfo.furigana || esParsed.furigana || "",
                        school_name: existingBasicInfo.school_name || esParsed.schoolName || "",
                        faculty: existingBasicInfo.faculty || esParsed.faculty || "",
                        department: existingBasicInfo.department || esParsed.department || "",
                      },
                    },
                    { onConflict: "user_id,mode" },
                  );
                }

                const { data: genDoc3 } = await supabase
                  .from("generated_documents")
                  .insert({
                    user_id: invitation.user_id,
                    mode: "individual",
                    doc_type: "entry_sheet",
                    title: "エントリーシート（模擬面接から自動生成）",
                    input_data: { source: "practice_interview", interviewId },
                    generated_content: JSON.stringify({
                      motivation: esParsed.motivation ?? "",
                      strengths: esParsed.strengths ?? "",
                      qualifications: esParsed.qualifications ?? "",
                      hobbies: esParsed.hobbies ?? "",
                    }),
                    final_draft: null,
                  })
                  .select("id")
                  .single();
                generatedDocId = genDoc3?.id ?? null;
                console.log("auto-generated entry sheet saved for interview:", interviewId);
              }
            } else {
              const DOC_TYPE_MAP: Record<
                string,
                { docType: string; title: string; instruction: string }
              > = {
                self_pr: {
                  docType: "self_pr",
                  title: "自己PR（模擬面接から自動生成）",
                  instruction:
                    "以下は自己PRをテーマにした模擬面接の会話記録です。この会話の中で語られた強み・具体的なエピソード・実績をもとに、面接や書類選考でそのまま使える自己PR文章を作成してください。会話に無い内容を勝手に作り出さないこと。",
                },
              };
              const docConfig = DOC_TYPE_MAP[practiceInterviewType];
              if (docConfig) {
                const docPrompt = `${docConfig.instruction}

【面接会話】
${conversationText}

書類本文のみを出力してください。前置き・説明・「以下が自己PRです」等の一文は不要です。`;

                const docResponse = await anthropic.messages.create({
                  model: "claude-sonnet-4-6",
                  max_tokens: 1500,
                  messages: [{ role: "user", content: docPrompt }],
                });
                const docTextBlock = docResponse.content.find((b: any) => b.type === "text") as any;
                const generatedContent = docTextBlock?.text?.trim();

                if (generatedContent) {
                  const { data: genDoc4 } = await supabase
                    .from("generated_documents")
                    .insert({
                      user_id: invitation.user_id,
                      mode: "individual",
                      doc_type: docConfig.docType,
                      title: docConfig.title,
                      input_data: { source: "practice_interview", interviewId },
                      generated_content: generatedContent,
                      final_draft: null,
                    })
                    .select("id")
                    .single();
                  generatedDocId = genDoc4?.id ?? null;
                  console.log("auto-generated document saved for interview:", interviewId);
                }
              }
            }
          } catch (e) {
            console.error("[save-interview] document auto-generation failed", e);
            // 書類生成に失敗しても、面接記録の保存自体は成功させる
          }
        }

        return json({ success: true, interviewId, generatedDocId });
      },
    },
  },
});
