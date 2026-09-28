import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { BusinessShell } from "@/components/ModeShell";
import {
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

export const Route = createFileRoute("/business/company/messages")({
  head: () => ({ meta: [{ title: "面談・メッセージ｜ガチキャリAI Business" }] }),
  validateSearch: (s: Record<string, unknown>): { id?: string } =>
    typeof s.id === "string" ? { id: s.id } : {},
  component: CompanyMessagesPage,
});

type Req = {
  id: string;
  status: string;
  message: string;
  createdAt: string;
  respondedAt: string | null;
  code: string | null;
  name: string;
  headline: string | null;
  unread: number;
};

function CompanyMessagesPage() {
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const [list, setList] = useState<Req[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await talentApi<{ requests: Req[] }>("/api/talent/contacts?as=company");
    if (r.ok) setList(r.data.requests);
    else setError(r.data.error ?? "読み込みに失敗しました");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = list?.find((r) => r.id === id) ?? null;

  return (
    <BusinessShell>
      <PageFrame
        title="面談・メッセージ"
        subtitle="面談を申し込んだ人の一覧です。承諾された人とは、ここで直接メッセージをやり取りできます。"
      >
        {!list ? (
          error ? (
            <ErrorText>{error}</ErrorText>
          ) : (
            <Loading />
          )
        ) : selected ? (
          <>
            <button
              type="button"
              onClick={() => void navigate({ to: "/business/company/messages", search: {} })}
              className="self-start text-[13px]"
              style={{ color: C.muted }}
            >
              ← 一覧へ戻る
            </button>
            <Card
              title={`${selected.name} さん`}
              right={
                <div className="flex items-center gap-3">
                  {selected.code && (
                    <Link
                      to="/business/company/talent/$code"
                      params={{ code: selected.code }}
                      className="text-[13px]"
                      style={{ color: C.accent }}
                    >
                      プロフィールを見る
                    </Link>
                  )}
                  <StatusBadge status={selected.status} />
                </div>
              }
            >
              <MessageThread requestId={selected.id} onChanged={() => void load()} />
            </Card>
          </>
        ) : list.length === 0 ? (
          <Card>
            <p className="text-[14px]" style={{ color: C.sub }}>
              まだ面談の申し込みはありません。
            </p>
            <Link
              to="/business/company/talent"
              className="mt-3 inline-block text-[14px]"
              style={{ color: C.accent }}
            >
              人材を探す →
            </Link>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() =>
                  void navigate({ to: "/business/company/messages", search: { id: r.id } })
                }
                className="rounded-2xl p-4 text-left transition-colors hover:border-[#C8FF00]"
                style={{ background: C.card, border: `1px solid ${C.border}` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: C.text, fontSize: 15, fontWeight: 700 }}>
                    {r.name} さん
                  </span>
                  <div className="flex items-center gap-2">
                    {r.unread > 0 && <Tag color={C.accent}>未読 {r.unread}</Tag>}
                    <StatusBadge status={r.status} />
                  </div>
                </div>
                {r.headline && (
                  <p className="mt-1 text-[12px]" style={{ color: C.muted }}>
                    {r.headline}
                  </p>
                )}
                <p className="mt-2 text-[11px]" style={{ color: C.muted }}>
                  {new Date(r.createdAt).toLocaleDateString("ja-JP")} に申し込み
                </p>
              </button>
            ))}
          </div>
        )}
      </PageFrame>
    </BusinessShell>
  );
}
