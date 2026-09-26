"""
面接官アバターの「顔の骨組み（リグ）」を作る。

  python scripts/avatar/build_rig.py <参考動画.mov> <ffmpeg のパス> <口を開けた写真.webp>

- 写真（public/avatar/base.webp）の顔に 478 点の網目を置き、外側に髪・背景用の網目を足す
- 参考動画は「顔の動き方のお手本」としてだけ使う（動画の絵は使わない）:
    * 口の開き・横幅が変わったとき、顔の各点がどう動くか（あご・ほっぺ・唇が一緒に動く量）を学習する
    * 聞いているときの首の傾き・位置、まばたき、眉の動きを数値として取り出す
- 口の中（歯・舌）は、同じ構図で口を開けた写真から取り、開いた口の形に合わせて貼る

出力: public/avatar/rig.json（ブラウザが読み込む）、public/avatar/mouth-inside.webp
必要なもの: mediapipe==0.10.14, opencv-python-headless, numpy
"""
import collections
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
AVATAR = ROOT / "public" / "avatar"
FPS = 24
IDLE_END = 70  # 参考動画の 0〜2.9 秒（聞いている区間）

# 頭の動きを測るときに使う、表情で動かない点（鼻筋・おでこ・頬骨・目尻・こめかみ）
STABLE = [6, 168, 197, 195, 10, 151, 9, 234, 454, 93, 323, 33, 263, 127, 356, 8]
# 首の動きを測る点（目尻はまばたきで動いて首が動いたように見えるので除く）
POSE_POINTS = [6, 168, 197, 195, 10, 151, 9, 234, 454, 93, 323, 127, 356, 8]
INNER_LIPS = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]
EYES = [
    [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
    [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249],
]
IRIS_CENTERS = [468, 473]

# 母音ごとの口の形（参考動画で測った「口の開き」と「口の横幅の変化」、目の間の距離を 1 とした比率）
VISEMES = {
    "a": [0.19, 0.02],
    "i": [0.04, 0.06],
    "u": [0.05, -0.05],
    "e": [0.10, 0.045],
    "o": [0.13, -0.035],
}


def detect(img_bgr, static=True, fm=None):
    own = fm is None
    if own:
        fm = mp.solutions.face_mesh.FaceMesh(static_image_mode=static, max_num_faces=1, refine_landmarks=True)
    r = fm.process(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
    if own:
        fm.close()
    h, w = img_bgr.shape[:2]
    lm = r.multi_face_landmarks[0].landmark
    return np.array([[p.x * w, p.y * h] for p in lm])


def similarity(src, dst):
    """src を dst に重ねる相似変換（拡大率, 回転行列, 平行移動）"""
    ms, md = src.mean(0), dst.mean(0)
    a, b = src - ms, dst - md
    u, s, vt = np.linalg.svd(a.T @ b)
    r = (u @ vt).T
    if np.linalg.det(r) < 0:
        vt[-1] *= -1
        r = (u @ vt).T
    sc = s.sum() / (a**2).sum()
    return sc, r, md - sc * (r @ ms)


def face_triangles():
    edges = mp.solutions.face_mesh.FACEMESH_TESSELATION
    adj = collections.defaultdict(set)
    for a, b in edges:
        adj[a].add(b)
        adj[b].add(a)
    tris = set()
    for a, b in edges:
        for c in adj[a] & adj[b]:
            tris.add(tuple(sorted((a, b, c))))
    return [list(t) for t in tris]


def oval_loop():
    edges = list(mp.solutions.face_mesh.FACEMESH_FACE_OVAL)
    nxt = collections.defaultdict(list)
    for a, b in edges:
        nxt[a].append(b)
        nxt[b].append(a)
    start = edges[0][0]
    loop, prev, cur = [start], None, start
    while True:
        cand = [n for n in nxt[cur] if n != prev]
        if not cand or cand[0] == start:
            break
        prev, cur = cur, cand[0]
        loop.append(cur)
    return loop


def main():
    video, ffmpeg, open_photo = sys.argv[1], sys.argv[2], sys.argv[3]
    base_img = cv2.imread(str(AVATAR / "base.webp"))
    H, W = base_img.shape[:2]
    base = detect(base_img)
    closed = detect(cv2.imread(str(AVATAR / "eyes-closed.webp")))
    open_img = cv2.imread(open_photo)
    opened = detect(open_img)
    eyew = np.linalg.norm(base[33] - base[263])

    # ---- 参考動画から動き方を取り出す ----
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([ffmpeg, "-loglevel", "error", "-i", video, "-vsync", "0", f"{tmp}/f%04d.png"], check=True)
        files = sorted(Path(tmp).glob("f*.png"))
        with mp.solutions.face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1, refine_landmarks=True) as fm:
            vid = [detect(cv2.imread(str(f)), fm=fm) for f in files]
    ref = vid[0]
    v_eyew = np.linalg.norm(ref[33] - ref[263])
    k = eyew / v_eyew  # 動画のピクセル → 写真のピクセル

    feats, disp, pose = [], [], []
    for f in vid:
        sc, r, t = similarity(f[STABLE], ref[STABLE])
        g = (sc * (r @ f.T)).T + t  # 頭の動きを取り除いた表情だけの点
        open_ = np.linalg.norm(g[13] - g[14]) / v_eyew
        width = np.linalg.norm(g[61] - g[291]) / v_eyew
        blink = (
            np.linalg.norm(g[159] - g[145]) / np.linalg.norm(g[33] - g[133])
            + np.linalg.norm(g[386] - g[374]) / np.linalg.norm(g[362] - g[263])
        ) / 2
        brow = (np.linalg.norm(g[105] - g[159]) + np.linalg.norm(g[334] - g[386])) / 2 / v_eyew
        feats.append([open_, width, blink, brow])
        disp.append(g)
        psc, pr, _ = similarity(f[POSE_POINTS], ref[POSE_POINTS])
        ang = -np.degrees(np.arctan2(pr[1, 0], pr[0, 0]))
        center = f[POSE_POINTS].mean(0) - ref[POSE_POINTS].mean(0)
        pose.append([ang, 1 / psc, center[0] * k / W, center[1] * k / H])
    feats = np.array(feats)
    disp = np.array(disp)
    neutral = (feats[:, 0] < 0.01) & (feats[:, 2] > 0.3)
    base_g = disp[neutral].mean(0)
    f0 = feats[neutral].mean(0)
    X = np.column_stack([feats[:, 0] - f0[0], feats[:, 1] - f0[1], feats[:, 2] - f0[2], feats[:, 3] - f0[3]])
    D = (disp - base_g).reshape(len(disp), -1)
    coef, *_ = np.linalg.lstsq(X, D, rcond=None)  # 4 x (478*2)
    fields = coef.reshape(4, -1, 2) * k  # 写真のピクセル単位（特徴量 1 あたり）
    open_field, width_field = fields[0], fields[1]

    # ---- 網目（顔 + 外側） ----
    loop = oval_loop()
    center = base[loop].mean(0)
    verts = [p for p in base]
    weight = [1.0] * len(base)
    fo = [open_field[i] for i in range(len(base))]
    fw = [width_field[i] for i in range(len(base))]
    chin_y = base[152][1]
    ring_ids = []
    for factor, wgt, share in [(1.15, 1.0, 0.5), (1.45, 0.75, 0.0), (1.85, 0.35, 0.0)]:
        ids = []
        for i in loop:
            p = center + (base[i] - center) * factor
            p = np.clip(p, [1, 1], [W - 2, H - 2])
            below = max(0.0, (p[1] - chin_y) / (0.15 * H))
            ids.append(len(verts))
            verts.append(p)
            weight.append(wgt * max(0.0, 1 - below))
            lower = base[i][1] > center[1]
            fo.append(open_field[i] * share if lower else np.zeros(2))
            fw.append(width_field[i] * share if lower else np.zeros(2))
        ring_ids.append(ids)
    n_border = 10
    for s in range(n_border):
        for p in ([W * s / n_border, 0], [W, H * s / n_border], [W * (1 - s / n_border), H], [0, H * (1 - s / n_border)]):
            verts.append(np.array(p, float))
            weight.append(0.0)
            fo.append(np.zeros(2))
            fw.append(np.zeros(2))
    verts = np.array(verts)

    tris = face_triangles()
    # 目の穴を埋める（黒目の中心から扇形に。まばたきでは上まぶたが下りて、この扇がつぶれる）
    for eye, c in zip(EYES, IRIS_CENTERS):
        near = min(IRIS_CENTERS, key=lambda j: np.linalg.norm(base[j] - base[eye].mean(0)))
        for a, b in zip(eye, eye[1:] + eye[:1]):
            tris.append([a, b, near])
    # 顔の外側: 顔の輪郭 + 外側の網目 + 画像の枠 をドロネー分割し、顔の内側の三角形は捨てる
    outer_ids = loop + [i for ids in ring_ids for i in ids] + list(range(len(verts) - 4 * n_border, len(verts)))
    subdiv = cv2.Subdiv2D((0, 0, W + 1, H + 1))
    lookup = {}
    for i in outer_ids:
        x, y = verts[i]
        subdiv.insert((float(x), float(y)))
        lookup[(round(float(x), 2), round(float(y), 2))] = i
    oval_poly = base[loop].astype(np.float32)
    for x1, y1, x2, y2, x3, y3 in subdiv.getTriangleList():
        ids = [lookup.get((round(float(x), 2), round(float(y), 2))) for x, y in ((x1, y1), (x2, y2), (x3, y3))]
        if None in ids:
            continue
        cx, cy = (x1 + x2 + x3) / 3, (y1 + y2 + y3) / 3
        if cv2.pointPolygonTest(oval_poly, (float(cx), float(cy)), False) > 0:
            continue
        tris.append(ids)

    # 口の中: 唇の内側の点が、口を開けた写真のどこに当たるか
    mouth_uv = [[opened[i][0] / W, opened[i][1] / H] for i in INNER_LIPS]
    blink_off = (closed[STABLE] - base[STABLE]).mean(0)

    idle = list(range(IDLE_END)) + list(range(IDLE_END - 2, 0, -1))
    # 首の傾き・拡大・ずれだけを使う。まばたきは参考動画のものだと遅く、眉はまばたきと混ざって顔が崩れるため使わない
    # まばたき中のコマは顔の点がずれて首が動いたように測れてしまうので、前後のコマから補間する。
    # さらに、なめらかにして急な変化をなくし、平均が 0 になるようにする（顔の大きさ・位置がぐにゃっと変わらないように）
    poses = np.array([pose[i] for i in idle], float)
    blinking = np.array([feats[i, 2] < 0.3 for i in idle])
    blinking = np.convolve(blinking.astype(float), np.ones(7), mode="same") > 0  # 前後 3 コマも含める
    x = np.arange(len(idle))
    for c in range(4):
        poses[~blinking, c] = poses[~blinking, c]
        poses[blinking, c] = np.interp(x[blinking], x[~blinking], poses[~blinking, c], period=len(idle))
    sigma = 4.0
    kern = np.exp(-0.5 * (np.arange(-12, 13) / sigma) ** 2)
    kern /= kern.sum()
    for c in range(4):
        padded = np.concatenate([poses[-12:, c], poses[:, c], poses[:12, c]])  # ループなので端をつなげる
        poses[:, c] = np.convolve(padded, kern, mode="same")[12:-12]
    poses[:, 0] -= poses[:, 0].mean()
    poses[:, 1] = 1 + np.clip(poses[:, 1] - poses[:, 1].mean(), -0.004, 0.004)
    poses[:, 2] -= poses[:, 2].mean()
    poses[:, 3] -= poses[:, 3].mean()
    curves = [[round(a, 3), round(sc, 4), round(tx, 5), round(ty, 5)] for a, sc, tx, ty in poses]

    pivot = base[152] + np.array([0, 0.35 * eyew])  # あごの少し下（首）を中心に頭を傾ける
    rig = {
        "size": [W, H],
        "fps": FPS,
        "vertices": [[round(x / W, 5), round(y / H, 5)] for x, y in verts],
        "weights": [round(w, 3) for w in weight],
        "openField": [[round(x / W, 5), round(y / H, 5)] for x, y in fo],
        "widthField": [[round(x / W, 5), round(y / H, 5)] for x, y in fw],
        # 目を閉じた写真の、この写真からのずれ（まばたきで目のまわりだけ切り替えるときに合わせる）
        "blinkOffset": [round(blink_off[0] / W, 5), round(blink_off[1] / H, 5)],
        "triangles": tris,
        "innerLips": INNER_LIPS,
        "mouthUv": [[round(u, 5), round(v, 5)] for u, v in mouth_uv],
        "pivot": [round(pivot[0] / W, 5), round(pivot[1] / H, 5)],
        "visemes": VISEMES,
        "idle": curves,
    }
    (AVATAR / "rig.json").write_text(json.dumps(rig, separators=(",", ":")))
    cv2.imwrite(str(AVATAR / "mouth-inside.webp"), open_img, [cv2.IMWRITE_WEBP_QUALITY, 90])
    print("vertices", len(verts), "triangles", len(tris), "idle frames", len(curves))


if __name__ == "__main__":
    main()
