import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PrivateShell } from "@/components/ModeShell";
import {
  Button,
  C,
  Card,
  ErrorText,
  Loading,
  MessageThread,
  PageFrame,
  StatusBadge,
  Tag,
  talentApi,
} from "@/components/talent/TalentUI";

export const Route = createFileRoute("/private/individual/offers")({
  head: () => ({ meta: [{ title: "オファー｜ガチキャリAI" }] }),
  validateSearch: (s: Record<string, unknown>): { id?: string } =>
    typeof s.id === "string" ? { id: s.id } : {},
  component: OffersPage,
});

type Offer = {
  id: string;
  status: string;
  message: string;
  createdAt: string;
  respondedAt: string | null;
  unread: number;
  company: {
    name: string;
    industry: string | null;
    employeeCount: string | null;
    address: string | null;
    description: string | null;
    positions: string | null;
    remotePolicy: string | null;
    salaryRange: string | null;
  };
};

function OffersPage() {
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const r = await talentApi<{ requests: Offer[] }>("/api/talent/contacts?as=candidate");
    if (r.ok) setOffers(r.data.requests);
    else setError(r.data.error ?? "読み込みに失敗しました");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const respond = async (offer: Offer, accept: boolean) => {
    if (
      !accept &&
      !window.confirm(
        `${offer.company.name} からの申し込みを辞退しますか？（理由は相手に伝わりません）`,
      )
    )
      return;
    setBusy(offer.id);
    const r = await talentApi("/api/talent/contacts", {
      action: "respond",
      requestId: offer.id,
      accept,
    });
    setBusy("");
    if (!r.ok) return setError(r.data.error ?? "失敗しました");
    await load();
  };

  const selected = offers?.find((o) => o.id === id) ?? null;

  return (
    <PrivateShell>
      <PageFrame
        title="オファー"
        subtitle="プロフィールを見た企業からの面談の申し込みです。承諾すると企業と直接メッセージでやり取りできます。辞退しても理由は伝わりません。"
      >
        {!offers ? (
          error ? (
            <ErrorText>{error}</ErrorText>
          ) : (
            <Loading />
          )
        ) : selected ? (
          <>
            <button
              type="button"
              onClick={() => void navigate({ to: "/private/individual/offers", search: {} })}
              className="self-start text-[13px]"
              style={{ color: C.muted }}
            >
              ← 一覧へ戻る
            </button>
            <Card title={selected.company.name} right={<StatusBadge status={selected.status} />}>
              <CompanyInfo offer={selected} />
              {selected.status === "pending" && (
                <div className="mt-5 flex gap-3">
                  <Button
                    onClick={() => void respond(selected, true)}
                    loading={busy === selected.id}
                  >
                    承諾してメッセージする
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void respond(selected, false)}
                    disabled={busy === selected.id}
                  >
                    辞退する
                  </Button>
                </div>
              )}
            </Card>
            {selected.status === "accepted" && (
              <Card title="メッセージ">
                <MessageThread requestId={selected.id} onChanged={() => void load()} />
              </Card>
            )}
          </>
        ) : offers.length === 0 ? (
          <Card>
            <p className="text-[14px]" style={{ color: C.sub, lineHeight: 1.8 }}>
              まだ申し込みは届いていません。プロフィールを公開して模擬面接を続けると、企業の目に留まりやすくなります。
            </p>
            <div className="mt-4 flex gap-3">
              <Link to="/private/individual/talent" style={{ color: C.accent, fontSize: 14 }}>
                公開プロフィールを確認 →
              </Link>
              <Link to="/private/individual/practice" style={{ color: C.accent, fontSize: 14 }}>
                模擬面接を受ける →
              </Link>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {offers.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() =>
                  void navigate({ to: "/private/individual/offers", search: { id: o.id } })
                }
                className="rounded-2xl p-4 text-left transition-colors hover:border-[#C8FF00]"
                style={{ background: C.card, border: `1px solid ${C.border}` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>
                    {o.company.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {o.unread > 0 && <Tag color={C.accent}>未読 {o.unread}</Tag>}
                    <StatusBadge status={o.status} />
                  </div>
                </div>
                <p className="mt-1 text-[12px]" style={{ color: C.muted }}>
                  {[o.company.industry, o.company.positions && `募集：${o.company.positions}`]
                    .filter(Boolean)
                    .join(" ・ ")}
                </p>
                <p className="mt-2 line-clamp-2 text-[13px]" style={{ color: C.sub }}>
                  {o.message}
                </p>
                <p className="mt-2 text-[11px]" style={{ color: C.muted }}>
                  {new Date(o.createdAt).toLocaleDateString("ja-JP")} に届きました
                </p>
              </button>
            ))}
          </div>
        )}
        {selected && <ErrorText>{error}</ErrorText>}
      </PageFrame>
    </PrivateShell>
  );
}

function CompanyInfo({ offer }: { offer: Offer }) {
  const c = offer.company;
  const rows: [string, string | null][] = [
    ["業種", c.industry],
    ["従業員数", c.employeeCount],
    ["所在地", c.address],
    ["募集職種", c.positions],
    ["働き方", c.remotePolicy],
    ["給与", c.salaryRange],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-lg px-3 py-2.5 text-[14px]"
        style={{ background: C.card2, color: C.text, whiteSpace: "pre-wrap", lineHeight: 1.7 }}
      >
        {offer.message}
      </div>
      {c.description && (
        <p className="text-[13px]" style={{ color: C.sub, lineHeight: 1.7 }}>
          {c.description}
        </p>
      )}
      <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt style={{ color: C.muted }}>{k}</dt>
              <dd style={{ color: C.sub }}>{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
