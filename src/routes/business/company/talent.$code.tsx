import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Lock, X } from "lucide-react";
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
  SummaryView,
  inputStyle,
  talentApi,
  type TalentSummary,
} from "@/components/talent/TalentUI";
import {
  CompanyInterviewBlock,
  type CompanyInterview,
} from "@/components/talent/CompanyInterviewBlock";
import { summaryAverage } from "@/lib/talent-score";

export const Route = createFileRoute("/business/company/talent/$code")({
  head: () => ({ meta: [{ title: "人材の詳細｜ガチキャリAI Business" }] }),
  component: TalentDetailPage,
});

type Detail = {
  code: string;
  headline: string | null;
  careerStage: string | null;
  desiredJobs: string | null;
  desiredLocations: string | null;
  selfPr: string | null;
  summary: TalentSummary | null;
  interviewCount: number;
  hasRecording: boolean;
  priceCoins: number;
  coins: CoinBalance;
  unlocked: boolean;
  contact: { id: string; status: string; created_at: string } | null;
  displayName?: string;
  unlockedAt?: string;
  interviews?: CompanyInterview[];
};

function TalentDetailPage() {
  const { code } = Route.useParams();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [buying, setBuying] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  const unlock = async () => {
    if (!d) return;
    if (d.coins.balance < d.priceCoins) return setBuying(true);
    if (!window.confirm(`${d.priceCoins}コインを使って、この方の詳しい評価を見ますか？`)) return;
    setUnlocking(true);
    setUnlockError("");
    const r = await talentApi<{ priceCoins?: number }>("/api/talent/unlock", {
      code: d.code,
      expectedCoins: d.priceCoins,
    });
    setUnlocking(false);
    if (r.status === 402) return setBuying(true);
    if (r.status === 409 && r.data.priceCoins) {
      setD((prev) => (prev ? { ...prev, priceCoins: r.data.priceCoins! } : prev));
    }
    if (!r.ok) return setUnlockError(r.data.error ?? "失敗しました");
    void load();
  };

  const load = useCallback(async () => {
    const r = await talentApi<Detail>(`/api/talent/detail?code=${encodeURIComponent(code)}`);
    if (r.ok) setD(r.data);
    else setError(r.data.error ?? "読み込みに失敗しました");
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

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
          ← 人材一覧へ戻る
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
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-col gap-1.5 text-[13px]" style={{ color: C.sub }}>
                  <span>状況：{d.careerStage ? CAREER_STAGE_LABELS[d.careerStage] : "未登録"}</span>
                  {d.desiredJobs && <span>希望職種：{d.desiredJobs}</span>}
                  {d.desiredLocations && <span>希望勤務地：{d.desiredLocations}</span>}
                  <span>
                    模擬面接 {d.interviewCount}回 ・ 録画 {d.hasRecording ? "あり" : "なし"}
                  </span>
                </div>
                <div className="text-right">
                  <p style={{ color: C.accent, fontSize: 34, fontWeight: 800, lineHeight: 1 }}>
                    {summaryAverage(d.summary)?.toFixed(1) ?? "-"}
                  </p>
                  <p className="text-[11px]" style={{ color: C.muted }}>
                    評価の平均（5点満点）
                  </p>
                </div>
              </div>
            </Card>

            {d.unlocked ? (
              <ContactCard d={d} onChanged={() => void load()} />
            ) : (
              <Card>
                <div className="flex flex-col gap-3">
                  <p
                    className="flex items-center gap-2"
                    style={{ color: C.text, fontSize: 15, fontWeight: 700 }}
                  >
                    <Lock size={16} color={C.accent} /> コインで詳しく見る
                  </p>
                  <ul
                    className="list-disc pl-5 text-[13px]"
                    style={{ color: C.sub, lineHeight: 1.9 }}
                  >
                    <li>お名前</li>
                    <li>面接ごとの詳しい評価と、面接の会話すべて</li>
                    <li>
                      {d.hasRecording ? "面接の録画" : "録画（この方は録画を公開していません）"}
                    </li>
                    <li>面談の申し込み（承諾されると直接メッセージでやり取りできます）</li>
                  </ul>
                  <p className="text-[12px]" style={{ color: C.muted }}>
                    この方は <b style={{ color: C.accent }}>{d.priceCoins}コイン</b>
                    （評価が高い方・多くの企業に見られている方ほど高くなります）。買い切りで、採用の成否にかかわらず追加の料金はかかりません。
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={() => void unlock()} loading={unlocking}>
                      {d.coins.balance >= d.priceCoins
                        ? `${d.priceCoins}コインで詳しく見る`
                        : `コインを買って見る（${d.priceCoins}コイン）`}
                    </Button>
                    <span className="text-[12px]" style={{ color: C.muted }}>
                      残り {d.coins.balance.toLocaleString()}コイン
                    </span>
                  </div>
                  <ErrorText>{unlockError}</ErrorText>
                </div>
              </Card>
            )}

            {d.selfPr && (
              <Card title="自己PR（本人が記入）">
                <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                  {d.selfPr}
                </p>
              </Card>
            )}

            <Card title="人物まとめ">
              <SummaryView summary={d.summary} />
            </Card>

            {d.unlocked && d.interviews && (
              <Card title="面接ごとの評価">
                {d.interviews.length === 0 ? (
                  <p className="text-[14px]" style={{ color: C.muted }}>
                    面接の記録がありません。
                  </p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {d.interviews.map((iv, i) => (
                      <CompanyInterviewBlock key={iv.id} iv={iv} defaultOpen={i === 0} />
                    ))}
                  </div>
                )}
              </Card>
            )}
          </>
        )}
      </PageFrame>
      {buying && d && (
        <CoinShopModal
          needCoins={Math.max(0, d.priceCoins - d.coins.balance) || d.priceCoins}
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
