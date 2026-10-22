/**
 * 練習の評価を、SNSに載せられる画像（1080×1350）にしてシェアする。
 * 名前は入れない。シェアの文には本人の招待リンクをつける（友だち紹介につながる）。
 */
import { useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { talentApi } from "@/components/talent/TalentUI";

type Competency = { label: string; score: number | null };

const W = 1080;
const H = 1350;
const FONT = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif`;
const ACCENT = "#C8FF00";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCard(opts: {
  jobType: string | null;
  date: string;
  score: number | null;
  competencies: Competency[];
}): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0F0F0F";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, W, 14);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#F0F0F0";
  ctx.font = `800 46px ${FONT}`;
  ctx.fillText("ガチキャリAI", 80, 130);
  ctx.fillStyle = "#888888";
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText("AI模擬面接の結果", 80, 180);

  ctx.fillStyle = "#CCCCCC";
  ctx.font = `600 34px ${FONT}`;
  const d = new Date(opts.date);
  ctx.fillText(
    `${opts.jobType || "模擬面接"}　${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
    80,
    260,
  );

  // 大きな数字：総合の点数（100点満点）と、7つの評価の平均（5点満点）
  const scored = opts.competencies.filter((c) => typeof c.score === "number");
  const avg = scored.length ? scored.reduce((a, c) => a + (c.score ?? 0), 0) / scored.length : null;
  roundRect(ctx, 80, 300, W - 160, 230, 28);
  ctx.fillStyle = "#1A1A1A";
  ctx.fill();
  ctx.fillStyle = "#888888";
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText("総合", 130, 370);
  ctx.fillText("7つの評価の平均", 590, 370);
  ctx.fillStyle = ACCENT;
  ctx.font = `800 120px ${FONT}`;
  ctx.fillText(opts.score != null ? `${opts.score}` : "—", 125, 490);
  const sw = ctx.measureText(opts.score != null ? `${opts.score}` : "—").width;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText("点", 135 + sw, 490);
  ctx.fillStyle = "#F0F0F0";
  ctx.font = `800 120px ${FONT}`;
  ctx.fillText(avg != null ? avg.toFixed(1) : "—", 585, 490);
  const aw = ctx.measureText(avg != null ? avg.toFixed(1) : "—").width;
  ctx.fillStyle = "#888888";
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText("/ 5", 600 + aw, 490);

  // 7つの評価の横棒
  let y = 610;
  for (const c of opts.competencies.slice(0, 7)) {
    // 長い名前（コミュニケーション力など）は、棒に重ならないよう文字を小さくする
    ctx.fillStyle = "#CCCCCC";
    let size = 30;
    ctx.font = `600 ${size}px ${FONT}`;
    while (size > 18 && ctx.measureText(c.label).width > 230) {
      size -= 2;
      ctx.font = `600 ${size}px ${FONT}`;
    }
    ctx.fillText(c.label, 80, y + 26);
    const barX = 330;
    const barW = W - 80 - barX - 90;
    roundRect(ctx, barX, y, barW, 30, 15);
    ctx.fillStyle = "#262626";
    ctx.fill();
    if (typeof c.score === "number" && c.score > 0) {
      roundRect(ctx, barX, y, Math.max(30, (barW * c.score) / 5), 30, 15);
      ctx.fillStyle = ACCENT;
      ctx.fill();
    }
    ctx.fillStyle = "#F0F0F0";
    ctx.font = `700 30px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(typeof c.score === "number" ? c.score.toFixed(1) : "—", W - 80, y + 26);
    ctx.textAlign = "left";
    y += 72;
  }

  ctx.fillStyle = "#F0F0F0";
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText("AIの面接官と、本番さながらに練習しよう", 80, H - 130);
  ctx.fillStyle = ACCENT;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText("gachicareer-ai.akitogroup.jp", 80, H - 75);
  return canvas;
}

export function ShareResultButton({
  jobType,
  date,
  score,
  competencies,
}: {
  jobType: string | null;
  date: string;
  score: number | null;
  competencies: Competency[];
}) {
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const canvas = drawCard({ jobType, date, score, competencies });
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) throw new Error("image");
      const ref = await talentApi<{ link: string | null }>("/api/referral");
      const link = (ref.ok && ref.data.link) || "https://gachicareer-ai.akitogroup.jp";
      const text = `AIの面接官と模擬面接してみた結果🔥\n#ガチキャリAI #就活 #面接練習\n${link}`;
      const file = new File([blob], "gachicareer-result.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
      // 画像のシェアができない端末（パソコンなど）：画像を保存して、文をコピーする
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "gachicareer-result.png";
      a.click();
      URL.revokeObjectURL(url);
      await navigator.clipboard?.writeText(text).catch(() => undefined);
      toast.success("画像を保存しました。投稿の文はコピーしてあります");
    } catch (e) {
      if ((e as { name?: string })?.name !== "AbortError") {
        console.error(e);
        toast.error("画像を作れませんでした");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => {
        e.preventDefault();
        void share();
      }}
      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] disabled:opacity-50"
      style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
    >
      <Share2 size={14} /> {busy ? "作成中..." : "結果を画像でシェア"}
    </button>
  );
}
