import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TiktokScene, buildTimeline, type StudioJobData } from "@/components/studio/TiktokScene";

// TikTok 動画の撮影用の画面。台本は撮影側（scripts/tiktok/render.mjs）が window.__STUDIO_JOB__ に入れる
export const Route = createFileRoute("/studio/tiktok")({
  head: () => ({
    meta: [{ title: "撮影用｜ガチキャリAI" }, { name: "robots", content: "noindex" }],
  }),
  component: StudioPage,
});

type StudioWindow = Window & {
  __STUDIO_JOB__?: StudioJobData;
  __studioReady?: boolean;
  __studioTimeline?: ReturnType<typeof buildTimeline>;
};

function StudioPage() {
  const [job, setJob] = useState<StudioJobData | null>(null);

  useEffect(() => {
    const w = window as StudioWindow;
    if (!w.__STUDIO_JOB__) return;
    w.__studioTimeline = buildTimeline(w.__STUDIO_JOB__);
    setJob(w.__STUDIO_JOB__);
  }, []);

  if (!job) {
    return <p style={{ padding: 24, color: "#888" }}>撮影用の画面です。</p>;
  }
  return (
    <div style={{ background: "#000", minHeight: "100vh" }}>
      <TiktokScene
        job={job}
        onReady={() => {
          // 締めで出すロゴも読み込み終わってから撮り始める
          const logo = new Image();
          logo.src = "/brand/logo.webp";
          void Promise.all([document.fonts.ready, logo.decode().catch(() => undefined)]).then(
            () => {
              (window as StudioWindow).__studioReady = true;
            },
          );
        }}
      />
    </div>
  );
}
