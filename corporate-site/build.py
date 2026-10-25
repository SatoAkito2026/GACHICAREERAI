"""会社ホームページを組み立てる。

src/pages/*.html（各ページの中身）に、src/layout.html（ヘッダー・フッターなど共通部分）をかぶせて public/ に書き出す。
src/standalone/*.html は独自デザインの1枚完結ページなので、そのまま public/ にコピーする。
ページの先頭のコメントに title / description / nav / cta を書く:

    <!--
    title: 会社概要
    description: 合同会社AKITOグループの会社概要と役員挨拶。
    nav: about
    cta: yes
    -->

使い方: python3 build.py
"""

import pathlib
import re

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "public"
SITE = "https://akitogroup.jp"
# Cloudflare Web Analytics のトークン（ダッシュボードの「Web Analytics」→ サイトを追加 で出る token）。空なら計測しない
CF_BEACON_TOKEN = ""

NAV = [
    ("about", "about.html", "会社概要", "Company"),
    ("services", "./#services", "事業内容", "Services"),
    ("posupos", "posupos.html", "ポスポス", "POSPOS"),
    ("gachicareer-ai", "https://gachicareer-ai.akitogroup.jp/", "ガチキャリAI", "Gachi Career AI"),
    ("gachicareer", "gachicareer.html", "ガチキャリ", "Gachi Career"),
    ("news", "news.html", "お知らせ", "News"),
]


def parse(text: str):
    m = re.match(r"\s*<!--(.*?)-->\s*", text, re.S)
    meta = {}
    if m:
        for line in m.group(1).strip().splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
        text = text[m.end():]
    return meta, text


def nav_html(active: str) -> str:
    items = []
    for key, href, label, _ in NAV:
        cur = ' aria-current="page"' if key == active else ""
        items.append(f'<a href="{href}"{cur}>{label}</a>')
    items.append('<a class="nav-cta" href="contact.html">お問い合わせ</a>')
    return "\n      ".join(items)


def drawer_html(active: str) -> str:
    """スマホ・タブレットの全画面メニュー"""
    items = []
    for key, href, label, en in NAV + [("contact", "contact.html", "お問い合わせ", "Contact")]:
        cur = ' aria-current="page"' if key == active else ""
        items.append(f'<a href="{href}"{cur}>{label}<small>{en}</small></a>')
    return "\n    ".join(items)


def page_ld(name, title, meta, body, url):
    """ページごとの構造化データ（パンくずと、お知らせ記事の Article）"""
    import json
    if name in ("index", "404"):
        out = [{"@context": "https://schema.org", "@type": "WebSite", "name": "AKITOグループ", "url": f"{SITE}/"}] if name == "index" else []
    else:
        items = [{"@type": "ListItem", "position": 1, "name": "トップ", "item": f"{SITE}/"}]
        if name.startswith("news-"):
            items.append({"@type": "ListItem", "position": 2, "name": "お知らせ", "item": f"{SITE}/news"})
        items.append({"@type": "ListItem", "position": len(items) + 1, "name": title, "item": url})
        out = [{"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}]
        if name.startswith("news-") and '"@type": "Article"' not in body:
            m = re.search(r'<time datetime="([0-9-]+)"', body)
            img = re.search(r'<img src="(assets/img/[^"]+)"', body)
            out.append({"@context": "https://schema.org", "@type": "Article", "headline": title, "description": meta.get("description", ""),
                        "datePublished": m.group(1) if m else None, "image": f"{SITE}/{img.group(1)}" if img else f"{SITE}/assets/img/logo-full.webp",
                        "author": {"@type": "Organization", "name": "合同会社AKITOグループ", "url": f"{SITE}/"},
                        "publisher": {"@type": "Organization", "name": "合同会社AKITOグループ", "logo": {"@type": "ImageObject", "url": f"{SITE}/icon-512.png"}},
                        "mainEntityOfPage": url})
    if '"@type": "BreadcrumbList"' in body:
        out = [d for d in out if d["@type"] != "BreadcrumbList"]
    return "".join('<script type="application/ld+json">' + json.dumps(d, ensure_ascii=False) + "</script>" for d in out)


def shop_types():
    """お店の種類（src/posupos/types.json）。LPの種類えらび・お問い合わせの選択肢・業種ページで使う"""
    import json
    f = SRC / "posupos" / "types.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else []


def shop_fill(html, mode=None):
    """{{shopcss}} {{shopmore}} {{shopoptions}} {{shopmap}} を、お店の種類の一覧から作って入れる"""
    import json
    groups = shop_types()
    if "{{shopcss}}" in html:
        rules = "".join(f'body[data-shop="{t["id"]}"] .v[data-v="{t["demo"]}"]{{display:block}}\n'
                        for g in groups for t in g["types"] if t["id"] != t["demo"])
        html = html.replace("{{shopcss}}", rules)
    if "{{shopmore}}" in html and mode:
        n = sum(len(g["types"]) for g in groups if g["mode"] == mode)
        body = "".join(f'<div class="sm-g"><b>{g["name"]}</b><div>' + "".join(
            f'<button type="button" role="tab" data-shop="{t["id"]}" aria-selected="false">{t["label"]}</button>' for t in g["types"]) + "</div></div>"
            for g in groups if g["mode"] == mode)
        html = html.replace("{{shopmore}}", f'<details class="sb-more"><summary><span class="sm-l">ほかのお店（全{n}種類）</span></summary><div class="sm-p">{body}<p class="sm-n">画面は、近いお店のイメージで表示します。</p></div></details>')
    if "{{shopoptions}}" in html:
        opts = ""
        for g in groups:
            lab = g["name"] if g["mode"] == "night" else "飲食店：" + g["name"]
            opts += f'<optgroup label="{lab}">' + "".join(
                f'<option{" selected" if t["id"] == "izakaya" else ""}>{t["label"]}</option>' for t in g["types"]) + "</optgroup>"
        html = html.replace("{{shopoptions}}", opts)
    if "{{shopmap}}" in html:
        html = html.replace("{{shopmap}}", json.dumps({t["id"]: t["label"] for g in groups for t in g["types"]}, ensure_ascii=False))
    return html


def posupos_ld(html, mode):
    """ポスポスLPの構造化データ（サービスの説明・よくある質問・パンくず）"""
    import json, html as H
    url = f"{SITE}/posupos-{mode}"
    desc = re.search(r'<meta name="description" content="([^"]*)"', html).group(1)
    faq = re.search(r'id="faq".*?</section>', html, re.S).group(0)
    qa = [(H.unescape(re.sub(r"<[^>]+>", "", q)).strip(), H.unescape(re.sub(r"<[^>]+>", "", a)).strip())
          for q, a in re.findall(r"<summary>(.*?)</summary><p>(.*?)</p>", faq, re.S)]
    data = [
        {"@context": "https://schema.org", "@type": "SoftwareApplication", "name": "ポスポス（POSPOS）", "alternateName": "POSPOS",
         "applicationCategory": "BusinessApplication", "operatingSystem": "Web（パソコン・タブレット・スマホのブラウザ）",
         "description": desc, "url": url, "image": f"{SITE}/assets/img/ogp-posupos-{mode}.png",
         "publisher": {"@type": "Organization", "name": "合同会社AKITOグループ", "url": f"{SITE}/"},
         "offers": [{"@type": "Offer", "name": n, "price": str(v), "priceCurrency": "JPY", "url": url + "#plans"}
                    for n, v in (("ライトプラン（月額・税込）", 11000), ("スタンダードプラン（キャンペーン価格・月額・税込・1店舗ごと）", 22000 if mode == "day" else 33000), ("個別プラン（月額・税込）〜", 55000))]},
        {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qa]},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "AKITOグループ", "item": f"{SITE}/"},
            {"@type": "ListItem", "position": 2, "name": "ポスポス", "item": f"{SITE}/posupos"},
            {"@type": "ListItem", "position": 3, "name": "昼のお店" if mode == "day" else "夜のお店", "item": url}]},
    ]
    return "".join('<script type="application/ld+json">' + json.dumps(d, ensure_ascii=False) + "</script>" for d in data)


def main():
    layout = (SRC / "layout.html").read_text(encoding="utf-8")
    cta = (SRC / "cta.html").read_text(encoding="utf-8")
    for page in sorted((SRC / "pages").glob("*.html")):
        meta, body = parse(page.read_text(encoding="utf-8"))
        name = page.stem
        title = meta.get("title", "")
        if name == "index":
            full_title = "合同会社AKITOグループ｜AI面接練習・キャリア支援・POSレジ（東京・池袋）"
        elif len(title) > 30:
            full_title = title  # 長いタイトルは会社名を付けない（検索結果で切れないように）
        else:
            full_title = f"{title}｜AKITOグループ"
        url = f"{SITE}/" if name == "index" else f"{SITE}/{name}"
        html = (
            layout.replace("{{title}}", full_title)
            .replace("{{description}}", meta.get("description", ""))
            .replace("{{url}}", url)
            .replace("{{image}}", SITE + "/assets/img/" + meta.get("image", "logo-full.webp"))
            .replace("{{nav}}", nav_html(meta.get("nav", "")))
            .replace("{{drawer}}", drawer_html(meta.get("nav", "")))
            .replace("{{cta}}", cta if meta.get("cta", "yes") != "no" else "")
            .replace("{{content}}", body.strip())
            .replace("{{pageld}}", page_ld(name, title, meta, body, url))
        )
        (OUT / f"{name}.html").write_text(shop_fill(html), encoding="utf-8")
        print("wrote", f"public/{name}.html")
    # 独自のデザインで1枚完結のページ（ガチキャリAIのLPなど）は、そのままコピーする
    for page in sorted((SRC / "standalone").glob("*.html")):
        (OUT / page.name).write_text(page.read_text(encoding="utf-8"), encoding="utf-8")
        print("copied", f"public/{page.name}")
    # 検索エンジン向けの sitemap.xml と robots.txt
    import datetime
    today = datetime.date.today().isoformat()
    names = [p.stem for p in sorted((SRC / "pages").glob("*.html")) if p.stem != "404"] + [p.stem for p in sorted((SRC / "standalone").glob("*.html"))] + ["posupos-day", "posupos-night"] + posupos_sub_names() + posupos_shop_names() + ["posupos-monitor"]
    urls = "".join(f"<url><loc>{SITE}/{'' if n == 'index' else n}</loc><lastmod>{today}</lastmod></url>" for n in names)
    (OUT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + "</urlset>\n", encoding="utf-8")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n", encoding="utf-8")
    print("wrote public/sitemap.xml, public/robots.txt")
    # ポスポスのLPは1つのひな形から、昼のお店用と夜のお店用の2ページを作る
    # {{#day}}…{{/day}} は昼だけ、{{#night}}…{{/night}} は夜だけ、{{w}} は「スタッフ」／「キャスト」
    lp = SRC / "posupos" / "lp.html"
    if lp.exists():
        text = lp.read_text(encoding="utf-8")
        for mode, other, word in (("day", "night", "スタッフ"), ("night", "day", "キャスト")):
            html = re.sub(r"\{\{#" + other + r"\}\}.*?\{\{/" + other + r"\}\}", "", text, flags=re.S)
            html = html.replace("{{#" + mode + "}}", "").replace("{{/" + mode + "}}", "")
            html = html.replace("{{w}}", word).replace("{{mode}}", mode)
            html = shop_fill(html, mode)
            html = html.replace("<!--LDJSON-->", posupos_ld(html, mode))
            (OUT / f"posupos-{mode}.html").write_text(html, encoding="utf-8")
            print("wrote", f"public/posupos-{mode}.html")
            for sub in sorted((SRC / "posupos" / "pages").glob("*.html")):
                write_posupos_sub(sub, html, mode, other, word)
            write_posupos_shops(html, mode, other, word)
            mon = SRC / "posupos" / "monitor.html"
            if mode == "day" and mon.exists():
                wrap_posupos(mon.read_text(encoding="utf-8"), html, mode, other, word, "posupos-monitor")


def write_posupos_shops(lp_html, mode, other, word):
    """業種ごとの入口ページ（src/posupos/shops.json と shop.html）。その業種のお店のモードだけ作る"""
    import json
    data_f, tpl_f = SRC / "posupos" / "shops.json", SRC / "posupos" / "shop.html"
    if not data_f.exists():
        return
    tpl = tpl_f.read_text(encoding="utf-8")
    li = lambda items: "".join(f'<div class="sp-card rv"><b>{a}</b><span>{b}</span></div>' for a, b in items)
    for d in json.loads(data_f.read_text(encoding="utf-8")):
        if d["mode"] != mode:
            continue
        t = tpl
        for k in ("key", "name", "title", "desc", "h1", "lead", "jobs", "aiq"):
            t = t.replace("{{" + k + "}}", d.get(k, ""))
        t = t.replace("{{demo}}", d.get("demo", d["key"])).replace("{{param}}", d.get("param", d["key"]))
        tb = ""
        if d.get("types"):
            chips = "".join(f'<li>{x}</li>' for x in d["types"])
            tb = f'''  <section class="sec" id="types">
    <div class="wrap">
      <div class="sec-head rv"><p class="eyebrow">Shop types</p><h2>{d["name"]}で使えるお店</h2></div>
      <ul class="sp-chips rv">{chips}</ul>
      {d.get("more", "")}
    </div>
  </section>
'''
        t = t.replace("{{typesblock}}", tb)
        t = t.replace("{{pains}}", li(d["pains"])).replace("{{feats}}", li(d["feats"]))
        t = t.replace("{{articles}}", "".join(f'<a href="{h}">{a} →</a>' for a, h in d.get("articles", [])))
        t = t.replace("{{faqs}}", "".join(f"<details><summary>{q}</summary><p>{a}</p></details>" for q, a in d["faqs"]))
        wrap_posupos(t, lp_html, mode, other, word, f"posupos-{d['key']}", None, d.get("demo", d["key"]))


def posupos_shop_names():
    f = SRC / "posupos" / "shops.json"
    import json
    return [f"posupos-{d['key']}" for d in json.loads(f.read_text(encoding="utf-8"))] if f.exists() else []


def posupos_sub_names():
    d = SRC / "posupos" / "pages"
    return [f"posupos-{m}-{p.stem}" for p in sorted(d.glob("*.html")) for m in ("day", "night")] if d.exists() else []


def write_posupos_sub(sub, lp_html, mode, other, word):
    """ポスポスのくわしいページ（src/posupos/pages/名前.html）を、LPのヘッダー・フッター・見た目で包んで昼／夜の2ページにする。
    先頭のコメントに title / description（{{#day}} なども使える）。本文の {{final}} はLPの最後の申し込み欄になる"""
    import json, html as H
    wrap_posupos(sub.read_text(encoding="utf-8"), lp_html, mode, other, word, f"posupos-{mode}-{sub.stem}", sub.stem)


def wrap_posupos(text, lp_html, mode, other, word, slug, name=None, shop=None):
    """ポスポスのLPのヘッダー・フッター・見た目で本文を包んで public/{slug}.html に書く。
    name があれば昼／夜の切りかえは同じ名前のくわしいページへ、なければLPへ。shop は画面イメージの業種"""
    import json, html as H
    text = re.sub(r"\{\{#" + other + r"\}\}.*?\{\{/" + other + r"\}\}", "", text, flags=re.S)
    text = text.replace("{{#" + mode + "}}", "").replace("{{/" + mode + "}}", "").replace("{{w}}", word).replace("{{mode}}", mode)
    meta, body = parse(text)
    final = re.search(r'  <section class="sec final">.*?</section>', lp_html, re.S).group(0)
    body = body.replace("{{final}}", final)
    fig = re.search(r'      <figure class="shot " data-shot="(?:home|ranking)">.*?</figure>', lp_html, re.S)
    body = body.replace("{{herofig}}", fig.group(0) if fig else "")
    head = lp_html[:lp_html.index("<main>")]
    if shop:
        head = re.sub(r'<body class="(\w+)" data-shop="\w+">', lambda m: f'<body class="{m.group(1)}" data-shop="{shop}">', head)
    tail = lp_html[lp_html.index("</main>"):]
    url = f"{SITE}/{slug}"
    title = meta.get("title", "ポスポス")
    desc = meta.get("description", "")
    head = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", head, flags=re.S)
    head = re.sub(r'(<meta name="description" content=")[^"]*', lambda m: m.group(1) + desc, head)
    head = re.sub(r'(<meta property="og:title" content=")[^"]*', lambda m: m.group(1) + title, head)
    head = re.sub(r'(<meta property="og:description" content=")[^"]*', lambda m: m.group(1) + desc, head)
    head = re.sub(r'(<meta property="og:url" content=")[^"]*', lambda m: m.group(1) + url, head)
    head = re.sub(r'(<link rel="canonical" href=")[^"]*', lambda m: m.group(1) + url, head)
    # ヘッダーのページ内リンクはLPへ、昼／夜の切りかえは同じくわしいページへ
    head = re.sub(r'href="#(?!top")([^"]+)"', lambda m: f'href="posupos-{mode}.html#{m.group(1)}"', head)
    head = head.replace('href="#top" aria-label="ポスポス トップへ"', f'href="posupos-{mode}.html" aria-label="ポスポス トップへ"')
    if name:
        head = head.replace('href="posupos-day.html"', 'href="posupos-day-' + name + '.html"').replace('href="posupos-night.html"', 'href="posupos-night-' + name + '.html"')
    faq = re.search(r'id="faq".*?</section>', body, re.S)
    qa = [(H.unescape(re.sub(r"<[^>]+>", "", q)).strip(), H.unescape(re.sub(r"<[^>]+>", "", a)).strip())
          for q, a in re.findall(r"<summary>(.*?)</summary><p>(.*?)</p>", faq.group(0), re.S)] if faq else []
    data = [{"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "トップ", "item": f"{SITE}/"},
        {"@type": "ListItem", "position": 2, "name": "ポスポス", "item": f"{SITE}/posupos-{mode}"},
        {"@type": "ListItem", "position": 3, "name": meta.get("crumb", title), "item": url}]}]
    if qa:
        data.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qa]})
    ld = "".join('<script type="application/ld+json">' + json.dumps(d, ensure_ascii=False) + "</script>" for d in data)
    tail = re.sub(r'<script type="application/ld\+json">.*?</script>', "", tail, flags=re.S)
    tail = tail.replace('<script src="assets/posupos-voice.js"', ld + '<script src="assets/posupos-voice.js"', 1)
    (OUT / f"{slug}.html").write_text(shop_fill(head + "<main>\n" + body + "\n" + tail, mode), encoding="utf-8")
    print("wrote", f"public/{slug}.html")


def add_analytics():
    """全ページに Cloudflare Web Analytics の計測タグを入れる（クッキーなし。ページごとの閲覧数がわかる）"""
    if not CF_BEACON_TOKEN:
        return
    tag = f"<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{{\"token\": \"{CF_BEACON_TOKEN}\"}}'></script>"
    for f in OUT.glob("*.html"):
        s = f.read_text(encoding="utf-8")
        if "cloudflareinsights" not in s and "</body>" in s:
            f.write_text(s.replace("</body>", tag + "</body>", 1), encoding="utf-8")


def clean_links():
    """サイト内リンクを .html なしの URL にそろえる（本番では .html 付きは転送になり、Google の巡回が遅れるため）"""
    names = {p.stem for p in OUT.glob("*.html")}
    pat = re.compile(r'href="(' + "|".join(sorted(map(re.escape, names), key=len, reverse=True)) + r')\.html(#[^"]*)?"')
    for f in OUT.glob("*.html"):
        s = f.read_text(encoding="utf-8")
        t = pat.sub(lambda m: 'href="/' + ("" if m.group(1) == "index" else m.group(1)) + (m.group(2) or "") + '"', s)
        if t != s:
            f.write_text(t, encoding="utf-8")


if __name__ == "__main__":
    main()
    clean_links()
    add_analytics()
