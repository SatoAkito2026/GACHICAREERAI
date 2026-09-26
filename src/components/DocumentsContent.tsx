import { Navigate, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { PrivateShell } from "@/components/ModeShell";
import {
  ResumeTemplate,
  FullResumeTemplate,
  WorkHistoryFullTemplate,
  EntrySheetTemplate,
  GenericFieldsTemplate,
  ProseTemplate,
  exportElementToPdf,
} from "@/components/DocumentTemplates";

type DocType =
  | "resume"
  | "work_history_resume"
  | "resume_review"
  | "work_history_review"
  | "statement_of_purpose"
  | "motivation_letter"
  | "self_pr"
  | "es_review"
  | "essay_review";

const DOC_OPTIONS_BY_MODE: Record<
  "individual" | "student",
  { value: DocType; label: string; needsReviewText: boolean }[]
> = {
  individual: [
    { value: "resume", label: "履歴書生成", needsReviewText: false },
    { value: "work_history_resume", label: "職務経歴書生成", needsReviewText: false },
    { value: "resume_review", label: "履歴書添削（プロ限定）", needsReviewText: true },
    { value: "work_history_review", label: "職務経歴書添削（プロ限定）", needsReviewText: true },
    { value: "motivation_letter", label: "志望動機書（プロ限定）", needsReviewText: false },
    { value: "self_pr", label: "自己PR（プロ限定）", needsReviewText: false },
    { value: "es_review", label: "ES改稿・完成版作成（プロ限定）", needsReviewText: true },
  ],
  student: [
    { value: "statement_of_purpose", label: "志望理由書", needsReviewText: false },
    { value: "essay_review", label: "小論文改稿・完成版作成（プロ限定）", needsReviewText: true },
  ],
};

type SavedDoc = {
  id: string;
  doc_type: string;
  title: string;
  generated_content: string;
  final_draft: string | null;
  created_at: string;
};

/** company screening.tsx と同じ方式でpdf.jsをCDNから読み込む */
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

// AIの出力が万が一 配列/オブジェクトで返ってきても、表示・保存が壊れないように文字列へ変換する
function toSafeString(v: unknown): string {
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
}

async function extractPdfText(file: File): Promise<string> {
  const lib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({
    data: buf,
    // 日本語PDF等で使われるCIDフォントを正しく読み取るためにCMapを指定する。
    // cdnjsにはcmapsフォルダ自体が無い(403になる)ため、jsdelivr経由で取得する。
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

export function DocumentsContent({
  mode,
  backTo,
}: {
  mode: "individual" | "student";
  backTo: string;
}) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const options = DOC_OPTIONS_BY_MODE[mode];
  const [startingInterview, setStartingInterview] = useState<
    "self_pr" | "entry_sheet" | "resume" | "work_history" | null
  >(null);
  const [selectedDocInterviewType, setSelectedDocInterviewType] = useState<
    "self_pr" | "entry_sheet" | "resume" | "work_history" | null
  >(null);
  const [customTemplates, setCustomTemplates] = useState<
    Record<string, { id: string; fields: any[] }>
  >({});
  const [uploadingTemplate, setUploadingTemplate] = useState<string | null>(null);
  const templateFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const startDocInterview = async (
    interviewType: "self_pr" | "entry_sheet" | "resume" | "work_history",
  ) => {
    if (!session) return;
    setStartingInterview(interviewType);
    try {
      const res = await fetch("/api/create-practice-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
        body: JSON.stringify({ avatarStyle: "neutral", interviewType, preferences: {} }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { token: string };
      navigate({ to: "/chat-interview/$token", params: { token: data.token } });
    } catch (e) {
      console.error(e);
      toast.error("開始に失敗しました");
    } finally {
      setStartingInterview(null);
    }
  };

  const [docType, setDocType] = useState<DocType>(options[0].value);
  const [targetName, setTargetName] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [reviewFileName, setReviewFileName] = useState("");
  const [extracting, setExtracting] = useState(false);
  const reviewFileInputRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [savedDocs, setSavedDocs] = useState<SavedDoc[]>([]);
  const [fetchingDocs, setFetchingDocs] = useState(true);
  const [careerProfile, setCareerProfile] = useState<any>(null);
  const [exportTarget, setExportTarget] = useState<SavedDoc | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data } = await (supabase
        .from("user_career_profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("mode", mode)
        .maybeSingle() as any);
      setCareerProfile(data ?? null);
    })();
    void loadCustomTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // exportTargetがセットされたら、テンプレートの描画完了を待ってPDF化する
  useEffect(() => {
    if (!exportTarget || !exportRef.current) return;
    (async () => {
      setExporting(true);
      try {
        // レイアウト確定を待つ
        await new Promise((r) => setTimeout(r, 150));
        if (exportRef.current) {
          await exportElementToPdf(exportRef.current, `${exportTarget.title || "書類"}.pdf`);
        }
      } catch (e) {
        console.error(e);
        toast.error("PDFの作成に失敗しました");
      } finally {
        setExporting(false);
        setExportTarget(null);
      }
    })();
  }, [exportTarget]);

  const selectedOption = options.find((o) => o.value === docType)!;

  const loadCustomTemplates = async () => {
    if (!session) return;
    const { data } = await (supabase
      .from("user_document_templates")
      .select("id, doc_type, fields")
      .eq("user_id", session.user.id) as any);
    const map: Record<string, { id: string; fields: any[] }> = {};
    (data ?? []).forEach((row: any) => {
      map[row.doc_type] = { id: row.id, fields: row.fields ?? [] };
    });
    setCustomTemplates(map);
  };

  const handleUploadTemplate = async (
    docTypeKey: "resume" | "work_history_resume" | "entry_sheet",
    file: File,
  ) => {
    if (!session) return;
    if (file.type !== "application/pdf") {
      toast.error("PDFファイルを選んでください");
      return;
    }
    setUploadingTemplate(docTypeKey);
    try {
      const text = await extractPdfText(file);
      if (!text.trim()) {
        toast.error("PDFから文字を読み取れませんでした");
        return;
      }
      const fieldsRes = await fetch("/api/extract-template-fields", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ docType: docTypeKey, templateText: text }),
      });
      const fieldsData = await fieldsRes.json();
      if (!fieldsRes.ok) throw new Error(fieldsData?.error || "抽出に失敗しました");

      const storagePath = `${session.user.id}/${docTypeKey}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("document-templates")
        .upload(storagePath, file, { upsert: true, contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from("user_document_templates").upsert(
        {
          user_id: session.user.id,
          doc_type: docTypeKey,
          template_path: storagePath,
          fields: fieldsData.fields,
        },
        { onConflict: "user_id,doc_type" },
      );
      if (dbError) throw dbError;

      toast.success("テンプレートを登録しました");
      void loadCustomTemplates();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "テンプレートの登録に失敗しました");
    } finally {
      setUploadingTemplate(null);
    }
  };

  const handleRemoveTemplate = async (docTypeKey: string) => {
    if (!session) return;
    await supabase
      .from("user_document_templates")
      .delete()
      .eq("user_id", session.user.id)
      .eq("doc_type", docTypeKey);
    void loadCustomTemplates();
  };

  const loadSavedDocs = async () => {
    if (!session) return;
    const { data } = await (supabase
      .from("generated_documents")
      .select("id, doc_type, title, generated_content, final_draft, created_at")
      .eq("user_id", session.user.id)
      .eq("mode", mode)
      .order("created_at", { ascending: false }) as any);
    setSavedDocs((data ?? []) as SavedDoc[]);
    setFetchingDocs(false);
  };

  useEffect(() => {
    void loadSavedDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (loading) {
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

  const handleReviewPdfSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        toast.error("PDFから文字を読み取れませんでした。テキストで直接入力してください");
        return;
      }
      setReviewText(text);
      setReviewFileName(file.name);
      toast.success("PDFを読み込みました");
    } catch (e) {
      console.error(e);
      toast.error("PDFの読み込みに失敗しました");
    } finally {
      setExtracting(false);
    }
  };

  const handleGenerate = async () => {
    if (selectedOption.needsReviewText && !reviewText.trim()) {
      toast.error("添削したい文章を入力してください");
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = await fetch(`/api/generate-document?_t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
        body: JSON.stringify({ docType, targetName, extraNotes, reviewText }),
      });
      if (res.status === 429) {
        const errBody = (await res.json().catch(() => null)) as { message?: string } | null;
        toast.error(errBody?.message ?? "利用上限に達しました");
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { content: string };
      setResult(data.content);
      toast.success("生成しました");
      void loadSavedDocs();
    } catch (e) {
      console.error(e);
      toast.error("生成に失敗しました。もう一度お試しください");
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("generated_documents").delete().eq("id", id);
    setSavedDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const inputStyle = {
    background: "#0F0F0F",
    border: "1px solid #2A2A2A",
    borderRadius: 8,
    color: "#F0F0F0",
    padding: "10px 12px",
    width: "100%",
    fontSize: 14,
  } as const;

  return (
    <PrivateShell>
      <div className="mx-auto max-w-xl px-6 py-10">
        <Link to={backTo} style={{ color: "#888888", fontSize: 13 }}>
          ← 戻る
        </Link>
        <h1 className="mt-4 text-[22px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
          書類生成AI
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "#999999" }}>
          プロフィール情報をもとに、AIが下書きを作成します。
        </p>

        {mode === "student" && (
          <>
            <div
              className="mt-6 rounded-2xl p-5"
              style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
            >
              <label className="mb-4 block">
                <span style={{ color: "#AAAAAA", fontSize: 13, fontWeight: 600 }}>種類</span>
                <select
                  style={{ ...inputStyle, marginTop: 6 }}
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as DocType)}
                >
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              {selectedOption.needsReviewText ? (
                <label className="mb-4 block">
                  <span style={{ color: "#AAAAAA", fontSize: 13, fontWeight: 600 }}>
                    元の文章（これを完成版に書き直します）
                  </span>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="file"
                      accept="application/pdf"
                      ref={reviewFileInputRef}
                      onChange={handleReviewPdfSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => reviewFileInputRef.current?.click()}
                      disabled={extracting}
                      className="rounded-full px-4 py-2 text-[13px] transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ background: "#2A2A2A", color: "#F0F0F0" }}
                    >
                      {extracting ? "読み込み中..." : "📎 PDFをアップロード"}
                    </button>
                    {reviewFileName && (
                      <span style={{ color: "#999999", fontSize: 12 }}>{reviewFileName}</span>
                    )}
                  </div>
                  <p className="mt-2 mb-1.5" style={{ color: "#666666", fontSize: 12 }}>
                    またはテキストで直接貼り付け:
                  </p>
                  <textarea
                    style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="ここに文章を貼り付けてください"
                  />
                </label>
              ) : (
                <label className="mb-4 block">
                  <span style={{ color: "#AAAAAA", fontSize: 13, fontWeight: 600 }}>
                    {mode === "student" ? "志望校名（任意）" : "応募先企業名（任意）"}
                  </span>
                  <input
                    style={{ ...inputStyle, marginTop: 6 }}
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                  />
                </label>
              )}

              <label className="mb-4 block">
                <span style={{ color: "#AAAAAA", fontSize: 13, fontWeight: 600 }}>
                  追加で伝えたいこと（任意）
                </span>
                <textarea
                  style={{ ...inputStyle, marginTop: 6, minHeight: 70, resize: "vertical" }}
                  value={extraNotes}
                  onChange={(e) => setExtraNotes(e.target.value)}
                />
              </label>

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full rounded-full py-3 text-[15px] transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
              >
                {generating ? "生成中..." : "生成する"}
              </button>
            </div>

            {result && (
              <div
                className="mt-6 rounded-2xl p-5"
                style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
              >
                <p className="mb-2" style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700 }}>
                  生成結果（添削解説）
                </p>
                <p
                  className="whitespace-pre-wrap text-[13px] leading-relaxed"
                  style={{ color: "#F0F0F0" }}
                >
                  {result}
                </p>
                {selectedOption.needsReviewText && (
                  <p className="mt-3 text-[12px]" style={{ color: "#888888" }}>
                    そのまま提出できる完成版は、下の「保存済みの書類」から「PDFで保存」で出力できます。
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {mode === "individual" && (
          <div className="mt-6 flex flex-col gap-3">
            <p style={{ color: "#AAAAAA", fontSize: 13, fontWeight: 600 }}>①作成する書類を選ぶ</p>
            {(
              [
                {
                  type: "self_pr",
                  label: "自己PR面接",
                  desc: "強み・実績を深掘り。会話から自己PR文章を自動生成",
                },
                {
                  type: "entry_sheet",
                  label: "ES面接",
                  desc: "志望動機・エピソードを深掘り。エントリーシートを自動生成",
                },
                {
                  type: "resume",
                  label: "履歴書面接",
                  desc: "経歴・スキルを整理。履歴書の項目を自動生成",
                },
                {
                  type: "work_history",
                  label: "職務経歴書面接",
                  desc: "職歴を会社ごとに深掘り。職務経歴書を自動生成",
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.type}
                type="button"
                onClick={() => setSelectedDocInterviewType(opt.type)}
                className="rounded-2xl p-5 text-left transition-colors"
                style={{
                  background: selectedDocInterviewType === opt.type ? "#C8FF00" : "#1A1A1A",
                  border: "1px solid #2A2A2A",
                }}
              >
                <p
                  style={{
                    color: selectedDocInterviewType === opt.type ? "#0F0F0F" : "#F0F0F0",
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  {opt.label}
                </p>
                <p
                  style={{
                    color: selectedDocInterviewType === opt.type ? "#3A3A00" : "#888888",
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  {opt.desc}
                </p>
              </button>
            ))}

            {selectedDocInterviewType && (
              <>
                <p className="mt-4" style={{ color: "#AAAAAA", fontSize: 13, fontWeight: 600 }}>
                  ②自分専用のテンプレート（任意）
                </p>
                <div
                  className="rounded-2xl p-5"
                  style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
                >
                  <p style={{ color: "#666666", fontSize: 10, marginBottom: 10 }}>
                    会社・学校指定のフォーマットがあれば、PDFをアップロードしてください。登録が無ければ、標準テンプレートで作成されます。
                  </p>
                  {(() => {
                    const key =
                      selectedDocInterviewType === "self_pr"
                        ? null
                        : selectedDocInterviewType === "work_history"
                          ? "work_history_resume"
                          : selectedDocInterviewType;
                    if (!key) {
                      return (
                        <p style={{ color: "#666666", fontSize: 11 }}>
                          自己PRはテンプレート形式が無く、文章のみで作成されます。
                        </p>
                      );
                    }
                    const label =
                      key === "resume"
                        ? "履歴書"
                        : key === "work_history_resume"
                          ? "職務経歴書"
                          : "エントリーシート";
                    return (
                      <div
                        className="flex items-center justify-between rounded-lg px-3 py-2"
                        style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                      >
                        <span style={{ color: "#F0F0F0", fontSize: 12 }}>
                          {label}
                          {customTemplates[key] && (
                            <span style={{ color: "#C8FF00", marginLeft: 8 }}>✓ 登録済み</span>
                          )}
                        </span>
                        <span className="flex items-center gap-2">
                          <label
                            className="cursor-pointer rounded-md px-3 py-1 text-[11px]"
                            style={{
                              background: "#222222",
                              border: "1px solid #333333",
                              color: "#F0F0F0",
                            }}
                          >
                            {uploadingTemplate === key
                              ? "解析中..."
                              : customTemplates[key]
                                ? "差し替え"
                                : "アップロード"}
                            <input
                              type="file"
                              accept="application/pdf"
                              className="hidden"
                              disabled={uploadingTemplate !== null}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleUploadTemplate(key, file);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          {customTemplates[key] && (
                            <button
                              onClick={() => handleRemoveTemplate(key)}
                              style={{ color: "#FF6B6B", fontSize: 11 }}
                            >
                              削除
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                <button
                  onClick={() => startDocInterview(selectedDocInterviewType)}
                  disabled={startingInterview !== null}
                  className="mt-2 w-full rounded-full py-3 text-[15px] transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
                >
                  {startingInterview ? "準備中..." : "始めます →"}
                </button>
              </>
            )}

            <p style={{ color: "#666666", fontSize: 11 }}>
              チャット形式のAIとの会話を通じて、書類がその場で自動生成されます。生成後は下の「保存済みの書類」から編集・PDF保存できます。
            </p>
          </div>
        )}

        <h2 className="mt-10 text-[16px]" style={{ color: "#F0F0F0", fontWeight: 700 }}>
          保存済みの書類
        </h2>
        {fetchingDocs && (
          <p className="mt-2 text-[13px]" style={{ color: "#888888" }}>
            読み込み中...
          </p>
        )}
        {!fetchingDocs && savedDocs.length === 0 && (
          <p className="mt-2 text-[13px]" style={{ color: "#888888" }}>
            まだありません。
          </p>
        )}
        <div className="mt-3 space-y-3">
          {savedDocs.map((doc) => (
            <details
              key={doc.id}
              className="rounded-xl p-4"
              style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
            >
              <summary
                className="flex cursor-pointer items-center justify-between"
                style={{ color: "#F0F0F0", fontSize: 14 }}
              >
                <span>{doc.title}</span>
                <span className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setExportTarget(doc);
                    }}
                    disabled={exporting}
                    style={{ color: "#C8FF00", fontSize: 12 }}
                  >
                    {exporting && exportTarget?.id === doc.id ? "PDF作成中..." : "PDFで保存"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(doc.id);
                    }}
                    style={{ color: "#FF6B6B", fontSize: 12 }}
                  >
                    削除
                  </button>
                </span>
              </summary>
              {doc.doc_type === "entry_sheet" ? (
                <EntrySheetEditor
                  doc={doc}
                  onSaved={(updated) =>
                    setSavedDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
                  }
                />
              ) : doc.doc_type === "resume" || doc.doc_type === "work_history_resume" ? (
                (() => {
                  let rd: any = {};
                  try {
                    rd = JSON.parse(doc.generated_content);
                  } catch {
                    rd = {};
                  }
                  return (
                    <p
                      className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed"
                      style={{ color: "#CCCCCC" }}
                    >
                      {rd.selfPr || "（内容を確認するには「PDFで保存」を押してください）"}
                    </p>
                  );
                })()
              ) : (
                <p
                  className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed"
                  style={{ color: "#CCCCCC" }}
                >
                  {doc.generated_content}
                </p>
              )}
            </details>
          ))}
        </div>

        {/* PDF書き出し用の非表示テンプレート(画面外に描画してキャプチャする) */}
        {exportTarget && (
          <div style={{ position: "fixed", top: 0, left: -99999 }}>
            <div ref={exportRef}>
              {exportTarget.doc_type === "resume" ? (
                (() => {
                  let rd: any = {};
                  try {
                    rd = JSON.parse(exportTarget.generated_content);
                  } catch {
                    rd = { selfPr: exportTarget.generated_content };
                  }
                  return (
                    <FullResumeTemplate
                      data={{
                        basicInfo: {
                          name: rd.basicInfo?.name ?? careerProfile?.basic_info?.name ?? "",
                          furigana:
                            rd.basicInfo?.furigana ?? careerProfile?.basic_info?.furigana ?? "",
                          birthdate: rd.basicInfo?.birthdate ?? "",
                          postal_code: rd.basicInfo?.postalCode ?? "",
                          address: rd.basicInfo?.address ?? "",
                          phone: rd.basicInfo?.phone ?? "",
                        },
                        gender: rd.basicInfo?.gender ?? "",
                        email: rd.basicInfo?.email ?? "",
                        contactPostalCode: rd.basicInfo?.contactPostalCode ?? "",
                        contactAddress: rd.basicInfo?.contactAddress ?? "",
                        contactPhone: rd.basicInfo?.contactPhone ?? "",
                        contactEmail: rd.basicInfo?.contactEmail ?? "",
                        education: rd.education ?? [],
                        workHistory: rd.workHistory ?? [],
                        qualifications: rd.qualifications ?? [],
                        motivationSelfPr: rd.selfPr ?? "",
                        requestColumn: rd.requestColumn ?? "",
                      }}
                    />
                  );
                })()
              ) : exportTarget.doc_type === "entry_sheet" ? (
                (() => {
                  let es: any = {};
                  try {
                    es = JSON.parse(exportTarget.generated_content);
                  } catch {
                    es = { motivation: exportTarget.generated_content };
                  }
                  if (es.customFields) {
                    return (
                      <GenericFieldsTemplate
                        title={exportTarget.title}
                        fields={(es.fields ?? []).map((f: any) => ({ key: f.key, label: f.label }))}
                        values={es.values ?? {}}
                      />
                    );
                  }
                  return (
                    <EntrySheetTemplate
                      data={{
                        name: careerProfile?.basic_info?.name ?? "",
                        furigana: careerProfile?.basic_info?.furigana ?? "",
                        schoolName: careerProfile?.basic_info?.school_name ?? "",
                        faculty: careerProfile?.basic_info?.faculty ?? "",
                        department: careerProfile?.basic_info?.department ?? "",
                        motivation: toSafeString(es.motivation),
                        strengths: toSafeString(es.strengths),
                        qualifications: toSafeString(es.qualifications),
                        hobbies: toSafeString(es.hobbies),
                      }}
                    />
                  );
                })()
              ) : exportTarget.doc_type === "work_history_resume" ? (
                (() => {
                  let wd: any = {};
                  try {
                    wd = JSON.parse(exportTarget.generated_content);
                  } catch {
                    wd = { selfPr: exportTarget.generated_content };
                  }
                  return (
                    <WorkHistoryFullTemplate
                      data={{
                        name: careerProfile?.basic_info?.name ?? "",
                        careerBlocks: wd.careerBlocks ?? [],
                        selfPr: wd.selfPr ?? "",
                        usableExperience: wd.usableExperience ?? "",
                        qualifications: wd.qualifications ?? "",
                        pcSkills: wd.pcSkills ?? "",
                        languageSkills: wd.languageSkills ?? "",
                      }}
                    />
                  );
                })()
              ) : (
                <ProseTemplate
                  title={exportTarget.title}
                  content={exportTarget.final_draft ?? exportTarget.generated_content}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </PrivateShell>
  );
}

/** エントリーシートの構造化データ(志望動機・強み・資格・趣味)をその場で編集できるフォーム */
function EntrySheetEditor({
  doc,
  onSaved,
}: {
  doc: SavedDoc;
  onSaved: (updated: SavedDoc) => void;
}) {
  const parsedInitial = (() => {
    try {
      return JSON.parse(doc.generated_content);
    } catch {
      return { motivation: doc.generated_content, strengths: "", qualifications: "", hobbies: "" };
    }
  })();

  if (parsedInitial.customFields) {
    return <CustomFieldsEditor doc={doc} initial={parsedInitial} onSaved={onSaved} />;
  }

  const [motivation, setMotivation] = useState(toSafeString(parsedInitial.motivation));
  const [strengths, setStrengths] = useState(toSafeString(parsedInitial.strengths));
  const [qualifications, setQualifications] = useState(toSafeString(parsedInitial.qualifications));
  const [hobbies, setHobbies] = useState(toSafeString(parsedInitial.hobbies));
  const [saving, setSaving] = useState(false);

  const fieldStyle = {
    background: "#0F0F0F",
    border: "1px solid #333333",
    borderRadius: 8,
    color: "#F0F0F0",
    padding: "8px 10px",
    width: "100%",
    fontSize: 13,
  } as const;

  const handleSave = async () => {
    setSaving(true);
    try {
      const newContent = JSON.stringify({ motivation, strengths, qualifications, hobbies });
      const { error } = await supabase
        .from("generated_documents")
        .update({ generated_content: newContent })
        .eq("id", doc.id);
      if (error) throw error;
      onSaved({ ...doc, generated_content: newContent });
      toast.success("保存しました");
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div>
        <label style={{ color: "#AAAAAA", fontSize: 11 }}>志望動機</label>
        <textarea
          style={{ ...fieldStyle, marginTop: 4, minHeight: 90, resize: "vertical" }}
          value={motivation}
          onChange={(e) => setMotivation(e.target.value)}
        />
      </div>
      <div>
        <label style={{ color: "#AAAAAA", fontSize: 11 }}>強み／特技</label>
        <textarea
          style={{ ...fieldStyle, marginTop: 4, minHeight: 60, resize: "vertical" }}
          value={strengths}
          onChange={(e) => setStrengths(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={{ color: "#AAAAAA", fontSize: 11 }}>所有資格</label>
          <input
            style={{ ...fieldStyle, marginTop: 4 }}
            value={qualifications}
            onChange={(e) => setQualifications(e.target.value)}
          />
        </div>
        <div>
          <label style={{ color: "#AAAAAA", fontSize: 11 }}>趣味／部活</label>
          <input
            style={{ ...fieldStyle, marginTop: 4 }}
            value={hobbies}
            onChange={(e) => setHobbies(e.target.value)}
          />
        </div>
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="self-start rounded-lg px-4 py-2 text-[12px] disabled:opacity-50"
        style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
      >
        {saving ? "保存中..." : "内容を保存する"}
      </button>
    </div>
  );
}

/** カスタムテンプレートの動的な項目を編集するフォーム */
function CustomFieldsEditor({
  doc,
  initial,
  onSaved,
}: {
  doc: SavedDoc;
  initial: {
    fields: { key: string; label: string; type?: string }[];
    values: Record<string, string>;
  };
  onSaved: (updated: SavedDoc) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initial.values ?? {}).map(([k, v]) => [k, toSafeString(v)])),
  );
  const [saving, setSaving] = useState(false);

  const fieldStyle = {
    background: "#0F0F0F",
    border: "1px solid #333333",
    borderRadius: 8,
    color: "#F0F0F0",
    padding: "8px 10px",
    width: "100%",
    fontSize: 13,
  } as const;

  const handleSave = async () => {
    setSaving(true);
    try {
      const newContent = JSON.stringify({ customFields: true, values, fields: initial.fields });
      const { error } = await supabase
        .from("generated_documents")
        .update({ generated_content: newContent })
        .eq("id", doc.id);
      if (error) throw error;
      onSaved({ ...doc, generated_content: newContent });
      toast.success("保存しました");
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3">
      {initial.fields.map((f) => (
        <div key={f.key}>
          <label style={{ color: "#AAAAAA", fontSize: 11 }}>{f.label}</label>
          {f.type === "short_text" ? (
            <input
              style={{ ...fieldStyle, marginTop: 4 }}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
            />
          ) : (
            <textarea
              style={{ ...fieldStyle, marginTop: 4, minHeight: 80, resize: "vertical" }}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
            />
          )}
        </div>
      ))}
      <button
        onClick={handleSave}
        disabled={saving}
        className="self-start rounded-lg px-4 py-2 text-[12px] disabled:opacity-50"
        style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
      >
        {saving ? "保存中..." : "内容を保存する"}
      </button>
    </div>
  );
}

/** 自己PRなど、単純な文章1本だけの書類をその場で編集できるフォーム */
function ProseEditor({ doc, onSaved }: { doc: SavedDoc; onSaved: (updated: SavedDoc) => void }) {
  const [content, setContent] = useState(doc.generated_content);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("generated_documents")
        .update({ generated_content: content })
        .eq("id", doc.id);
      if (error) throw error;
      onSaved({ ...doc, generated_content: content });
      toast.success("保存しました");
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full outline-none"
        style={{
          background: "#0F0F0F",
          border: "1px solid #333333",
          borderRadius: 8,
          color: "#F0F0F0",
          padding: "9px 12px",
          minHeight: 120,
          resize: "vertical",
          fontSize: 13,
          lineHeight: 1.7,
        }}
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="self-start rounded-lg px-4 py-2 text-[12px] disabled:opacity-50"
        style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
      >
        {saving ? "保存中..." : "内容を保存する"}
      </button>
    </div>
  );
}
