# 広告のBGM（自作・落ち着いた夜っぽい曲）を作る。著作権の心配がないように、音はすべてここで合成する
# 使い方: python3 bgm.py 出力.wav 秒数
# ゆったり 72BPM。やわらかいエレピ風の和音 + 低いベース + うすいパッド + 小さなハイハット
import sys, wave
import numpy as np

SR = 44100
out = sys.argv[1] if len(sys.argv) > 1 else "bgm.wav"
SEC = float(sys.argv[2]) if len(sys.argv) > 2 else 44.0
BPM = 72
BEAT = 60 / BPM
BAR = BEAT * 4
n = int(SR * SEC)
mix = np.zeros(n)
rng = np.random.default_rng(7)

def hz(m):  # MIDI → 周波数
    return 440 * 2 ** ((m - 69) / 12)

def ep(freq, start, dur, vol):
    """エレピ風：倍音少なめのサイン + ゆっくり減衰 + すこし揺らぐ"""
    i0 = int(start * SR); L = int(dur * SR)
    if i0 >= n: return
    L = min(L, n - i0)
    t = np.arange(L) / SR
    env = np.exp(-t * 1.6) * (1 - np.exp(-t * 60))
    trem = 1 + 0.06 * np.sin(2 * np.pi * 4.5 * t)
    s = (np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 3) + 0.12 * np.sin(2 * np.pi * freq * 3 * t) * np.exp(-t * 5))
    mix[i0:i0 + L] += vol * s * env * trem

def pad(freqs, start, dur, vol):
    i0 = int(start * SR); L = min(int(dur * SR), n - i0)
    if L <= 0: return
    t = np.arange(L) / SR
    a = np.minimum(1, t / 1.2) * np.minimum(1, (dur - t) / 1.2)
    s = sum(np.sin(2 * np.pi * f * t) + np.sin(2 * np.pi * f * 1.003 * t) for f in freqs) / (2 * len(freqs))
    mix[i0:i0 + L] += vol * s * np.clip(a, 0, 1)

def bass(freq, start, dur, vol):
    i0 = int(start * SR); L = min(int(dur * SR), n - i0)
    if L <= 0: return
    t = np.arange(L) / SR
    env = np.exp(-t * 1.2) * (1 - np.exp(-t * 40))
    mix[i0:i0 + L] += vol * np.sin(2 * np.pi * freq * t) * env

def hat(start, vol):
    i0 = int(start * SR); L = min(int(0.05 * SR), n - i0)
    if L <= 0: return
    t = np.arange(L) / SR
    noise = rng.standard_normal(L)
    noise = noise - np.convolve(noise, np.ones(6) / 6, mode="same")  # 高い音だけ残す
    mix[i0:i0 + L] += vol * noise * np.exp(-t * 90)

# Fmaj7 → Em7 → Dm7 → Cmaj7（夜っぽい、やさしい進行）
CHORDS = [
    ([53, 57, 60, 64], 41),  # Fmaj7
    ([52, 55, 59, 62], 40),  # Em7
    ([50, 53, 57, 60], 38),  # Dm7
    ([48, 52, 55, 59], 36),  # Cmaj7
]
bar = 0; t0 = 0.0
while t0 < SEC:
    notes, root = CHORDS[bar % 4]
    pad([hz(m + 12) for m in notes], t0, BAR + 0.6, 0.10)
    # 和音は1拍目と3拍目の裏に、少しずらして（手で弾いたように）
    for k, m in enumerate(notes):
        ep(hz(m + 12), t0 + k * 0.012, BAR, 0.11)
        ep(hz(m + 12), t0 + BEAT * 2.5 + k * 0.01, BEAT * 1.5, 0.06)
    bass(hz(root), t0, BEAT * 2, 0.22)
    bass(hz(root + 7), t0 + BEAT * 2, BEAT * 2, 0.16)
    if bar >= 1:  # 2小節目からハイハット
        for b in range(8):
            hat(t0 + b * BEAT / 2, 0.035 if b % 2 else 0.05)
    # ときどき、上でひとつだけメロディ
    if bar % 2 == 1:
        ep(hz(notes[-1] + 24), t0 + BEAT * 1.5, BEAT * 2, 0.05)
        ep(hz(notes[-2] + 24), t0 + BEAT * 3, BEAT * 1.5, 0.04)
    bar += 1; t0 += BAR

# かんたんな残響（少しずつ遅らせて重ねる）
rev = np.zeros(n)
for d, g in [(0.071, .25), (0.113, .18), (0.167, .13), (0.239, .09)]:
    k = int(d * SR); rev[k:] += g * mix[:-k]
mix = mix + rev
# 最初と最後をなめらかに
fade = int(2.5 * SR)
mix[:int(0.8 * SR)] *= np.linspace(0, 1, int(0.8 * SR))
mix[-fade:] *= np.linspace(1, 0, fade)
mix = mix / np.max(np.abs(mix)) * 0.8
st = np.stack([mix, np.roll(mix, int(0.012 * SR))], axis=1)  # 左右に少し広げる
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype("<i2").tobytes())
print("bgm:", out, SEC, "sec")
