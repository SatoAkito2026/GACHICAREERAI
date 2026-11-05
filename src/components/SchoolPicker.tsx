/**
 * 受験モード：志望校の名前を入れると、全国の学校一覧から候補を出す
 * 一覧は public/data/schools.json（文部科学省の学校コード一覧＋警察・消防・防衛の学校。scripts/schools/build_schools.py で作る）。
 * 入力しはじめたときに1回だけ読み込む。一覧にない学校もそのまま入力できる。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ExamSchoolType } from "@/lib/exam-schools";

type Row = [name: string, pref: number, kind: string];

const PREFS = [
  "全国",
  "北海道",
  "青森",
  "岩手",
  "宮城",
  "秋田",
  "山形",
  "福島",
  "茨城",
  "栃木",
  "群馬",
  "埼玉",
  "千葉",
  "東京",
  "神奈川",
  "新潟",
  "富山",
  "石川",
  "福井",
  "山梨",
  "長野",
  "岐阜",
  "静岡",
  "愛知",
  "三重",
  "滋賀",
  "京都",
  "大阪",
  "兵庫",
  "奈良",
  "和歌山",
  "鳥取",
  "島根",
  "岡山",
  "広島",
  "山口",
  "徳島",
  "香川",
  "愛媛",
  "高知",
  "福岡",
  "佐賀",
  "長崎",
  "熊本",
  "大分",
  "宮崎",
  "鹿児島",
  "沖縄",
];

/** 一覧の種類 → 面接の種類 */
const KIND_TO_TYPE: Record<string, ExamSchoolType> = {
  hs_public: "hs_public",
  hs_private: "hs_private",
  kosen: "kosen",
  univ: "univ_recommend",
  jc: "junior_college",
  vocational: "vocational",
  nursing: "nursing",
  midwife: "midwife",
  police: "police",
  fire: "fire",
  jsdf_high: "jsdf_high",
  defense_univ: "defense_univ",
  jsdf_other: "jsdf_other",
  other: "other",
};

const KIND_LABEL: Record<string, string> = {
  hs_public: "公立高校",
  hs_private: "私立高校",
  kosen: "高専",
  univ: "大学",
  jc: "短大",
  vocational: "専門学校",
  nursing: "看護",
  midwife: "助産",
  police: "警察",
  fire: "消防",
  jsdf_high: "自衛隊",
  defense_univ: "防衛",
  jsdf_other: "自衛隊",
  other: "そのほか",
};

let cache: Promise<Row[]> | null = null;
function loadSchools(): Promise<Row[]> {
  if (!cache)
    cache = fetch("/data/schools.json")
      .then((r) => (r.ok ? (r.json() as Promise<Row[]>) : []))
      .catch(() => {
        cache = null;
        return [];
      });
  return cache;
}

/** 全角英数・空白をそろえて比べる */
function norm(s: string): string {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s\u3000・]/g, "")
    .toLowerCase();
}

export function SchoolPicker({
  value,
  onChange,
  placeholder,
  style,
}: {
  value: string;
  /** type は一覧から選んだときだけ入る（手で入力したときは undefined） */
  onChange: (name: string, type?: ExamSchoolType) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const q = norm(value);
  const hits = useMemo(() => {
    if (!rows || q.length < 1) return [];
    const scored: { row: Row; score: number }[] = [];
    for (const row of rows) {
      const n = norm(row[0]);
      const i = n.indexOf(q);
      if (i < 0) continue;
      // 先頭から一致・短い名前を上に
      scored.push({ row, score: (i === 0 ? 0 : 1000) + n.length });
      if (scored.length > 400) break;
    }
    return scored
      .sort((a, b) => a.score - b.score)
      .slice(0, 8)
      .map((s) => s.row);
  }, [rows, q]);

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        style={style}
        value={value}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          if (!rows) void loadSchools().then(setRows);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          if (!rows) void loadSchools().then(setRows);
        }}
      />
      {open && hits.length > 0 && (
        <div
          style={{
            position: "absolute",
            zIndex: 30,
            left: 0,
            right: 0,
            top: "calc(100% + 4px)",
            background: "#1A1A1A",
            border: "1px solid #333",
            borderRadius: 10,
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(0,0,0,.5)",
          }}
        >
          {hits.map((row) => (
            <button
              key={`${row[0]}-${row[1]}`}
              type="button"
              onClick={() => {
                onChange(row[0], KIND_TO_TYPE[row[2]] ?? "other");
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
              style={{ color: "#F0F0F0", fontSize: 13, borderBottom: "1px solid #262626" }}
            >
              <span className="min-w-0 truncate">{row[0]}</span>
              <span className="shrink-0" style={{ color: "#888", fontSize: 11 }}>
                {PREFS[row[1]] ?? ""}・{KIND_LABEL[row[2]] ?? ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
