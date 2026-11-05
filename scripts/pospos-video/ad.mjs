// ポスポスの広告動画（夜のお店・約40秒・9:16）を作る
// 作り直したいときは、corporate-site/public/pospos-videos/ad-night-40.mp4 を消して push する
// 声：オーナー（男性・疲れてぼやく）とナレーション（高めの女性）。最初と最後に「ポスポス♪」（LP と同じ assets/posupos.mp3）
// BGM：assets/bgm-night.mp3（bgm.py で自作。著作権の心配なし）を小さく流す
// 画面：文字の場面と、デモのお店（キャバクラ Club Rose）の画面
// 使い方：node ad.mjs（OPENAI_API_KEY がないときは声なしで長さだけ合わせる＝見た目の確認用）
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO } from "./videos.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../corporate-site/public/pospos-videos");
const WORK = path.join(HERE, ".work", "ad-night");
const APP = "https://pospos.akitogroup.jp";
const KEY = process.env.OPENAI_API_KEY || "";
const W = 1080, H = 1920;
const ID = "ad-night-40";
// LP を開いたときに鳴る「ポスポス♪」と同じ音（加工ずみ）
const JINGLE = path.resolve(HERE, "../../corporate-site/public/assets/posupos.mp3");
const BGM = path.join(HERE, "assets/bgm-night.mp3");

// 声の決まり
const VOICE = {
  owner: { voice: "ash", tempo: 1.58, how: "30代の日本人男性。夜のお店のオーナー。閉店後で疲れていて、ため息まじりに、ぼやくように話す。" },
  narr: { voice: "shimmer", tempo: 1.45, how: "明るく、少し高めの声の日本人女性のナレーション。はっきり、テンポよく、やさしく。" },
};

// 場面（上から順に）。kind：logo／clock／list／demo／big／relief／cta
const SCENES = [
  { kind: "logo", jingle: true },
  { kind: "clock", who: "owner", say: "はぁ…今日もバック計算、終わらない…" },
  { kind: "list", n: 1, who: "owner", tempo: 1.75, gap: 0, say: "付け回しは、ホワイトボード。" },
  { kind: "list", n: 2, who: "owner", tempo: 1.75, gap: 0, say: "給料は、エクセルで手計算。" },
  { kind: "list", n: 3, who: "owner", tempo: 1.75, gap: 0, say: "キャストには毎日、今日いくら？って聞かれるし…" },
  { kind: "demo", go: "/admin/slips", who: "narr", say: "ポスポスなら、お会計するだけで、" },
  { kind: "demo", go: "/admin/slips", scroll: 300, who: "narr", say: "バックも給料も、自動で計算。" },
  { kind: "demo", go: "/admin/seating", scroll: 380, who: "narr", say: "付け回しは、選んで押すだけ。" },
  { kind: "demo", go: "/admin/ranking", prev: true, who: "narr", say: "売上や指名のランキングも、伝票から自動で。" },
  { kind: "demo", go: "/me", prep: true, who: "narr", say: "キャストは、給料も今の席もスマホで確認。" },
  { kind: "demo", img: "assets/img/pos-ai-talk-night.webp", who: "narr", say: "体入の前の一次面接も、AIにおまかせ。", read: "体験入店の前の一次面接も、エーアイにおまかせ。" },
  { kind: "big", who: "narr", say: "毎日1時間半かかっていた給料計算が、確認するだけの1分に。" },
  { kind: "relief", who: "owner", say: "え、もう終わり？" },
  { kind: "point", who: "narr", say: "今のレジはそのままで、並べて試せます。", big: "今のレジのまま<br>並べて試せる" },
  { kind: "cta", who: "narr", say: "今なら0円で始められます。夜のこと、全部ポスポス。", jingle: true },
];
const LIST = ["付け回しは、ホワイトボード", "給料は、Excelで手計算", "「今日いくら？」と毎日聞かれる"];

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
const dur = (f) => parseFloat(sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const b64 = (file, type) => `data:${type};base64,` + fs.readFileSync(file).toString("base64");

async function tts(text, who, file, tempo) {
  const v = VOICE[who];
  if (!KEY) {
    const sec = Math.max(1.4, text.length * 0.12);
    sh("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", sec.toFixed(2), "-q:a", "4", file]);
    return;
  }
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: v.voice, input: text, response_format: "mp3", instructions: v.how }),
  });
  if (!r.ok) throw new Error(`TTS ${r.status} ${await r.text()}`);
  const raw = file.replace(/\.mp3$/, ".raw.mp3");
  fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
  sh("ffmpeg", ["-y", "-i", raw, "-filter:a", `silenceremove=start_periods=1:start_threshold=-45dB,atempo=${tempo || v.tempo},areverse,silenceremove=start_periods=1:start_silence=0.08:start_threshold=-45dB,areverse`, "-ar", "44100", "-ac", "2", file]);
}

const FONT = `'Noto Sans CJK JP','Noto Sans JP','IPAGothic',sans-serif`;
const BG = "linear-gradient(160deg,#0B1022,#18204A 55%,#3A1C4F)";
const GOLD = "#FFB547";
const page0 = (inner, bg = BG) => `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;background:${bg};font-family:${FONT};color:#fff;position:relative;overflow:hidden">${inner}</body></html>`;
const cap = (who, text) => `<div style="position:absolute;left:60px;right:120px;bottom:250px;font-size:48px;font-weight:800;line-height:1.45;background:rgba(10,14,35,.88);border-left:12px solid ${who === "owner" ? "#8FA3C8" : GOLD};padding:24px 32px;border-radius:20px"><span style="display:block;font-size:26px;opacity:.7;margin-bottom:6px">${who === "owner" ? "オーナー" : "ポスポス"}</span>${esc(text)}</div>`;

function frame(sc, ctx) {
  if (sc.kind === "logo") {
    return page0(`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><img src="${ctx.logo}" style="width:300px;height:300px;border-radius:64px"><div style="font-size:84px;font-weight:900;margin-top:40px;letter-spacing:.06em">ポスポス</div><div style="font-size:36px;opacity:.75;margin-top:12px">夜のお店のPOSレジ</div></div>`);
  }
  if (sc.kind === "clock") {
    return page0(`<div style="position:absolute;top:330px;left:0;right:60px;text-align:center"><div style="font-size:40px;opacity:.65">閉店後</div><div style="font-size:220px;font-weight:900;letter-spacing:.04em;color:#E6ECFF;text-shadow:0 0 40px rgba(120,150,255,.35)">3:12</div><div style="font-size:44px;opacity:.75;margin-top:10px">伝票の山と、電卓と、Excel</div></div>
      <div style="position:absolute;top:900px;left:120px;right:180px;display:flex;gap:18px;justify-content:center">${["伝票", "電卓", "Excel"].map((t) => `<div style="flex:1;height:200px;border-radius:24px;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.15);display:grid;place-items:center;font-size:40px;font-weight:800;opacity:.85">${t}</div>`).join("")}</div>${cap(sc.who, sc.say)}`, "linear-gradient(160deg,#05070F,#0E1430 60%,#1B1236)");
  }
  if (sc.kind === "list") {
    const items = LIST.map((t, i) => `<div style="opacity:${i < sc.n ? 1 : .18};display:flex;align-items:center;gap:26px;background:rgba(255,255,255,${i < sc.n ? .1 : .04});border-radius:26px;padding:34px 36px;font-size:54px;font-weight:900"><span style="flex:0 0 76px;height:76px;border-radius:50%;background:${i < sc.n ? "#E5484D" : "#444"};display:grid;place-items:center;font-size:44px">✕</span>${esc(t)}</div>`).join("");
    return page0(`<div style="position:absolute;top:220px;left:60px;right:120px;font-size:58px;font-weight:900">夜のお店の、あるある</div><div style="position:absolute;top:400px;left:60px;right:120px;display:grid;gap:30px">${items}</div>${cap(sc.who, sc.say)}`);
  }
  if (sc.kind === "demo") {
    return page0(`<div style="position:absolute;top:150px;left:60px;right:120px;font-size:58px;font-weight:900;color:${GOLD}">ポスポスなら</div>
      <div style="position:absolute;top:300px;left:90px;width:840px;height:1300px;border-radius:48px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5);background:#fff"><img src="${ctx.shot}" style="width:840px;display:block"></div>
      ${cap(sc.who, sc.say)}<div style="position:absolute;top:1678px;left:90px;font-size:26px;opacity:.7">画面はデモ・見本です（お店・人の名前・数字は架空）</div>`);
  }
  if (sc.kind === "big") {
    return page0(`<div style="position:absolute;top:340px;left:60px;right:120px;text-align:center"><div style="font-size:46px;opacity:.8">導入店の例（ミックスバー）</div><div style="font-size:64px;font-weight:900;margin-top:40px">毎日の給料の計算</div>
      <div style="font-size:120px;font-weight:900;margin-top:30px;line-height:1.2">約1時間半<br><span style="font-size:80px;opacity:.7">↓</span><br><span style="color:${GOLD}">約1分</span><div style="font-size:52px;margin-top:10px;color:${GOLD}">（確認するだけ）</div></div>
      <div style="font-size:28px;opacity:.65;margin-top:40px;line-height:1.6">※ 導入店1店舗の聞き取り（月50時間 → 月30分）を、<br>1か月30日で割った目安です。お店によってちがいます。</div></div>${cap(sc.who, sc.say)}`);
  }
  if (sc.kind === "point") {
    return page0(`<div style="position:absolute;top:520px;left:60px;right:120px;text-align:center"><div style="font-size:100px;font-weight:900;line-height:1.35">${sc.big}</div><div style="font-size:40px;opacity:.75;margin-top:40px">入れかえずに、くらべてから決められます</div></div>${cap(sc.who, sc.say)}`);
  }
  if (sc.kind === "relief") {
    return page0(`<div style="position:absolute;top:420px;left:60px;right:120px;text-align:center"><div style="font-size:40px;opacity:.7">閉店後</div><div style="font-size:110px;font-weight:900;margin-top:20px;line-height:1.3">確認する<br>だけ</div></div>${cap(sc.who, sc.say)}`, "linear-gradient(160deg,#1E3A8A,#3B5BDB 55%,#F59F00)");
  }
  // cta
  return page0(`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding-bottom:120px">
    <img src="${ctx.logo}" style="width:220px;height:220px;border-radius:48px">
    <div style="font-size:78px;font-weight:900;margin-top:46px;line-height:1.35">夜のこと、<br>全部ポスポス。</div>
    <div style="margin-top:60px;font-size:54px;font-weight:900;color:${GOLD}">今なら0円で始められる<span style="font-size:24px;vertical-align:super">※</span></div>
    <div style="font-size:40px;font-weight:800;margin-top:14px">初期導入費用0円<span style="font-size:20px;vertical-align:super">※</span>・端末不要</div>
    <div style="font-size:36px;font-weight:700;margin-top:56px;padding:18px 40px;border:4px solid #fff;border-radius:999px">ログインなしで触れるデモは<br>プロフィールのリンクから</div>
    <div style="position:absolute;bottom:230px;left:70px;right:130px;font-size:22px;opacity:.6;line-height:1.6">※ 0円で始められる：ライト・スタンダードプランは最初の1か月無料。※ 初期導入費用0円：1年以上の年間契約のとき（先着30店まで）。月ごとの契約は55,000円（税込）。</div></div>`);
}

const browser = await chromium.launch();
const app = await browser.newContext({ viewport: { width: 390, height: 604 }, deviceScaleFactor: 3, locale: "ja-JP" });
const pg = await app.newPage();
const canvas = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
await pg.goto(DEMO.night, { waitUntil: "networkidle", timeout: 90000 });
const settle = async () => {
  await pg.waitForLoadState("networkidle").catch(() => {});
  for (let i = 0; i < 20; i++) { const t = await pg.textContent("body").catch(() => ""); if (!t.includes("読み込んでいます")) break; await pg.waitForTimeout(800); }
  await pg.waitForTimeout(1200);
};
const logo = b64(path.resolve(HERE, "../../corporate-site/public/assets/img/posupos-mark.webp"), "image/webp");

const clips = [];
for (const [i, sc] of SCENES.entries()) {
  const ctx = { logo };
  if (sc.kind === "demo") {
    if (sc.img) {
      ctx.shot = b64(path.resolve(HERE, "../../corporate-site/public", sc.img), "image/webp");
    } else {
      if (sc.prep) {
        await pg.goto(APP + "/admin/seating", { waitUntil: "networkidle", timeout: 90000 }); await settle();
        for (const txt of ["2名", "あいり", "場内指名", "30分", "に付ける"]) { await pg.locator("button").filter({ hasText: txt }).first().click({ timeout: 10000 }).catch(() => {}); await pg.waitForTimeout(500); }
        await settle();
      }
      await pg.goto(APP + sc.go, { waitUntil: "networkidle", timeout: 90000 }); await settle();
      if (sc.prev) { await pg.getByText("← 前月", { exact: true }).first().click().catch(() => {}); await settle(); }
      if (sc.scroll) { await pg.mouse.wheel(0, sc.scroll); await pg.waitForTimeout(700); }
      ctx.shot = "data:image/png;base64," + (await pg.screenshot()).toString("base64");
    }
  }
  const png = path.join(WORK, `f${i}.png`), mp4 = path.join(WORK, `c${i}.mp4`);
  await canvas.setContent(frame(sc, ctx), { waitUntil: "load" });
  await canvas.waitForTimeout(200);
  await canvas.screenshot({ path: png });
  // この場面の音：声（＋最後はジングル）。ロゴの場面はジングルだけ
  const parts = [];
  if (sc.say) { const a = path.join(WORK, `v${i}.mp3`); await tts(sc.read || sc.say, sc.who, a, sc.tempo); parts.push(a); }
  if (sc.jingle) parts.push(JINGLE);
  const aud = path.join(WORK, `a${i}.m4a`);
  if (parts.length === 1) sh("ffmpeg", ["-y", "-i", parts[0], "-ar", "44100", "-ac", "2", aud]);
  else sh("ffmpeg", ["-y", "-i", parts[0], "-i", parts[1], "-filter_complex", "[0:a]aresample=44100,aformat=channel_layouts=stereo,apad=pad_dur=0.25[a0];[1:a]aresample=44100,aformat=channel_layouts=stereo[a1];[a0][a1]concat=n=2:v=0:a=1[a]", "-map", "[a]", aud]);
  const d = dur(aud) + (sc.kind === "cta" ? 1.6 : sc.gap ?? 0.2);
  sh("ffmpeg", ["-y", "-loop", "1", "-framerate", "30", "-i", png, "-i", aud, "-filter_complex", "[1:a]apad[a]", "-map", "0:v", "-map", "[a]",
    "-t", d.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2", mp4]);
  clips.push(mp4);
}
await browser.close();

const list = path.join(WORK, "list.txt");
fs.writeFileSync(list, clips.map((c) => `file '${c}'`).join("\n"));
const voiceOnly = path.join(WORK, "voice.mp4");
sh("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", voiceOnly]);
const total = dur(voiceOnly);
// BGM を小さく重ねる（声のじゃまをしない大きさ。最後はフェードアウト）
const out = path.join(OUT, `${ID}.mp4`);
sh("ffmpeg", ["-y", "-i", voiceOnly, "-stream_loop", "-1", "-i", BGM, "-filter_complex",
  `[1:a]volume=0.16,atrim=0:${total.toFixed(2)},afade=t=out:st=${(total - 2).toFixed(2)}:d=2[b];[0:a][b]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`,
  "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
fs.copyFileSync(path.join(WORK, "f1.png"), path.join(OUT, `${ID}.png`));
console.log(`作りました: ${path.relative(process.cwd(), out)}（${dur(out).toFixed(1)}秒${KEY ? "" : "・声なし"}）`);
