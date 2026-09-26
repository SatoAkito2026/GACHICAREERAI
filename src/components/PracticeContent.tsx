import { Navigate, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { usePlan } from "@/hooks/use-plan";
import { supabase } from "@/integrations/supabase/client";
import { PrivateShell } from "@/components/ModeShell";
import { INDUSTRY_OPTIONS } from "@/lib/career-options";

const STYLE_OPTIONS: { value: "friendly" | "neutral" | "strict"; label: string; desc: string }[] = [
  { value: "friendly", label: "フレンドリー", desc: "リラックスして話せる雰囲気" },
  { value: "neutral", label: "標準", desc: "バランスの取れた面接官" },
  { value: "strict", label: "厳しめ", desc: "本番同様の緊張感で練習したい人向け" },
];

type Preferences = {
  desired_job_type: string;
  desired_company_name: string;
  desired_school: string;
  desired_faculty: string;
  custom_questions: string;
  prioritize_profile: boolean;
};

const EMPTY_PREFS: Preferences = {
  desired_job_type: "",
  desired_company_name: "",
  desired_school: "",
  desired_faculty: "",
  custom_questions: "",
  prioritize_profile: false,
};

/** company screening.tsx / DocumentsContent.tsx と同じ方式でpdf.jsを読み込む */
async function loadPdfJs(): Promise<any> {
  const w = window as any;
  if (w["pdfjs-dist/build/pdf"]) return w["pdfjs-dist/build/pdf"];
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("pdf.js load failed"));
    document.head.appendChild(s);
  });
  const lib = w["pdfjs-dist/build/pdf"];
  lib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return lib;
}

async function extractPdfText(file: File): Promise<string> {
  const lib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({
    data: buf,
    cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/",
    cMapPacked: true,
  }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str).join(" ") + "\n";
  }
  return text;
}

export function PracticeContent({
  mode,
  backTo,
}: {
  mode: "individual" | "student";
  backTo: string;
}) {
  const { session, loading } = useAuth();
  const { plan } = usePlan();
  const navigate = useNavigate();
  const isPro = plan === "individual_pro" || plan === "company_pro";

  const [avatarStyle, setAvatarStyle] = useState<"friendly" | "neutral" | "strict">("neutral");
  const interviewType = "general" as const;
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [resumeFileName, setResumeFileName] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data } = await (supabase
        .from("user_career_profiles")
        .select("practice_preferences")
        .eq("user_id", session.user.id)
        .eq("mode", mode)
        .maybeSingle() as any);
      if (data?.practice_preferences) {
        setPrefs({ ...EMPTY_PREFS, ...data.practice_preferences });
      }
      setPrefsLoaded(true);
    })();
  }, [session, mode]);

  if (loading || !prefsLoaded) {
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

  const handleSavePrefs = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase
        .from("user_career_profiles")
        .upsert({ user_id: session.user.id, mode, practice_preferences: prefs } as any, {
          onConflict: "user_id,mode",
        }) as any);
      if (error) throw error;
      toast.success("設定を保存しました");
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("PDFファイルを選んでください");
      return;
    }
    setExtracting(true);
    try {
      const text = await extractPdfText(file);
      if (!text.trim()) {
        toast.error("PDFから文字を読み取れませんでした");
        return;
      }
      setResumeText(text);
      setResumeFileName(file.name);
      toast.success("書類を読み込みました");
    } catch (e) {
      console.error(e);
      toast.error("PDFの読み込みに失敗しました");
    } finally {
      setExtracting(false);
    }
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      const res = await fetch(`/api/create-practice-session?_t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
        body: JSON.stringify({
          avatarStyle,
          interviewType,
          preferences: prefs,
          uploadedResumeText: isPro ? resumeText : "",
        }),
      });
      if (res.status === 429) {
        const errBody = (await res.json().catch(() => null)) as { message?: string } | null;
        toast.error(errBody?.message ?? "利用上限に達しました");
        setStarting(false);
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { token: string };
      navigate({ to: "/interview/$token", params: { token: data.token } });
    } catch (e) {
      console.error(e);
      toast.error("練習セッションの開始に失敗しました。もう一度お試しください");
      setStarting(false);
    }
  };

  const cardStyle = {
    background: "#1A1A1A",
    border: "1px solid #2A2A2A",
    borderRadius: 16,
  } as const;
  const inputStyle = {
    background: "#0F0F0F",
    border: "1px solid #2A2A2A",
    borderRadius: 8,
    color: "#F0F0F0",
    padding: "9px 12px",
    width: "100%",
    fontSize: 13,
  } as const;

  return (
    <PrivateShell>
      <div className="mx-auto max-w-lg px-6 py-10">
        <Link to={backTo} style={{ color: "#888888", fontSize: 13 }}>
          ← 戻る
        </Link>
        <h1 className="mt-4 text-[22px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
          {mode === "student" ? "入試面接練習" : "模擬面接AI"}
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "#999999" }}>
          AIアバターが面接官役を務めます。プロフィール情報を踏まえて質問してくれます。
        </p>

        <div className="mt-4 rounded-2xl p-5" style={cardStyle}>
          <p style={{ color: "#AAAAAA", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            面接官のスタイル
          </p>
          <div className="flex flex-col gap-2">
            {STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAvatarStyle(opt.value)}
                className="rounded-xl px-4 py-3 text-left transition-colors"
                style={{
                  background: avatarStyle === opt.value ? "#C8FF00" : "#0F0F0F",
                  border: "1px solid #2A2A2A",
                }}
              >
                <p
                  style={{
                    color: avatarStyle === opt.value ? "#0F0F0F" : "#F0F0F0",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {opt.label}
                </p>
                <p
                  style={{
                    color: avatarStyle === opt.value ? "#3A3A00" : "#888888",
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {opt.desc}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-2xl p-5" style={cardStyle}>
          <p style={{ color: "#AAAAAA", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            任意設定（保存して再利用できます）
          </p>

          <label className="mt-3 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={prefs.prioritize_profile}
              onChange={(e) => setPrefs((p) => ({ ...p, prioritize_profile: e.target.checked }))}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span style={{ color: "#F0F0F0", fontSize: 13 }}>
              プロフィールの内容を優先的に反映する
              <span style={{ display: "block", color: "#888888", fontSize: 11, marginTop: 2 }}>
                オンにすると、下の希望条件よりプロフィールの登録内容を優先します（毎回入力するのが面倒な場合に）
              </span>
            </span>
          </label>

          {mode === "individual" ? (
            <>
              <div className="mt-4">
                <label style={{ color: "#AAAAAA", fontSize: 12 }}>希望職種</label>
                <select
                  style={{ ...inputStyle, marginTop: 4 }}
                  value={prefs.desired_job_type}
                  onChange={(e) => setPrefs((p) => ({ ...p, desired_job_type: e.target.value }))}
                >
                  <option value="">選択しない</option>
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3">
                <label style={{ color: "#AAAAAA", fontSize: 12 }}>希望会社名（任意）</label>
                <input
                  style={{ ...inputStyle, marginTop: 4 }}
                  value={prefs.desired_company_name}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, desired_company_name: e.target.value }))
                  }
                  placeholder="例：株式会社〇〇"
                />
              </div>
            </>
          ) : (
            <>
              <div className="mt-4">
                <label style={{ color: "#AAAAAA", fontSize: 12 }}>希望学校</label>
                <input
                  style={{ ...inputStyle, marginTop: 4 }}
                  value={prefs.desired_school}
                  onChange={(e) => setPrefs((p) => ({ ...p, desired_school: e.target.value }))}
                  placeholder="例：〇〇大学"
                />
              </div>
              <div className="mt-3">
                <label style={{ color: "#AAAAAA", fontSize: 12 }}>希望学部・学科（任意）</label>
                <input
                  style={{ ...inputStyle, marginTop: 4 }}
                  value={prefs.desired_faculty}
                  onChange={(e) => setPrefs((p) => ({ ...p, desired_faculty: e.target.value }))}
                  placeholder="例：経済学部"
                />
              </div>
            </>
          )}

          <div className="mt-3">
            <label style={{ color: "#AAAAAA", fontSize: 12 }}>聞いてほしい質問（任意）</label>
            <textarea
              style={{ ...inputStyle, marginTop: 4, minHeight: 70, resize: "vertical" }}
              value={prefs.custom_questions}
              onChange={(e) => setPrefs((p) => ({ ...p, custom_questions: e.target.value }))}
              placeholder="例：転勤の可否について聞かれたい、部活動の話を深掘りしてほしい　など"
            />
          </div>

          <div className="mt-4">
            <label style={{ color: "#AAAAAA", fontSize: 12 }}>
              書類をアップロードして反映（プロ限定）
            </label>
            {!isPro ? (
              <p
                className="mt-2 rounded-lg p-3"
                style={{
                  background: "#0F0F0F",
                  border: "1px solid #2A2A2A",
                  color: "#777777",
                  fontSize: 12,
                }}
              >
                この機能はプロプラン限定です。
              </p>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="file"
                  accept="application/pdf"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={extracting}
                  className="rounded-full px-4 py-2 text-[12px] transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: "#2A2A2A", color: "#F0F0F0" }}
                >
                  {extracting ? "読み込み中..." : "📎 PDFをアップロード"}
                </button>
                {resumeFileName && (
                  <span style={{ color: "#999999", fontSize: 12 }}>{resumeFileName}</span>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleSavePrefs}
            disabled={saving}
            className="mt-4 w-full rounded-full py-2.5 text-[13px] transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "#2A2A2A", color: "#F0F0F0", fontWeight: 600 }}
          >
            {saving ? "保存中..." : "この設定を保存する"}
          </button>
        </div>

        <button
          onClick={handleStart}
          disabled={starting}
          className="mt-6 w-full rounded-full py-3 text-[15px] transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
        >
          {starting ? "準備中..." : "面接練習をはじめる"}
        </button>

        <p className="mt-4 text-[12px]" style={{ color: "#666666" }}>
          カメラ・マイクへのアクセス許可が必要です。終了後、練習履歴からフィードバックを確認できます。
        </p>
      </div>
    </PrivateShell>
  );
}
