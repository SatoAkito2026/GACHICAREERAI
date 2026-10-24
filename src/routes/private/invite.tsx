import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Gift, Share2 } from "lucide-react";
import { toast } from "sonner";
import { PrivateShell } from "@/components/ModeShell";
import { talentApi } from "@/components/talent/TalentUI";

export const Route = createFileRoute("/private/invite")({
  head: () => ({ meta: [{ title: "友だちを招待｜ガチキャリAI" }] }),
  component: InvitePage,
});

type Info = {
  code: string | null;
  link: string | null;
  invited: number;
  rewarded: number;
  bonus: number;
  bonusPerReferral: number;
};

const SHARE_TEXT =
  "AIの面接官と模擬面接ができる「ガチキャリAI」、評価がガチで参考になるよ。このリンクから登録すると練習のボーナスがもらえる👇";

function InvitePage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void talentApi<Info>("/api/referral").then((r) => {
      if (r.ok) setInfo(r.data);
      else setError(r.data.error ?? "読み込みに失敗しました");
    });
  }, []);

  const link = info?.link ?? "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("招待リンクをコピーしました");
    } catch {
      toast.error("コピーできませんでした。リンクを長押ししてコピーしてください");
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "ガチキャリAI", text: SHARE_TEXT, url: link });
      } catch {
        // 共有をやめたときは何もしない
      }
    } else {
      void copy();
    }
  };
  const lineUrl = `https://line.me/R/share?text=${encodeURIComponent(`${SHARE_TEXT}\n${link}`)}`;
  const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(link)}`;

  return (
    <PrivateShell>
      <main className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-8">
        <div>
          <h1
            className="flex items-center gap-2 text-[22px]"
            style={{ color: "#F0F0F0", fontWeight: 800 }}
          >
            <Gift size={24} color="#C8FF00" /> 友だちを招待
          </h1>
          <p className="mt-2 text-[13px]" style={{ color: "#AAAAAA", lineHeight: 1.8 }}>
            招待リンクから友だちが登録して、練習を1回終えると、
            <b style={{ color: "#C8FF00" }}>
              あなたと友だちの両方に練習のボーナスが{info?.bonusPerReferral ?? 3}回
            </b>
            ずつ入ります。ボーナスは、その日・その月の練習の上限を超えたときに使われます。
          </p>
        </div>

        {!info ? (
          <p className="text-[13px]" style={{ color: error ? "#FF6B6B" : "#888" }}>
            {error || "読み込み中..."}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Tile label="招待した人" value={`${info.invited}人`} />
              <Tile label="練習を始めた人" value={`${info.rewarded}人`} />
              <Tile label="ボーナスの残り" value={`${info.bonus}回`} accent />
            </div>

            <div
              className="flex flex-col gap-3 rounded-2xl p-5"
              style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
            >
              <p className="text-[12px]" style={{ color: "#888" }}>
                あなたの招待リンク
              </p>
              <p
                className="break-all rounded-lg px-3 py-2.5 text-[13px]"
                style={{ background: "#0F0F0F", color: "#F0F0F0", border: "1px solid #2A2A2A" }}
              >
                {link}
              </p>
              <button
                type="button"
                onClick={() => void share()}
                className="flex items-center justify-center gap-2 rounded-xl py-3 text-[15px]"
                style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 800 }}
              >
                <Share2 size={18} /> 招待リンクを送る
              </button>
              <div className="grid grid-cols-3 gap-2">
                <a
                  href={lineUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl py-2.5 text-center text-[13px]"
                  style={{ background: "#06C755", color: "#fff", fontWeight: 700 }}
                >
                  LINE
                </a>
                <a
                  href={xUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl py-2.5 text-center text-[13px]"
                  style={{
                    background: "#000",
                    color: "#fff",
                    fontWeight: 700,
                    border: "1px solid #333",
                  }}
                >
                  X
                </a>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="flex items-center justify-center gap-1 rounded-xl py-2.5 text-[13px]"
                  style={{ border: "1px solid #333", color: "#DDD", fontWeight: 700 }}
                >
                  <Copy size={14} /> コピー
                </button>
              </div>
            </div>
            <p className="text-[11px]" style={{ color: "#666", lineHeight: 1.7 }}>
              ボーナスは練習の回数だけで、お金やポイントとは交換できません。登録から7日以内に招待リンクを使った新しいアカウントだけが対象です。
            </p>
          </>
        )}
      </main>
    </PrivateShell>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl p-3" style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}>
      <p className="text-[11px]" style={{ color: "#888" }}>
        {label}
      </p>
      <p
        className="mt-1 text-[18px]"
        style={{ color: accent ? "#C8FF00" : "#F0F0F0", fontWeight: 800 }}
      >
        {value}
      </p>
    </div>
  );
}
