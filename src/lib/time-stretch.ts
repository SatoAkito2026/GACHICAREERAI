/**
 * 声の高さを変えずに速くする（WSOLA）。面接官の声を速く・流暢にするのに使う。
 * 再生の速さ（playbackRate）を上げると声が高くなって聞き取りにくくなるため、こちらで縮めてから普通の速さで再生する。
 */
export function timeStretch(input: Float32Array, sampleRate: number, speed: number): Float32Array {
  if (!(speed > 0) || Math.abs(speed - 1) < 0.01 || input.length < sampleRate * 0.1) return input;
  const frame = Math.round(sampleRate * 0.03); // 30ms
  const hopOut = Math.floor(frame / 2);
  const hopIn = hopOut * speed;
  const tolerance = Math.round(sampleRate * 0.008);
  const overlap = frame - hopOut;

  const win = new Float32Array(frame);
  for (let i = 0; i < frame; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1));

  const outLen = Math.ceil(input.length / speed) + frame;
  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);

  const addFrame = (from: number, at: number) => {
    for (let i = 0; i < frame; i++) {
      const s = input[from + i] ?? 0;
      out[at + i] += s * win[i];
      norm[at + i] += win[i];
    }
  };

  let prev = 0;
  addFrame(0, 0);
  for (let k = 1; ; k++) {
    const at = k * hopOut;
    const nominal = Math.round(k * hopIn);
    if (nominal + frame >= input.length || at + frame >= outLen) break;
    // 前の区切りの「続き」と一番よく重なる位置を、予定の位置の近くで探す
    const natural = prev + hopOut;
    let best = nominal;
    let bestScore = -Infinity;
    const lo = Math.max(0, nominal - tolerance);
    const hi = Math.min(input.length - frame - 1, nominal + tolerance);
    for (let c = lo; c <= hi; c++) {
      let score = 0;
      for (let i = 0; i < overlap; i += 2) score += input[c + i] * (input[natural + i] ?? 0);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    addFrame(best, at);
    prev = best;
  }

  const length = Math.min(outLen, Math.ceil(input.length / speed));
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) result[i] = norm[i] > 1e-3 ? out[i] / norm[i] : 0;
  return result;
}
