"""
面接官アバターの素材を、AIで生成した面接官の動画（Kling）から作る。

  python scripts/avatar/build_avatar.py <元動画.mov> <ffmpeg のパス>

出力:
  public/avatar/idle.mp4, idle.webm  … 聞いている動画（前半を 順再生→逆再生 でつないだ継ぎ目のないループ）
  public/avatar/mouths.png           … 口の形 4 段階（少し開け〜大きく開け）。フレーム0の顔の位置に合わせてある
  src/components/interviewer-avatar-data.ts … 各フレームの顔のずれ（口の画像を顔の動きに追従させる）

必要なもの: opencv-python-headless, numpy
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
FPS = 24
IDLE_END = 70  # 0〜2.9秒（顔のずれが小さく、口を閉じている区間）
MOUTH_FRAMES = [82, 90, 94, 104]  # 話している区間から選んだ、口の開きが違う4コマ
# 顔の位置追跡に使う枠（鼻とほっぺ。口やまばたきで変わらない所）
TMPL = (395, 280, 110, 70)
# 口の画像を切り出す枠（フレーム0の座標）と、なじませる楕円
MOUTH_BOX = (380, 330, 140, 100)
MOUTH_ELLIPSE = (450, 375, 58, 34)


def track(frames):
    g0 = cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY)
    x0, y0, w, h = TMPL
    tmpl = g0[y0 : y0 + h, x0 : x0 + w]
    offsets = []
    for f in frames:
        g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
        win = g[y0 - 40 : y0 + h + 40, x0 - 40 : x0 + w + 40]
        r = cv2.matchTemplate(win, tmpl, cv2.TM_CCOEFF_NORMED)
        _, _, _, (x, y) = cv2.minMaxLoc(r)

        def sub(a, b, c):
            d = a - 2 * b + c
            return 0.0 if d == 0 else 0.5 * (a - c) / d

        dx = sub(r[y, x - 1], r[y, x], r[y, x + 1]) if 0 < x < r.shape[1] - 1 else 0.0
        dy = sub(r[y - 1, x], r[y, x], r[y + 1, x]) if 0 < y < r.shape[0] - 1 else 0.0
        offsets.append((float(x + dx - 40), float(y + dy - 40)))
    return offsets


def mouth_sprite(frame, offset):
    ox, oy = offset
    m = np.float32([[1, 0, -ox], [0, 1, -oy]])
    aligned = cv2.warpAffine(frame, m, (frame.shape[1], frame.shape[0]), flags=cv2.INTER_LINEAR)
    bx, by, bw, bh = MOUTH_BOX
    crop = aligned[by : by + bh, bx : bx + bw]
    cx, cy, rx, ry = MOUTH_ELLIPSE
    yy, xx = np.mgrid[0:bh, 0:bw].astype(np.float32)
    d = np.sqrt(((xx + bx - cx) / rx) ** 2 + ((yy + by - cy) / ry) ** 2)
    alpha = np.clip((1.0 - d) / 0.35, 0, 1)
    alpha = alpha * alpha * (3 - 2 * alpha)  # smoothstep
    return np.dstack([crop, (alpha * 255).astype(np.uint8)])


def main():
    src, ffmpeg = sys.argv[1], sys.argv[2]
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([ffmpeg, "-loglevel", "error", "-i", src, "-vsync", "0", f"{tmp}/f%04d.png"], check=True)
        files = sorted(Path(tmp).glob("f*.png"))
        frames = [cv2.imread(str(f)) for f in files]
        offsets = track(frames)

        # 聞いている動画: 0..IDLE_END-1 → IDLE_END-2..1（順再生→逆再生で継ぎ目なし）
        order = list(range(IDLE_END)) + list(range(IDLE_END - 2, 0, -1))
        for n, i in enumerate(order):
            cv2.imwrite(f"{tmp}/idle{n:04d}.png", frames[i])
        out = ROOT / "public" / "avatar"
        out.mkdir(parents=True, exist_ok=True)
        common = [ffmpeg, "-loglevel", "error", "-y", "-framerate", str(FPS), "-i", f"{tmp}/idle%04d.png", "-an"]
        subprocess.run(
            common + ["-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-crf", "21",
                      "-preset", "slow", "-movflags", "+faststart", str(out / "idle.mp4")],
            check=True,
        )
        subprocess.run(
            common + ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-row-mt", "1", str(out / "idle.webm")],
            check=True,
        )
        cv2.imwrite(str(out / "poster.jpg"), frames[0], [cv2.IMWRITE_JPEG_QUALITY, 88])

        sprites = [mouth_sprite(frames[i], offsets[i]) for i in MOUTH_FRAMES]
        cv2.imwrite(str(out / "mouths.png"), np.hstack(sprites))

        idle_offsets = [offsets[i] for i in order]
        bx, by, bw, bh = MOUTH_BOX
        data = {
            "fps": FPS,
            "videoSize": [frames[0].shape[1], frames[0].shape[0]],
            "mouthBox": [bx, by, bw, bh],
            "mouthCount": len(MOUTH_FRAMES),
            "offsets": [[round(x, 2), round(y, 2)] for x, y in idle_offsets],
        }
        ts = (
            "// 自動生成: scripts/avatar/build_avatar.py（手で編集しない）\n"
            "// 聞いている動画の各フレームで、顔がフレーム0からどれだけずれているか（px）\n"
            f"export const AVATAR_DATA = {json.dumps(data)} as const;\n"
        )
        (ROOT / "src" / "components" / "interviewer-avatar-data.ts").write_text(ts)
        print("frames:", len(order), "mouths:", len(sprites))


if __name__ == "__main__":
    main()
