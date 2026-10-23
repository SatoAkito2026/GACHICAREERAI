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

NAV = [
    ("about", "about.html", "会社概要", "Company"),
    ("services", "./#services", "事業内容", "Services"),
    ("gachicareer-ai", "gachicareer-ai.html", "ガチキャリAI", "Gachi Career AI"),
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
                    for n, v in (("ライトプラン（月額・税込）", 11000), ("スタンダードプラン（月額・税込）", 22000 if mode == "day" else 33000), ("個別プラン（月額・税込）〜", 55000))]},
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
        (OUT / f"{name}.html").write_text(html, encoding="utf-8")
        print("wrote", f"public/{name}.html")
    # 独自のデザインで1枚完結のページ（ガチキャリAIのLPなど）は、そのままコピーする
    for page in sorted((SRC / "standalone").glob("*.html")):
        (OUT / page.name).write_text(page.read_text(encoding="utf-8"), encoding="utf-8")
        print("copied", f"public/{page.name}")
    # 検索エンジン向けの sitemap.xml と robots.txt
    import datetime
    today = datetime.date.today().isoformat()
    names = [p.stem for p in sorted((SRC / "pages").glob("*.html")) if p.stem != "404"] + [p.stem for p in sorted((SRC / "standalone").glob("*.html"))] + ["posupos-day", "posupos-night"]
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
            html = html.replace("<!--LDJSON-->", posupos_ld(html, mode))
            (OUT / f"posupos-{mode}.html").write_text(html, encoding="utf-8")
            print("wrote", f"public/posupos-{mode}.html")


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
