import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type GeneratedDocOption = { id: string; title: string; created_at: string };

type DocSlotState = {
  source: "custom" | "generated" | "";
  generatedDocId: string;
  customPath: string;
  uploading: boolean;
};

const EMPTY_SLOT: DocSlotState = {
  source: "",
  generatedDocId: "",
  customPath: "",
  uploading: false,
};

function DocSlot({
  label,
  docTypeForGenerated,
  state,
  setState,
  session,
  generatedOptions,
}: {
  label: string;
  docTypeForGenerated: string;
  state: DocSlotState;
  setState: (s: DocSlotState) => void;
  session: any;
  generatedOptions: GeneratedDocOption[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("PDFファイルを選んでください");
      return;
    }
    setState({ ...state, uploading: true });
    try {
      const path = `individual/${session.user.id}/${docTypeForGenerated}-${Date.now()}.pdf`;
      const { error } = await supabase.storage.from("resumes").upload(path, file, { upsert: true });
      if (error) throw error;
      setState({ source: "custom", generatedDocId: "", customPath: path, uploading: false });
      toast.success("アップロードしました");
    } catch (err) {
      console.error(err);
      toast.error("アップロードに失敗しました");
      setState({ ...state, uploading: false });
    }
  };

  return (
    <div className="rounded-xl p-4" style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}>
      <p style={{ color: "#F0F0F0", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{label}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 rounded-lg px-3 py-2 text-[12px]"
          style={{
            background: state.source === "custom" ? "#C8FF00" : "#1A1A1A",
            color: state.source === "custom" ? "#0F0F0F" : "#CCCCCC",
            border: "1px solid #2A2A2A",
            fontWeight: 700,
          }}
        >
          {state.uploading ? "アップロード中..." : "自分でアップロード"}
        </button>
        <input
          type="file"
          accept="application/pdf"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
      <div className="mt-2">
        <p style={{ color: "#666666", fontSize: 11, marginBottom: 4 }}>
          または、インタビアAIで作成したものを使う：
        </p>
        <select
          value={state.source === "generated" ? state.generatedDocId : ""}
          onChange={(e) => {
            if (e.target.value)
              setState({
                source: "generated",
                generatedDocId: e.target.value,
                customPath: "",
                uploading: false,
              });
          }}
          style={{
            background: "#1A1A1A",
            border: "1px solid #2A2A2A",
            borderRadius: 8,
            color: "#F0F0F0",
            padding: "8px 10px",
            width: "100%",
            fontSize: 12,
          }}
        >
          <option value="">選択してください</option>
          {generatedOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}（{new Date(d.created_at).toLocaleDateString("ja-JP")}）
            </option>
          ))}
        </select>
      </div>
      {state.source && (
        <p className="mt-2" style={{ color: "#7CFFB2", fontSize: 11 }}>
          ✓ {state.source === "custom" ? "アップロードしたPDFを使用" : "AI生成した書類を使用"}
        </p>
      )}
    </div>
  );
}

export function MyDocumentsSection({ mode }: { mode: "individual" | "student" }) {
  const { session } = useAuth();
  const [resumeState, setResumeState] = useState<DocSlotState>(EMPTY_SLOT);
  const [workHistoryState, setWorkHistoryState] = useState<DocSlotState>(EMPTY_SLOT);
  const [resumeOptions, setResumeOptions] = useState<GeneratedDocOption[]>([]);
  const [workHistoryOptions, setWorkHistoryOptions] = useState<GeneratedDocOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!session || mode !== "individual") return;
    (async () => {
      const [{ data: profile }, { data: docs }] = await Promise.all([
        supabase
          .from("user_career_profiles")
          .select(
            "primary_resume_source, primary_resume_generated_doc_id, primary_resume_custom_path, primary_work_history_source, primary_work_history_generated_doc_id, primary_work_history_custom_path",
          )
          .eq("user_id", session.user.id)
          .eq("mode", "individual")
          .maybeSingle(),
        supabase
          .from("generated_documents")
          .select("id, doc_type, title, created_at")
          .eq("user_id", session.user.id)
          .eq("mode", "individual")
          .in("doc_type", ["resume", "work_history_resume"])
          .order("created_at", { ascending: false }),
      ]);

      setResumeOptions(((docs ?? []) as any[]).filter((d) => d.doc_type === "resume"));
      setWorkHistoryOptions(
        ((docs ?? []) as any[]).filter((d) => d.doc_type === "work_history_resume"),
      );

      if (profile) {
        const p = profile as any;
        if (p.primary_resume_source) {
          setResumeState({
            source: p.primary_resume_source,
            generatedDocId: p.primary_resume_generated_doc_id ?? "",
            customPath: p.primary_resume_custom_path ?? "",
            uploading: false,
          });
        }
        if (p.primary_work_history_source) {
          setWorkHistoryState({
            source: p.primary_work_history_source,
            generatedDocId: p.primary_work_history_generated_doc_id ?? "",
            customPath: p.primary_work_history_custom_path ?? "",
            uploading: false,
          });
        }
      }
      setLoaded(true);
    })();
  }, [session, mode]);

  if (mode !== "individual" || !loaded) return null;

  const handleSave = async () => {
    if (!session) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("user_career_profiles").upsert(
        {
          user_id: session.user.id,
          mode: "individual",
          primary_resume_source: resumeState.source || null,
          primary_resume_generated_doc_id:
            resumeState.source === "generated" ? resumeState.generatedDocId : null,
          primary_resume_custom_path:
            resumeState.source === "custom" ? resumeState.customPath : null,
          primary_work_history_source: workHistoryState.source || null,
          primary_work_history_generated_doc_id:
            workHistoryState.source === "generated" ? workHistoryState.generatedDocId : null,
          primary_work_history_custom_path:
            workHistoryState.source === "custom" ? workHistoryState.customPath : null,
        } as any,
        { onConflict: "user_id,mode" },
      );
      if (error) throw error;
      toast.success("マイ書類を保存しました");
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl p-5" style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}>
      <p style={{ color: "#C8FF00", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>マイ書類</p>
      <p style={{ color: "#888888", fontSize: 12, marginBottom: 14 }}>
        求人応募時に使う履歴書・職務経歴書を、あらかじめ決めておけます。自分で作った書類をアップロードするか、AIで作成したものから選べます。
      </p>
      <div className="flex flex-col gap-3">
        <DocSlot
          label="履歴書"
          docTypeForGenerated="resume"
          state={resumeState}
          setState={setResumeState}
          session={session}
          generatedOptions={resumeOptions}
        />
        <DocSlot
          label="職務経歴書"
          docTypeForGenerated="work_history_resume"
          state={workHistoryState}
          setState={setWorkHistoryState}
          session={session}
          generatedOptions={workHistoryOptions}
        />
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 w-full rounded-full py-2.5 text-[13px] transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: "#2A2A2A", color: "#F0F0F0", fontWeight: 700 }}
      >
        {saving ? "保存中..." : "マイ書類を保存する"}
      </button>
    </div>
  );
}
