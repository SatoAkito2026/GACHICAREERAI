import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Elements, CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { CheckCircle2, Lock, X } from "lucide-react";
import { BusinessShell } from "@/components/ModeShell";
import { stripePromise } from "@/components/CheckoutModal";
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
  ticketPrice: number;
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
                    {competencyAverage(d.summary)?.toFixed(1) ?? "-"}
                  </p>
                  <p className="text-[11px]" style={{ color: C.muted }}>
                    力の平均（5点満点）
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
                    <Lock size={16} color={C.accent} /> チケットで詳しく見る
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
                    1人分 {d.ticketPrice.toLocaleString()}
                    円（税込）・買い切り。採用の成否にかかわらず追加の料金はかかりません。
                  </p>
                  <div>
                    <Button onClick={() => setBuying(true)}>
                      チケットを購入する（{d.ticketPrice.toLocaleString()}円）
                    </Button>
                  </div>
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
        <PurchaseModal
          code={d.code}
          price={d.ticketPrice}
          onClose={() => setBuying(false)}
          onDone={() => {
            setBuying(false);
            void load();
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
          <CheckCircle2 size={15} /> チケット購入済み（
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

const CARD_OPTIONS = {
  hidePostalCode: true,
  style: {
    base: { color: "#F0F0F0", fontSize: "15px", "::placeholder": { color: "#888888" } },
    invalid: { color: "#FF5C5C" },
  },
};

function PurchaseForm({
  code,
  price,
  onDone,
}: {
  code: string;
  price: number;
  onDone: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pay = async () => {
    if (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
    if (!card) return;
    setLoading(true);
    setError("");
    const intent = await talentApi<{
      clientSecret?: string;
      paymentIntentId?: string;
      alreadyUnlocked?: boolean;
    }>("/api/talent/unlock", { action: "intent", code });
    if (!intent.ok) {
      setLoading(false);
      return setError(intent.data.error ?? "決済の準備に失敗しました");
    }
    if (intent.data.alreadyUnlocked) return onDone();
    const result = await stripe.confirmCardPayment(intent.data.clientSecret!, {
      payment_method: { card },
    });
    if (result.error) {
      setLoading(false);
      return setError(result.error.message ?? "決済に失敗しました");
    }
    const confirm = await talentApi("/api/talent/unlock", {
      action: "confirm",
      paymentIntentId: result.paymentIntent?.id ?? intent.data.paymentIntentId,
    });
    setLoading(false);
    if (!confirm.ok) {
      return setError(
        (confirm.data.error ?? "確認に失敗しました") +
          "（決済済みの場合は、数分後にページを開き直すと反映されます）",
      );
    }
    onDone();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <CardElement options={CARD_OPTIONS} />
      </div>
      <label className="flex items-start gap-2 text-[12px]" style={{ color: C.sub }}>
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          閲覧した個人情報は採用の検討・連絡のためだけに使い、第三者に渡さないことに同意します。チケットは購入後のキャンセル・返金はできません。
        </span>
      </label>
      <ErrorText>{error}</ErrorText>
      <Button onClick={() => void pay()} loading={loading} disabled={!stripe || !agree}>
        {price.toLocaleString()}円を支払う
      </Button>
    </div>
  );
}

function PurchaseModal({
  code,
  price,
  onClose,
  onDone,
}: {
  code: string;
  price: number;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: C.card2, border: `1.5px solid ${C.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 style={{ color: C.text, fontSize: 17, fontWeight: 700 }}>チケットを購入</h2>
          <button type="button" onClick={onClose} aria-label="閉じる">
            <X size={20} color={C.muted} />
          </button>
        </div>
        <p className="mb-4 text-[13px]" style={{ color: C.sub }}>
          No.{code.slice(0, 6).toUpperCase()}{" "}
          の方の名前・詳しい評価・録画の閲覧と、面談の申し込みができるようになります。
          <br />
          <b style={{ color: C.accent, fontSize: 18 }}>{price.toLocaleString()}円</b>（税込）
        </p>
        <Elements stripe={stripePromise}>
          <PurchaseForm code={code} price={price} onDone={onDone} />
        </Elements>
      </div>
    </div>
  );
}

/** 企業向けの点数は「7つの力」の平均（本人向けの練習の点数は使わない） */
function competencyAverage(summary: TalentSummary | null): number | null {
  const scores = (summary?.competencies ?? [])
    .map((c) => c.score)
    .filter((n): n is number => typeof n === "number");
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
