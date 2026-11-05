"""
全国の学校一覧（受験モードの志望校の候補）を作る。

元データ：文部科学省「学校コード一覧」（https://www.mext.go.jp/b_menu/toukei/mext_01087.html）の CSV
  - 都道府県別の一覧（_2-1・_2-2・_4）：高校・中等教育学校・専修学校（専門学校）
  - 大学・短大・高専の一覧（_6）
文科省の一覧にない警察学校・消防学校・防衛や省庁の学校は、下の表で足す。

使い方：python3 scripts/schools/build_schools.py <CSVを置いたフォルダ>
出力：public/data/schools.json  [[学校名, 都道府県番号(1-47 / 0=全国), 種類, 市区町村], ...]
（市区町村は、同じ名前の学校を見分けるためと、AI に学校を調べてもらうときに確かめるため）
種類：hs_public / hs_private / kosen / univ / jc / vocational / nursing / midwife / police / fire / jsdf_high / defense_univ / jsdf_other / other
"""
import csv
import re
import io
import json
import os
import sys

PREFS = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
    "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
    "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
    "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
    "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
]


CITY_RE = re.compile(r"^(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県)?((?:[^市区町村]+?郡)?[^市区町村]+?[市区町村])")


def city_of(address: str) -> str:
    m = CITY_RE.match(address.strip())
    return m.group(1) if m else ""


def kind_of(school_kind: str, setter: str, name: str):
    k = school_kind[:2]
    if k in ("D1", "D2"):  # 高校・中等教育学校
        return "hs_private" if setter.startswith("3") else "hs_public"
    if k == "H1":  # 専修学校（専門学校・看護学校など）
        if "助産" in name:
            return "midwife"
        if "看護" in name:
            return "nursing"
        return "vocational"
    if k == "F1":
        return "univ"
    if k == "F2":
        return "jc"
    if k == "G1":
        return "kosen"
    return None


def extra_schools():
    rows = []
    for i, p in enumerate(PREFS, start=1):
        short = p if p == "北海道" else p[:-1]
        police = "警視庁警察学校" if p == "東京都" else f"{short if p != '北海道' else '北海道'}{'県' if p.endswith('県') else ('府' if p.endswith('府') else '')}警察学校"
        if p == "北海道":
            police = "北海道警察学校"
        rows.append([police, i, "police"])
        fire = "東京消防庁消防学校" if p == "東京都" else f"{p}消防学校"
        rows.append([fire, i, "fire"])
    rows += [
        ["皇宮警察学校", 0, "police"],
        ["陸上自衛隊高等工科学校", 14, "jsdf_high"],
        ["防衛大学校", 14, "defense_univ"],
        ["防衛医科大学校（医学科）", 11, "defense_univ"],
        ["防衛医科大学校（看護学科）", 11, "defense_univ"],
        ["航空学生（海上自衛隊・航空自衛隊）", 0, "jsdf_other"],
        ["自衛官候補生", 0, "jsdf_other"],
        ["一般曹候補生", 0, "jsdf_other"],
        ["海上保安大学校", 34, "other"],
        ["海上保安学校", 26, "other"],
        ["気象大学校", 12, "other"],
        ["国立看護大学校", 13, "nursing"],
        ["職業能力開発総合大学校", 13, "other"],
    ]
    return rows


def main(src: str):
    out = []
    seen = set()
    for f in sorted(os.listdir(src)):
        if not f.endswith(".csv"):
            continue
        text = open(os.path.join(src, f), encoding="utf-8-sig").read()
        rows = list(csv.reader(io.StringIO(text)))[2:]
        for r in rows:
            if len(r) < 6:
                continue
            if len(r) > 9 and r[9].strip():  # 廃止された学校
                continue
            kind = kind_of(r[1], r[3], r[5])
            if not kind:
                continue
            try:
                pref = int(r[2][:2])
            except ValueError:
                continue
            name = r[5].strip()
            key = (name, pref)
            if not name or key in seen:
                continue
            seen.add(key)
            out.append([name, pref, kind, city_of(r[6]) if len(r) > 6 else ""])
    for row in extra_schools():
        key = (row[0], row[1])
        if key not in seen:
            seen.add(key)
            out.append(row + [""])
    out.sort(key=lambda x: (x[1], x[0]))
    dest = os.path.join(os.path.dirname(__file__), "..", "..", "public", "data", "schools.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, separators=(",", ":"))
    counts = {}
    for _, _, k, _ in out:
        counts[k] = counts.get(k, 0) + 1
    print(len(out), counts)


if __name__ == "__main__":
    main(sys.argv[1])
