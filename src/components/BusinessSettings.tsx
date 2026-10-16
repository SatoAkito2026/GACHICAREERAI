import { useEffect, useState } from "react";
import { Lock, Save } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import CompanyInfoSection from "@/components/CompanyInfoSection";
import { useMode } from "@/hooks/use-mode";
import { usePlan } from "@/hooks/use-plan";
import { supabase } from "@/integrations/supabase/client";

const INTERVIEW_STYLES = [
  { key: "strict", label: "厳格", desc: "論理的・深掘り重視" },
  { key: "friendly", label: "フレンドリー", desc: "親しみやすい雰囲気" },
  { key: "neutral", label: "中立", desc: "バランス型（デフォルト）" },
  { key: "professional", label: "プロフェッショナル", desc: "ビジネスライク" },
] as const;

const LANGUAGES = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "英語" },
  { value: "bilingual", label: "バイリンガル" },
] as const;

function AvatarConfigSection() {
  const { company, refresh } = useMode();
  const { limits } = usePlan();
  const isPro = limits.customAvatar;

  const [avatarName, setAvatarName] = useState("");
  const [interviewStyle, setInterviewStyle] = useState("neutral");
  const [language, setLanguage] = useState("ja");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const cfg = (company?.avatar_config ?? {}) as Record<string, unknown>;
    setAvatarName(typeof cfg.avatar_name === "string" ? cfg.avatar_name : "");
    setInterviewStyle(typeof cfg.interview_style === "string" ? cfg.interview_style : "neutral");
    setLanguage(typeof cfg.language === "string" ? cfg.language : "ja");
  }, [company]);

  const handleSave = async () => {
    if (!company) return;
    setSaving(true);
    const { error } = await supabase
      .from("companies")
      .update({
        avatar_config: { avatar_name: avatarName, interview_style: interviewStyle, language },
      })
      .eq("id", company.id);
    setSaving(false);
    if (error) {
      toast.error("保存に失敗しました");
      return;
    }
    toast.success("AIアバター設定を保存しました");
    await refresh();
  };

  const label = { color: "#F0F0F0", fontSize: 14, fontWeight: 500 } as const;
  const inputStyle = {
    background: "#121212",
    border: "1px solid #333333",
    color: "#F0F0F0",
  } as const;

  return (
    <section
      className="rounded-2xl p-6"
      style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
    >
      <h2 className="text-[18px]" style={{ fontWeight: 600, color: "#F0F0F0" }}>
        AIアバター設定
      </h2>
      <p className="mt-1 text-[13px]" style={{ color: "#888888" }}>
        面接を担当するAIアバターの設定
      </p>

      <div className="mt-5">
        <label style={label}>アバターの名前</label>
        <input
          type="text"
          value={avatarName}
          onChange={(e) => setAvatarName(e.target.value)}
          placeholder="例：田中AI"
          className="mt-1 flex h-10 w-full rounded-md px-3 text-sm focus:outline-none"
          style={inputStyle}
        />
      </div>

      <div className="mt-5">
        <label style={label}>面接スタイル</label>
        <div className="mt-2 flex flex-col gap-2">
          {INTERVIEW_STYLES.map((s) => (
            <label
              key={s.key}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2"
              style={{
                border: `1px solid ${interviewStyle === s.key ? "#C8FF00" : "#333333"}`,
                background: interviewStyle === s.key ? "rgba(200,255,0,0.06)" : "transparent",
              }}
            >
              <input
                type="radio"
                name="interview_style"
                checked={interviewStyle === s.key}
                onChange={() => setInterviewStyle(s.key)}
                style={{ accentColor: "#C8FF00" }}
              />
              <span>
                <span className="text-[14px]" style={{ color: "#F0F0F0", fontWeight: 500 }}>
                  {s.label}
                </span>
                <span className="ml-2 text-[12px]" style={{ color: "#888888" }}>
                  {s.desc}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <label style={label}>面接言語</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="mt-1 flex h-10 w-full rounded-md px-3 text-sm focus:outline-none"
          style={inputStyle}
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value} style={{ background: "#1A1A1A" }}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !company}
        className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md text-sm font-semibold disabled:opacity-50"
        style={{ background: "#C8FF00", color: "#0F0F0F" }}
      >
        <Save size={16} />
        {saving ? "保存中..." : "保存する"}
      </button>

      <div
        className="mt-6 rounded-xl p-4"
        style={{ border: "1px dashed #333333", background: "#121212" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[14px]" style={{ color: "#F0F0F0", fontWeight: 600 }}>
            独自アバター
          </span>
          {!isPro && (
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]"
              style={{ background: "#2A2A2A", color: "#888888" }}
            >
              <Lock size={11} /> プロプランで利用可能
            </span>
          )}
        </div>
        <p className="mt-2 text-[12px]" style={{ color: "#888888" }}>
          専用のAIアバターを作成します（別途初期費用が必要です）
        </p>
        <a
          href="mailto:info@akitogroup.jp"
          className="mt-3 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium"
          style={
            isPro
              ? { background: "#C8FF00", color: "#0F0F0F", pointerEvents: "auto" }
              : { background: "#2A2A2A", color: "#666666", pointerEvents: "none" }
          }
        >
          お問い合わせ
        </a>
      </div>
    </section>
  );
}

export default function BusinessSettings({ title }: { title: string }) {
  const { plan } = usePlan();
  const allowedPlans = ["company_light", "company_pro"];

  if (!allowedPlans.includes(plan)) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
          gap: 16,
          fontFamily: "'Inter',sans-serif",
        }}
      >
        <div style={{ fontSize: 40 }}>🔒</div>
        <p style={{ fontSize: 18, fontWeight: 600, color: "#F0F0F0" }}>
          企業設定はライトプラン以上でご利用いただけます
        </p>
        <p style={{ fontSize: 14, color: "#888" }}>
          プランをアップグレードして企業情報を設定しましょう
        </p>
        <Link
          to="/pricing"
          style={{
            background: "#C8FF00",
            color: "#0F0F0F",
            borderRadius: 9,
            padding: "12px 24px",
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          プランをアップグレード →
        </Link>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 pb-20 pt-8">
      <h1 className="mb-6 text-[24px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
        {title}
      </h1>
      <div className="md:grid md:grid-cols-2 md:gap-6">
        <div>
          <CompanyInfoSection />
        </div>
        <div className="mt-6 md:mt-0">
          <AvatarConfigSection />
        </div>
      </div>
    </main>
  );
}
