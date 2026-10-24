import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BusinessShell } from "@/components/ModeShell";
import {
  C,
  ErrorText,
  Loading,
  PageFrame,
  StatusBadge,
  talentApi,
} from "@/components/talent/TalentUI";

export const Route = createFileRoute("/business/company/purchased")({
  head: () => ({ meta: [{ title: "購入した人材｜ガチキャリAI Business" }] }),
  component: PurchasedPage,
});

type Person = {
  code: string;
  displayName: string;
  headline: string | null;
  desiredJobs: string | null;
  boughtResults: number | null;
  purchasedAt: string;
  viaApplication: boolean;
  lastPracticeAt: string | null;
  contactStatus: string | null;
};

function date(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("ja-JP") : "—";
}

function PurchasedPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState("");
  const [needsCompany, setNeedsCompany] = useState(false);

  useEffect(() => {
    void talentApi<{ people: Person[] }>("/api/talent/purchased").then((r) => {
      if (r.ok) {
        setPeople(r.data.people);
      } else {
        setPeople([]);
        setError(r.data.error ?? "読み込みに失敗しました");
        setNeedsCompany(!!r.data.needsCompany);
      }
    });
  }, []);

  return (
    <BusinessShell>
      <PageFrame
        width={1000}
        title="購入した人材"
        subtitle="コインで見た人と、求人に応募してきた人の一覧です。開くと、面接ごとの採用担当者向けの評価・会話・録画（本人が許可した場合）を見られます。"
      >
        {!people ? (
          <Loading />
        ) : error ? (
          <div className="flex flex-col gap-2">
            <ErrorText>{error}</ErrorText>
            {needsCompany && (
              <Link to="/business/company/settings" style={{ color: C.accent, fontSize: 14 }}>
                設定画面へ →
              </Link>
            )}
          </div>
        ) : people.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-[14px]" style={{ color: C.muted }}>
              まだコインで見た人はいません。
            </p>
            <Link to="/business/company/talent" style={{ color: C.accent, fontSize: 14 }}>
              人材を探す →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {people.map((p) => (
              <Link
                key={p.code}
                to="/business/company/talent/$code"
                params={{ code: p.code }}
                className="flex flex-col gap-2 rounded-2xl p-4 transition-colors hover:border-[#C8FF00] md:flex-row md:items-center md:gap-5"
                style={{ background: C.card, border: `1px solid ${C.border}` }}
              >
                <div className="min-w-0 flex-1">
                  <p style={{ color: C.text, fontSize: 15, fontWeight: 700 }}>
                    {p.displayName}
                    <span className="ml-2 text-[12px]" style={{ color: C.muted, fontWeight: 400 }}>
                      {p.headline || ""}
                    </span>
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: C.muted }}>
                    {p.desiredJobs ? `希望：${p.desiredJobs} ・ ` : ""}
                    最後の練習 {date(p.lastPracticeAt)} ・ {p.viaApplication ? "応募" : "購入"}{" "}
                    {date(p.purchasedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={p.contactStatus} />
                  <div className="text-right">
                    <p style={{ color: C.accent, fontSize: 18, fontWeight: 800, lineHeight: 1 }}>
                      {p.boughtResults === null ? "すべて" : `${p.boughtResults}件`}
                    </p>
                    <p className="text-[10px]" style={{ color: C.muted }}>
                      見られる結果
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </PageFrame>
    </BusinessShell>
  );
}
