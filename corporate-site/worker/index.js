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
    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") return json({ error: "POST で送ってください。" }, 405);
      return handleContact(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
