// ポスポスの資料（資料請求用・営業プレゼン用）を作る
const pptxgen = require("pptxgenjs");
const path = require("path");
const { applyTheme } = require("/root/.claude/skills/synced/5257273b-3804-4b6c-afb4-f365b8a8a02c_cf6d8f1c-f98e-4872-be22-d9784f1802d1/pptx/scripts/apply_theme.js");

const F = "Yu Gothic";
const THEME = {
  name: "POSPOS", headFontFace: F, bodyFontFace: F,
  colors: { dk1: "13234A", lt1: "FFFFFF", dk2: "0E1F4D", lt2: "F2F6FD",
    accent1: "1557D6", accent2: "FFB547", accent3: "E5484D", accent4: "22A06B", accent5: "288DFD", accent6: "7A3FB0",
    hlink: "1557D6", folHlink: "7A3FB0" },
};
const K = { navy: "13234A", deep: "0E1F4D", blue: "1557D6", sky: "288DFD", mist: "F2F6FD", line: "DCE4F2", ink2: "4A5878", gold: "FFB547", goldL: "FFE58A", red: "E5484D", white: "FFFFFF" };
const IMG = (n) => path.join(__dirname, "img", n + ".png");
const NOTE_FIRST = "※ 世界初：2026年10月 当社調べ。POSレジに、AIによる応募者の一次面接の機能を標準でつけたサービスとして。";

function setup(title) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pres.title = title; pres.author = "合同会社AKITOグループ"; pres.company = "合同会社AKITOグループ";
  pres.theme = { headFontFace: F, bodyFontFace: F };
  pres.defineSlideMaster({ title: "DARK", background: { color: K.deep },
    objects: [{ image: { path: IMG("posupos-lockup-night"), x: 0.6, y: 6.75, w: 1.67, h: 0.45 } }] });
  pres.defineSlideMaster({ title: "LIGHT", background: { color: K.white },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.4, w: 12.1, h: 0.9, fontFace: F, fontSize: 30, bold: true, color: K.navy, valign: "middle", margin: 0 }, text: "" } },
      { image: { path: IMG("posupos-lockup"), x: 11.1, y: 6.85, w: 1.48, h: 0.4 } },
    ],
    slideNumber: { x: 0.6, y: 6.9, w: 0.6, h: 0.3, fontFace: F, fontSize: 10, color: K.ink2 } });
  return pres;
}
const T = (s, text, o) => s.addText(text, Object.assign({ fontFace: F, isTextBox: true, margin: 0, color: K.navy, fontSize: 15, valign: "top" }, o));
const card = (s, x, y, w, h, fill = K.mist, name) => s.addShape("roundRect", { x, y, w, h, rectRadius: 0.15, fill: { color: fill }, line: { color: fill }, objectName: name });
const shadowCard = (s, x, y, w, h, name) => s.addShape("roundRect", { x, y, w, h, rectRadius: 0.15, fill: { color: K.white }, line: { color: K.line, width: 1 }, shadow: { type: "outer", color: "13234A", opacity: 0.12, blur: 8, offset: 3, angle: 90 }, objectName: name });
const pill = (s, x, y, w, text, fill = K.gold, color = "3A2200", size = 13) => {
  s.addShape("roundRect", { x, y, w, h: 0.42, rectRadius: 0.21, fill: { color: fill }, line: { color: fill } });
  T(s, text, { x, y, w, h: 0.42, align: "center", valign: "middle", bold: true, fontSize: size, color });
};
const num = (s, x, y, n, fill = K.blue) => {
  s.addShape("ellipse", { x, y, w: 0.5, h: 0.5, fill: { color: fill }, line: { color: fill } });
  T(s, String(n), { x, y, w: 0.5, h: 0.5, align: "center", valign: "middle", bold: true, fontSize: 16, color: K.white });
};
const foot = (s, text, color = K.ink2) => T(s, text, { x: 1.4, y: 6.86, w: 9.4, h: 0.4, fontSize: 10, color, valign: "middle" });
const img = (s, n, x, y, w, h, frame = true) => {
  if (frame) s.addShape("roundRect", { x: x - 0.06, y: y - 0.06, w: w + 0.12, h: h + 0.12, rectRadius: 0.1, fill: { color: K.white }, line: { color: K.line, width: 1 }, shadow: { type: "outer", color: "13234A", opacity: 0.15, blur: 10, offset: 4, angle: 90 } });
  s.addImage({ path: IMG(n), x, y, w, h });
};
function cardsGrid(s, items, { x = 0.6, y = 1.6, w = 12.1, cols = 3, h = 1.9, gap = 0.3, fill = K.mist, titleColor = K.navy, bodyColor = K.ink2, titleSize = 17, bodySize = 14, numbered = false, shadow = false } = {}) {
  const cw = (w - gap * (cols - 1)) / cols;
  items.forEach(([t, b], i) => {
    const cx = x + (i % cols) * (cw + gap), cy = y + Math.floor(i / cols) * (h + gap);
    if (shadow) shadowCard(s, cx, cy, cw, h); else card(s, cx, cy, cw, h, fill);
    let tx = cx + 0.3;
    if (numbered) { num(s, cx + 0.3, cy + 0.28, i + 1); tx = cx + 0.95; }
    T(s, t, { x: tx, y: cy + 0.28, w: cw - (tx - cx) - 0.25, h: 0.5, bold: true, fontSize: titleSize, color: titleColor, valign: "middle" });
    T(s, b, { x: cx + 0.3, y: cy + 0.9, w: cw - 0.55, h: h - 1.05, fontSize: bodySize, color: bodyColor, lineSpacingMultiple: 1.15 });
  });
}
const title = (s, t) => s.addText(t, { placeholder: "title" });

// ---------- 共通のスライド ----------
function coverSlide(pres, kicker, big, sub) {
  const s = pres.addSlide({ masterName: "DARK" });
  s.addImage({ path: IMG("posupos-logo-full-night"), x: 8.7, y: 1.5, w: 3.9, h: 3.56 });
  pill(s, 0.8, 1.2, 1.5, "世界初※");
  T(s, "面接を自動化した、POSシステム", { x: 2.45, y: 1.2, w: 6, h: 0.42, valign: "middle", bold: true, fontSize: 18, color: K.white });
  T(s, big, { x: 0.8, y: 2.0, w: 7.8, h: 2.1, bold: true, fontSize: 44, color: K.white, lineSpacingMultiple: 1.1, valign: "middle" });
  T(s, sub, { x: 0.8, y: 4.25, w: 7.6, h: 1.0, fontSize: 18, color: "C9D6F5", lineSpacingMultiple: 1.2 });
  T(s, kicker, { x: 0.8, y: 5.45, w: 7.6, h: 0.4, fontSize: 14, color: K.goldL, bold: true });
  T(s, NOTE_FIRST, { x: 2.6, y: 6.8, w: 10.1, h: 0.4, fontSize: 10, color: "9FB0D8", valign: "middle" });
  return s;
}
function savesSlide(pres, night, ttl) {
  const s = pres.addSlide({ masterName: "LIGHT" });
  title(s, ttl);
  const items = [["お店が見るのは", "1分の録画", "届いた録画と選んだ答えを見て決めるだけ。対面の面接はいりません"],
    ["URLを送る", "1秒", "ボタンを押すとLINEが開き、送る文もアプリが作ります"],
    ["結果", "自動で届く", "受け終わると、録画・写真・選んだ答えの一覧・話し方の雰囲気のまとめが届きます"],
    ["日程調整", "いらない", "面接の日を決めるやりとりがなくなります。応募者もお店に来なくてOK"],
    night ? ["体入費", "節約", "体入の前に会う人をしぼれるので、合わない人の体入費が減ります"] : ["ドタキャン", "待ちぼうけなし", "面接の予定を入れないので、来ない人を待つ時間がむだになりません"]];
  const cw = 2.26, gap = 0.2;
  items.forEach(([lab, big, body], i) => {
    const x = 0.6 + i * (cw + gap), y = 1.65;
    s.addShape("roundRect", { x, y, w: cw, h: 4.6, rectRadius: 0.15, fill: { color: K.deep }, line: { color: K.deep } });
    pill(s, x + 0.25, y + 0.3, 1.3, lab, "2A3F80", K.white, 12);
    T(s, big, { x: x + 0.2, y: y + 0.95, w: cw - 0.4, h: 1.3, bold: true, fontSize: big.length <= 3 ? 32 : big.length <= 5 ? 24 : 20, color: K.goldL, valign: "middle" });
    T(s, body, { x: x + 0.25, y: y + 2.4, w: cw - 0.5, h: 2.0, fontSize: 14, color: "DCE4F7", lineSpacingMultiple: 1.2 });
  });
  foot(s, "応募者は、ボタンで選ぶのに1分ほど・AIと話すのが1分ほど。AIは合否を決めません。採用はお店が決めます。");
  return s;
}
function fitSlide(pres, ttl) {
  const s = pres.addSlide({ masterName: "LIGHT" });
  title(s, ttl);
  img(s, "pos-ai-result-day", 7.05, 1.9, 5.6, 3.35);
  cardsGrid(s, [["条件が一覧でわかる", "出勤日数・曜日・時間帯・勤務開始・通勤・経験を、全員が同じボタンで答えます。選んだ答えが一覧で届きます。"],
    ["お店の質問も聞ける", "お店から聞きたいことを3つまで。AIの面接官が会話の中で聞きます。"],
    ["話している姿が見える", "自己紹介とやってみたい理由を話す姿の録画と顔の写真。雰囲気・話し方・表情がわかります。"]],
    { x: 0.6, y: 1.6, w: 6.0, cols: 1, h: 1.45, gap: 0.2, titleSize: 17, bodySize: 13.5 });
  T(s, "画面は見本です（お店・応募者は架空）", { x: 7.05, y: 5.4, w: 5.6, h: 0.3, fontSize: 10, color: K.ink2 });
  foot(s, "AIは合否を決めません。見た目についてもAIは何も言いません。録画と写真を見て、お店が決めます。");
  return s;
}
function priceSlide(pres, ttl, sales) {
  const s = pres.addSlide({ masterName: "LIGHT" });
  title(s, ttl);
  const cols = [
    { n: "ライト", p: "11,000円", r: "", who: "お会計と売上を、まず楽に", pts: ["注文・会計・伝票", "QR注文・厨房の画面", "ポイント・会員証", "Square・レシート印刷"], ai: false },
    { n: "スタンダード", p: "昼 22,000円\n夜 33,000円", r: "今申し込んだお店は、ずっとこの価格", who: "お店の運営を、まるごと", pts: ["ライトの機能すべて", "打刻・シフト・給料", "顧客・クーポン・お金・日報", "AI面接（追加料金なし）"], ai: true },
    { n: "個別", p: "55,000円〜", r: "", who: "お店のやり方に合わせて", pts: ["ライト＋スタンダードの機能", "お店独自の給料の計算", "データの取り込み・帳票", "AI面接（追加料金なし）"], ai: true },
  ];
  const cw = 3.85, gap = 0.28;
  cols.forEach((c, i) => {
    const x = 0.6 + i * (cw + gap), y = 1.55, std = i === 1;
    s.addShape("roundRect", { x, y, w: cw, h: 4.75, rectRadius: 0.15, fill: { color: std ? K.white : K.mist }, line: { color: std ? K.blue : K.mist, width: std ? 2.5 : 1 }, shadow: std ? { type: "outer", color: "1557D6", opacity: 0.25, blur: 12, offset: 4, angle: 90 } : undefined });
    if (std) pill(s, x + 0.3, y - 0.2, 2.6, "キャンペーン価格・おすすめ", K.blue, K.white, 12);
    T(s, c.n + "プラン", { x: x + 0.3, y: y + 0.35, w: cw - 0.6, h: 0.5, bold: true, fontSize: 20 });
    T(s, c.who, { x: x + 0.3, y: y + 0.85, w: cw - 0.6, h: 0.35, fontSize: 13, color: K.ink2 });
    if (std) {
      T(s, "月額（税込）", { x: x + 0.3, y: y + 1.2, w: cw - 0.6, h: 0.3, fontSize: 12, color: K.ink2 });
      T(s, c.p, { x: x + 0.3, y: y + 1.45, w: cw - 0.6, h: 0.75, fontSize: 19, bold: true, color: K.blue, lineSpacingMultiple: 1.0 });
      T(s, c.r, { x: x + 0.3, y: y + 2.2, w: cw - 0.6, h: 0.3, fontSize: 11, color: K.ink2 });
    } else T(s, [{ text: "月額 ", options: { fontSize: 13 } }, { text: c.p, options: { fontSize: 24, bold: true } }, { text: "（税込）", options: { fontSize: 11 } }], { x: x + 0.3, y: y + 1.25, w: cw - 0.6, h: 0.6, valign: "middle" });
    T(s, c.pts.map((p, j) => ({ text: p, options: { bullet: true, breakLine: j < c.pts.length - 1, bold: p.startsWith("AI面接"), color: p.startsWith("AI面接") ? K.blue : K.navy } })), { x: x + 0.3, y: y + 2.6, w: cw - 0.6, h: 2.0, fontSize: 14, paraSpaceAfter: 6 });
  });
  foot(s, "料金は1店舗ごと・初期費用0円・1か月無料。キャンペーン期間中のお申し込みは、契約が続くかぎりキャンペーン価格のまま（予告なく終了する場合があります）。");
  return s;
}
function closeSlide(pres, big, steps) {
  const s = pres.addSlide({ masterName: "DARK" });
  T(s, big, { x: 0.8, y: 0.8, w: 11.7, h: 1.1, bold: true, fontSize: big.length > 18 ? 30 : 38, color: K.white, valign: "middle" });
  steps.forEach(([t, b], i) => {
    const x = 0.8 + i * 4.0, y = 2.3;
    s.addShape("roundRect", { x, y, w: 3.7, h: 2.3, rectRadius: 0.15, fill: { color: "1E2F66" }, line: { color: "2E4488" } });
    num(s, x + 0.3, y + 0.3, i + 1, K.gold);
    T(s, t, { x: x + 0.95, y: y + 0.3, w: 2.6, h: 0.5, bold: true, fontSize: 18, color: K.white, valign: "middle" });
    T(s, b, { x: x + 0.3, y: y + 1.0, w: 3.1, h: 1.2, fontSize: 14, color: "C9D6F5", lineSpacingMultiple: 1.2 });
  });
  s.addShape("roundRect", { x: 0.8, y: 4.95, w: 11.7, h: 1.5, rectRadius: 0.15, fill: { color: K.white }, line: { color: K.white } });
  T(s, "お問い合わせ・無料お試しのお申し込み", { x: 1.1, y: 5.1, w: 7, h: 0.4, bold: true, fontSize: 15, color: K.blue });
  T(s, "TEL 080-2420-4900（年中無休・24時間受付）", { x: 1.1, y: 5.55, w: 7, h: 0.45, bold: true, fontSize: 20 });
  T(s, "akitogroup.jp/posupos　／　info@akitogroup.jp", { x: 1.1, y: 6.0, w: 7.4, h: 0.35, fontSize: 14, color: K.ink2 });
  T(s, "合同会社AKITOグループ\n東京都豊島区東池袋", { x: 8.9, y: 5.4, w: 3.4, h: 0.8, fontSize: 13, color: K.ink2, align: "right" });
  return s;
}


// ---------- POSの機能（くわしく） ----------
function shotImg(s, n, x, y, w, maxH) {
  const sz = { floor: [590, 427], checkout: [541, 501], kitchen: [590, 267], money: [1104, 342], "staff-home": [250, 486], slip: [590, 449], tsukemawashi: [590, 553], salary: [1104, 351], back: [541, 397], "cast-home": [250, 486] }[n];
  let h = w * sz[1] / sz[0]; if (maxH && h > maxH) { h = maxH; w = h * sz[0] / sz[1]; }
  img(s, "m-" + n, x, y, w, h); return { w, h };
}
function bulletsBox(s, items, x, y, w, h, size = 14.5) {
  T(s, items.map(([a, b], j) => ({ text: a + (b ? "：" : ""), options: { bold: true, bullet: true, breakLine: !b && j < items.length - 1 } })).flatMap((r, j) => {
    const b = items[j][1]; return b ? [r, { text: b, options: { breakLine: j < items.length - 1, color: K.ink2 } }] : [r];
  }), { x, y, w, h, fontSize: size, paraSpaceAfter: 7, lineSpacingMultiple: 1.1 });
}
function posDetail(pres, keys) {
  const add = {
    order: () => { const s = pres.addSlide({ masterName: "LIGHT" }); title(s, "注文から会計まで（昼のお店）");
      shotImg(s, "floor", 0.65, 1.65, 6.1);
      const st = [["卓を開く", "配置図で卓を選んで人数を入れる。1階／2階のタブも"], ["注文", "オプション・飲み放題／食べ放題・折半。注文は厨房の画面へ"], ["お会計", "分け払い・分けて会計・ポイント／クーポン・Square"], ["レシート", "明細・レシート・領収書を印刷。会員番号のQRつき"]];
      st.forEach(([t, b], i) => { const y = 1.6 + i * 1.18; card(s, 7.15, y, 5.55, 1.0); num(s, 7.4, y + 0.25, i + 1); T(s, t, { x: 8.1, y: y + 0.1, w: 4.4, h: 0.4, bold: true, fontSize: 16 }); T(s, b, { x: 8.1, y: y + 0.5, w: 4.45, h: 0.45, fontSize: 13, color: K.ink2 }); });
      foot(s, "画面は見本です（店名・数字は架空）。"); },
    checkout: () => { const s = pres.addSlide({ masterName: "LIGHT" }); title(s, "お会計でできること");
      shotImg(s, "checkout", 0.65, 1.65, 4.9);
      cardsGrid(s, [["分けて払う・分けて会計", "現金＋カードなど払い方を分けたり、1つの卓を分けて会計したり。"], ["消費税・軽減税率", "店内／お持ち帰りを選んで、お持ち帰りは軽減税率で計算。"], ["深夜料金・サービス料", "22時からの注文に10%など。夜はサービス料も会計でそのまま。"], ["ポイント・クーポン", "会員証のQRでポイント。円引き・％引き・期間・回数のクーポン。"], ["Square・売掛", "カード・交通系IC・QR決済はSquareで。夜は売掛（ツケ）も。"], ["伝票の直しは理由つき", "直す・消すときは理由が必須。あとから見られます。"]],
        { x: 6.0, y: 1.6, w: 6.7, cols: 2, h: 1.45, gap: 0.2, titleSize: 15, bodySize: 12.5 });
      foot(s, "画面は見本です（店名・数字は架空）。"); },
    kitchen: () => { const s = pres.addSlide({ masterName: "LIGHT" }); title(s, "厨房の画面・QR注文・券売機");
      shotImg(s, "kitchen", 0.65, 1.65, 7.0);
      cardsGrid(s, [["厨房の画面", "注文が卓ごとにまとまり、作り始める→できた。料理／ドリンクの持ち場を分けられ、大きな音・自動印刷も。"], ["QR注文", "お客さまのスマホや卓のタブレットから、写真つきメニューで注文。飲み放題の残り時間・店員の呼び出しも。ログインなし。"], ["券売機", "お店の端末を券売機に。お金を入れてメニューを選び、食券を印刷できます。"]],
        { x: 8.05, y: 1.6, w: 4.65, cols: 1, h: 1.5, gap: 0.2, titleSize: 15.5, bodySize: 12.5 });
      T(s, "注文の伝えもれ・聞きまちがいを減らし、ホールは配膳と接客に集中できます。", { x: 0.65, y: 5.15, w: 7.0, h: 0.8, fontSize: 16, bold: true, color: K.blue });
      foot(s, "画面は見本です（店名・数字は架空）。"); },
    night: () => { const s = pres.addSlide({ masterName: "LIGHT" }); title(s, "夜のお店：伝票・延長・指名・付け回し");
      shotImg(s, "slip", 0.65, 1.65, 4.1); shotImg(s, "tsukemawashi", 5.0, 1.65, 3.55);
      bulletsBox(s, [["ホール・延長", "卓ごとに人数・残り時間・合計。もうすぐ終わる卓は赤、自動延長も"], ["指名・同伴", "本指名・場内指名・同伴を記録。リクエストの売上は指名した子へ"], ["付け回し", "卓→キャスト→付け方→何分を選ぶだけ。キャストのスマホに「今の席・あと何分」"], ["伝票の内わけ", "お店・キャスト・利益の内わけ。直したときは理由つきで記録"], ["売掛・ボトル", "ツケの一覧と回収、ボトルキープの残り・期限"]], 8.9, 1.6, 3.8, 4.8, 13);
      foot(s, "画面は見本です（店名・名前・数字は架空）。"); },
    pay: () => { const s = pres.addSlide({ masterName: "LIGHT" }); title(s, "打刻・シフト・給料を自動で");
      shotImg(s, "salary", 0.65, 1.65, 7.4);
      shotImg(s, "back", 0.65, 4.3, 3.1, 2.1);
      bulletsBox(s, [["打刻", "ICカード（Suicaなど）でタッチ。打刻の直し・修正申請の承認"], ["シフト", "スタッフがスマホで希望を出す。締め切り・決めたシフト・臨時休業"], ["給料", "日払い・週払い・月払い。時給・手当・控除、深夜時給・交通費・前借りの差し引き"], ["夜のお店", "商品ごとのバック、売上や指名で変わる時給・歩合、送りの手当、源泉徴収"], ["決めたあとも安心", "決めたあとに打刻や伝票を直すと「決めた後に変更あり」とお知らせ。Excel出力も"]], 8.4, 1.6, 4.3, 4.9, 13);
      foot(s, "画面は見本です（名前・数字は架空）。"); },
    money: () => { const s = pres.addSlide({ masterName: "LIGHT" }); title(s, "お金・日報・在庫・顧客もひとつに");
      shotImg(s, "money", 1.67, 1.6, 10.0);
      cardsGrid(s, [["お金", "利益（売上−手数料−人件費−仕入れ−経費）・原価率・レジの現金・明細。"], ["日報・月報", "売上・客数・客単価・支払い方法ごと・人件費・よく出た商品。印刷も。"], ["出数・在庫", "よく出たメニュー、在庫・入荷・原価。氷・おしぼりなども。"], ["顧客・会計ソフトへ", "顧客カルテ・来店の記録。freee・マネーフォワード・弥生用のCSV。"]],
        { x: 0.6, y: 5.0, w: 12.1, cols: 4, h: 1.6, gap: 0.2, titleSize: 15, bodySize: 12.5 });
      foot(s, "画面は見本です（店名・数字は架空）。"); },
    phone: () => { const s = pres.addSlide({ masterName: "LIGHT" }); title(s, "スタッフ・キャストは自分のスマホで");
      shotImg(s, "staff-home", 0.9, 1.6, 2.4, 4.8); shotImg(s, "cast-home", 3.7, 1.6, 2.4, 4.8);
      cardsGrid(s, [["シフト", "希望を出す・決まったシフトを見る。"], ["給料・明細", "いくらもらえるか、日別の明細。前借りも。"], ["チャット・通知", "1対1・グループ・お知らせ。写真・既読。"], ["夜は成績・お客さま", "成績・ランキング、自分のお客さま、来客予定、確定申告の案内。"]],
        { x: 6.8, y: 1.6, w: 5.9, cols: 2, h: 2.05, gap: 0.25, titleSize: 15.5, bodySize: 13 });
      T(s, "「給料いくら？」「シフトどうなった？」の問い合わせが減ります。", { x: 6.8, y: 6.0, w: 5.9, h: 0.7, fontSize: 14, bold: true, color: K.blue });
      foot(s, "画面は見本です（名前・数字は架空）。"); },
  };
  keys.forEach((k) => add[k]());
}

// =================== 資料請求用 ===================
async function brochure() {
  const pres = setup("ポスポス サービス資料");
  coverSlide(pres, "サービス資料　2026年10月", "面接ができる、\n最強のPOSレジ。", "注文・会計から、打刻・シフト・給料、\nアルバイトやキャストの一次面接まで。");

  let s = pres.addSlide({ masterName: "LIGHT" }); title(s, "お店の、こんなお悩みありませんか？");
  cardsGrid(s, [["応募が来すぎて、面接が追いつかない", "応募はあるのに、面接の時間がとれず返事が遅れる。"],
    ["日程調整とドタキャン", "電話で日を決めても、当日に来ないことがある。"],
    ["体入してみたら合わない", "夜のお店では、合わない人の体入費がかさむ。"],
    ["給料の計算に何時間も", "タイムカードやバックを、Excelで一人ずつ計算している。"],
    ["注文の伝えもれ・延長の見落とし", "混む時間ほど、厨房への伝えもれや延長の声かけもれが起きる。"],
    ["レジ・勤怠・給料がバラバラ", "アプリがいくつもあって、同じことを何度も入れている。"]], { y: 1.65, h: 2.15 });

  s = pres.addSlide({ masterName: "LIGHT" }); title(s, "ポスポスとは：レジと店舗管理に、AI面接がついたPOSレジ");
  cardsGrid(s, [["レジ・注文・会計", "配置図で卓を開いて注文から会計まで。QR注文・厨房の画面・券売機・Square。夜はセット・延長・指名・付け回し・売掛も。"],
    ["打刻・シフト・給料", "ICカードで打刻。シフトの希望集めから、深夜時給・交通費・前借り、夜はバック・歩合・源泉徴収まで自動で計算。"],
    ["AI面接（世界初※）", "URLを送るだけ。応募者は条件をボタンで選んで、AIの面接官と1分ほど話します。録画と答えがお店に届きます。"]], { y: 1.65, h: 3.0, numbered: true, shadow: true });
  T(s, "パソコン・タブレット・スマホのブラウザで動くので、インストールはいりません。飲食店28種類・夜のお店7種類で使えます。", { x: 0.6, y: 5.0, w: 12.1, h: 0.6, fontSize: 15, color: K.ink2 });
  foot(s, NOTE_FIRST);

  s = pres.addSlide({ masterName: "LIGHT" }); title(s, "AI面接：ボタンで選んで、1分話す");
  img(s, "pos-ai-choose", 0.75, 1.65, 2.75, 4.2); img(s, "pos-ai-talk-day", 3.75, 1.65, 2.62, 4.2);
  cardsGrid(s, [["LINEで送るだけ", "職種を選んでURLを作り、LINEで送るだけ。応募者は登録なしでスマホから受けられます。"],
    ["条件はボタンで選ぶ", "出勤日数・曜日・時間帯・勤務開始・通勤・経験。夜のお店はお酒・年齢の確認も（1分ほど）。"],
    ["AIと1分ほど話す", "自己紹介・やってみたい理由・お店からの質問（3つまで）。話している姿を録画します。"]],
    { x: 6.75, y: 1.6, w: 5.95, cols: 1, h: 1.45, gap: 0.2, bodySize: 13.5 });
  foot(s, "画面は見本です（お店・応募者は架空）。届くもの：録画・顔の写真3枚・選んだ答えの一覧・話し方の雰囲気のまとめ・会話の文字。");

  savesSlide(pres, true, "AI面接で、ここまで減らせます");
  fitSlide(pres, "あなたのお店がほしい人か、会う前にわかる");

  s = pres.addSlide({ masterName: "LIGHT" }); title(s, "使い方は、5つのステップ");
  const st = [["URLを作る", "職種を選ぶだけ。URLは1回だけ・14日まで"], ["LINEで送る", "送る文はアプリが作る。ボタン1つ"], ["答える", "ボタンで選んで、AIと1分ほど話す"], ["結果が届く", "録画・写真・選んだ答えが自動で"], ["お店が分ける", "合格・二次面接へ・検討・不合格"]];
  st.forEach(([t, b], i) => { const x = 0.6 + i * 2.46; card(s, x, 1.6, 2.26, 2.0); num(s, x + 0.25, 1.8, i + 1); T(s, t, { x: x + 0.85, y: 1.8, w: 1.35, h: 0.5, bold: true, fontSize: 16, valign: "middle" }); T(s, b, { x: x + 0.25, y: 2.45, w: 1.8, h: 1.05, fontSize: 13, color: K.ink2 }); });
  img(s, "pos-ai-url", 0.65, 4.0, 5.1, 2.4);
  img(s, "pos-ai-list", 6.3, 4.35, 6.35, 1.3);
  foot(s, "分けた結果は応募者には知らせません。");

  s = pres.addSlide({ masterName: "LIGHT" }); title(s, "安心して使えるように");
  cardsGrid(s, [["録画は同意してから", "応募者は、録画されることに同意してから面接を受けます。同意しないと受けられません。"],
    ["90日で自動で消える", "録画・写真・会話は90日で自動で消えます。お店の画面からいつでも消せます。"],
    ["ほかのお店からは見えない", "結果はそのお店の画面だけで見られます。評価は応募者に見せません。"],
    ["AIは合否を決めない", "AIのまとめは参考です。採用するかどうかは、お店の人が会って決めます。"],
    ["変更の記録・権限", "だれが・いつ・何を変えたか（改ざんチェックつき）。アカウントごとの権限。"],
    ["年齢・本人確認はお店で", "夜のお店の年齢・本人確認は、AI面接ではなく必ずお店で身分証を見て行ってください。"]], { y: 1.65, h: 2.15 });

  s = pres.addSlide({ masterName: "LIGHT" }); title(s, "昼のお店・夜のお店の主な機能");
  card(s, 0.6, 1.6, 5.9, 4.9); card(s, 6.8, 1.6, 5.9, 4.9, "EEF0FA");
  T(s, "昼のお店（飲食店）", { x: 0.9, y: 1.85, w: 5.3, h: 0.5, bold: true, fontSize: 19, color: K.blue });
  T(s, "夜のお店", { x: 7.1, y: 1.85, w: 5.3, h: 0.5, bold: true, fontSize: 19, color: "5A2FA0" });
  const day = ["配置図で卓の受付・注文・会計、分け払い・割り勘", "QR注文（写真つきメニュー・飲み放題の残り時間）", "厨房の画面（料理／ドリンクの持ち場）・券売機", "お持ち帰りの軽減税率・深夜料金", "ポイント・会員証（名前を聞かずに）・クーポン", "打刻・シフト・給料（深夜時給・交通費・前借り）"];
  const ngt = ["セット料金・延長（もうすぐ終わる卓を赤で）", "本指名・場内指名・同伴、付け回し・タイムテーブル", "バック・売上や指名で変わる時給・歩合", "売掛（ツケ）・ボトルキープ・顧客カルテ・来客予定", "源泉徴収（ホステス等の報酬）・送りの手当", "キャストモード（給料・成績・確定申告の案内）"];
  const bl = (a) => a.map((p, j) => ({ text: p, options: { bullet: true, breakLine: j < a.length - 1 } }));
  T(s, bl(day), { x: 0.9, y: 2.5, w: 5.3, h: 3.8, fontSize: 14.5, paraSpaceAfter: 8 });
  T(s, bl(ngt), { x: 7.1, y: 2.5, w: 5.3, h: 3.8, fontSize: 14.5, paraSpaceAfter: 8 });
  posDetail(pres, ["order", "checkout", "kitchen", "night", "pay", "money", "phone"]);

  s = pres.addSlide({ masterName: "LIGHT" }); title(s, "対応しているお店（飲食店28種類・夜のお店7種類）");
  const groups = [["和食", "和食レストラン・寿司・そば・うどん・定食・食堂・丼もの・牛丼・とんかつ・揚げ物"], ["居酒屋・焼き鳥・お酒", "居酒屋・焼き鳥・バー・バル（キャストなし）"], ["肉・鉄板・鍋", "焼肉・ステーキ・鉄板焼き・お好み焼き・もんじゃ・しゃぶしゃぶ・鍋"], ["麺・中華・アジア", "ラーメン・つけ麺・中華料理・韓国料理・カレー・インド料理・エスニック"],
    ["洋食", "洋食レストラン・イタリアン・フレンチ・ビストロ・ハンバーガー"], ["カフェ・パン・スイーツ", "カフェ・パン屋・ベーカリー・ケーキ・スイーツ"], ["テイクアウト・食べ放題", "お弁当・テイクアウト・キッチンカー・ビュッフェ・食べ放題"], ["夜のお店", "ホストクラブ・キャバクラ・ガールズバー・ボーイズバー・コンセプトカフェ・スナック・ラウンジ"]];
  cardsGrid(s, groups, { y: 1.6, cols: 4, h: 2.3, gap: 0.22, titleSize: 15.5, bodySize: 13 });
  foot(s, "このほかの飲食店も、お気軽にご相談ください。");

  priceSlide(pres, "料金プラン");

  s = pres.addSlide({ masterName: "LIGHT" }); title(s, "グループ店・年間契約・導入の流れ");
  const stat = [["1か月分", "1年契約"], ["3か月分", "2年契約"], ["5か月分", "3年契約"]];
  stat.forEach(([b, l], i) => { const x = 0.6 + i * 2.05; card(s, x, 1.65, 1.85, 1.8, "FFF4DB"); T(s, l, { x: x + 0.2, y: 1.8, w: 1.5, h: 0.35, fontSize: 13, color: "6A5530", bold: true }); T(s, b, { x: x + 0.15, y: 2.2, w: 1.6, h: 0.6, fontSize: 24, bold: true, color: "B26B00" }); T(s, "おトク", { x: x + 0.2, y: 2.85, w: 1.5, h: 0.35, fontSize: 13, color: "6A5530" }); });
  T(s, [{ text: "年間契約（前払い）", options: { bold: true, breakLine: true } }, { text: "自動では更新しません（終わる1か月前にお知らせ）。途中でやめても、残りの期間のお金はお返しできません。", options: { breakLine: true } }, { text: "グループ店", options: { bold: true, breakLine: true } }, { text: "何店舗でも。料金は1店舗ごと（足した日からの日割り）。" }], { x: 0.6, y: 3.7, w: 6.0, h: 2.6, fontSize: 14, paraSpaceAfter: 4, color: K.navy });
  const fl = [["お問い合わせ", "電話・フォーム"], ["1か月無料でお試し", "カード登録なしなら勝手に請求されません"], ["登録・設定", "ホームページからのお申し込みは登録代行が無料"], ["本番スタート", "AI面接のURLもすぐ送れます"]];
  fl.forEach(([t, b], i) => { const y = 1.6 + i * 1.2; card(s, 7.0, y, 5.7, 1.0); num(s, 7.25, y + 0.25, i + 1); T(s, t, { x: 7.95, y: y + 0.12, w: 4.5, h: 0.4, bold: true, fontSize: 16 }); T(s, b, { x: 7.95, y: y + 0.52, w: 4.6, h: 0.4, fontSize: 13, color: K.ink2 }); });

  closeSlide(pres, "まずは無料で、1か月。", [["お問い合わせ", "お電話かフォームから。お店の種類と店舗数を教えてください。"], ["無料でお試し", "1か月無料。カードを登録しなければ請求されません。"], ["AI面接を体験", "最初の応募者に、AI面接のURLを送ってみてください。"]]);

  await pres.writeFile({ fileName: path.join(__dirname, "posupos-shiryo.pptx") });
  await applyTheme(path.join(__dirname, "posupos-shiryo.pptx"), THEME);
}

// =================== 営業プレゼン用 ===================
async function sales() {
  const pres = setup("ポスポス ご提案資料");
  let s = coverSlide(pres, "ご提案資料　2026年10月", "面接の時間を、\nお店の時間に。", "応募が来たらURLを送るだけ。\nAIが一次面接をして、お店は1分の録画を見るだけ。");
  s.addNotes("あいさつ。今日は「採用にかかっている時間とお金」と、それをレジと一緒に減らす方法のお話です。");

  s = pres.addSlide({ masterName: "LIGHT" }); title(s, "店長の時間、面接に何時間使っていますか？");
  const q = [["電話で日程調整", "営業中に折り返し、空いている日を何度もやりとり"], ["対面で30分の面接", "ピークの合間に手を止めて、毎回同じ質問"], ["来ない・合わない", "ドタキャンの待ちぼうけ、体入してから合わないと気づく"]];
  q.forEach(([t, b], i) => { const x = 0.6 + i * 4.1; shadowCard(s, x, 1.8, 3.8, 3.3); T(s, ["①", "②", "③"][i], { x: x + 0.3, y: 2.05, w: 1, h: 0.7, fontSize: 30, bold: true, color: K.red }); T(s, t, { x: x + 0.3, y: 2.85, w: 3.2, h: 0.5, bold: true, fontSize: 20 }); T(s, b, { x: x + 0.3, y: 3.5, w: 3.2, h: 1.3, fontSize: 15, color: K.ink2, lineSpacingMultiple: 1.2 }); });
  T(s, "この時間は、売上を作る時間でも、スタッフを育てる時間でもありません。", { x: 0.6, y: 5.5, w: 12.1, h: 0.6, fontSize: 18, bold: true, color: K.blue });
  s.addNotes("問いかけ。「先月、応募は何人ありましたか？」「1人の面接に、準備も入れて何分くらいかかっていますか？」と聞いて、相手の数字を書きとめる。");

  s = pres.addSlide({ masterName: "LIGHT" }); title(s, "たとえば、月に応募が10人のお店では");
  const rows = [["日程調整（1人15分）", "150分"], ["対面の面接（1人30分）", "300分"], ["ドタキャンで空けた時間（3人×30分）", "90分"]];
  rows.forEach(([a, b], i) => { const y = 1.75 + i * 0.95; card(s, 0.6, y, 7.0, 0.8); T(s, a, { x: 0.9, y, w: 4.8, h: 0.8, fontSize: 17, valign: "middle" }); T(s, b, { x: 5.6, y, w: 1.8, h: 0.8, fontSize: 22, bold: true, align: "right", valign: "middle" }); });
  s.addShape("roundRect", { x: 0.6, y: 4.7, w: 7.0, h: 1.0, rectRadius: 0.15, fill: { color: K.deep }, line: { color: K.deep } });
  T(s, "1か月に", { x: 0.9, y: 4.7, w: 2, h: 1.0, fontSize: 17, color: K.white, valign: "middle" });
  T(s, "約9時間", { x: 3.4, y: 4.7, w: 4.0, h: 1.0, fontSize: 34, bold: true, color: K.goldL, align: "right", valign: "middle" });
  shadowCard(s, 8.1, 1.75, 4.6, 3.95);
  T(s, "ポスポスなら", { x: 8.45, y: 2.0, w: 4, h: 0.5, bold: true, fontSize: 18, color: K.blue });
  T(s, [{ text: "URLを送る：1人1秒", options: { breakLine: true } }, { text: "お店が見る録画：1人1分ほど", options: { breakLine: true } }, { text: "日程調整・待ちぼうけ：なし", options: {} }], { x: 8.45, y: 2.6, w: 4.0, h: 1.7, fontSize: 16, paraSpaceAfter: 8 });
  T(s, "→ 月10分ほど", { x: 8.45, y: 4.5, w: 4.0, h: 0.8, fontSize: 28, bold: true, color: K.blue });
  foot(s, "説明のための架空の例です（応募10人・ドタキャン3人の場合）。応募者が答える時間（選ぶ1分＋話す1分ほど）は、お店の時間には入りません。");
  s.addNotes("さっき聞いた相手の数字で計算しなおして見せると効く。");

  s = pres.addSlide({ masterName: "LIGHT" }); title(s, "夜のお店なら、体入費のむだも");
  const r2 = [["体入の時給 3,000円 × 4時間", "12,000円／人"], ["合わなかった体入", "月に5人"]];
  r2.forEach(([a, b], i) => { const y = 1.8 + i * 1.0; card(s, 0.6, y, 7.0, 0.85); T(s, a, { x: 0.9, y, w: 4.6, h: 0.85, fontSize: 18, valign: "middle" }); T(s, b, { x: 5.3, y, w: 2.1, h: 0.85, fontSize: 20, bold: true, align: "right", valign: "middle" }); });
  s.addShape("roundRect", { x: 0.6, y: 4.0, w: 7.0, h: 1.2, rectRadius: 0.15, fill: { color: "3A1F6B" }, line: { color: "3A1F6B" } });
  T(s, "1か月に出ていく体入費", { x: 0.9, y: 4.0, w: 3.6, h: 1.2, fontSize: 17, color: K.white, valign: "middle" });
  T(s, "60,000円", { x: 4.2, y: 4.0, w: 3.2, h: 1.2, fontSize: 36, bold: true, color: K.goldL, align: "right", valign: "middle" });
  shadowCard(s, 8.1, 1.8, 4.6, 3.4);
  T(s, "体入の前にAI面接", { x: 8.45, y: 2.05, w: 4, h: 0.5, bold: true, fontSize: 18, color: "5A2FA0" });
  T(s, "出勤できる日・時間をボタンで、話している姿を1分の録画で、体入の前に確認。体入してもらう人をしぼれるので、合わない人の体入費が減ります。", { x: 8.45, y: 2.65, w: 3.95, h: 2.3, fontSize: 15.5, color: K.navy, lineSpacingMultiple: 1.25 });
  foot(s, "説明のための架空の例です。体入の条件はお店ごとに違います。");

  s = pres.addSlide({ masterName: "LIGHT" }); title(s, "解決：ポスポスのAI面接（世界初※）");
  img(s, "pos-ai-choose", 0.75, 1.75, 2.6, 3.98); img(s, "pos-ai-talk-night", 3.6, 1.75, 2.48, 3.98); img(s, "pos-ai-result-night", 6.45, 2.0, 6.2, 3.71);
  T(s, "選ぶ → 話す → 届く", { x: 0.75, y: 5.9, w: 11.9, h: 0.5, fontSize: 18, bold: true, color: K.blue });
  foot(s, "画面は見本です（お店・応募者は架空）。" + NOTE_FIRST);
  s.addNotes("ここで実際の画面を見せる（デモ）。可能なら、その場で面接のURLを作ってLINEで送ってみせる。");

  savesSlide(pres, true, "お店の手間は、ここまで減ります");

  s = pres.addSlide({ masterName: "LIGHT" }); title(s, "いまのやり方と、ポスポス");
  const comp = [["応募への返事", "営業のあとに折り返し", "URLを1秒で送る"], ["面接の日程", "電話で何度もやりとり", "いらない（応募者の都合で受ける）"], ["一次面接", "対面で30分", "選ぶ質問＋1分の録画。お店は見るだけ"], ["ドタキャン", "待ちぼうけ", "受けた人の結果だけ届く"], ["比べ方", "面接する人でばらつく", "全員同じボタンの答えと録画で比べる"]];
  const rowsT = [[{ text: "", options: { fill: { color: K.white } } }, { text: "いまのやり方", options: { bold: true, color: K.ink2, fill: { color: K.mist }, align: "center" } }, { text: "ポスポス", options: { bold: true, color: K.white, fill: { color: K.blue }, align: "center" } }]]
    .concat(comp.map(([a, b, c]) => [{ text: a, options: { bold: true } }, { text: b, options: { color: K.ink2, align: "center" } }, { text: c, options: { bold: true, color: K.blue, align: "center" } }]));
  s.addTable(rowsT, { x: 0.6, y: 1.6, w: 12.1, colW: [2.8, 4.3, 5.0], rowH: 0.78, fontFace: F, fontSize: 16, color: K.navy, valign: "middle", border: { type: "solid", pt: 1, color: K.line } });

  fitSlide(pres, "しかも、お店がほしい人か会う前にわかる");

  s = pres.addSlide({ masterName: "LIGHT" }); title(s, "そして、レジ・給料・シフトもひとつに");
  cardsGrid(s, [["注文・会計", "QR注文・厨房の画面・券売機・Square。夜はセット・延長・指名・付け回し・売掛まで。"], ["打刻・シフト・給料", "ICカードで打刻。深夜時給・交通費・前借り、夜はバック・歩合・源泉徴収まで自動で計算。"], ["お金・日報・顧客", "利益・原価率・日報、顧客カルテ・ポイント・ボトル。会計ソフト用のCSVにも。"]], { y: 1.65, h: 2.6, numbered: true, shadow: true });
  T(s, "採用から給料まで、同じアプリで。いくつものアプリに同じことを入れる手間もなくなります。", { x: 0.6, y: 4.7, w: 12.1, h: 0.6, fontSize: 18, bold: true, color: K.blue });
  posDetail(pres, ["order", "checkout", "night", "pay", "money", "phone"]);

  priceSlide(pres, "AI面接は、スタンダードの料金にふくまれています", true);

  s = pres.addSlide({ masterName: "LIGHT" }); title(s, "いま始めると");
  cardsGrid(s, [["ずっとキャンペーン価格", "キャンペーン期間中のお申し込みは、契約が続くかぎりキャンペーン価格のまま（予告なく終了する場合があります）。"], ["1か月無料", "カードを登録しなければ、お試しのあと勝手に請求されることはありません。"], ["初期費用0円", "ホームページからのお申し込みは、商品・写真・スタッフの登録代行も無料。"], ["AI面接は追加料金なし", "スタンダードプランなら、次の応募からすぐAI面接を使えます。"]], { y: 1.65, cols: 2, h: 2.15, shadow: true });
  s.addNotes("クロージング。「まず1か月、次の応募者にURLを送ってみませんか？」と提案する。");

  closeSlide(pres, "まず1か月、次の応募者にURLを送ってみませんか？", [["今日、お申し込み", "お電話かフォームから。お店の種類と店舗数だけでOK。"], ["登録はおまかせ", "ホームページからのお申し込みは登録代行が無料。"], ["次の応募でAI面接", "URLを1秒で送って、届いた結果を見てみてください。"]]);

  await pres.writeFile({ fileName: path.join(__dirname, "posupos-teian.pptx") });
  await applyTheme(path.join(__dirname, "posupos-teian.pptx"), THEME);
}

(async () => { await brochure(); await sales(); console.log("written"); })();
