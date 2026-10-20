/**
 * 本人：ガチキャリポイント（企業にコインで見られると、その1/4が入る。1ポイント＝1円）
 * 今はライト・プロの月額の支払いに使える。
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Gift } from "lucide-react";
import { usePlan } from "@/hooks/use-plan";
import { talentApi } from "@/components/talent/TalentUI";

type Row = { points: number; reason: string; created_at: string };

const REASON: Record<string, string> = {
  unlock_share: "企業があなたを見ました",
  plan_payment: "月額の支払いに使用",
  refund: "戻し",
  adjust: "調整",
};

export function PointsCard() {
  const { plan, refresh } = usePlan();
  const [data, setData] = useState<{ balance: number; history: Row[] } | null>(null);
  const [applying, setApplying] = useState(false);

  const load = () =>
    void talentApi<{ balance: number; history: Row[] }>("/api/points").then((r) => {
      if (r.ok) setData(r.data);
    });
  useEffect(load, []);

  const subscribed = plan === "individual_light" || plan === "individual_pro";

  const apply = async () => {
    setApplying(true);
    const r = await talentApi<{ used: number }>("/api/points", { action: "apply" });
    setApplying(false);
    if (!r.ok) return void toast.error(r.data.error ?? "使えませんでした");
    toast.success(`${r.data.used.toLocaleString()}ポイントを次の支払いに使います`);
    load();
    void refresh();
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl p-5"
      style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2" style={{ color: "#F0F0F0", fontWeight: 700 }}>
          <Gift size={18} color="#C8FF00" /> ガチキャリポイント
        </span>
        <span style={{ color: "#C8FF00", fontSize: 22, fontWeight: 800 }}>
          {data ? data.balance.toLocaleString() : "—"}
          <span className="ml-1 text-[12px]">pt</span>
        </span>
      </div>
      <p className="text-[12px]" style={{ color: "#999999", lineHeight: 1.7 }}>
        プロフィールを公開して、企業があなたの詳しい評価を見ると、その料金の1/4がポイントで入ります（1pt＝1円）。ライト・プロの月額の支払いに使えます。
      </p>
      {data &&
        data.balance > 0 &&
        (subscribed ? (
          <button
            type="button"
            disabled={applying}
            onClick={() => void apply()}
            className="rounded-xl py-2.5 text-[14px] disabled:opacity-50"
            style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
          >
            {applying ? "処理中..." : "次の月額の支払いに使う"}
          </button>
        ) : (
          <Link
            to="/pricing"
            className="rounded-xl py-2.5 text-center text-[14px]"
            style={{ border: "1px solid #C8FF00", color: "#C8FF00", fontWeight: 700 }}
          >
            ライト・プロに申し込むときに使う →
          </Link>
        ))}
      {data && data.history.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[12px]" style={{ color: "#888888" }}>
            履歴を見る
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-[12px]" style={{ color: "#CCCCCC" }}>
            {data.history.map((h, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {new Date(h.created_at).toLocaleDateString("ja-JP")}{" "}
                  {REASON[h.reason] ?? h.reason}
                </span>
                <span style={{ color: h.points > 0 ? "#C8FF00" : "#FF8A8A" }}>
                  {h.points > 0 ? "+" : ""}
                  {h.points.toLocaleString()}pt
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
