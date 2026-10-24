/**
 * 練習の録画を再生する。ブラウザで録った動画（webm）には全体の長さが入っていないため、
 * そのまま流すと長さがどんどん伸びていく。最初に一度最後まで飛ばして長さを確かめ、
 * それまでは「読み込み中」を出す。
 */
import { useRef, useState, type CSSProperties } from "react";

export function RecordingVideo({
  src,
  className,
  style,
}: {
  src: string;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  const onLoadedMetadata = () => {
    const v = ref.current;
    if (!v) return;
    if (Number.isFinite(v.duration) && v.duration > 0) {
      setReady(true);
      return;
    }
    // 長さが分からない動画：いちばん最後まで飛ばすと長さが決まるので、決まったら先頭に戻す
    const fix = () => {
      if (!Number.isFinite(v.duration)) return;
      v.removeEventListener("timeupdate", fix);
      v.removeEventListener("durationchange", fix);
      v.currentTime = 0;
      setReady(true);
    };
    v.addEventListener("timeupdate", fix);
    v.addEventListener("durationchange", fix);
    v.currentTime = 1e101;
  };

  return (
    <div className="relative">
      <video
        ref={ref}
        src={src}
        controls={ready}
        preload="auto"
        playsInline
        onLoadedMetadata={onLoadedMetadata}
        className={className}
        style={{ ...style, opacity: ready ? 1 : 0.35 }}
      />
      {!ready && (
        <div
          className="absolute inset-0 flex items-center justify-center text-[13px]"
          style={{ color: "#CCCCCC", fontWeight: 700 }}
        >
          録画を読み込み中…
        </div>
      )}
    </div>
  );
}
