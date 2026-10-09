import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  EditableEntrySheetTemplate,
  EditableGenericFieldsTemplate,
  EditableProseTemplate,
  EditableFullResumeTemplate,
  EditableWorkHistoryTemplate,
} from "@/components/DocumentTemplates";

export const Route = createFileRoute("/chat-interview/$token")({
  head: () => ({ meta: [{ title: "面接チャット｜インタビアAI" }] }),
  component: ChatInterviewPage,
});

type Message = { role: "user" | "assistant"; content: string };

const GREETING: Record<string, string> = {
  self_pr: "こんにちは。自己PR面接を始めます。まずは簡単に自己紹介をお願いします。",
  entry_sheet: "こんにちは。ES面接を始めます。まずは簡単に自己紹介をお願いします。",
  resume: "こんにちは。履歴書面接を始めます。まずは簡単に自己紹介をお願いします。",
};

function ChatInterviewPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [typeLabel, setTypeLabel] = useState("");
  const candidateInfoRef = useRef<{ candidateName?: string; jobType?: string }>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [ended, setEnded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completedDoc, setCompletedDoc] = useState<{
    id: string;
    doc_type: string;
    title: string;
    generated_content: string;
  } | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/chat-interview-info?token=${token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "取得に失敗しました");
        setTypeLabel(data.typeLabel);
        candidateInfoRef.current = { candidateName: data.candidateName, jobType: data.jobType };
        const greeting =
          GREETING[data.interviewType] ?? "こんにちは。まずは簡単に自己紹介をお願いします。";
        setMessages([{ role: "assistant", content: greeting }]);
        startTimeRef.current = Date.now();
      } catch (e: any) {
        setErrorMsg(e?.message || "面接情報の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || sending || ended) return;
    const newHistory = [...messages, { role: "user" as const, content: text }];
    setMessages(newHistory);
    setInputText("");
    setSending(true);
    try {
      const res = await fetch("/api/chat-interview-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          candidateText: text,
          conversationHistory: messages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "送信に失敗しました");
      setMessages((prev) => [...prev, { role: "assistant", content: data.aiText }]);
      if (data.isEnded) setEnded(true);
    } catch (e: any) {
      toast.error(e?.message || "送信に失敗しました");
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setTranscribing(true);
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const formData = new FormData();
          formData.append("audio", audioBlob, "audio.webm");
          formData.append("token", token);
          const res = await fetch("/api/whisper-transcribe", { method: "POST", body: formData });
          const data = await res.json();
          if (data.text) setInputText((prev) => (prev ? `${prev} ${data.text}` : data.text));
        } catch (e) {
          toast.error("文字起こしに失敗しました");
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (e) {
      toast.error("マイクへのアクセスが許可されませんでした");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      const res = await fetch("/api/save-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          messages,
          elapsed,
          isAbandoned: !ended,
          candidateName: candidateInfoRef.current.candidateName,
          jobType: candidateInfoRef.current.jobType,
        }),
      });
      const data = await res.json();
      if (data.generatedDocId) {
        const { data: doc } = await supabase
          .from("generated_documents")
          .select("id, doc_type, title, generated_content")
          .eq("id", data.generatedDocId)
          .maybeSingle();
        if (doc) {
          setCompletedDoc(doc as any);
          setSaving(false);
          return;
        }
      }
      toast.success("面接記録を保存しました");
      navigate({ to: "/private/individual" });
    } catch (e) {
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "#0F0F0F" }}
      >
        <p style={{ color: "#888888", fontSize: 14 }}>読み込み中...</p>
      </div>
    );
  }
  if (errorMsg) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "#0F0F0F" }}
      >
        <p style={{ color: "#FF6B6B", fontSize: 14 }}>{errorMsg}</p>
      </div>
    );
  }

  if (completedDoc) {
    return (
      <CompletionScreen doc={completedDoc} onDone={() => navigate({ to: "/private/individual" })} />
    );
  }

  return (
    // 画面の高さに固定し、会話だけをスクロールさせる（スマホでも入力欄が常に下に見える）
    <div className="flex h-[100svh] flex-col" style={{ background: "#0F0F0F" }}>
      <div
        className="shrink-0 border-b px-4 py-3 md:px-6 md:py-4"
        style={{ borderColor: "#2A2A2A" }}
      >
        <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700 }}>{typeLabel}</p>
        <p style={{ color: "#666666", fontSize: 11, marginTop: 2 }}>
          テキストチャット形式です。マイクボタンで音声入力もできます（AIの返答はテキストのみです）
        </p>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6"
        style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}
      >
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[88%] rounded-2xl px-4 py-3 md:max-w-[80%]"
                style={{
                  background: m.role === "user" ? "#C8FF00" : "#1A1A1A",
                  color: m.role === "user" ? "#0F0F0F" : "#F0F0F0",
                  border: m.role === "assistant" ? "1px solid #2A2A2A" : "none",
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div
                className="rounded-2xl px-4 py-3"
                style={{
                  background: "#1A1A1A",
                  border: "1px solid #2A2A2A",
                  color: "#888888",
                  fontSize: 13,
                }}
              >
                入力中...
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className="shrink-0 border-t px-3 pt-3 md:px-6 md:pt-4"
        style={{
          borderColor: "#2A2A2A",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {ended ? (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="w-full rounded-xl py-3 text-[14px] disabled:opacity-50"
              style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
            >
              {saving ? "保存中..." : "面接を終了して結果を見る →"}
            </button>
          ) : (
            <div className="flex items-end gap-2">
              <button
                onClick={recording ? stopRecording : startRecording}
                disabled={transcribing || sending}
                className="shrink-0 rounded-full p-3 disabled:opacity-50"
                style={{
                  background: recording ? "#FF6B6B" : "#1A1A1A",
                  border: "1px solid #2A2A2A",
                }}
                title={recording ? "録音を停止して文字起こし" : "音声入力を開始"}
              >
                {recording ? "⏹" : transcribing ? "…" : "🎤"}
              </button>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  // IME変換中(日本語入力の変換確定)のEnterは送信しない。isComposingで判定できない
                  // ブラウザ向けにkeyCode 229もあわせてチェックする
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing &&
                    e.keyCode !== 229
                  ) {
                    e.preventDefault();
                    sendMessage(inputText);
                  }
                }}
                placeholder="回答を入力（またはマイクで話す）..."
                className="flex-1 outline-none"
                style={{
                  background: "#1A1A1A",
                  border: "1px solid #2A2A2A",
                  borderRadius: 12,
                  color: "#F0F0F0",
                  padding: "10px 14px",
                  fontSize: 14,
                  minHeight: 46,
                  maxHeight: 120,
                  resize: "vertical",
                }}
              />
              <button
                onClick={() => sendMessage(inputText)}
                disabled={sending || !inputText.trim()}
                className="shrink-0 rounded-full px-5 py-3 text-[13px] disabled:opacity-40"
                style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
              >
                送信
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 面接終了後、その場で編集して保存するか削除するかを選べる完成画面 */
/** 面接終了後、その場で編集して保存するか削除するかを選べる完成画面(実際の書類レイアウトのまま編集) */
function CompletionScreen({
  doc,
  onDone,
}: {
  doc: { id: string; doc_type: string; title: string; generated_content: string };
  onDone: () => void;
}) {
  const isJson = (() => {
    try {
      JSON.parse(doc.generated_content);
      return true;
    } catch {
      return false;
    }
  })();
  const parsed = isJson ? JSON.parse(doc.generated_content) : null;
  const isCustomFields = parsed?.customFields === true;

  // AIの出力が万が一 配列/オブジェクトで返ってきても、表示・保存が壊れないように文字列へ変換する
  const toSafeString = (v: unknown): string => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) {
      return v
        .map((item) =>
          typeof item === "string"
            ? item
            : typeof item === "object" && item
              ? Object.values(item).filter(Boolean).join(" ")
              : String(item),
        )
        .filter(Boolean)
        .join("、");
    }
    if (typeof v === "object")
      return Object.values(v as object)
        .filter(Boolean)
        .join(" ");
    return String(v);
  };

  const [profile, setProfile] = useState<any>(null);
  const [basicInfo, setBasicInfo] = useState({
    name: "",
    furigana: "",
    schoolName: "",
    faculty: "",
    department: "",
    interviewNumber:
      isJson && !isCustomFields && doc.doc_type !== "resume" ? (parsed?.interviewNumber ?? "") : "",
  });
  const [proseContent, setProseContent] = useState(isJson ? "" : doc.generated_content);
  const [esValues, setEsValues] = useState<{
    motivation: string;
    strengths: string;
    qualifications: string;
    hobbies: string;
  }>(
    isJson && !isCustomFields && doc.doc_type !== "resume"
      ? {
          motivation: toSafeString(parsed.motivation),
          strengths: toSafeString(parsed.strengths),
          qualifications: toSafeString(parsed.qualifications),
          hobbies: toSafeString(parsed.hobbies),
        }
      : { motivation: "", strengths: "", qualifications: "", hobbies: "" },
  );
  const [customValues, setCustomValues] = useState<Record<string, string>>(
    isCustomFields
      ? Object.fromEntries(
          Object.entries(parsed.values ?? {}).map(([k, v]) => [k, toSafeString(v)]),
        )
      : {},
  );
  const resumeParsed = doc.doc_type === "resume" && isJson ? parsed : {};
  const [resumeBasicInfo, setResumeBasicInfo] = useState({
    name: resumeParsed.basicInfo?.name ?? "",
    furigana: resumeParsed.basicInfo?.furigana ?? "",
    birthdate: resumeParsed.basicInfo?.birthdate ?? "",
    gender: resumeParsed.basicInfo?.gender ?? "",
    postalCode: resumeParsed.basicInfo?.postalCode ?? "",
    address: resumeParsed.basicInfo?.address ?? "",
    phone: resumeParsed.basicInfo?.phone ?? "",
    email: resumeParsed.basicInfo?.email ?? "",
    contactFurigana: resumeParsed.basicInfo?.contactFurigana ?? "",
    contactPostalCode: resumeParsed.basicInfo?.contactPostalCode ?? "",
    contactAddress: resumeParsed.basicInfo?.contactAddress ?? "",
    contactPhone: resumeParsed.basicInfo?.contactPhone ?? "",
    contactEmail: resumeParsed.basicInfo?.contactEmail ?? "",
  });
  const [resumeEducation, setResumeEducation] = useState(resumeParsed.education ?? []);
  const [resumeWorkHistory, setResumeWorkHistory] = useState(resumeParsed.workHistory ?? []);
  const [resumeQualifications, setResumeQualifications] = useState(
    resumeParsed.qualifications ?? [],
  );
  const [resumeSelfPr, setResumeSelfPr] = useState(toSafeString(resumeParsed.selfPr));
  const [resumeRequestColumn, setResumeRequestColumn] = useState(resumeParsed.requestColumn ?? "");
  const workHistoryParsed = doc.doc_type === "work_history_resume" && isJson ? parsed : {};
  const [whValues, setWhValues] = useState({
    selfPr: workHistoryParsed.selfPr ?? "",
    usableExperience: workHistoryParsed.usableExperience ?? "",
    qualifications: workHistoryParsed.qualifications ?? "",
    pcSkills: workHistoryParsed.pcSkills ?? "",
    languageSkills: workHistoryParsed.languageSkills ?? "",
  });
  const [whCareerBlocks, setWhCareerBlocks] = useState(workHistoryParsed.careerBlocks ?? []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { data: prof } = await supabase
        .from("user_career_profiles")
        .select("basic_info, education_history, work_history, certifications")
        .eq("user_id", data.user.id)
        .eq("mode", "individual")
        .maybeSingle();
      setProfile(prof);
      const bi = (prof?.basic_info ?? {}) as Record<string, any>;
      setBasicInfo({
        name: bi.name ?? "",
        furigana: bi.furigana ?? "",
        schoolName: bi.school_name ?? "",
        faculty: bi.faculty ?? "",
        department: bi.department ?? "",
        interviewNumber: basicInfo.interviewNumber,
      });
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const newContent =
        doc.doc_type === "resume"
          ? JSON.stringify({
              basicInfo: resumeBasicInfo,
              education: resumeEducation,
              workHistory: resumeWorkHistory,
              qualifications: resumeQualifications,
              selfPr: resumeSelfPr,
              requestColumn: resumeRequestColumn,
            })
          : doc.doc_type === "work_history_resume"
            ? JSON.stringify({ ...workHistoryParsed, careerBlocks: whCareerBlocks, ...whValues })
            : isJson
              ? isCustomFields
                ? JSON.stringify({
                    customFields: true,
                    values: customValues,
                    fields: parsed.fields,
                  })
                : JSON.stringify({ ...esValues, interviewNumber: basicInfo.interviewNumber })
              : proseContent;
      const { error } = await supabase
        .from("generated_documents")
        .update({ generated_content: newContent })
        .eq("id", doc.id);
      if (error) throw error;

      // 履歴書面接の場合、その場で編集した氏名・ふりがな等の基本情報もプロフィールに反映する
      if (doc.doc_type === "resume") {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          await supabase.from("user_career_profiles").upsert(
            {
              user_id: userData.user.id,
              mode: "individual",
              education_history: resumeEducation.map((r: any) => ({
                school_name: r.content,
                degree: "",
                status: `${r.year}年${r.month}月`,
              })),
              work_history: resumeWorkHistory.map((r: any) => ({
                company_name: r.content,
                position: "",
                period: `${r.year}年${r.month}月`,
              })),
              certifications: resumeQualifications.map((r: any) => ({
                name: r.content,
                acquired_on: `${r.year}年${r.month}月`,
              })),
              basic_info: {
                name: resumeBasicInfo.name,
                furigana: resumeBasicInfo.furigana,
                birthdate: resumeBasicInfo.birthdate,
                gender: resumeBasicInfo.gender,
                postal_code: resumeBasicInfo.postalCode,
                address: resumeBasicInfo.address,
                phone: resumeBasicInfo.phone,
                email: resumeBasicInfo.email,
              },
            },
            { onConflict: "user_id,mode" },
          );
        }
      }

      // ES面接の場合、その場で編集した氏名・ふりがな・学校名等もプロフィールに反映する
      if (!isCustomFields && isJson && doc.doc_type === "entry_sheet") {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          await supabase.from("user_career_profiles").upsert(
            {
              user_id: userData.user.id,
              mode: "individual",
              basic_info: {
                ...(profile?.basic_info ?? {}),
                name: basicInfo.name,
                furigana: basicInfo.furigana,
                school_name: basicInfo.schoolName,
                faculty: basicInfo.faculty,
                department: basicInfo.department,
              },
            },
            { onConflict: "user_id,mode" },
          );
        }
      }

      toast.success("保存しました");
      onDone();
    } catch (e) {
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("この書類を削除します。よろしいですか？")) return;
    setDeleting(true);
    try {
      await supabase.from("generated_documents").delete().eq("id", doc.id);
      toast.success("削除しました");
      onDone();
    } catch (e) {
      toast.error("削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  const [refineMode, setRefineMode] = useState(false);
  const [refineMessages, setRefineMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [refineInput, setRefineInput] = useState("");
  const [refining, setRefining] = useState(false);

  const getRefinableContent = (): any => {
    if (doc.doc_type === "resume") {
      return {
        education: resumeEducation,
        workHistory: resumeWorkHistory,
        qualifications: resumeQualifications,
        selfPr: resumeSelfPr,
        requestColumn: resumeRequestColumn,
      };
    }
    if (doc.doc_type === "work_history_resume") {
      return { careerBlocks: whCareerBlocks, ...whValues };
    }
    if (isCustomFields) {
      return { values: customValues };
    }
    if (isJson) {
      return esValues;
    }
    return { text: proseContent };
  };

  const applyRefinedContent = (updated: any) => {
    if (doc.doc_type === "resume") {
      if (updated.education) setResumeEducation(updated.education);
      if (updated.workHistory) setResumeWorkHistory(updated.workHistory);
      if (updated.qualifications) setResumeQualifications(updated.qualifications);
      if (typeof updated.selfPr === "string") setResumeSelfPr(updated.selfPr);
      if (typeof updated.requestColumn === "string") setResumeRequestColumn(updated.requestColumn);
      return;
    }
    if (doc.doc_type === "work_history_resume") {
      if (updated.careerBlocks) setWhCareerBlocks(updated.careerBlocks);
      setWhValues((prev) => ({ ...prev, ...updated }));
      return;
    }
    if (isCustomFields) {
      if (updated.values)
        setCustomValues((prev) => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(updated.values).map(([k, v]) => [k, toSafeString(v)]),
          ),
        }));
      return;
    }
    if (isJson) {
      setEsValues((prev) => ({
        motivation: toSafeString(updated.motivation ?? prev.motivation),
        strengths: toSafeString(updated.strengths ?? prev.strengths),
        qualifications: toSafeString(updated.qualifications ?? prev.qualifications),
        hobbies: toSafeString(updated.hobbies ?? prev.hobbies),
      }));
      return;
    }
    if (typeof updated.text === "string") setProseContent(updated.text);
  };

  const handleRefineSend = async () => {
    if (!refineInput.trim() || refining) return;
    const instruction = refineInput.trim();
    setRefineMessages((prev) => [...prev, { role: "user", content: instruction }]);
    setRefineInput("");
    setRefining(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch("/api/refine-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({
          docType: doc.doc_type,
          currentContent: getRefinableContent(),
          instruction,
          chatHistory: refineMessages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "添削に失敗しました");
      applyRefinedContent(data.updatedContent);
      setRefineMessages((prev) => [...prev, { role: "assistant", content: data.replyMessage }]);
    } catch (e: any) {
      toast.error(e?.message || "添削に失敗しました");
    } finally {
      setRefining(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-6 md:px-6 md:py-10" style={{ background: "#0F0F0F" }}>
      <div style={{ maxWidth: refineMode ? 1200 : 850, margin: "0 auto" }}>
        <div className="flex items-center justify-between">
          <div>
            <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700 }}>面接お疲れさまでした</p>
            <p style={{ color: "#888888", fontSize: 12, marginTop: 6, marginBottom: 20 }}>
              実際の書類の見た目のまま、その場で編集できます。よければ「保存する」、不要なら「削除する」を選んでください。
            </p>
          </div>
          <button
            onClick={() => setRefineMode((v) => !v)}
            className="shrink-0 rounded-full px-4 py-2 text-[12px]"
            style={{
              background: refineMode ? "#C8FF00" : "#1A1A1A",
              color: refineMode ? "#0F0F0F" : "#F0F0F0",
              border: "1px solid #2A2A2A",
              fontWeight: 700,
            }}
          >
            💬 {refineMode ? "AI添削を終了" : "AIに相談して直す"}
          </button>
        </div>

        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          {refineMode && (
            <div
              className="flex h-[70svh] w-full shrink-0 flex-col rounded-2xl md:h-[600px] md:w-[340px]"
              style={{
                background: "#1A1A1A",
                border: "1px solid #2A2A2A",
              }}
            >
              <div className="border-b px-4 py-3" style={{ borderColor: "#2A2A2A" }}>
                <p style={{ color: "#C8FF00", fontSize: 12, fontWeight: 700 }}>AI添削チャット</p>
                <p style={{ color: "#666666", fontSize: 10, marginTop: 2 }}>
                  「もっと具体的にして」など、直したい内容を話しかけてください
                </p>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
                {refineMessages.length === 0 && (
                  <p style={{ color: "#555555", fontSize: 11 }}>
                    例：「自己PRをもっと数字を使って具体的にして」「趣味の欄を削除して」
                  </p>
                )}
                {refineMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className="max-w-[90%] rounded-xl px-3 py-2"
                      style={{
                        background: m.role === "user" ? "#C8FF00" : "#0F0F0F",
                        color: m.role === "user" ? "#0F0F0F" : "#F0F0F0",
                        fontSize: 12,
                        lineHeight: 1.6,
                      }}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {refining && (
                  <p style={{ color: "#888888", fontSize: 11 }}>右側の書類を直しています...</p>
                )}
              </div>
              <div className="border-t p-3" style={{ borderColor: "#2A2A2A" }}>
                <div className="flex gap-2">
                  <textarea
                    value={refineInput}
                    onChange={(e) => setRefineInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing &&
                        e.keyCode !== 229
                      ) {
                        e.preventDefault();
                        handleRefineSend();
                      }
                    }}
                    placeholder="直したい内容を入力..."
                    className="flex-1 outline-none"
                    style={{
                      background: "#0F0F0F",
                      border: "1px solid #2A2A2A",
                      borderRadius: 8,
                      color: "#F0F0F0",
                      padding: "8px 10px",
                      fontSize: 12,
                      minHeight: 40,
                      maxHeight: 90,
                      resize: "vertical",
                    }}
                  />
                  <button
                    onClick={handleRefineSend}
                    disabled={refining || !refineInput.trim()}
                    className="shrink-0 rounded-lg px-3 text-[12px] disabled:opacity-40"
                    style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
                  >
                    送信
                  </button>
                </div>
              </div>
            </div>
          )}

          <div
            className="flex-1"
            style={{ overflowX: "auto", boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}
          >
            {doc.doc_type === "resume" ? (
              <EditableFullResumeTemplate
                basicInfo={resumeBasicInfo}
                onBasicInfoChange={(key, value) =>
                  setResumeBasicInfo((prev) => ({ ...prev, [key]: value }))
                }
                education={resumeEducation}
                onEducationChange={setResumeEducation}
                workHistory={resumeWorkHistory}
                onWorkHistoryChange={setResumeWorkHistory}
                qualifications={resumeQualifications}
                onQualificationsChange={setResumeQualifications}
                selfPr={resumeSelfPr}
                onSelfPrChange={setResumeSelfPr}
                requestColumn={resumeRequestColumn}
                onRequestColumnChange={setResumeRequestColumn}
              />
            ) : doc.doc_type === "work_history_resume" ? (
              <EditableWorkHistoryTemplate
                name={profile?.basic_info?.name ?? ""}
                careerBlocks={whCareerBlocks}
                onCareerBlocksChange={setWhCareerBlocks}
                values={whValues}
                onChange={(key, value) => setWhValues((prev) => ({ ...prev, [key]: value }))}
              />
            ) : isCustomFields ? (
              <EditableGenericFieldsTemplate
                title={doc.title}
                fields={(parsed.fields ?? []).map((f: any) => ({ key: f.key, label: f.label }))}
                values={customValues}
                onChange={(key, value) => setCustomValues((prev) => ({ ...prev, [key]: value }))}
              />
            ) : isJson ? (
              <EditableEntrySheetTemplate
                data={basicInfo}
                onDataChange={(key, value) => setBasicInfo((prev) => ({ ...prev, [key]: value }))}
                values={esValues}
                onChange={(key, value) => setEsValues((prev) => ({ ...prev, [key]: value }))}
              />
            ) : (
              <EditableProseTemplate
                title={doc.title}
                content={proseContent}
                onChange={setProseContent}
              />
            )}
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleDelete}
            disabled={deleting || saving}
            className="flex-1 rounded-xl py-3 text-[14px] disabled:opacity-50"
            style={{
              background: "#1A1010",
              border: "1px solid #FF4444",
              color: "#FF6666",
              fontWeight: 700,
            }}
          >
            {deleting ? "削除中..." : "削除する"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="flex-1 rounded-xl py-3 text-[14px] disabled:opacity-50"
            style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
          >
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>
        <p className="mt-4 text-center" style={{ color: "#555555", fontSize: 11 }}>
          「保存する」を押すとマイ書類（履歴）に残り、後からダウンロードもできます。
        </p>
      </div>
    </div>
  );
}
