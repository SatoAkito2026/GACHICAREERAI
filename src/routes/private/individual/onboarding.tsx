import { createFileRoute, Navigate, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useMode } from "@/hooks/use-mode";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_OPTIONS, INDUSTRY_OPTIONS } from "@/lib/career-options";

export const Route = createFileRoute("/private/individual/onboarding")({
  head: () => ({ meta: [{ title: "プロフィール登録｜インタビアAI" }] }),
  component: IndividualOnboardingPage,
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

function IndividualOnboardingPage() {
  const { session, loading } = useAuth();
  const { loading: modeLoading, setMode } = useMode();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [furigana, setFurigana] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");
  const [desiredTarget, setDesiredTarget] = useState("");
  const [motivation, setMotivation] = useState("");
  const [strength, setStrength] = useState("");
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
    if (!name.trim() || !motivation.trim()) {
      toast.error("お名前と、転職理由・志望動機は入力してください");
      return;
    }
    setSubmitting(true);
    try {
      const userId = session.user.id;
      const answers = {
        name,
        furigana,
        current_status: currentStatus,
        desired_target: desiredTarget,
        motivation,
        strength,
        self_pr: selfPr,
      };

      await setMode("private_individual");

      const { error: onboardingError } = await (supabase.from("onboarding_answers").upsert(
        {
          user_id: userId,
          mode: "individual",
          answers,
          completed_at: new Date().toISOString(),
        } as any,
        { onConflict: "user_id,mode" },
      ) as any);
      if (onboardingError) throw onboardingError;

      const { error: profileError } = await (supabase.from("user_career_profiles").upsert(
        {
          user_id: userId,
          mode: "individual",
          basic_info: { name, furigana, current_status: currentStatus },
          self_pr: selfPr,
          skills: strength ? [strength] : [],
          desired_conditions: { job_type: desiredTarget },
        } as any,
        { onConflict: "user_id,mode" },
      ) as any);
      if (profileError) throw profileError;

      toast.success("プロフィールを作成しました！");
      navigate({ to: "/private/individual" });
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
          面接練習・自己分析の精度を上げるための質問です。後からいつでも編集できます。
        </p>

        <div className="mt-6 flex gap-3">
          <div
            className="flex-1 rounded-lg py-2.5 text-center text-[14px]"
            style={{
              background: "#C8FF00",
              color: "#0F0F0F",
              border: "1px solid #2A2A2A",
              fontWeight: 700,
            }}
          >
            👤 個人（就活・転職）
          </div>
          <Link
            to="/private/student/onboarding"
            className="flex-1 rounded-lg py-2.5 text-center text-[14px] transition-colors"
            style={{
              background: "#1A1A1A",
              color: "#CCCCCC",
              border: "1px solid #2A2A2A",
              fontWeight: 700,
            }}
          >
            🎓 受験生（入試対策）
          </Link>
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

          <Field label="現在の状況">
            <select
              style={INPUT_STYLE}
              value={currentStatus}
              onChange={(e) => setCurrentStatus(e.target.value)}
            >
              <option value="">選択してください</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>

          <Field label="希望する職種・業界">
            <select
              style={INPUT_STYLE}
              value={desiredTarget}
              onChange={(e) => setDesiredTarget(e.target.value)}
            >
              <option value="">選択してください</option>
              {INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>

          <Field label="転職理由・志望動機（ひとこと）">
            <textarea
              style={{ ...INPUT_STYLE, minHeight: 80, resize: "vertical" }}
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              placeholder="今思っていることを、率直に書いてください"
            />
          </Field>

          <Field label="自分の強み">
            <input
              style={INPUT_STYLE}
              value={strength}
              onChange={(e) => setStrength(e.target.value)}
              placeholder="例：粘り強さ、傾聴力"
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
