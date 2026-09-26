import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { BusinessShell } from "@/components/ModeShell";
import { useActorPaywall, ActorPaywallScreen } from "@/components/ActorPaywall";

const PRODUCTION_TYPES = [
  "舞台",
  "映画",
  "演劇",
  "ミュージカル",
  "歌舞伎",
  "ドラマ",
  "CM",
  "その他",
];

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

const cardStyle = { background: "#1A1A1A", border: "1px solid #333333", borderRadius: 16 } as const;
const inputStyle = {
  background: "#0F0F0F",
  border: "1px solid #333333",
  borderRadius: 8,
  color: "#F0F0F0",
  padding: "9px 12px",
  width: "100%",
  fontSize: 13,
} as const;
const RANK_COLORS: Record<string, string> = {
  A: "#C8FF00",
  B: "#00CC88",
  C: "#CCAA00",
  D: "#CC4444",
};

export const Route = createFileRoute("/business/actor/screening")({
  head: () => ({ meta: [{ title: "書類選考｜芸能・キャスティング" }] }),
  component: ActorScreeningPage,
});

function ActorScreeningPage() {
  const { user, session, loading } = useAuth();
  const { isPaid, loading: paywallLoading } = useActorPaywall();

  const [productionType, setProductionType] = useState("");
  const [productionTitle, setProductionTitle] = useState("");
  const [presets, setPresets] = useState<{ id: string; name: string }[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [presetSaving, setPresetSaving] = useState(false);
  const [synopsis, setSynopsis] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [requiredConditions, setRequiredConditions] = useState("");
  const [preferredConditions, setPreferredConditions] = useState("");

  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [screening, setScreening] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  // フックは早期 return より前で呼ぶ（読み込み中→表示で呼ぶ数が変わるとページが落ちるため）
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("actor_screening_presets")
        .select("id, name")
        .eq("company_user_id", user.id)
        .order("updated_at", { ascending: false });
      setPresets((data ?? []) as { id: string; name: string }[]);
    })();
  }, [user]);

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
  if (paywallLoading) return null;
  if (!isPaid)
    return (
      <BusinessShell>
        <ActorPaywallScreen />
      </BusinessShell>
    );

  const addFiles = (incoming: FileList | File[]) => {
    const pdfs = Array.from(incoming).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    setFiles((prev) => [...prev, ...pdfs].slice(0, 20));
  };

  const handleSavePreset = async () => {
    if (!user) return;
    const name = presetName.trim();
    if (!name) {
      toast.error("設定に名前を付けてください");
      return;
    }
    setPresetSaving(true);
    try {
      const { data, error } = await supabase
        .from("actor_screening_presets")
        .insert({
          company_user_id: user.id,
          name,
          production_title: productionTitle || null,
          synopsis: synopsis || null,
          production_type: productionType || null,
          role_description: roleDescription || null,
          required_conditions: requiredConditions || null,
          preferred_conditions: preferredConditions || null,
        })
        .select("id, name")
        .single();
      if (error) throw error;
      setPresets((prev) => [{ id: data.id, name: data.name }, ...prev]);
      setPresetName("");
      toast.success("設定を保存しました");
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました");
    } finally {
      setPresetSaving(false);
    }
  };

  const handleLoadPreset = async (id: string) => {
    if (!id) return;
    const { data } = await supabase
      .from("actor_screening_presets")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (data) {
      setProductionTitle(data.production_title ?? "");
      setSynopsis(data.synopsis ?? "");
      setProductionType(data.production_type ?? "");
      setRoleDescription(data.role_description ?? "");
      setRequiredConditions(data.required_conditions ?? "");
      setPreferredConditions(data.preferred_conditions ?? "");
      toast.success("設定を読み込みました");
    }
  };

  const handleDeletePreset = async (id: string) => {
    await supabase.from("actor_screening_presets").delete().eq("id", id);
    setPresets((prev) => prev.filter((p) => p.id !== id));
    if (selectedPresetId === id) setSelectedPresetId("");
  };

  const canStart = productionType !== "" && files.length > 0;

  const handleStart = async () => {
    if (!canStart || !session) return;
    setScreening(true);
    setResults([]);
    try {
      const candidates: { fileName: string; resumeText: string }[] = [];
      for (const f of files) {
        try {
          const text = await extractPdfText(f);
          if (text.trim()) candidates.push({ fileName: f.name, resumeText: text });
        } catch {
          // skip unreadable files
        }
      }
      if (candidates.length === 0) {
        toast.error("PDFのテキストを読み取れませんでした");
        return;
      }
      const res = await fetch(`/api/screen-actors-batch?_t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
        body: JSON.stringify({
          productionTitle,
          synopsis,
          productionType,
          roleDescription,
          requiredConditions,
          preferredConditions,
          candidates,
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      const sorted = (data.results ?? []).sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));

      // 企業の書類選考と同じ方式で、履歴書PDFをストレージに保存する(企業モードと同じく履歴・結果画面から閲覧できるように)
      if (user) {
        for (const r of sorted) {
          const originalFile = files.find((f) => f.name === r.file_name);
          if (!originalFile || !r.id) continue;
          try {
            const storagePath = `${user.id}/${r.id}.pdf`;
            const { error: uploadError } = await supabase.storage
              .from("resumes")
              .upload(storagePath, originalFile, { contentType: "application/pdf", upsert: true });
            if (!uploadError) {
              await supabase
                .from("screening_candidates")
                .update({ resume_storage_path: storagePath } as never)
                .eq("id", r.id);
              r.resume_storage_path = storagePath;
            }
          } catch (uploadErr) {
            console.error("PDF upload error:", uploadErr);
          }
        }
      }

      setResults(sorted);
      toast.success(`${sorted.length}名の書類選考が完了しました`);
    } catch (e) {
      console.error(e);
      toast.error("書類選考に失敗しました");
    } finally {
      setScreening(false);
    }
  };

  return (
    <BusinessShell>
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-[22px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
          書類選考
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "#999999" }}>
          作品情報と求める人物像を設定し、複数の履歴書をまとめてアップロードすると、AIがランク付けします。演技力は評価対象外です（経歴の信頼度・集客力・役柄適合率を評価します）。
        </p>

        <div className="mt-6 rounded-2xl p-5" style={cardStyle}>
          <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            STEP1・作品条件
          </p>

          {presets.length > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <select
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                className="flex-1"
                style={inputStyle}
              >
                <option value="">保存済みの設定を読み込む...</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleLoadPreset(selectedPresetId)}
                disabled={!selectedPresetId}
                className="shrink-0 rounded-lg px-3 py-2 text-[12px] disabled:opacity-40"
                style={{ background: "#222222", border: "1px solid #333333", color: "#F0F0F0" }}
              >
                読み込む
              </button>
              {selectedPresetId && (
                <button
                  type="button"
                  onClick={() => handleDeletePreset(selectedPresetId)}
                  className="shrink-0 rounded-lg px-3 py-2 text-[12px]"
                  style={{ color: "#FF6B6B" }}
                >
                  削除
                </button>
              )}
            </div>
          )}
          <div
            className="mb-4 flex items-center gap-2 rounded-lg p-3"
            style={{ background: "#0F0F0F", border: "1px solid #333333" }}
          >
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="この設定に名前を付けて保存（例：愛のふるさと・ヒロイン候補）"
              className="flex-1 outline-none"
              style={{
                ...inputStyle,
                background: "transparent",
                border: "none",
                padding: "4px 8px",
              }}
            />
            <button
              type="button"
              onClick={handleSavePreset}
              disabled={presetSaving}
              className="shrink-0 rounded-lg px-4 py-2 text-[12px] disabled:opacity-50"
              style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
            >
              {presetSaving ? "保存中..." : "設定を保存"}
            </button>
          </div>
          <label style={{ color: "#AAAAAA", fontSize: 12 }}>作品名</label>
          <input
            style={{ ...inputStyle, marginTop: 4 }}
            value={productionTitle}
            onChange={(e) => setProductionTitle(e.target.value)}
            placeholder="例：愛のふるさと"
          />

          <label style={{ color: "#AAAAAA", fontSize: 12, marginTop: 12, display: "block" }}>
            あらすじ
          </label>
          <textarea
            style={{ ...inputStyle, marginTop: 4, minHeight: 70, resize: "vertical" }}
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            placeholder="この作品がどんな物語かを簡単に記載してください"
          />

          <label style={{ color: "#AAAAAA", fontSize: 12, marginTop: 12, display: "block" }}>
            作品種別
          </label>
          <select
            style={{ ...inputStyle, marginTop: 4 }}
            value={productionType}
            onChange={(e) => setProductionType(e.target.value)}
          >
            <option value="">選択してください</option>
            {PRODUCTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <label style={{ color: "#AAAAAA", fontSize: 12, marginTop: 12, display: "block" }}>
            求める役柄・人物像
          </label>
          <textarea
            style={{ ...inputStyle, marginTop: 4, minHeight: 70, resize: "vertical" }}
            value={roleDescription}
            onChange={(e) => setRoleDescription(e.target.value)}
            placeholder="例：20代後半〜30代の主人公の恋人役。誠実で芯の強いキャラクター"
          />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: "#AAAAAA", fontSize: 12 }}>必須条件</label>
              <textarea
                style={{ ...inputStyle, marginTop: 4, minHeight: 60, resize: "vertical" }}
                value={requiredConditions}
                onChange={(e) => setRequiredConditions(e.target.value)}
                placeholder="例：舞台出演経験3年以上"
              />
            </div>
            <div>
              <label style={{ color: "#AAAAAA", fontSize: 12 }}>歓迎条件</label>
              <textarea
                style={{ ...inputStyle, marginTop: 4, minHeight: 60, resize: "vertical" }}
                value={preferredConditions}
                onChange={(e) => setPreferredConditions(e.target.value)}
                placeholder="例：ダンス経験、SNSでの発信力"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl p-5" style={cardStyle}>
          <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            STEP2・履歴書アップロード（複数可・最大20件）
          </p>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl px-6 py-8 text-center"
            style={{
              border: `1px dashed ${dragOver ? "#C8FF00" : "#333333"}`,
              background: "#0F0F0F",
            }}
          >
            <p style={{ color: "#F0F0F0", fontSize: 13 }}>
              PDFをドラッグ&ドロップ、またはクリックして選択
            </p>
            <p style={{ color: "#666666", fontSize: 11, marginTop: 4 }}>{files.length}/20件</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {files.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                >
                  <span style={{ color: "#F0F0F0", fontSize: 12 }}>{f.name}</span>
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    style={{ color: "#888888", fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={!canStart || screening}
            className="mt-4 w-full rounded-lg py-3 text-[14px] disabled:opacity-50"
            style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
          >
            {screening ? "AIが選考中..." : "AIで書類選考を開始する →"}
          </button>
        </div>

        {results.length > 0 && (
          <div className="mt-6 space-y-3">
            <h2 style={{ color: "#F0F0F0", fontSize: 16, fontWeight: 700 }}>
              {results.length}名の選考結果
            </h2>
            {results.map((r, i) => (
              <div key={i} className="rounded-2xl p-4" style={cardStyle}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[13px]"
                      style={{
                        background: RANK_COLORS[r.rank] ?? "#888888",
                        color: "#0F0F0F",
                        fontWeight: 700,
                      }}
                    >
                      {r.rank}
                    </span>
                    <span style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700 }}>
                      {r.candidate_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.fit_percentage != null && (
                      <span style={{ color: "#7CD4FF", fontSize: 12 }}>
                        適合率 {r.fit_percentage}%
                      </span>
                    )}
                    <span style={{ color: "#C8FF00", fontSize: 14, fontWeight: 700 }}>
                      {r.score}点
                    </span>
                  </div>
                </div>
                <p style={{ color: "#CCCCCC", fontSize: 12, marginTop: 8 }}>{r.summary}</p>
                {r.audience_draw_summary && (
                  <p style={{ color: "#7CD98F", fontSize: 12, marginTop: 4 }}>
                    {r.audience_draw_summary}
                  </p>
                )}
                {r.resume_storage_path && (
                  <button
                    onClick={async () => {
                      const { data, error } = await supabase.storage
                        .from("resumes")
                        .createSignedUrl(r.resume_storage_path, 60);
                      if (error || !data) {
                        toast.error("履歴書の取得に失敗しました");
                        return;
                      }
                      window.open(data.signedUrl, "_blank");
                    }}
                    className="mt-2 rounded-md px-2 py-1 text-[11px]"
                    style={{ color: "#6B9FFF", border: "1px solid #2A2A4A" }}
                  >
                    📄 履歴書を見る
                  </button>
                )}
                {r.check_points?.length > 0 && (
                  <div className="mt-2">
                    <p style={{ color: "#FF6B6B", fontSize: 11, fontWeight: 700 }}>
                      データベースとの食い違い
                    </p>
                    {r.check_points.map((c: string, j: number) => (
                      <p key={j} style={{ color: "#CCCCCC", fontSize: 11 }}>
                        ・{c}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </BusinessShell>
  );
}
