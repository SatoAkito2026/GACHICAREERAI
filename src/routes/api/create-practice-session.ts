/**
 * 個人/受験生の模擬面接練習セッション作成API
 *
 * POST /api/create-practice-session
 *   body: { avatarStyle: 'friendly' | 'neutral' | 'strict' }
 *
 * 認証済みユーザー自身を宛先にした interview_invitations を作成し、
 * 既存の /interview/$token ページ(3Dアバター・音声認識・音声合成)に
 * そのまま案内する。screening_data にはプロフィール情報を注入し、
 * practice_mode を設定することで interview-turn.ts / save-interview.ts が
 * 企業面接とは別の質問方針・総評フォーマットで動作する。
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
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

export const Route = createFileRoute("/api/create-practice-session")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Supabase config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);
        const userId = auth.userId;

        const body = (await request.json().catch(() => null)) as {
          avatarStyle?: string;
          interviewType?: string;
          preferences?: {
            desired_job_type?: string;
            desired_company_name?: string;
            desired_school?: string;
            desired_faculty?: string;
            custom_questions?: string;
            prioritize_profile?: boolean;
          };
          uploadedResumeText?: string;
        } | null;
        const avatarStyle = ["friendly", "neutral", "strict"].includes(body?.avatarStyle ?? "")
          ? (body!.avatarStyle as string)
          : "neutral";
        const interviewType = [
          "general",
          "self_pr",
          "entry_sheet",
          "resume",
          "work_history",
        ].includes(body?.interviewType ?? "")
          ? (body!.interviewType as string)
          : "general";
        const preferences = body?.preferences ?? {};

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

        // プランごとの制限(クールダウン・最大時間・深掘り度)は plan_practice_config
        // テーブルで管理する。行が無ければ、これまでの既定値にフォールバックする。
        const { data: practiceConfig } = await supabase
          .from("plan_practice_config")
          .select("cooldown_hours, max_minutes, depth")
          .eq("plan", plan)
          .maybeSingle();

        const cooldownHours = practiceConfig?.cooldown_hours ?? (isPro || isLight ? 24 : 24 * 3);
        const maxMinutes = practiceConfig
          ? practiceConfig.max_minutes
          : isPro
            ? null
            : isLight
              ? 15
              : 5;
        const depth: "basic" | "standard" | "deep" =
          (practiceConfig?.depth as "basic" | "standard" | "deep" | undefined) ??
          (isPro ? "deep" : isLight ? "standard" : "basic");

        // 個人・受験生プランの回数制限は一時的に撤廃(企業側の制限には一切影響しない)

        const { data: careerProfile } = await supabase
          .from("user_career_profiles")
          .select("*")
          .eq("user_id", userId)
          .eq("mode", dbMode)
          .maybeSingle();

        const basicInfo = (careerProfile?.basic_info ?? {}) as Record<string, string>;
        const candidateName = basicInfo.name || "practice_user";

        const prioritizeProfile = !!preferences.prioritize_profile;

        // 面接AIへの文脈として、プロフィール情報を丸ごと渡す
        const screeningData: Record<string, unknown> = careerProfile
          ? {
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
            }
          : {};

        // 「プロフィール優先」がOFFで、任意設定に入力があれば、それをscreening_dataに
        // 明示的に上乗せする(interview-turn.tsのプロンプトで優先的に扱われる)
        if (!prioritizeProfile) {
          if (dbMode === "individual") {
            if (preferences.desired_job_type)
              screeningData.practice_desired_job_type = preferences.desired_job_type;
            if (preferences.desired_company_name)
              screeningData.practice_desired_company_name = preferences.desired_company_name;
          } else {
            if (preferences.desired_school)
              screeningData.practice_desired_school = preferences.desired_school;
            if (preferences.desired_faculty)
              screeningData.practice_desired_faculty = preferences.desired_faculty;
          }
        }
        // 聞いてほしい質問は「プロフィール優先」の設定に関わらず常に反映する
        if (preferences.custom_questions?.trim()) {
          screeningData.practice_custom_questions = preferences.custom_questions.trim();
        }

        const jobType =
          !prioritizeProfile && dbMode === "individual" && preferences.desired_job_type
            ? preferences.desired_job_type
            : !prioritizeProfile && dbMode === "student" && preferences.desired_school
              ? preferences.desired_school
              : dbMode === "student"
                ? ((careerProfile?.desired_schools as any[])?.[0]?.school_name ?? "受験")
                : ((careerProfile?.desired_conditions as any)?.job_type ?? "模擬面接");

        // 書類アップロードはプロプラン限定機能(サーバー側でも念のため制限する)
        const uploadedResumeText =
          isPro && body?.uploadedResumeText ? body.uploadedResumeText.slice(0, 8000) : null;

        // 面接情報パネル表示用。company_name列を「個人=希望会社名」「受験生=希望学部・学科」として使う
        const companyNameForDisplay = !prioritizeProfile
          ? dbMode === "individual"
            ? preferences.desired_company_name || null
            : preferences.desired_faculty || null
          : null;

        const { data: created, error } = await supabase
          .from("interview_invitations")
          .insert({
            user_id: userId,
            candidate_name: candidateName,
            job_type: jobType,
            company_name: companyNameForDisplay,
            screening_data: screeningData,
            practice_mode: dbMode,
            avatar_style: avatarStyle,
            practice_max_minutes: maxMinutes,
            practice_depth: depth,
            practice_interview_type: interviewType,
            uploaded_resume_text: uploadedResumeText,
            status: "pending",
          })
          .select("token")
          .single();

        if (error || !created) {
          console.error("[create-practice-session] failed", error);
          return json({ error: "failed_to_create" }, 500);
        }

        return json({ token: created.token });
      },
    },
  },
});
