#!/usr/bin/env python3
"""モニター募集の送り先を自動で集める（地域を指定するだけ）。

1. OpenStreetMap（地図のオープンデータ）から、その地域の飲食店・夜のお店で、ホームページかメールが登録されているお店を集める
2. お店自身のホームページのトップと「お問い合わせ・会社概要」などのページだけを開いて、公開されているメールアドレスを探す
3. 「営業お断り」「広告メールお断り」などと書いてあるお店は外す
4. tools/leads_import.py でそのまま取り込める CSV にする

使い方（Mac のターミナルで）:
  python3 tools/leads_collect.py 豊島区                       # 豊島区の飲食店・夜のお店
  python3 tools/leads_collect.py 新宿区 渋谷区 --out leads.csv
  python3 tools/leads_collect.py 札幌市 --kind night            # 夜のお店だけ（day=飲食店だけ、all=両方）
  python3 tools/leads_collect.py 豊島区 --limit 50              # まず50軒だけ試す
  python3 tools/leads_collect.py 東京都 --skip 豊島区 新宿区    # 都道府県まるごと（区市町村ごとに leads-東京都/ に保存。止まっても続きから）
  python3 tools/leads_collect.py 大阪市 --pref 大阪府           # 東京都以外は --pref をつける
そのあと:
  python3 tools/leads_import.py leads.csv            # 確認
  python3 tools/leads_import.py leads.csv --commit   # 取り込み

相手に迷惑をかけないためのきまり:
  ・1つのお店のサイトで開くのは最大4ページ。ページごとに少し待つ
  ・robots.txt で「機械は見ないで」とされているページは開かない
  ・食べログ・ホットペッパー・Instagram などのポータルや SNS は開かない（お店自身のサイトだけ）
  ・チェーン店（本部がある大きなお店）はのぞく（--include-chains で入れる）
データ: © OpenStreetMap contributors（ODbL）
"""
import argparse
import csv
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser

UA = "AKITOgroup-POSPOS-leads/1.0 (+https://akitogroup.jp/privacy; pospos@akitogroup.jp)"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
SKIP_HOSTS = ("camp-fire.jp", "tabelog.com", "hotpepper.jp", "gnavi.co.jp", "retty.me", "instagram.com", "facebook.com", "twitter.com", "x.com", "tiktok.com",
              "line.me", "lin.ee", "google.com", "goo.gl", "g.page", "youtube.com", "ameblo.jp", "ikyu.com", "ozmall.co.jp", "ekiten.jp", "itp.ne.jp")
SKIP_WORDS = ("hachi-navi", "hachiojimarche", "-sci.jp", "resebook", "yelp.", "tripadvisor.", "pocketpara", "caba-club", "hostlove", "nightwork", "fuzoku")
NIGHT_WORDS = re.compile(r"キャバ|ホスト|スナック|ラウンジ|ガールズ|ボーイズ|コンカフェ|コンセプトカフェ|クラブ|CLUB|Club|lounge|Lounge")
CONTACT_WORDS = re.compile(r"contact|inquiry|toiawase|otoiawase|company|about|profile|access|shop|info|gaiyou|gaiyo|tokushoho|law|お問い?合わせ|お問合せ|会社概要|店舗情報|店舗案内|アクセス|特定商取引", re.I)
REFUSE = re.compile(r"(広告|営業|セールス|勧誘|売り込み|DM).{0,10}(お断り|禁止|ご遠慮|固くお断り|不要|拒否|お控え)")
EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
# お店の人に届かない・営業の連絡先ではないアドレス（サイトの管理用・お客様窓口・採用・広報など）
ROLE_EMAIL = re.compile(r"^(webmaster|postmaster|hostmaster|admin|root|noreply|no-reply|support|cs|customer|recruit|saiyo|saiyou|jinji|press|pr|ir|privacy|abuse|security|shuzai|webshop|online-shop|onlineshop|shop-online|onlinestore|ec|houjin|media|kouhou|koho|soumu|soumuka|hr)[-_.@]|-hr@|-pr@|-cs@|-support@", re.I)
BAD_EMAIL = re.compile(r"\.(local|test|invalid)$|\.(lg|ac|go)\.jp$|\.(png|jpe?g|gif|webp|svg|css|js)$|@(example|sentry|wixpress|sentry-next|domain|email|yourdomain|mysite|akitogroup|company|mystore)\.|^(xxx|sample|test|your|name|info@example)", re.I)
TYPES = {"ramen": "ラーメン", "japanese": "和食", "sushi": "寿司", "soba": "そば・うどん", "udon": "そば・うどん", "yakiniku": "焼肉", "yakitori": "焼き鳥",
         "italian": "イタリアン", "pizza": "イタリアン", "french": "フレンチ・ビストロ", "chinese": "中華料理", "korean": "韓国料理", "curry": "カレー・インド料理",
         "indian": "カレー・インド料理", "thai": "エスニック（タイ・ベトナムなど）", "vietnamese": "エスニック（タイ・ベトナムなど）", "burger": "ハンバーガー",
         "steak_house": "ステーキ・鉄板焼き", "okonomiyaki": "お好み焼き・もんじゃ", "tonkatsu": "とんかつ・揚げ物", "donburi": "丼もの・牛丼", "coffee_shop": "カフェ",
         "cake": "ケーキ・スイーツ", "bakery": "パン屋・ベーカリー", "western": "洋食レストラン"}


CURL = shutil.which("curl")


def fetch(url, data=None, timeout=12, limit=600_000):
    """(状態コード, Content-Type, 最後のURL, 中身) を返す。Mac の古い Python は新しい暗号化に対応していないので curl を使う"""
    if CURL:
        with tempfile.NamedTemporaryFile() as body, tempfile.NamedTemporaryFile("w+") as form:
            cmd = [CURL, "-sS", "-L", "--max-redirs", "5", "--max-time", str(timeout), "--max-filesize", str(limit * 4), "-A", UA,
                   "-H", "Accept-Language: ja,en;q=0.5", "-o", body.name, "-w", "%{http_code}\n%{content_type}\n%{url_effective}"]
            if data is not None:
                form.write(data.decode()); form.flush()
                cmd += ["--data-binary", "@" + form.name]
            r = subprocess.run(cmd + [url], capture_output=True, text=True)
            if r.returncode not in (0, 63):
                raise OSError((r.stderr or "curl error").strip()[:200])
            code, ctype, final = (r.stdout.split("\n") + ["", "", url])[:3]
            with open(body.name, "rb") as f:
                return int(code or 0), ctype, final or url, f.read(limit)
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Accept-Language": "ja,en;q=0.5"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.headers.get("Content-Type") or "", r.geturl(), r.read(limit)
    except urllib.error.HTTPError as e:
        return e.code, "", url, b""


def http_get(url, timeout=12, limit=600_000):
    code, ctype, final, raw = fetch(url, timeout=timeout, limit=limit)
    if code >= 400:
        raise OSError(f"HTTP {code}")
    if "html" not in (ctype or "html"):
        return "", final
    m = re.search(r"charset=([\w-]+)", ctype or "") or re.search(rb'charset=["\']?([\w-]+)', raw[:3000])
    cs = (m.group(1).decode() if isinstance(m.group(1), bytes) else m.group(1)) if m else "utf-8"
    try:
        return raw.decode(cs, "replace"), final
    except LookupError:
        return raw.decode("utf-8", "replace"), final


def overpass(area, kind, pref="東京都"):
    amen = {"day": "restaurant|cafe|fast_food|food_court|ice_cream|pub|bar|biergarten",
            "night": "bar|pub|nightclub", "all": "restaurant|cafe|fast_food|food_court|ice_cream|pub|bar|biergarten|nightclub"}[kind]
    keys = ("website", "contact:website", "url", "email", "contact:email")
    parts = "".join(f'nwr["amenity"~"^({amen})$"]["{k}"](area.a);' for k in keys)
    parts += "".join(f'nwr["shop"~"^(bakery|confectionery|pastry)$"]["{k}"](area.a);' for k in ("website", "contact:website", "email")) if kind != "night" else ""
    # 同じ名前の区・市がほかの県にもある（北区・中央区・港区など）ので、都道府県の中にあるお店だけにする（軽い問い合わせ）
    inpref = f'area["name"="{pref}"]["admin_level"="4"]->.p;' if pref and area != pref else ""
    if inpref:
        parts = parts.replace("(area.a);", "(area.a)(area.p);")
    q = f'''[out:json][timeout:180];
{inpref}area["name"="{area}"]["boundary"="administrative"]->.a;
({parts});
out tags;'''
    data = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for ep in OVERPASS + OVERPASS:  # 全部だめなら、少し待ってもう1周
        if ep is OVERPASS[0] and last is not None:
            print("  → どのサーバーも混んでいます。60秒待ってからもう1周試します", flush=True)
            time.sleep(60)
        host = urllib.parse.urlparse(ep).netloc
        print(f"{area}: OpenStreetMap（{host}）に問い合わせています…（混んでいると1〜2分かかります）", flush=True)
        t0 = time.time()
        try:
            code, _, _, raw = fetch(ep, data=data, timeout=190, limit=50_000_000)
            if code != 200:
                raise OSError(f"HTTP {code}")
            res = json.loads(raw.decode())
            # 混んでいて時間切れになると、HTTP 200 のまま「0件」で返ってくることがある（remark に runtime error）
            if "error" in (res.get("remark") or "").lower():
                raise OSError("サーバーの時間切れ: " + res["remark"][:80])
            els = res["elements"]
            print(f"  → 返事がきました（{time.time() - t0:.0f}秒）", flush=True)
            return els
        except Exception as e:  # 混んでいたら次のサーバーへ
            last = e
            print(f"  → うまくいきませんでした（{e}）。別のサーバーで試します", flush=True)
            time.sleep(3)
    raise RuntimeError(f"OpenStreetMap から取れませんでした（{last}）。少し時間をおいてもう一度試してください。")


TOKYO = ("千代田区 中央区 港区 新宿区 文京区 台東区 墨田区 江東区 品川区 目黒区 大田区 世田谷区 渋谷区 中野区 杉並区 豊島区 北区 荒川区 板橋区 練馬区 足立区 葛飾区 江戸川区 "
         "八王子市 立川市 武蔵野市 三鷹市 青梅市 府中市 昭島市 調布市 町田市 小金井市 小平市 日野市 東村山市 国分寺市 国立市 福生市 狛江市 東大和市 清瀬市 東久留米市 "
         "武蔵村山市 多摩市 稲城市 羽村市 あきる野市 西東京市 瑞穂町 日の出町 檜原村 奥多摩町 大島町 利島村 新島村 神津島村 三宅村 御蔵島村 八丈町 青ヶ島村 小笠原村").split()


def municipalities(pref):
    """都道府県の中の区市町村の名前の一覧。となりの県の市（境目を共有している）は、役所の場所で見分けて外す"""
    if pref == "東京都":
        return list(TOKYO)  # 東京都は一覧を持っている（地図のサーバーに聞かない）
    base = f'rel["name"="{pref}"]["admin_level"="4"];map_to_area->.p;rel(area.p)["boundary"="administrative"]["admin_level"="7"]->.c;'
    for q in (base + 'node(r.c:"admin_centre")(area.p)->.n;rel.c(bn.n:"admin_centre");out tags;', base + '.c out tags;'):
        data = urllib.parse.urlencode({"data": "[out:json][timeout:120];" + q}).encode()
        for ep in OVERPASS:
            print(f"{pref}: 区市町村の一覧を問い合わせています（{urllib.parse.urlparse(ep).netloc}）…", flush=True)
            try:
                code, _, _, raw = fetch(ep, data=data, timeout=130, limit=20_000_000)
                if code != 200:
                    raise OSError(f"HTTP {code}")
                names = sorted({e["tags"]["name"] for e in json.loads(raw.decode())["elements"] if e.get("tags", {}).get("name")})
                if names:
                    return names
                break  # 0件なら、役所の場所で見分けない方法で取り直す
            except Exception as e:
                print(f"  → うまくいきませんでした（{e}）。別のサーバーで試します", flush=True)
                time.sleep(3)
    sys.exit(f"{pref} の区市町村の一覧が取れませんでした。少し時間をおいてもう一度試してください。")


def shop_type(t):
    name = t.get("name", "")
    if t.get("amenity") == "nightclub" or (t.get("amenity") in ("bar", "pub") and NIGHT_WORDS.search(name)):
        for w, lab in (("キャバ", "キャバクラ"), ("ホスト", "ホストクラブ"), ("スナック", "スナック"), ("ラウンジ", "ラウンジ"), ("ガールズ", "ガールズバー"), ("ボーイズ", "ボーイズバー"), ("コンカフェ", "コンセプトカフェ"), ("コンセプトカフェ", "コンセプトカフェ")):
            if w in name:
                return lab
        # キャストの言葉がない nightclub は、ほとんどがライブハウス・DJのクラブ（POSの相手ではない）
        return None if t.get("amenity") == "nightclub" else "その他の夜のお店"
    for c in re.split(r"[;,]", t.get("cuisine", "")):
        if c.strip() in TYPES:
            return TYPES[c.strip()]
    if t.get("shop") == "bakery":
        return "パン屋・ベーカリー"
    if t.get("shop") in ("confectionery", "pastry"):
        return "ケーキ・スイーツ"
    return {"cafe": "カフェ", "bar": "バー・バル（キャストなし）", "pub": "居酒屋", "fast_food": "お弁当・テイクアウト・キッチンカー"}.get(t.get("amenity"), "そのほかの飲食店")


class Crawler:
    def __init__(self, delay):
        self.delay, self.robots = delay, {}

    def allowed(self, url):
        p = urllib.parse.urlparse(url)
        base = f"{p.scheme}://{p.netloc}"
        if base not in self.robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                code, _, _, raw = fetch(base + "/robots.txt", timeout=8, limit=100_000)
                if code in (401, 403):
                    rp.parse(["User-agent: *", "Disallow: /"])  # 見せないと言っているなら開かない
                elif code == 200:
                    rp.parse(raw.decode("utf-8", "replace").splitlines())
                else:
                    rp.parse([])
            except Exception:
                rp.parse([])
            self.robots[base] = rp
        return self.robots[base].can_fetch(UA, url)

    def get(self, url):
        if not self.allowed(url):
            return None, url
        time.sleep(self.delay)
        try:
            return http_get(url)
        except Exception:
            return None, url

    def find(self, site):
        """お店のサイトから (メール, 見つけたページ, 断りの文があるか) を返す"""
        host = urllib.parse.urlparse(site).netloc.lower()
        if not host or any(host == h or host.endswith("." + h) for h in SKIP_HOSTS) or any(w in host for w in SKIP_WORDS):
            return None, None, False
        top, final = self.get(site)
        if top is None:
            return None, None, False
        pages, refused, found = [(final, top)], False, []
        links = []
        for href, label in re.findall(r'<a[^>]+href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', top, re.S | re.I):
            u = urllib.parse.urljoin(final, html.unescape(href))
            if urllib.parse.urlparse(u).netloc.lower() == urllib.parse.urlparse(final).netloc.lower() and (CONTACT_WORDS.search(href) or CONTACT_WORDS.search(re.sub("<[^>]+>", "", label))):
                if u not in links and u.rstrip("/") != final.rstrip("/"):
                    links.append(u)
        for u in links[:3]:
            txt, fu = self.get(u)
            if txt:
                pages.append((fu, txt))
        for url, txt in pages:
            plain = html.unescape(re.sub(r"<[^>]+>", " ", txt))
            if REFUSE.search(plain):
                refused = True
            mails = re.findall(r'mailto:([^"\'?>\s]+)', txt, re.I) + EMAIL.findall(plain.replace("＠", "@").replace("[at]", "@").replace("(at)", "@"))
            for m in mails:
                m = urllib.parse.unquote(m).strip(".,;:").lower()
                if EMAIL.fullmatch(m) and not BAD_EMAIL.search(m) and not ROLE_EMAIL.search(m):
                    found.append((m, url))
        if not found:
            return None, None, refused
        dom = host.replace("www.", "")
        found.sort(key=lambda x: (not x[0].endswith(dom), not x[0].startswith(("info@", "contact@", "shop@", "mail@"))))
        return found[0][0], found[0][1], refused


def collect(areas, a, out):
    seen, shops = set(), []
    for area in areas:
        els = overpass(area, a.kind, a.pref)
        n0 = len(shops)
        for e in els:
            t = e.get("tags", {})
            if not t.get("name") or (not a.include_chains and (t.get("brand") or t.get("brand:wikidata"))):
                continue
            key = f"{e['type']}/{e['id']}"
            if key in seen:
                continue
            seen.add(key)
            pref = t.get("addr:province") or t.get("addr:state") or (area if area.endswith(("都", "道", "府", "県")) else a.pref or "")
            if not (t.get("website") or t.get("contact:website") or t.get("url")) and not a.allow_osm_email:
                continue
            typ = shop_type(t)
            if typ is None:
                continue
            shops.append({"osm": key, "name": t["name"], "type": typ, "pref": pref,
                          "site": t.get("website") or t.get("contact:website") or t.get("url") or "",
                          "email": (t.get("email") or t.get("contact:email") or "").split(";")[0].strip().lower(), "area": area})
        print(f"{area}: OpenStreetMap でホームページがあるお店 {len(shops) - n0} 軒")
    if a.limit:
        shops = shops[:a.limit]
    cr, rows, stats = Crawler(a.delay), [], {"メールあり": 0, "見つからない": 0, "営業お断り": 0}
    if shops:
        print(f"{len(shops)} 軒のホームページを順番に見ます（1軒あたり数秒。止めるときは control + C）", flush=True)
    for i, s in enumerate(shops, 1):
        # 送ってよいのは、お店自身がホームページで公開しているアドレスだけ。
        # OpenStreetMap は誰でも書きこめるので、そこにあるだけのアドレスは使わない（--allow-osm-email のときだけ使う）
        email, page, refused = "", "", False
        if s["site"]:
            site = s["site"] if s["site"].startswith("http") else "http://" + s["site"]
            m, p, refused = cr.find(site)
            if m:
                email, page = m, p
        if not email and s["email"] and a.allow_osm_email:
            email, page = s["email"], f"https://www.openstreetmap.org/{s['osm']}"
        if refused:
            stats["営業お断り"] += 1
        elif email and any(r["メール"] == email for r in rows):
            pass  # 同じアドレス（同じ会社の別のお店など）は1回だけ
        elif email:
            stats["メールあり"] += 1
            rows.append({"店名": s["name"], "種類": s["type"], "都道府県": s["pref"], "メール": email, "見つけたページ": page,
                         "メモ": f"OSM {s['osm']}（{s['area']}）"})
        else:
            stats["見つからない"] += 1
        print(f"\r{i}/{len(shops)} 軒のホームページを確認（メールあり {stats['メールあり']}・営業お断り {stats['営業お断り']}）", end="", flush=True)
    print()
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["店名", "種類", "都道府県", "メール", "見つけたページ", "メモ"])
        w.writeheader()
        w.writerows(rows)
    print(f"{out} に {len(rows)} 件を書きました（メールが見つからない {stats['見つからない']}・営業お断りで外した {stats['営業お断り']}）。")
    print(f"次は: python3 tools/leads_import.py {out}")

    return len(rows)


def main():
    ap = argparse.ArgumentParser(description="モニター募集の送り先を自動で集める")
    ap.add_argument("areas", nargs="+", help="市区町村や都道府県の名前（例：豊島区 新宿区 大阪市）")
    ap.add_argument("--pref", default="東京都", help="探す都道府県（同じ名前の区・市を区別するため。例：--pref 大阪府）")
    ap.add_argument("--skip", nargs="*", default=[], help="都道府県まるごとのとき、飛ばす区市町村（例：--skip 豊島区 新宿区）")
    ap.add_argument("--whole", action="store_true", help="都道府県を区市町村に分けずに1回で探す（重いので、ふだんは使わない）")
    ap.add_argument("--kind", choices=["all", "day", "night"], default="all")
    ap.add_argument("--out", default="leads.csv")
    ap.add_argument("--limit", type=int, default=0, help="試しに集める最大の軒数")
    ap.add_argument("--delay", type=float, default=1.5, help="ページごとに待つ秒数")
    ap.add_argument("--include-chains", action="store_true")
    ap.add_argument("--allow-osm-email", action="store_true", help="OpenStreetMap にあるだけのアドレスも使う（お店が公開したとは限らないので、ふだんは使わない）")
    a = ap.parse_args()
    PREFS = ("都", "道", "府", "県")
    if len(a.areas) == 1 and a.areas[0].endswith(PREFS) and not a.whole:
        # 都道府県まるごと：区市町村ごとに分けて、1つずつ CSV にする（止まっても、できた分は飛ばして続きから）
        pref = a.areas[0]
        outdir = a.out if a.out != "leads.csv" else f"leads-{pref}"
        os.makedirs(outdir, exist_ok=True)
        names = [n for n in municipalities(pref) if n not in a.skip]
        print(f"{pref}: 区市町村 {len(names)} か所を順番に集めます（できた分は {outdir}/ に1つずつ保存）", flush=True)
        total = 0
        for i, name in enumerate(names, 1):
            path = os.path.join(outdir, f"{name}.csv")
            if os.path.exists(path):
                print(f"[{i}/{len(names)}] {name}: もう集めてあるので飛ばします")
                continue
            print(f"\n[{i}/{len(names)}] {name}", flush=True)
            a.pref = pref
            try:
                total += collect([name], a, path)
            except RuntimeError as e:
                print(f"{name}: {e} → 飛ばして次へ（もう一度同じコマンドを実行すると、ここから集め直します）")
        print(f"\n{pref}: ぜんぶ終わりました（今回 {total} 件）。")
        print(f"次は: cat {outdir}/*.csv  →  python3 tools/leads_import.py {outdir}/*.csv")
        return
    try:
        collect(a.areas, a, a.out)
    except RuntimeError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
