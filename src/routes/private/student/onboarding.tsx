import { createFileRoute, Navigate, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useMode } from "@/hooks/use-mode";
import { supabase } from "@/integrations/supabase/client";
import { GRADE_OPTIONS, EXAM_TYPE_OPTIONS, SUBJECT_OPTIONS } from "@/lib/career-options";

export const Route = createFileRoute("/private/student/onboarding")({
  head: () => ({ meta: [{ title: "プロフィール登録｜インタビアAI" }] }),
  component: StudentOnboardingPage,
});

const INPUT_STYLE = {
  background: "#0F0F0F",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  color: "#F0F0F0",
  padding: "10px 12px",
  width: "100%",
  fontSize: 14,
} as const;
const LABEL_STYLE = { color: "#AAAAAA", fontSize: 13, fontWeight: 600 } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-5 block">
      <span style={LABEL_STYLE}>{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function StudentOnboardingPage() {
  const { session, loading } = useAuth();
  const { loading: modeLoading, setMode } = useMode();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [furigana, setFurigana] = useState("");
  const [grade, setGrade] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [desiredSchool, setDesiredSchool] = useState("");
  const [desiredFaculty, setDesiredFaculty] = useState("");
  const [examType, setExamType] = useState("");
  const [strongSubject, setStrongSubject] = useState("");
  const [weakSubject, setWeakSubject] = useState("");
  const [activities, setActivities] = useState("");
  const [motivation, setMotivation] = useState("");
  const [selfPr, setSelfPr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading || modeLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "#0F0F0F" }}
      >
        <p className="text-sm" style={{ color: "#888888" }}>
          読み込み中...
        </p>
      </div>
    );
  }
  if (!session) return <Navigate to="/login" />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !desiredSchool.trim() || !motivation.trim()) {
      toast.error("お名前・志望校・志望理由は入力してください");
      return;
    }
    setSubmitting(true);
    try {
      const userId = session.user.id;
      const answers = {
        name,
        furigana,
        grade,
        school_name: schoolName,
        desired_school: desiredSchool,
        desired_faculty: desiredFaculty,
        exam_type: examType,
        strong_subject: strongSubject,
        weak_subject: weakSubject,
        activities,
        motivation,
        self_pr: selfPr,
      };

      await setMode("private_student");

      const { error: onboardingError } = await (supabase.from("onboarding_answers").upsert(
        {
          user_id: userId,
          mode: "student",
          answers,
          completed_at: new Date().toISOString(),
        } as any,
        { onConflict: "user_id,mode" },
      ) as any);
      if (onboardingError) throw onboardingError;

      const { error: profileError } = await (supabase.from("user_career_profiles").upsert(
        {
          user_id: userId,
          mode: "student",
          basic_info: {
            name,
            furigana,
            grade,
            school_name: schoolName,
            strong_subject: strongSubject,
            weak_subject: weakSubject,
          },
          self_pr: selfPr,
          desired_schools: desiredSchool
            ? [{ school_name: desiredSchool, faculty: desiredFaculty, priority: 1 }]
            : [],
          extracurricular_activities: activities ? [{ text: activities }] : [],
        } as any,
        { onConflict: "user_id,mode" },
      ) as any);
      if (profileError) throw profileError;

      toast.success("プロフィールを作成しました！");
      navigate({ to: "/private/student" });
    } catch (err) {
      console.error(err);
      toast.error("保存に失敗しました。もう一度お試しください");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen px-6 py-10"
      style={{ background: "#0F0F0F", fontFamily: "'Inter', sans-serif" }}
    >
      <div className="mx-auto max-w-lg">
        <h1 className="text-[22px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
          プロフィールを作りましょう
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "#999999" }}>
          入試面接練習・志望理由書の精度を上げるための質問です。後からいつでも編集できます。
        </p>

        <div className="mt-6 flex gap-3">
          <Link
            to="/private/individual/onboarding"
            className="flex-1 rounded-lg py-2.5 text-center text-[14px] transition-colors"
            style={{
              background: "#1A1A1A",
              color: "#CCCCCC",
              border: "1px solid #2A2A2A",
              fontWeight: 700,
            }}
          >
            👤 個人（就活・転職）
          </Link>
          <div
            className="flex-1 rounded-lg py-2.5 text-center text-[14px]"
            style={{
              background: "#C8FF00",
              color: "#0F0F0F",
              border: "1px solid #2A2A2A",
              fontWeight: 700,
            }}
          >
            🎓 受験生（入試対策）
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-8">
          <div className="grid grid-cols-2 gap-4">
            <Field label="お名前">
              <input
                style={INPUT_STYLE}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="山田 太郎"
              />
            </Field>
            <Field label="ふりがな">
              <input
                style={INPUT_STYLE}
                value={furigana}
                onChange={(e) => setFurigana(e.target.value)}
                placeholder="やまだ たろう"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="現在の学年">
              <select style={INPUT_STYLE} value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="">選択してください</option>
                {GRADE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="現在の学校名">
              <input
                style={INPUT_STYLE}
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="○○高等学校"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="志望校（第一志望）">
              <input
                style={INPUT_STYLE}
                value={desiredSchool}
                onChange={(e) => setDesiredSchool(e.target.value)}
                placeholder="○○大学"
              />
            </Field>
            <Field label="志望学部・学科">
              <input
                style={INPUT_STYLE}
                value={desiredFaculty}
                onChange={(e) => setDesiredFaculty(e.target.value)}
                placeholder="△△学部"
              />
            </Field>
          </div>

          <Field label="受験形式">
            <select
              style={INPUT_STYLE}
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
            >
              <option value="">選択してください</option>
              {EXAM_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="得意科目">
              <select
                style={INPUT_STYLE}
                value={strongSubject}
                onChange={(e) => setStrongSubject(e.target.value)}
              >
                <option value="">選択してください</option>
                {SUBJECT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="苦手科目">
              <select
                style={INPUT_STYLE}
                value={weakSubject}
                onChange={(e) => setWeakSubject(e.target.value)}
              >
                <option value="">選択してください</option>
                {SUBJECT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="部活動・課外活動">
            <input
              style={INPUT_STYLE}
              value={activities}
              onChange={(e) => setActivities(e.target.value)}
              placeholder="例：バスケットボール部 部長"
            />
          </Field>

          <Field label="志望理由（ひとこと）">
            <textarea
              style={{ ...INPUT_STYLE, minHeight: 80, resize: "vertical" }}
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              placeholder="なぜその学校・学部を志望するのか、率直に書いてください"
            />
          </Field>

          <Field label="自己PR（ひとこと）">
            <textarea
              style={{ ...INPUT_STYLE, minHeight: 80, resize: "vertical" }}
              value={selfPr}
              onChange={(e) => setSelfPr(e.target.value)}
              placeholder="面接で伝えたいことを、思いつく範囲で"
            />
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 w-full rounded-full py-3 text-[15px] transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
          >
            {submitting ? "保存中..." : "はじめる"}
          </button>
        </form>
      </div>
    </div>
  );
}
