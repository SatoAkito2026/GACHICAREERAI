/**
 * 本人：企業に見える面接の結果をカードで並べる。開くと企業に見える中身、削除もできる
 */
import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { C, Card, ErrorText, Loading, Tag, talentApi } from "@/components/talent/TalentUI";
import {
  CompanyInterviewBlock,
  type CompanyInterview,
} from "@/components/talent/CompanyInterviewBlock";
import { AVATAR_STYLE_LABELS } from "@/lib/career-options";

function average(scores: (number | null)[]): number | null {
  const list = scores.filter((n): n is number => typeof n === "number");
  if (list.length === 0) return null;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

/** 面接ごとの結果（企業に見える内容）をカードで並べる。開くと詳しく見られ、削除もできる */
export function MyInterviewCards({
  interviews,
  onDeleted,
}: {
  interviews: CompanyInterview[] | null;
  onDeleted: (id: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const remove = async (id: string) => {
    if (
      !window.confirm(
        "この面接の結果を削除しますか？\n評価・会話・録画が消え、企業からも見えなくなります。元に戻せません。",
      )
    )
      return;
    setDeleting(id);
    setError("");
    const r = await talentApi("/api/talent/my-interviews", { action: "delete", id });
    setDeleting(null);
    if (!r.ok) return setError(r.data.error ?? "削除に失敗しました");
    if (openId === id) setOpenId(null);
    onDeleted(id);
  };

  const opened = interviews?.find((iv) => iv.id === openId) ?? null;

  return (
    <Card title="企業に見える面接の結果">
      <p className="mb-4 text-[12px]" style={{ color: C.muted, lineHeight: 1.7 }}>
        コインで見た企業には、面接ごとにこの内容が見えます（練習の点数・改善点・模範回答は見えません）。見せたくない面接は削除できます。削除すると人物まとめも1時間以内に作り直されます。
      </p>
      {interviews === null ? (
        <Loading />
      ) : interviews.length === 0 ? (
        <p className="text-[14px]" style={{ color: C.muted }}>
          まだ面接の結果がありません。
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {interviews.map((iv) => {
            const avg = average(iv.competencies.map((c) => c.score));
            const style = iv.settings?.avatar_style
              ? AVATAR_STYLE_LABELS[iv.settings.avatar_style]
              : null;
            return (
              <div
                key={iv.id}
                className="flex flex-col gap-2 rounded-xl p-4"
                style={{ background: C.bg, border: `1px solid ${C.border}` }}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(iv.id)}
                  className="flex flex-col gap-2 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>
                        {iv.jobType || "職種指定なし"}
                      </p>
                      <p className="mt-0.5 text-[12px]" style={{ color: C.muted }}>
                        {new Date(iv.date).toLocaleDateString("ja-JP")}
                        {style && ` ・ 面接官：${style}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p style={{ color: C.accent, fontSize: 20, fontWeight: 800, lineHeight: 1 }}>
                        {avg?.toFixed(1) ?? "-"}
                      </p>
                      <p className="text-[10px]" style={{ color: C.muted }}>
                        評価の平均
                      </p>
                    </div>
                  </div>
                  {iv.recruiterView?.summary && (
                    <p
                      className="line-clamp-2 text-[12px]"
                      style={{ color: C.sub, lineHeight: 1.7 }}
                    >
                      {iv.recruiterView.summary}
                    </p>
                  )}
                </button>
                <div className="flex items-center justify-between">
                  <span className="flex gap-1.5">
                    {iv.recordingUrl && <Tag color={C.accent}>録画</Tag>}
                    <button
                      type="button"
                      onClick={() => setOpenId(iv.id)}
                      className="text-[12px]"
                      style={{ color: C.accent }}
                    >
                      開く →
                    </button>
                  </span>
                  <button
                    type="button"
                    disabled={deleting === iv.id}
                    onClick={() => void remove(iv.id)}
                    className="flex items-center gap-1 text-[12px] disabled:opacity-50"
                    style={{ color: "#FF6B6B" }}
                  >
                    <Trash2 size={13} /> {deleting === iv.id ? "削除中..." : "削除"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3">
        <ErrorText>{error}</ErrorText>
      </div>

      {opened && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setOpenId(null)}
        >
          <div
            className="my-8 flex w-full max-w-2xl flex-col gap-3 rounded-2xl p-4"
            style={{ background: C.card, border: `1px solid ${C.border}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p style={{ color: C.text, fontSize: 15, fontWeight: 700 }}>企業に見える内容</p>
              <button type="button" onClick={() => setOpenId(null)} aria-label="閉じる">
                <X size={20} color={C.muted} />
              </button>
            </div>
            <CompanyInterviewBlock key={opened.id} iv={opened} defaultOpen />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={deleting === opened.id}
                onClick={() => void remove(opened.id)}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-[13px] disabled:opacity-50"
                style={{ color: "#FF6B6B", border: "1px solid #5A2A2A" }}
              >
                <Trash2 size={14} /> この面接を削除
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/** 本人の面接の結果（企業に見える形）を読み込む */
export function useMyInterviews() {
  const [interviews, setInterviews] = useState<CompanyInterview[] | null>(null);
  useEffect(() => {
    void talentApi<{ interviews: CompanyInterview[] }>("/api/talent/my-interviews").then((r) =>
      setInterviews(r.ok ? r.data.interviews : []),
    );
  }, []);
  const removeLocal = (id: string) =>
    setInterviews((prev) => (prev ? prev.filter((iv) => iv.id !== id) : prev));
  return { interviews, removeLocal };
}
