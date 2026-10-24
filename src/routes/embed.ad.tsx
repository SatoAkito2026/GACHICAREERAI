import { createFileRoute } from "@tanstack/react-router";

/**
 * ブログ・記事の横などに埋め込む広告（iframe で読み込む）。
 * <iframe src="https://gachicareer-ai.akitogroup.jp/embed/ad" width="300" height="600" ...>
 * 押すと新しいタブでトップページを開く。
 */
export const Route = createFileRoute("/embed/ad")({
  head: () => ({
    meta: [{ title: "ガチキャリAI" }, { name: "robots", content: "noindex" }],
  }),
  component: EmbedAd,
});

const ACCENT = "#C8FF00";
const TARGET = "https://gachicareer-ai.akitogroup.jp/?from=embed";

function EmbedAd() {
  return (
    <a
      href={TARGET}
      target="_blank"
      rel="noopener"
      className="flex h-screen w-full flex-col overflow-hidden"
      style={{
        background: "#0B0B0B",
        color: "#F0F0F0",
        fontFamily: `"Noto Sans JP", "Hiragino Sans", sans-serif`,
        textDecoration: "none",
      }}
    >
      <div className="flex items-center gap-2 px-3 pt-3">
        <img src="/icons/icon-192.png" alt="" className="h-6 w-6 rounded-md" />
        <span className="text-[13px]" style={{ fontWeight: 800 }}>
          ガチキャリAI
        </span>
        <span
          className="ml-auto rounded px-1.5 py-0.5 text-[9px]"
          style={{ background: "#232323", color: "#999" }}
        >
          PR
        </span>
      </div>
      <p className="px-3 pt-2 text-[17px] leading-snug" style={{ fontWeight: 900 }}>
        AIの面接官と、
        <span style={{ color: ACCENT }}>本番さながら</span>に練習
      </p>
      <div className="relative mx-3 mt-2 min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
        <video
          src="/videos/ad.mp4"
          poster="/videos/ad-poster.jpg"
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="px-3 pb-3 pt-2.5">
        <p className="text-[11px] leading-relaxed" style={{ color: "#AAAAAA" }}>
          声で話すだけで、発言を根拠に採点。間・声・目線までチェック。
        </p>
        <span
          className="mt-2 flex h-10 items-center justify-center rounded-full text-[14px]"
          style={{ background: ACCENT, color: "#0F0F0F", fontWeight: 900 }}
        >
          無料ではじめる
        </span>
      </div>
    </a>
  );
}
