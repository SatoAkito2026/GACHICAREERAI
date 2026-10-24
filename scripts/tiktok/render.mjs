/**
 * TikTok 動画を1本作る（GitHub Actions から毎日動かす。.github/workflows/tiktok-video.yml）
 *
 * 1. アプリに台本と音声を作ってもらう（POST /api/studio/job）
 * 2. 撮影用の画面（/studio/tiktok）を、時計を止めたブラウザで開き、1コマずつ進めて撮る
 * 3. ffmpeg で、コマと音声を合わせて mp4（1080×1920・30コマ/秒）にする
 * 4. アプリに送る（POST /api/studio/upload）→ 管理画面に出る
 *
 * 必要な環境変数：APP_URL（例 https://gachicareer-ai.akitogroup.jp）、STUDIO_SECRET
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const APP_URL = (process.env.APP_URL || "https://gachicareer-ai.akitogroup.jp").replace(/\/$/, "");
const SECRET = process.env.STUDIO_SECRET;
const FPS = 30;
const WORK = join(process.cwd(), ".tiktok-work");
if (!SECRET) throw new Error("STUDIO_SECRET が設定されていません");

async function api(path, init = {}) {
  const res = await fetch(`${APP_URL}${path}`, {
    ...init,
    headers: { "x-studio-secret": SECRET, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

// ページの時計を止めて、撮影側から1コマずつ進められるようにする
const CLOCK = `
(() => {
  let vt = 0;
  const cbs = new Map();
  let id = 0;
  const base = Date.now();
  const realRaf = window.requestAnimationFrame.bind(window);
  window.__realRaf = realRaf;
  performance.now = () => vt;
  Date.now = () => base + vt;
  window.requestAnimationFrame = (cb) => { id += 1; cbs.set(id, cb); return id; };
  window.cancelAnimationFrame = (i) => { cbs.delete(i); };
  window.__advance = (ms) => {
    vt += ms;
    const list = [...cbs.values()];
    cbs.clear();
    for (const cb of list) { try { cb(vt); } catch (e) { console.error(e); } }
  };
})();
`;

// 効果音は ffmpeg の式で作る（音のファイルを持たない）
const SFX_RATE = 48000;
const tone = (expr, dur) => `aevalsrc=exprs='${expr}':s=${SFX_RATE}:d=${dur}`;
/** 数字が上がっていく間のカチカチ（だんだん高くなる） */
const tickSound = (dur) =>
  tone(`0.3*sin(2*PI*(1400+900*t/${dur})*t)*exp(-90*mod(t,0.04))`, dur.toFixed(3));
/** 受かる：ピロン */
const OK_SOUND = tone(
  "0.3*if(lt(t,0.09),sin(2*PI*1047*t),sin(2*PI*1568*t)+0.4*sin(2*PI*3136*t))*exp(-3.5*max(t-0.09,0))",
  "0.8",
);
/** 落ちる：ブブー */
const NG_SOUND = tone(
  "0.2*(sin(2*PI*150*t)+0.5*sin(2*PI*300*t)+0.3*sin(2*PI*450*t))*lt(mod(t,0.22),0.17)",
  "0.44",
);

async function main() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(join(WORK, "frames"), { recursive: true });

  console.log("台本と音声を作っています…");
  // 決まった時刻の実行では、今日の動画がもうあれば作らない（手動のときはいつでも作る）
  // FORMAT=ad のときは広告（決まった台本）を作る
  const query =
    process.env.FORMAT === "ad"
      ? "?format=ad"
      : process.env.ONLY_IF_NONE_TODAY
        ? "?onlyIfNoneToday=1"
        : "";
  const job = await api(`/api/studio/job${query}`, { method: "POST" });
  if (job.skipped) {
    console.log("今日の動画はもうできているので、作りませんでした");
    return;
  }
  console.log(`「${job.title}」（${job.themeLabel}）`);

  try {
    const browser = await chromium.launch({
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    });
    const page = await browser.newPage({
      viewport: { width: 540, height: 960 },
      deviceScaleFactor: 2,
    });
    page.on("console", (m) => m.type() === "error" && console.log("[page]", m.text()));
    await page.addInitScript(CLOCK);
    await page.addInitScript((data) => {
      window.__STUDIO_JOB__ = data;
    }, job);
    await page.goto(`${APP_URL}/studio/tiktok`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__studioReady === true, null, { timeout: 60000 });
    const timeline = await page.evaluate(() => window.__studioTimeline);
    const frames = Math.ceil(timeline.total * FPS);
    console.log(`${timeline.total.toFixed(1)}秒（${frames}コマ）を撮ります…`);

    for (let f = 0; f < frames; f++) {
      if (f > 0) await page.evaluate((ms) => window.__advance(ms), 1000 / FPS);
      else await page.evaluate(() => window.__advance(0));
      // 時間を進めたあとの描き直しが画面に出るのを待つ
      await page.evaluate(() => new Promise((r) => window.__realRaf(() => window.__realRaf(r))));
      await page.screenshot({
        path: join(WORK, "frames", `${String(f).padStart(5, "0")}.jpg`),
        type: "jpeg",
        quality: 92,
      });
      if (f % 150 === 0) console.log(`  ${f}/${frames}`);
    }
    await browser.close();

    // 音声：せりふごとの PCM を、画面と同じ時刻に置いて重ねる
    const inputs = [];
    const filters = [];
    timeline.lines.forEach((line, i) => {
      const file = join(WORK, `line${i}.pcm`);
      writeFileSync(file, Buffer.from(job.audio[i], "base64"));
      inputs.push("-f", "s16le", "-ar", String(job.sampleRate), "-ac", "1", "-i", file);
      const delay = Math.round(line.start * 1000);
      // 面接官はアプリと同じく少し速く・高く再生する（pitchRate）。tempo は音の高さを変えずに速くする
      const pitchRate = line.pitchRate ?? line.rate;
      const speed = pitchRate !== 1 ? `asetrate=${Math.round(job.sampleRate * pitchRate)},` : "";
      const tempo = line.tempo && line.tempo !== 1 ? `,atempo=${line.tempo}` : "";
      filters.push(`[${i + 1}:a]${speed}aresample=48000${tempo},adelay=${delay}|${delay}[a${i}]`);
    });
    // 効果音：点数がくるくる上がる間のカチカチ → 止まったら NG は「ブブー」、OK は「ピロン」
    const sfxLabels = [];
    (timeline.sfx || []).forEach((s, i) => {
      for (const [k, sound] of [
        ["t", tickSound(s.dur)],
        ["e", s.kind === "ok" ? OK_SOUND : NG_SOUND],
      ]) {
        const at = Math.round((k === "t" ? s.at : s.at + s.dur) * 1000);
        filters.push(`${sound},adelay=delays=${at}:all=1[s${k}${i}]`);
        sfxLabels.push(`[s${k}${i}]`);
      }
    });
    const mix = timeline.lines.map((_, i) => `[a${i}]`).join("") + sfxLabels.join("");
    filters.push(
      `${mix}amix=inputs=${timeline.lines.length + sfxLabels.length}:normalize=0,apad,atrim=0:${timeline.total.toFixed(3)}[aout]`,
    );

    const out = join(WORK, "out.mp4");
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-framerate",
        String(FPS),
        "-i",
        join(WORK, "frames", "%05d.jpg"),
        ...inputs,
        "-filter_complex",
        filters.join(";"),
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-r",
        String(FPS),
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        "-t",
        timeline.total.toFixed(3),
        out,
      ],
      { stdio: "inherit" },
    );

    console.log("アプリに送っています…");
    await api(`/api/studio/upload?id=${job.id}&duration=${timeline.total.toFixed(1)}`, {
      method: "POST",
      headers: { "Content-Type": "video/mp4" },
      body: readFileSync(out),
    });
    console.log("できました");
  } catch (e) {
    await api(`/api/studio/upload?id=${job.id}&failed=1`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: String(e?.stack || e),
    }).catch(() => {});
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
