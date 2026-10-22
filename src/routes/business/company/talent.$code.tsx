import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Lock, Video } from "lucide-react";
import { BusinessShell } from "@/components/ModeShell";
import { CoinShopModal, type CoinBalance } from "@/components/talent/CoinShop";
import {
  Button,
  C,
  CAREER_STAGE_LABELS,
  Card,
  ErrorText,
  Loading,
  PageFrame,
  StatusBadge,
  Tag,
  inputStyle,
  talentApi,
} from "@/components/talent/TalentUI";
import {
  CompanyInterviewBlock,
  type CompanyInterview,
} from "@/components/talent/CompanyInterviewBlock";
import { AVATAR_STYLE_LABELS } from "@/lib/career-options";

export const Route = createFileRoute("/business/company/talent/$code")({
  head: () => ({ meta: [{ title: "面接結果の詳細｜ガチキャリAI Business" }] }),
  validateSearch: (s: Record<string, unknown>): { iv?: string } =>
    typeof s.iv === "string" ? { iv: s.iv } : {},
  component: TalentDetailPage,
});

/** 公開中の面接の結果1つ分。買った結果だけ detail（詳しい評価・会話・録画）がつく */
type Result = {
  id: string;
  date: string;
  jobType: string | null;
  avatarStyle: string | null;
  overview: string;
  strengths: string[];
  competencies: { key: string; label: string; score: number | null }[];
  average: number | null;
  hasRecording: boolean;
  priceCoins: number;
  unlocked: boolean;
  detail: CompanyInterview | null;
};

type Detail = {
  code: string;
  headline: string | null;
  careerStage: string | null;
  desiredJobs: string | null;
  desiredLocations: string | null;
  selfPr: string | null;
  coins: CoinBalance;
  unlocked: boolean;
  contact: { id: string; status: string; created_at: string } | null;
  results: Result[];
  displayName?: string;
  unlockedAt?: string;
};

function TalentDetailPage() {
  const { code } = Route.useParams();
  const { iv } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [buying, setBuying] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  const load = useCallback(async () => {
    const r = await talentApi<Detail>(`/api/talent/detail?code=${encodeURIComponent(code)}`);
    if (r.ok) setD(r.data);
    else setError(r.data.error ?? "読み込みに失敗しました");
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = d ? (d.results.find((r) => r.id === iv) ?? d.results[0] ?? null) : null;
  const others = d && selected ? d.results.filter((r) => r.id !== selected.id) : [];

  const unlock = async () => {
    if (!d || !selected) return;
    if (d.coins.balance < selected.priceCoins) return setBuying(true);
    if (!window.confirm(`${selected.priceCoins}コインを使って、この面接結果を詳しく見ますか？`))
      return;
    setUnlocking(true);
    setUnlockError("");
    const r = await talentApi<{ priceCoins?: number }>("/api/talent/unlock", {
      code: d.code,
      interviewId: selected.id,
      expectedCoins: selected.priceCoins,
    });
    setUnlocking(false);
    if (r.status === 402) return setBuying(true);
    if (!r.ok) {
      setUnlockError(r.data.error ?? "失敗しました");
      if (r.status === 409) void load();
      return;
    }
    void load();
  };

  return (
    <BusinessShell>
      <PageFrame
        width={920}
        title={d?.unlocked ? `${d.displayName} さん` : `No.${code.slice(0, 6).toUpperCase()}`}
        subtitle={d?.headline ?? undefined}
      >
        <Link
          to="/business/company/talent"
          className="self-start text-[13px]"
          style={{ color: C.muted }}
        >
          ← 一覧へ戻る
        </Link>
        {!d ? (
          error ? (
            <ErrorText>{error}</ErrorText>
          ) : (
            <Loading />
          )
        ) : (
          <>
            <Card>
              <div className="flex flex-col gap-1.5 text-[13px]" style={{ color: C.sub }}>
                <span>状況：{d.careerStage ? CAREER_STAGE_LABELS[d.careerStage] : "未登録"}</span>
                {d.desiredJobs && <span>希望職種：{d.desiredJobs}</span>}
                {d.desiredLocations && <span>希望勤務地：{d.desiredLocations}</span>}
                <span>公開中の面接結果 {d.results.length}件（結果ごとに評価・値段が別です）</span>
              </div>
            </Card>

            {!selected ? (
              <Card>
                <p className="text-[14px]" style={{ color: C.muted }}>
                  公開中の面接結果がありません。
                </p>
              </Card>
            ) : (
              <Card
                title={`${selected.jobType || "職種指定なし"}の面接（${new Date(selected.date).toLocaleDateString("ja-JP")}）`}
                right={
                  <div className="text-right">
                    <p style={{ color: C.accent, fontSize: 30, fontWeight: 800, lineHeight: 1 }}>
                      {selected.average?.toFixed(1) ?? "-"}
                    </p>
                    <p className="text-[11px]" style={{ color: C.muted }}>
                      評価の平均（5点満点）
                    </p>
                  </div>
                }
              >
                {selected.unlocked && selected.detail ? (
                  <CompanyInterviewBlock key={selected.id} iv={selected.detail} defaultOpen />
                ) : (
                  <div className="flex flex-col gap-4">
                    <ResultPreview r={selected} />
                    <div
                      className="flex flex-col gap-3 rounded-xl p-4"
                      style={{ background: C.card2 }}
                    >
                      <p
                        className="flex items-center gap-2"
                        style={{ color: C.text, fontSize: 15, fontWeight: 700 }}
                      >
                        <Lock size={16} color={C.accent} /> コインでこの結果を詳しく見る
                      </p>
                      <ul
                        className="list-disc pl-5 text-[13px]"
                        style={{ color: C.sub, lineHeight: 1.9 }}
                      >
                        <li>7つの評価の理由と、根拠になった発言</li>
                        <li>採用担当者向けの見立て・確認したい点</li>
                        <li>この面接の会話すべて</li>
                        <li>
                          {selected.hasRecording
                            ? "この面接の録画"
                            : "録画（この結果にはありません）"}
                        </li>
                        <li>お名前と、面談の申し込み（どれか1つ買えば開きます）</li>
                      </ul>
                      <p className="text-[12px]" style={{ color: C.muted }}>
                        この結果は <b style={{ color: C.accent }}>{selected.priceCoins}コイン</b>
                        。同じ人のほかの結果は、それぞれ別に買います。買い切りで、採用の成否にかかわらず追加の料金はかかりません。
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <Button onClick={() => void unlock()} loading={unlocking}>
                          {d.coins.balance >= selected.priceCoins
                            ? `${selected.priceCoins}コインで詳しく見る`
                            : `コインを買って見る（${selected.priceCoins}コイン）`}
                        </Button>
                        <span className="text-[12px]" style={{ color: C.muted }}>
                          残り {d.coins.balance.toLocaleString()}コイン
                        </span>
                      </div>
                      <ErrorText>{unlockError}</ErrorText>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {d.unlocked && <ContactCard d={d} onChanged={() => void load()} />}

            {d.selfPr && (
              <Card title="自己PR（本人が記入）">
                <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                  {d.selfPr}
                </p>
              </Card>
            )}

            {others.length > 0 && (
              <Card title="この人のほかの面接結果">
                <div className="grid gap-3 md:grid-cols-2">
                  {others.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setUnlockError("");
                        void navigate({ search: { iv: r.id } });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="flex flex-col gap-2 rounded-xl p-4 text-left"
                      style={{ background: C.bg, border: `1px solid ${C.border}` }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>
                            {r.jobType || "職種指定なし"}
                          </p>
                          <p className="mt-0.5 text-[12px]" style={{ color: C.muted }}>
                            {new Date(r.date).toLocaleDateString("ja-JP")}
                            {r.avatarStyle &&
                              ` ・ 面接官：${AVATAR_STYLE_LABELS[r.avatarStyle] ?? ""}`}
                          </p>
                        </div>
                        <p
                          style={{ color: C.accent, fontSize: 20, fontWeight: 800, lineHeight: 1 }}
                        >
                          {r.average?.toFixed(1) ?? "-"}
                        </p>
                      </div>
                      <span className="flex items-center gap-2">
                        {r.hasRecording && (
                          <span
                            className="flex items-center gap-1 text-[12px]"
                            style={{ color: C.muted }}
                          >
                            <Video size={12} /> 録画あり
                          </span>
                        )}
                        {r.unlocked ? (
                          <Tag color={C.accent}>購入済み</Tag>
                        ) : (
                          <Tag color={C.accent}>{r.priceCoins}コイン</Tag>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </PageFrame>
      {buying && d && selected && (
        <CoinShopModal
          needCoins={Math.max(0, selected.priceCoins - d.coins.balance) || selected.priceCoins}
          onClose={() => setBuying(false)}
          onDone={(coins) => {
            setBuying(false);
            setD((prev) => (prev ? { ...prev, coins } : prev));
          }}
        />
      )}
    </BusinessShell>
  );
}

/** 買う前に見える、その結果の要約（7つの評価の点数・見立ての要約・強み） */
function ResultPreview({ r }: { r: Result }) {
  const style = r.avatarStyle ? AVATAR_STYLE_LABELS[r.avatarStyle] : null;
  return (
    <div className="flex flex-col gap-3">
      {style && (
        <p className="text-[12px]" style={{ color: C.muted }}>
          面接官：{style}
        </p>
      )}
      {r.overview && <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.8 }}>{r.overview}</p>}
      {r.strengths.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.strengths.map((s) => (
            <Tag key={s} color={C.accent}>
              {s}
            </Tag>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {r.competencies.map((c) => (
          <div key={c.key} className="flex items-center gap-3 text-[13px]">
            <span className="w-24 shrink-0" style={{ color: C.sub }}>
              {c.label}
            </span>
            <div className="h-2 flex-1 rounded-full" style={{ background: C.bg }}>
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${((c.score ?? 0) / 5) * 100}%`,
                  background: C.accent,
                }}
              />
            </div>
            <span className="w-10 text-right" style={{ color: C.text, fontWeight: 700 }}>
              {c.score?.toFixed(1) ?? "-"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactCard({ d, onChanged }: { d: Detail; onChanged: () => void }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    setSending(true);
    setError("");
    const r = await talentApi("/api/talent/contacts", { action: "request", code: d.code, message });
    setSending(false);
    if (!r.ok) return setError(r.data.error ?? "送信に失敗しました");
    onChanged();
  };

  const withdraw = async () => {
    if (!d.contact || !window.confirm("申し込みを取り下げますか？")) return;
    const r = await talentApi("/api/talent/contacts", {
      action: "withdraw",
      requestId: d.contact.id,
    });
    if (!r.ok) return setError(r.data.error ?? "失敗しました");
    onChanged();
  };

  if (d.contact && d.contact.status !== "withdrawn") {
    return (
      <Card title="面談の申し込み" right={<StatusBadge status={d.contact.status} />}>
        <div className="flex flex-col gap-3 text-[14px]" style={{ color: C.sub }}>
          {d.contact.status === "pending" && (
            <>
              <p>申し込みを送りました。本人が承諾すると、メールでお知らせします。</p>
              <div>
                <Button variant="ghost" onClick={() => void withdraw()}>
                  申し込みを取り下げる
                </Button>
              </div>
            </>
          )}
          {d.contact.status === "accepted" && (
            <>
              <p>承諾されました。メッセージで面談の日程などを直接ご相談ください。</p>
              <div>
                <Link
                  to="/business/company/messages"
                  search={{ id: d.contact.id }}
                  className="inline-flex rounded-lg px-4 py-2.5 text-[14px]"
                  style={{ background: C.accent, color: "#0F0F0F", fontWeight: 600 }}
                >
                  メッセージを開く
                </Link>
              </div>
            </>
          )}
          {d.contact.status === "declined" && <p>今回は辞退されました。</p>}
          <ErrorText>{error}</ErrorText>
        </div>
      </Card>
    );
  }

  return (
    <Card title="面談を申し込む">
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-[13px]" style={{ color: C.accent }}>
          <CheckCircle2 size={15} /> 閲覧済み（
          {d.unlockedAt ? new Date(d.unlockedAt).toLocaleDateString("ja-JP") : ""}）
        </p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="会社の紹介、募集している仕事、面談したい理由などを書いてください（本人に届きます）"
          className="resize-y rounded-lg px-3 py-2.5 text-[14px] outline-none"
          style={inputStyle}
        />
        <p className="text-[11px]" style={{ color: C.muted }}>
          会社名・業種・所在地・募集職種など、設定画面に登録した会社情報も一緒に表示されます。
        </p>
        <ErrorText>{error}</ErrorText>
        <div>
          <Button
            onClick={() => void send()}
            loading={sending}
            disabled={message.trim().length < 10}
          >
            面談を申し込む
          </Button>
        </div>
      </div>
    </Card>
  );
}
