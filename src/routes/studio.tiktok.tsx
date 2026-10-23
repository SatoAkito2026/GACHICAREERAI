import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TiktokScene, buildTimeline, type StudioJobData } from "@/components/studio/TiktokScene";
import {
  RewriteScene,
  buildRewriteTimeline,
  type RewriteJobData,
} from "@/components/studio/RewriteScene";

// TikTok 動画の撮影用の画面。台本は撮影側（scripts/tiktok/render.mjs）が window.__STUDIO_JOB__ に入れる
export const Route = createFileRoute("/studio/tiktok")({
  head: () => ({
    meta: [{ title: "撮影用｜ガチキャリAI" }, { name: "robots", content: "noindex" }],
  }),
  component: StudioPage,
});

type AnyJob = StudioJobData | RewriteJobData;
type StudioWindow = Window & {
  __STUDIO_JOB__?: AnyJob;
  __studioReady?: boolean;
  __studioTimeline?: { lines: { start: number; rate: number }[]; total: number };
};

const isRewrite = (job: AnyJob): job is RewriteJobData =>
  (job as RewriteJobData).format === "rewrite";

function StudioPage() {
  const [job, setJob] = useState<AnyJob | null>(null);

  useEffect(() => {
    const w = window as StudioWindow;
    const j = w.__STUDIO_JOB__;
    if (!j) return;
    // 撮影側は、この時刻表どおりに音声を並べる
    w.__studioTimeline = isRewrite(j) ? buildRewriteTimeline(j) : buildTimeline(j);
    setJob(j);
  }, []);

  if (!job) {
    return <p style={{ padding: 24, color: "#888" }}>撮影用の画面です。</p>;
  }
  const onReady = () => {
    // 締めで出すロゴも読み込み終わってから撮り始める
    const logo = new Image();
    logo.src = "/brand/logo.webp";
    void Promise.all([document.fonts.ready, logo.decode().catch(() => undefined)]).then(() => {
      (window as StudioWindow).__studioReady = true;
    });
  };
  return (
    <div style={{ background: "#000", minHeight: "100vh" }}>
      {isRewrite(job) ? (
        <RewriteScene job={job} onReady={onReady} />
      ) : (
        <TiktokScene job={job} onReady={onReady} />
      )}
    </div>
  );
}
