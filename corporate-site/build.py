"""会社ホームページを組み立てる。

src/pages/*.html（各ページの中身）に、src/layout.html（ヘッダー・フッターなど共通部分）をかぶせて public/ に書き出す。
src/standalone/*.html は独自デザインの1枚完結ページなので、そのまま public/ にコピーする。
ページの先頭のコメントに title / description / nav / cta を書く:

    <!--
    title: 会社概要
    description: 合同会社AKITOグループの会社概要と代表挨拶。
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


def main():
    layout = (SRC / "layout.html").read_text(encoding="utf-8")
    cta = (SRC / "cta.html").read_text(encoding="utf-8")
    for page in sorted((SRC / "pages").glob("*.html")):
        meta, body = parse(page.read_text(encoding="utf-8"))
        name = page.stem
        title = meta.get("title", "")
        full_title = "AKITOグループ｜愛ある事業で煌めくあなたに届ける未来" if name == "index" else f"{title}｜AKITOグループ"
        url = f"{SITE}/" if name == "index" else f"{SITE}/{name}"
        html = (
            layout.replace("{{title}}", full_title)
            .replace("{{description}}", meta.get("description", ""))
            .replace("{{url}}", url)
            .replace("{{nav}}", nav_html(meta.get("nav", "")))
            .replace("{{drawer}}", drawer_html(meta.get("nav", "")))
            .replace("{{cta}}", cta if meta.get("cta", "yes") != "no" else "")
            .replace("{{content}}", body.strip())
        )
        (OUT / f"{name}.html").write_text(html, encoding="utf-8")
        print("wrote", f"public/{name}.html")
    # 独自のデザインで1枚完結のページ（ガチキャリAIのLPなど）は、そのままコピーする
    for page in sorted((SRC / "standalone").glob("*.html")):
        (OUT / page.name).write_text(page.read_text(encoding="utf-8"), encoding="utf-8")
        print("copied", f"public/{page.name}")


if __name__ == "__main__":
    main()
