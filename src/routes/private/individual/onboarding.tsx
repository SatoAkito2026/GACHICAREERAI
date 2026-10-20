import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { SafeNavigate } from "@/components/SafeNavigate";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useMode } from "@/hooks/use-mode";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_OPTIONS, INDUSTRY_OPTIONS } from "@/lib/career-options";
import { extractPdfText } from "@/lib/pdf-text";

const RESUME_FIELD_LABEL = "職務経歴書（アップロード）";

export const Route = createFileRoute("/private/individual/onboarding")({
  head: () => ({ meta: [{ title: "プロフィール登録｜ガチキャリAI" }] }),
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
  // 職務経歴書・履歴書（任意）。PDFから文字だけ取り出してプロフィールに保存し、面接AIが質問に使う
  const [resumeName, setResumeName] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [extracting, setExtracting] = useState(false);
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
  if (!session) return <SafeNavigate to="/login" />;

  const handleResume = async (file: File | null) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("PDFファイルを選んでください");
      return;
    }
    setExtracting(true);
    try {
      const text = (await extractPdfText(file)).replace(/\s+\n/g, "\n").trim();
      if (!text) {
        toast.error("PDFから文字を読み取れませんでした（画像だけのPDFは読み取れません）");
        return;
      }
      setResumeText(text.slice(0, 8000));
      setResumeName(file.name);
    } catch (err) {
      console.error(err);
      toast.error("PDFの読み込みに失敗しました");
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("お名前を入力してください");
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
        resume_uploaded: !!resumeText,
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
          desired_conditions: { job_type: desiredTarget },
          ...(resumeText
            ? { custom_fields: [{ label: RESUME_FIELD_LABEL, value: resumeText }] }
            : {}),
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
          1分で終わります。後からいつでも編集できます。
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

          <div className="mb-5">
            <span style={LABEL_STYLE}>職務経歴書・履歴書（任意）</span>
            <p className="mt-1 text-[12px]" style={{ color: "#888888", lineHeight: 1.6 }}>
              PDFをアップロードすると、AI面接官がその内容をもとに質問します。あとからでも登録できます。
            </p>
            <label
              className="mt-2 flex cursor-pointer items-center justify-center rounded-lg py-3 text-[14px]"
              style={{ border: "1px dashed #3A3A3A", color: resumeText ? "#C8FF00" : "#CCCCCC" }}
            >
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => void handleResume(e.target.files?.[0] ?? null)}
              />
              {extracting
                ? "読み込み中..."
                : resumeText
                  ? `✓ ${resumeName}（読み込みました・変更する）`
                  : "📄 PDFを選ぶ"}
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting || extracting}
            className="mt-4 w-full rounded-full py-3 text-[15px] transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
          >
            {submitting ? "保存中..." : extracting ? "PDFを読み込み中..." : "はじめる"}
          </button>
        </form>
      </div>
    </div>
  );
}
