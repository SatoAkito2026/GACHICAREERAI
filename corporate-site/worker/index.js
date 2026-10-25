// 会社ホームページの Worker。ページや画像は public/ からそのまま配信し、
// ここではお問い合わせフォーム（POST /api/contact）だけを受けて、Resend で info@akitogroup.jp に届ける。
// 秘密鍵: RESEND_API_KEY（wrangler secret put RESEND_API_KEY）

const TO = "info@akitogroup.jp";
const FROM = "AKITOグループ ホームページ <info@akitogroup.jp>";

const TOPICS = {
  "gachicareer-ai": "ガチキャリAI",
  gachicareer: "ガチキャリ",
  pos: "ポスポス（POSレジ）",
  recruit: "採用応募",
  other: "その他",
};

const LIMITS = { name: 100, company: 100, email: 200, tel: 30, subject: 200, message: 4000 };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function oneLine(s) {
  return s.replace(/[\r\n]+/g, " ").trim();
}

async function handleContact(request, env) {
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json({ error: "このページからは送信できません。" }, 403);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: "送信内容を読み取れませんでした。" }, 400);
  }
  if (typeof data !== "object" || data === null) return json({ error: "送信内容を読み取れませんでした。" }, 400);

  // ロボット対策：人には見えない欄に何か入っていたら、送ったことにして捨てる
  if (data.website) return json({ ok: true });

  const f = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    const v = typeof data[key] === "string" ? data[key].trim() : "";
    if (v.length > max) return json({ error: "入力が長すぎます。短くしてお送りください。" }, 400);
    f[key] = v;
  }
  if (!f.name || !f.email || !f.subject || !f.message) {
    return json({ error: "お名前・メールアドレス・件名・お問い合わせ内容を入力してください。" }, 400);
  }
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(f.email)) {
    return json({ error: "メールアドレスの形をご確認ください（例：name@example.com）。" }, 400);
  }
  const topic = Object.hasOwn(TOPICS, data.topic) ? TOPICS[data.topic] : "未選択";

  if (!env.RESEND_API_KEY) return json({ error: "ただいま送信できません。info@akitogroup.jp へメールでご連絡ください。" }, 500);

  const rows = [
    ["ご用件", topic],
    ["お名前", f.name],
    ["会社名・団体名", f.company || "（なし）"],
    ["メール", f.email],
    ["電話番号", f.tel || "（なし）"],
    ["件名", f.subject],
  ];
  const html =
    `<p>ホームページのお問い合わせフォームから送信がありました。</p><table cellpadding="6" style="border-collapse:collapse">` +
    rows.map(([k, v]) => `<tr><th align="left" style="border-bottom:1px solid #ddd">${k}</th><td style="border-bottom:1px solid #ddd">${escapeHtml(v)}</td></tr>`).join("") +
    `</table><p style="white-space:pre-wrap;margin-top:16px">${escapeHtml(f.message)}</p>`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\n${f.message}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      reply_to: f.email,
      subject: oneLine(`【HP問い合わせ／${topic}】${f.subject}`),
      html,
      text,
    }),
  });
  if (!res.ok) {
    console.error("resend failed", res.status, await res.text());
    return json({ error: "送信できませんでした。お手数ですが、info@akitogroup.jp へメールでご連絡ください。" }, 502);
  }
  return json({ ok: true });
}


// ===== ポスポスのモニター募集（POST /api/monitor） =====
// 申し込みを Supabase の posupos_monitors に入れて、info@ に知らせ、申し込んだ人に確認のメールを送る。
// 契約が切れる前のお知らせは scheduled（毎日）で送る。本人が「案内してよい」にチェックした人だけ。
// 秘密鍵: SUPABASE_SERVICE_ROLE_KEY（wrangler secret put SUPABASE_SERVICE_ROLE_KEY）。SUPABASE_URL は wrangler.jsonc の vars
const SITE = "https://akitogroup.jp";
const SENDER = "合同会社AKITOグループ（ポスポス）";
const SENDER_ADDR = "東京都豊島区東池袋";
const MON_LIMITS = { shop_name: 100, shop_type: 60, stores: 30, prefecture: 20, name: 100, email: 200, tel: 30, current_pos: 100, contract_end: 7, contract_note: 30, message: 2000 };

async function sendMail(env, msg) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, ...msg }),
  });
  if (!res.ok) console.error("resend failed", res.status, await res.text());
  return res.ok;
}

function sb(env, path, init = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

const footerText = (stopUrl) =>
  `\n\n――――――――\n${SENDER}\n${SENDER_ADDR}\nTEL 080-2420-4900 ／ info@akitogroup.jp\n${stopUrl ? `今後このご案内が不要な場合は、こちらから止められます：${stopUrl}\n` : ""}`;

async function handleMonitor(request, env) {
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: "このページからは送信できません。" }, 403);
  let data;
  try { data = await request.json(); } catch { return json({ error: "送信内容を読み取れませんでした。" }, 400); }
  if (typeof data !== "object" || data === null) return json({ error: "送信内容を読み取れませんでした。" }, 400);
  if (data.website) return json({ ok: true });
  const f = {};
  for (const [key, max] of Object.entries(MON_LIMITS)) {
    const v = typeof data[key] === "string" ? data[key].trim() : "";
    if (v.length > max) return json({ error: "入力が長すぎます。短くしてお送りください。" }, 400);
    f[key] = v;
  }
  if (!f.shop_name || !f.name || !f.email) return json({ error: "お店の名前・お名前・メールアドレスを入力してください。" }, 400);
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(f.email)) return json({ error: "メールアドレスの形をご確認ください（例：name@example.com）。" }, 400);
  if (!data.agree) return json({ error: "モニターの内容への同意にチェックしてください。" }, 400);
  if (!env.RESEND_API_KEY) return json({ error: "ただいま送信できません。お電話でご連絡ください。" }, 500);
  const contractEnd = /^\d{4}-\d{2}$/.test(f.contract_end) ? `${f.contract_end}-01` : null;
  const remindOk = data.remind_ok === true && !!contractEnd;

  let stopToken = null;
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const row = { shop_name: f.shop_name, shop_type: f.shop_type || null, stores: f.stores || null, prefecture: f.prefecture || null, name: f.name, email: f.email, tel: f.tel || null,
      current_pos: f.current_pos || null, contract_end: contractEnd, contract_note: f.contract_note || null, remind_ok: remindOk, message: f.message || null };
    const r = await sb(env, "posupos_monitors", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
    if (r.ok) stopToken = (await r.json())[0]?.stop_token || null;
    else console.error("supabase insert failed", r.status, await r.text());
  }

  const rows = [["お店の名前", f.shop_name], ["お店の種類", f.shop_type], ["都道府県", f.prefecture], ["店舗数", f.stores], ["お名前", f.name], ["メール", f.email], ["電話番号", f.tel],
    ["今のレジ", f.current_pos], ["契約が切れる時期", f.contract_end || f.contract_note], ["切れる前の案内", remindOk ? "受け取る" : "受け取らない"], ["保存", stopToken ? "Supabase に保存済み" : "保存なし（このメールだけ）"]];
  const text = rows.map(([k, v]) => `${k}: ${v || "（なし）"}`).join("\n") + `\n\n${f.message || ""}`;
  const ok = await sendMail(env, { to: [TO], reply_to: f.email, subject: oneLine(`【ポスポス モニター申し込み】${f.shop_name}（${f.shop_type || "種類未選択"}）`), text });
  if (!ok) return json({ error: "送信できませんでした。お手数ですが、お電話でご連絡ください。" }, 502);

  const stopUrl = remindOk && stopToken ? `${SITE}/api/monitor/stop?t=${stopToken}` : "";
  await sendMail(env, {
    to: [f.email], reply_to: TO,
    subject: "【ポスポス】モニターのお申し込みを受け付けました",
    text: `${f.name} 様\n\nポスポスのモニターにお申し込みいただき、ありがとうございます。\n担当者から、メールかお電話でご連絡します（${f.shop_name}）。\n\n・モニター期間：2か月（無料。カードの登録はいりません）\n・今お使いのレジ・決済と並行してお使いいただけます\n・お願い：使ってみた感想をお聞かせください\n` +
      (remindOk ? `\n今のレジの契約が切れる前（${f.contract_end.replace("-", "年")}月の前）に、ポスポスのご案内をお送りします。\n` : "") + footerText(stopUrl),
  });
  return json({ ok: true });
}

async function handleMonitorStop(url, env) {
  const t = url.searchParams.get("t") || "";
  const page = (msg) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ポスポス</title><body style="font-family:sans-serif;max-width:560px;margin:60px auto;padding:0 20px;line-height:1.8"><h1 style="font-size:22px">ポスポス</h1><p>${msg}</p><p><a href="/posupos">ポスポスのページへ</a></p></body>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (!/^[0-9a-f-]{36}$/.test(t) || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return page("このリンクは使えません。お手数ですが info@akitogroup.jp へご連絡ください。");
  const r = await sb(env, `posupos_monitors?stop_token=eq.${t}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ stopped_at: new Date().toISOString() }) });
  if (!r.ok) console.error("supabase stop failed", r.status, await r.text());
  const rows = r.ok ? await r.json() : [];
  return page(rows.length ? "ご案内のメールを止めました。これまでありがとうございました。" : "このリンクは使えません（すでに止めたか、期限が切れています）。お手数ですが info@akitogroup.jp へご連絡ください。");
}

// 毎日：契約が切れる3か月前になった人に、1回だけご案内を送る（本人が同意した人だけ）
async function sendContractReminders(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.RESEND_API_KEY) return;
  const today = new Date();
  const until = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 3, 1)).toISOString().slice(0, 10);
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const r = await sb(env, `posupos_monitors?select=id,name,shop_name,email,current_pos,contract_end,stop_token&remind_ok=is.true&stopped_at=is.null&reminded_at=is.null&contract_end=gte.${from}&contract_end=lte.${until}&limit=50`);
  if (!r.ok) { console.error("supabase select failed", r.status, await r.text()); return; }
  for (const m of await r.json()) {
    const ym = m.contract_end.slice(0, 7).replace("-", "年") + "月";
    const sent = await sendMail(env, {
      to: [m.email], reply_to: TO,
      subject: `【ポスポス】今のレジの契約（${ym}）が近づいてきました`,
      text: `${m.name} 様（${m.shop_name}）\n\n以前ポスポスのモニターにお申し込みいただいた際に、今のレジ${m.current_pos ? `（${m.current_pos}）` : ""}の契約が ${ym} に切れるとうかがっていました。\n\n切りかえを考える時期になりましたら、ポスポスもぜひご検討ください。\n・注文・会計から、打刻・シフト・給料、AI面接まで、ひとつのアプリで\n・スタンダードプランはキャンペーン価格（予告なく終了する場合があります）\n・初期費用0円・登録の作業はこちらで代わりに行います\n\nくわしくはこちら：${SITE}/posupos\nご相談はこのメールへの返信か、お電話でどうぞ。` + footerText(`${SITE}/api/monitor/stop?t=${m.stop_token}`),
    });
    if (sent) await sb(env, `posupos_monitors?id=eq.${m.id}`, { method: "PATCH", body: JSON.stringify({ reminded_at: new Date().toISOString() }) });
  }
}

// WordPress 時代のURL → 新しいページ（検索結果や古いリンクから来た人のため）
const OLD_URLS = {
  "/about-company": "/about",
  "/contact": "/contact",
  "/blog-2": "/news",
  "/blog": "/news",
  // ガチキャリAIのLPはアプリのトップページ（gachicareer-ai.akitogroup.jp）に一本化
  "/interview-copilot-ai": "https://gachicareer-ai.akitogroup.jp/",
  "/gachicareer-ai": "https://gachicareer-ai.akitogroup.jp/",
  "/gachicareer-ai.html": "https://gachicareer-ai.akitogroup.jp/",
  "/無料相談・イベント": "/",
  "/2025/10/06/blog-3": "/news-barracks",
  "/2025/09/25/椎名町小学校でボランティア活動をしてまいりました！": "/news-volunteer",
  "/2025/09/25/akitoグループのホームページを開設しました！": "/news-open",
};

function oldUrlRedirect(url) {
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  path = path.replace(/\/+$/, "").toLowerCase() || "/";
  const to = OLD_URLS[path];
  // /contact はそのまま新しいページなので、末尾の / だけの違いは ASSETS に任せる
  if (to && to !== path) return Response.redirect(new URL(to, url).toString(), 301);
  if (/^\/(category|author|tag)\//.test(path)) return Response.redirect(new URL("/news", url).toString(), 301);
  if (path === "/feed" || path.startsWith("/wp-")) return Response.redirect(new URL("/", url).toString(), 301);
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const moved = oldUrlRedirect(url);
    if (moved) return moved;
    if (url.pathname === "/api/monitor") {
      if (request.method !== "POST") return json({ error: "POST で送ってください。" }, 405);
      return handleMonitor(request, env);
    }
    if (url.pathname === "/api/monitor/stop") return handleMonitorStop(url, env);
    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") return json({ error: "POST で送ってください。" }, 405);
      return handleContact(request, env);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendContractReminders(env));
  },
};
