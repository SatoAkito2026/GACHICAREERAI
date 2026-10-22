/**
 * 本人：企業に見せる面接の結果を選ぶ。
 * 公開中の結果をカードで並べ（右上の×で外す）、枠が空いていれば＋から評価のストックを選んで追加する。
 */
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { C, Card, ErrorText, Loading, Tag, talentApi } from "@/components/talent/TalentUI";
import {
  CompanyInterviewBlock,
  type CompanyInterview,
} from "@/components/talent/CompanyInterviewBlock";
import { AVATAR_STYLE_LABELS } from "@/lib/career-options";
import { interviewAverage } from "@/lib/talent-score";

/** 企業に見える形の、面接1回分のカード */
function ResultCard({
  iv,
  onOpen,
  corner,
  footer,
}: {
  iv: CompanyInterview;
  onOpen: () => void;
  corner?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const avg = interviewAverage(iv.competencies);
  const style = iv.settings?.avatar_style ? AVATAR_STYLE_LABELS[iv.settings.avatar_style] : null;
  return (
    <div
      className="relative flex flex-col gap-2 rounded-xl p-4"
      style={{ background: C.bg, border: `1px solid ${C.border}` }}
    >
      {corner && <div className="absolute right-2 top-2">{corner}</div>}
      <button type="button" onClick={onOpen} className="flex flex-col gap-2 pr-6 text-left">
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
          <p className="line-clamp-2 text-[12px]" style={{ color: C.sub, lineHeight: 1.7 }}>
            {iv.recruiterView.summary}
          </p>
        )}
        <span className="flex items-center gap-2 text-[12px]" style={{ color: C.accent }}>
          {iv.recordingUrl && <Tag color={C.accent}>録画</Tag>}
          中身を見る →
        </span>
      </button>
      {footer}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="my-8 flex w-full max-w-2xl flex-col gap-3 rounded-2xl p-4"
        style={{ background: C.card, border: `1px solid ${C.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p style={{ color: C.text, fontSize: 15, fontWeight: 700 }}>{title}</p>
          <button type="button" onClick={onClose} aria-label="閉じる">
            <X size={20} color={C.muted} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function MyInterviewCards() {
  const [interviews, setInterviews] = useState<CompanyInterview[] | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void talentApi<{ interviews: CompanyInterview[]; limit: number | null }>(
      "/api/talent/my-interviews",
    ).then((r) => {
      if (r.ok) {
        setInterviews(r.data.interviews);
        setLimit(r.data.limit);
      } else {
        setInterviews([]);
        setError(r.data.error ?? "読み込みに失敗しました");
      }
    });
  }, []);

  const shown = (interviews ?? []).filter((iv) => iv.shown);
  const stock = (interviews ?? []).filter((iv) => !iv.shown);
  const hasRoom = limit === null || shown.length < limit;

  const toggle = async (id: string, show: boolean) => {
    if (!show && !window.confirm("この結果を公開から外しますか？（結果は消えず、あとで戻せます）"))
      return;
    setBusy(id);
    setError("");
    const r = await talentApi("/api/talent/my-interviews", {
      action: show ? "show" : "hide",
      id,
    });
    setBusy(null);
    if (!r.ok) return setError(r.data.error ?? "保存に失敗しました");
    setInterviews((prev) =>
      prev ? prev.map((iv) => (iv.id === id ? { ...iv, shown: show } : iv)) : prev,
    );
    if (show && limit !== null && shown.length + 1 >= limit) setPicking(false);
  };

  const opened = interviews?.find((iv) => iv.id === openId) ?? null;

  return (
    <Card
      title="企業に見える面接結果"
      right={
        interviews && (
          <span className="text-[13px]" style={{ color: C.accent, fontWeight: 700 }}>
            現在公開中（{shown.length}/{limit ?? "上限なし"}
            {limit !== null && "件"}）
          </span>
        )
      }
    >
      <p className="mb-4 text-[12px]" style={{ color: C.muted, lineHeight: 1.7 }}>
        企業の一覧には、ここに並べた結果が1つずつ別々に表示されます（評価・値段も結果ごと）。練習の点数・改善点・模範回答は見えません。新しい練習は、枠が空いていれば自動で入ります。
      </p>
      {interviews === null ? (
        <Loading />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((iv) => (
            <ResultCard
              key={iv.id}
              iv={iv}
              onOpen={() => setOpenId(iv.id)}
              corner={
                <button
                  type="button"
                  disabled={busy === iv.id}
                  onClick={() => void toggle(iv.id, false)}
                  aria-label="公開から外す"
                  title="公開から外す"
                  className="rounded-full p-1 disabled:opacity-50"
                  style={{ background: C.card2 }}
                >
                  <X size={14} color="#FF6B6B" />
                </button>
              }
            />
          ))}
          {hasRoom && (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-xl text-[13px]"
              style={{ border: `1px dashed ${C.border}`, color: C.accent }}
            >
              <Plus size={22} />
              結果を追加する
            </button>
          )}
        </div>
      )}
      {interviews && !hasRoom && (
        <p className="mt-3 text-[12px]" style={{ color: C.muted }}>
          公開できるのは{limit}件までです。入れ替えるときは、×で外してから追加してください。
        </p>
      )}
      <div className="mt-3">
        <ErrorText>{error}</ErrorText>
      </div>

      {picking && (
        <Modal title="公開する結果を選ぶ" onClose={() => setPicking(false)}>
          <p className="text-[12px]" style={{ color: C.muted }}>
            企業にはこのカードの中身が見えます。
            {limit !== null && `あと${Math.max(0, limit - shown.length)}件追加できます。`}
          </p>
          {stock.length === 0 ? (
            <p className="text-[14px]" style={{ color: C.muted }}>
              追加できる結果がありません。模擬面接を受けると、ここに増えます。
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {stock.map((iv) => (
                <ResultCard
                  key={iv.id}
                  iv={iv}
                  onOpen={() => setOpenId(iv.id)}
                  footer={
                    <button
                      type="button"
                      disabled={busy === iv.id || !hasRoom}
                      onClick={() => void toggle(iv.id, true)}
                      className="flex items-center justify-center gap-1 rounded-lg py-2 text-[13px] disabled:opacity-50"
                      style={{ background: C.accent, color: "#0F0F0F", fontWeight: 700 }}
                    >
                      <Plus size={14} /> {busy === iv.id ? "追加中..." : "追加する"}
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </Modal>
      )}

      {opened && (
        <Modal title="企業に見える内容" onClose={() => setOpenId(null)}>
          <CompanyInterviewBlock key={opened.id} iv={opened} defaultOpen />
        </Modal>
      )}
    </Card>
  );
}
