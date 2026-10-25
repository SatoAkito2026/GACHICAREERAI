#!/usr/bin/env python3
"""モニター募集の一斉送信の送り先を、CSV からポスポスの Supabase（posupos_leads）に入れる。

使い方:
  export SUPABASE_SERVICE_ROLE_KEY=...   # ポスポスのプロジェクトの service_role の鍵
  python3 tools/leads_import.py 送り先.csv            # 確認だけ（入れない）
  python3 tools/leads_import.py 送り先.csv --commit   # 入れる

CSV の列（1行目に列の名前。日本語・英語どちらでもよい。足りない列は空でよい）:
  店名(shop_name) / 種類(shop_type) / 都道府県(prefecture) / メール(email) / 見つけたページ(source_url) / 広告お断り(ad_refused) / メモ(note)

入れないもの:
  ・メールアドレスの形でないもの
  ・同じアドレスの重複（CSV の中・すでに入っているもの）
  ・「広告お断り」の列に何か入っている行、メモに「広告お断り」「営業お断り」などがある行
  ・すでにモニターに申し込んだアドレス、配信停止したアドレス
"""
import csv
import json
import os
import re
import sys
import urllib.parse
import urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://adzoyzslrjaokovqhxol.supabase.co")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
COLS = {
    "shop_name": ["shop_name", "店名", "お店の名前", "店舗名", "名前", "name"],
    "shop_type": ["shop_type", "種類", "お店の種類", "業種", "ジャンル"],
    "prefecture": ["prefecture", "都道府県", "県"],
    "email": ["email", "メール", "メールアドレス", "mail", "e-mail"],
    "source_url": ["source_url", "見つけたページ", "url", "URL", "ホームページ", "サイト"],
    "ad_refused": ["ad_refused", "広告お断り", "営業お断り"],
    "note": ["note", "メモ", "備考"],
}
REFUSE = re.compile(r"(広告|営業|セールス|勧誘).{0,6}(お断り|禁止|ご遠慮|不要|拒否)")
EMAIL = re.compile(r"^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$")


def api(path, method="GET", body=None):
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json",
                                          "Prefer": "resolution=ignore-duplicates,return=minimal"})
    with urllib.request.urlopen(req) as r:
        t = r.read().decode()
        return json.loads(t) if t else None


def existing(table, emails):
    found = set()
    emails = list(emails)
    for i in range(0, len(emails), 100):
        q = ",".join('"' + e.replace('"', "") + '"' for e in emails[i:i + 100])
        for row in api(f"{table}?select=email&email=in.({urllib.parse.quote(q)})") or []:
            found.add(row["email"].lower())
    return found


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    commit = "--commit" in sys.argv
    if not args:
        print(__doc__); sys.exit(1)
    with open(args[0], encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        head = {h.strip(): h for h in (reader.fieldnames or [])}
        pick = {k: next((head[n] for n in names if n in head), None) for k, names in COLS.items()}
        if not pick["email"]:
            sys.exit(f"メールの列が見つかりません。列の名前: {list(head)}")
        rows, skip = {}, {"形がちがう": 0, "重複": 0, "広告お断り": 0, "店名なし": 0}
        for r in reader:
            g = lambda k: (r.get(pick[k]) or "").strip() if pick[k] else ""
            email = g("email").lower().strip("<>").replace("mailto:", "")
            if not EMAIL.match(email):
                skip["形がちがう"] += 1; continue
            if g("ad_refused") or REFUSE.search(g("note")):
                skip["広告お断り"] += 1; continue
            if email in rows:
                skip["重複"] += 1; continue
            name = g("shop_name") or email.split("@")[1]
            if not g("shop_name"):
                skip["店名なし"] += 1
            rows[email] = {"shop_name": name[:100], "shop_type": g("shop_type")[:60] or None, "prefecture": g("prefecture")[:20] or None,
                           "email": email[:200], "source_url": g("source_url")[:500] or None, "note": g("note")[:500] or None}
    print(f"CSV から読んだ送り先: {len(rows)} 件（入れない: " + "・".join(f"{k} {v}" for k, v in skip.items() if v and k != "店名なし") + "）")
    if skip["店名なし"]:
        print(f"  ※ 店名が空の {skip['店名なし']} 件は、メールのドメインを店名のかわりにします")
    nosrc = sum(1 for v in rows.values() if not v["source_url"])
    if nosrc:
        print(f"  ※ 見つけたページ（source_url）が空の行が {nosrc} 件あります。公開されていたアドレスだと説明できるよう、なるべく残してください")
    if not KEY:
        print("SUPABASE_SERVICE_ROLE_KEY が入っていないので、重複の確認と取り込みはしていません。"); return
    already = existing("posupos_leads", rows) | existing("posupos_monitors", rows)
    new = [v for k, v in rows.items() if k not in already]
    print(f"すでに入っている・モニターに申し込み済み: {len(rows) - len(new)} 件 → 新しく入れる: {len(new)} 件")
    for v in new[:5]:
        print("  例:", v["shop_name"], v["email"], v["source_url"] or "")
    if not commit:
        print("\n確認だけしました。入れるときは最後に --commit をつけて、もう一度実行してください。"); return
    for i in range(0, len(new), 200):
        api("posupos_leads?on_conflict=email", "POST", new[i:i + 200])
    print(f"{len(new)} 件を入れました。毎朝 CAMPAIGN_DAILY 件ずつ送られます（0 のあいだは送りません）。")


if __name__ == "__main__":
    main()
