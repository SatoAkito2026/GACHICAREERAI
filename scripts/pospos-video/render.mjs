// ポスポスの説明動画を作る（9:16・1080×1920）
// 1. デモのお店をブラウザで開いて、台本どおりに押しながら画面を撮る
// 2. 1コマずつ「見出し＋スマホの画面＋字幕（＋押したところの丸）」の画像にする
// 3. 声は OpenAI の TTS（OPENAI_API_KEY があるとき。ないときは無音で長さだけ合わせる＝見た目の確認用）
// 4. ffmpeg で1本の mp4 にして corporate-site/public/pospos-videos/ に置く
// 使い方：node render.mjs（全部）／ node render.mjs night-01-tsukemawashi（1本だけ）
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VIDEOS, DEMO } from "./videos.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../corporate-site/public/pospos-videos");
const WORK = path.join(HERE, ".work");
const APP = "https://pospos.akitogroup.jp";
const KEY = process.env.OPENAI_API_KEY || "";
const VOICE = process.env.TTS_VOICE || "coral";
const W = 1080, H = 1920;
const CTA = {
  say: "今なら0円で始められます。初期導入費用0円、端末もいりません。ログインなしで触れるデモは、プロフィールのリンクから。",
  big: "今なら0円で始められる",
  sub: "初期導入費用0円・端末不要",
};

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
const dur = (f) => parseFloat(sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function tts(text, file) {
  if (!KEY) {
    // 声なし：文字数から長さを決めて無音を作る
    const sec = Math.max(1.8, text.length * 0.13);
    sh("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", sec.toFixed(2), "-q:a", "4", file]);
    return;
  }
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts", voice: VOICE, input: text, response_format: "mp3",
      instructions: "日本語。明るく、はっきり、聞き取りやすく。お店のオーナーに話しかけるように、少しテンポよく。",
    }),
  });
  if (!r.ok) throw new Error(`TTS ${r.status} ${await r.text()}`);
  const raw = file.replace(/\.mp3$/, ".raw.mp3");
  fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
  // 速めに（声の高さは変えない）
  sh("ffmpeg", ["-y", "-i", raw, "-filter:a", "atempo=1.35", "-ar", "44100", "-ac", "2", file]);
}

// 1コマの画像（HTMLで組んで撮る）
function frameHtml({ title, shot, caption, tap, kind, mode }) {
  const accent = mode === "night" ? "#FFB547" : "#3B82F6";
  const bg = mode === "night" ? "linear-gradient(160deg,#0E1733,#1A2550 60%,#3A1C4F)" : "linear-gradient(160deg,#0F2A5C,#1557D6)";
  const font = `'Noto Sans CJK JP','Noto Sans JP','IPAGothic',sans-serif`;
  if (kind === "cta") {
    return `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;background:${bg};font-family:${font};color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
      <img src="${shot}" style="width:260px;height:260px;border-radius:56px;margin-bottom:60px">
      <div style="font-size:80px;font-weight:900;line-height:1.3;padding:0 60px;white-space:nowrap">${esc(CTA.big)}</div>
      <div style="font-size:54px;font-weight:800;margin-top:36px;color:${accent}">${esc(CTA.sub)}</div>
      <div style="font-size:44px;font-weight:700;margin-top:90px;padding:22px 44px;border:4px solid #fff;border-radius:999px">ログインなしで触れるデモは<br>プロフィールのリンクから</div>
      <div style="position:absolute;bottom:250px;font-size:34px;opacity:.75">ポスポス｜${mode === "night" ? "夜のお店" : "飲食店"}のPOSレジ</div>
    </body></html>`;
  }
  const tapDot = tap ? `<div style="position:absolute;left:${tap.x - 55}px;top:${tap.y - 55}px;width:110px;height:110px;border-radius:50%;background:rgba(255,181,71,.35);border:8px solid ${accent};box-sizing:border-box"></div>` : "";
  const hook = kind === "hook";
  return `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;background:${bg};font-family:${font};color:#fff;position:relative;overflow:hidden">
    <div style="position:absolute;top:150px;left:60px;right:120px;font-size:62px;font-weight:900;line-height:1.3">${esc(title)}</div>
    <div style="position:absolute;top:${hook ? 360 : 340}px;left:90px;width:840px;height:1300px;border-radius:48px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5);background:#fff">
      <img src="${shot}" style="width:840px;display:block;${hook ? "filter:brightness(.45)" : ""}">
      ${tapDot}
    </div>
    ${hook
      ? `<div style="position:absolute;top:760px;left:110px;right:150px;font-size:76px;font-weight:900;line-height:1.4;text-shadow:0 6px 20px rgba(0,0,0,.6)">${esc(caption)}</div>`
      : `<div style="position:absolute;left:60px;right:120px;bottom:240px;font-size:50px;font-weight:800;line-height:1.45;background:rgba(10,14,35,.86);border-left:12px solid ${accent};padding:26px 34px;border-radius:20px">${esc(caption)}</div>`}
    <div style="position:absolute;top:1675px;left:90px;font-size:26px;opacity:.7">画面はデモのお店です（お店・人の名前・数字は架空）</div>
  </body></html>`;
}

async function render(video, browser) {
  const dir = path.join(WORK, video.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const app = await browser.newContext({ viewport: { width: 390, height: 604 }, deviceScaleFactor: 3, locale: "ja-JP" });
  const page = await app.newPage();
  const canvas = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
  await page.goto(DEMO[video.mode], { waitUntil: "networkidle", timeout: 90000 });
  const settle = async () => {
    await page.waitForLoadState("networkidle").catch(() => {});
    for (let i = 0; i < 20; i++) {
      const t = await page.textContent("body").catch(() => "");
      if (!t.includes("読み込んでいます")) break;
      await page.waitForTimeout(800);
    }
    await page.waitForTimeout(1200);
  };
  const shotData = async () => "data:image/png;base64," + (await page.screenshot()).toString("base64");
  const logo = "data:image/webp;base64," + fs.readFileSync(path.resolve(HERE, "../../corporate-site/public/assets/img/posupos-mark.webp")).toString("base64");

  const clips = [];
  let n = 0;
  const addClip = async (html, say) => {
    n++;
    const png = path.join(dir, `f${n}.png`), mp3 = path.join(dir, `a${n}.mp3`), mp4 = path.join(dir, `c${n}.mp4`);
    await canvas.setContent(html, { waitUntil: "load" });
    await canvas.waitForTimeout(150);
    await canvas.screenshot({ path: png });
    await tts(say, mp3);
    const d = dur(mp3) + 0.35;
    sh("ffmpeg", ["-y", "-loop", "1", "-framerate", "30", "-i", png, "-i", mp3, "-filter_complex", "[1:a]apad[a]", "-map", "0:v", "-map", "[a]",
      "-t", d.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-ar", "44100", mp4]);
    clips.push(mp4);
  };

  // 最初のひと言（最初の画面を暗くして、上に大きく）
  const first = video.steps[0];
  if (first.go) { await page.goto(APP + first.go, { waitUntil: "networkidle", timeout: 90000 }); await settle(); }
  if (first.prev) { await page.getByText("← 前月", { exact: true }).first().click(); await settle(); }
  await addClip(frameHtml({ title: video.title, shot: await shotData(), caption: video.hook, kind: "hook", mode: video.mode }), video.hook);

  for (const [i, st] of video.steps.entries()) {
    if (i > 0 && st.go) { await page.goto(APP + st.go, { waitUntil: "networkidle", timeout: 90000 }); await settle(); }
    if (i > 0 && st.prev) { await page.getByText("← 前月", { exact: true }).first().click(); await settle(); }
    if (st.scroll) { await page.mouse.wheel(0, st.scroll); await page.waitForTimeout(700); }
    if (st.scrollTo) { await page.getByText(st.scrollTo, { exact: true }).first().evaluate((el) => el.scrollIntoView({ block: "start" })); await page.mouse.wheel(0, -150); await page.waitForTimeout(700); }
    let tap = null, beforeShot = null;
    if (st.click) {
      let loc = page.locator(st.click.has).filter({ hasText: st.click.text });
      loc = st.click.last ? loc.last() : loc.first();
      await loc.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
      await page.waitForTimeout(400);
      const box = await loc.boundingBox();
      // before: 押す前の画面を撮る（押すと画面が変わるボタン用）
      if (st.click.before) beforeShot = await shotData();
      await loc.click({ timeout: 10000 });
      await settle();
      if (box) {
        const vp = page.viewportSize();
        if (box.y >= 0 && box.y < vp.height) tap = { x: Math.round((box.x + box.width / 2) * (840 / 390)), y: Math.round((box.y + box.height / 2) * (840 / 390)) };
      }
    }
    await addClip(frameHtml({ title: video.title, shot: beforeShot || (await shotData()), caption: st.say, tap, mode: video.mode }), st.say);
  }
  await addClip(frameHtml({ shot: logo, kind: "cta", mode: video.mode }), CTA.say);

  const list = path.join(dir, "list.txt");
  fs.writeFileSync(list, clips.map((c) => `file '${c}'`).join("\n"));
  const out = path.join(OUT, `${video.id}.mp4`);
  sh("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out]);
  // 表紙（2コマ目）
  fs.copyFileSync(path.join(dir, "f2.png"), path.join(OUT, `${video.id}.png`));
  await app.close();
  console.log(`作りました: ${path.relative(process.cwd(), out)}（${dur(out).toFixed(1)}秒${KEY ? "" : "・声なし"}）`);
}

const only = process.argv[2];
let list = only ? VIDEOS.filter((v) => v.id === only) : VIDEOS;
// ONLY_MISSING=1 のときは、まだ動画がないものだけ作る
if (process.env.ONLY_MISSING) list = list.filter((v) => !fs.existsSync(path.join(OUT, `${v.id}.mp4`)));
if (!list.length && process.env.ONLY_MISSING) console.log("新しく作る動画はありません");
if (!list.length && !process.env.ONLY_MISSING) { console.error("その id の動画はありません"); process.exit(1); }
if (!process.env.HTML_ONLY) {
  const browser = await chromium.launch();
  for (const v of list) await render(v, browser);
  await browser.close();
}

// 投稿するときの説明文（そのままコピーして使う）
const TAGS = { night: "#ポスポス #POSレジ #キャバクラ #ホストクラブ #ガールズバー #コンカフェ #夜職 #水商売 #店舗経営", day: "#ポスポス #POSレジ #飲食店 #居酒屋 #飲食店経営 #セルフオーダー #シフト管理" };
const postText = (v) => `${v.hook}\n${v.title}。ポスポスなら、画面を押すだけ。\n\n今なら0円で始められる（初期導入費用0円・端末不要）\nログインなしで触れるデモは、プロフィールのリンクから。\n\n${TAGS[v.mode]}`;
// 一覧のページ（スマホで開いて保存する用。検索には出さない）。小さな表紙を並べて、押すと大きく再生
const items = VIDEOS.filter((v) => fs.existsSync(path.join(OUT, `${v.id}.mp4`)));
const card = (v, i) => `<li class="it">
  <button class="th" type="button" data-src="pospos-videos/${v.id}.mp4" aria-label="${esc(v.title)}を再生"><img src="pospos-videos/${v.id}.png" alt="" loading="lazy"><span class="pl">▶</span></button>
  <div class="tx">
    <p class="no">${i + 1}本目・${v.mode === "night" ? "夜のお店" : "飲食店"}</p>
    <b>${esc(v.title)}</b>
    <div class="bt">
      <button type="button" class="b1" data-src="pospos-videos/${v.id}.mp4">▶ 見る</button>
      <a class="b2" href="pospos-videos/${v.id}.mp4" download="${v.id}.mp4">保存</a>
      <button type="button" class="b2 cp" data-text="${esc(postText(v))}">説明文をコピー</button>
    </div>
  </div>
</li>`;
fs.writeFileSync(path.resolve(OUT, "../pospos-videos.html"), `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>ポスポスの動画（投稿用）</title>
<style>
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;margin:0;background:#f2f4f9;color:#13234a}
.wrap{max-width:720px;margin:0 auto;padding:16px}
h1{font-size:19px;margin:4px 0 6px}.lead{font-size:13px;color:#4a5878;margin:0 0 14px;line-height:1.7}
ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.it{display:flex;gap:12px;background:#fff;border-radius:14px;padding:10px;align-items:center;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.th{position:relative;flex:0 0 72px;height:128px;border:0;padding:0;border-radius:10px;overflow:hidden;background:#0e1733;cursor:pointer}
.th img{width:100%;height:100%;object-fit:cover;display:block}
.pl{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:22px;background:rgba(0,0,0,.25)}
.tx{min-width:0;flex:1}.no{margin:0;font-size:11.5px;color:#8a94ad}.tx b{display:block;font-size:15px;margin:2px 0 8px;line-height:1.4}
.bt{display:flex;flex-wrap:wrap;gap:6px}
.bt button,.bt a{font:inherit;font-size:12.5px;font-weight:700;border-radius:999px;padding:7px 12px;text-decoration:none;cursor:pointer;border:1px solid #d6deef;background:#fff;color:#13234a}
.bt .b1{background:#13234a;color:#fff;border-color:#13234a}
.cp.ok{background:#22a06b;color:#fff;border-color:#22a06b}
.mo{position:fixed;inset:0;background:rgba(5,8,20,.88);display:none;align-items:center;justify-content:center;z-index:9;padding:16px}
.mo.on{display:flex}.mo video{height:86vh;max-width:100%;aspect-ratio:9/16;border-radius:12px;background:#000}
.mo .x{position:absolute;top:12px;right:14px;background:#fff;color:#13234a;border:0;border-radius:999px;width:40px;height:40px;font-size:20px;cursor:pointer}
</style></head><body><div class="wrap">
<h1>ポスポスの動画（TikTok・Instagram 投稿用）</h1>
<p class="lead">表紙か「▶ 見る」で再生。「保存」でスマホに保存して、「説明文をコピー」を投稿の説明に貼ってください。全${items.length}本</p>
<ol>
${items.map(card).join("\n")}
</ol></div>
<div class="mo" id="mo"><button class="x" type="button" aria-label="閉じる">×</button><video id="mv" controls playsinline></video></div>
<script>
var mo=document.getElementById('mo'),mv=document.getElementById('mv');
document.querySelectorAll('[data-src]').forEach(function(b){b.addEventListener('click',function(){mv.src=b.dataset.src;mo.classList.add('on');mv.play().catch(function(){})})});
function close(){mv.pause();mv.removeAttribute('src');mv.load();mo.classList.remove('on')}
mo.addEventListener('click',function(e){if(e.target===mo||e.target.classList.contains('x'))close()});
document.querySelectorAll('.cp').forEach(function(b){b.addEventListener('click',function(){var t=b.dataset.text;var done=function(){b.textContent='コピーしました';b.classList.add('ok');setTimeout(function(){b.textContent='説明文をコピー';b.classList.remove('ok')},1800)};if(navigator.clipboard)navigator.clipboard.writeText(t).then(done,function(){prompt('コピーしてください',t)});else prompt('コピーしてください',t)})});
</script>
</body></html>
`);
