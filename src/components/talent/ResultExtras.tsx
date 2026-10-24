/**
 * 練習の結果の部品（本人の画面と企業の画面の両方で使う）
 * - 一次面接の目安（7つの力の平均から出す）
 * - 話し方（答えの長さ・言いよどみ）
 * - 間・声・目線（面接中にブラウザで測った数字）
 */
import { speechAdvice, type SpeechStats } from "@/lib/speech-stats";
import { deliveryAdvice, type DeliveryStats } from "@/lib/delivery-tracker";

/** 7つの力の平均（5点満点）から、一次面接の目安を出す */
export function verdictOf(avg: number) {
  if (avg >= 3.8)
    return {
      label: "通過ライン",
      color: "#C8FF00",
      note: "この受け答えなら、一次面接は通過が見込める水準です",
    };
  if (avg >= 3.0)
    return {
      label: "あと一歩",
      color: "#FFD25C",
      note: "あと少しの具体性や構成で、通過ラインに届きます",
    };
  if (avg >= 2.0)
    return {
      label: "もう少し練習を",
      color: "#FFB84D",
      note: "結論→理由→具体例の順で話す練習をすると伸びます",
    };
  return {
    label: "基本から練習を",
    color: "#FF8A8A",
    note: "よく聞かれる質問への答えを、まず1つずつ用意しましょう",
  };
}

export function competencyAvg(comps: { score: number | null }[] | null | undefined): number | null {
  const scores = (comps ?? [])
    .map((c) => c.score)
    .filter((n): n is number => typeof n === "number");
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

/** いちばん上に出す一言の結論 */
export function VerdictCard({ avg, forCompany = false }: { avg: number; forCompany?: boolean }) {
  const v = verdictOf(avg);
  return (
    <div
      className="flex items-center gap-4 rounded-2xl p-4"
      style={{ background: "#141414", border: `1px solid ${v.color}55` }}
    >
      <div className="shrink-0 text-center">
        <p style={{ color: "#888", fontSize: 11 }}>7つの力の平均</p>
        <p style={{ color: "#F0F0F0", fontSize: 28, fontWeight: 900, lineHeight: 1.1 }}>
          {avg.toFixed(1)}
          <span style={{ fontSize: 13, color: "#888" }}> / 5</span>
        </p>
      </div>
      <div className="min-w-0">
        <p style={{ color: "#AAA", fontSize: 12 }}>
          {forCompany ? "一次面接の目安" : "本番の一次面接なら"}
        </p>
        <p style={{ color: v.color, fontSize: 20, fontWeight: 900 }}>{v.label}</p>
        <p style={{ color: "#999", fontSize: 11.5, lineHeight: 1.6 }}>
          {forCompany ? "※7つの力の平均から出した目安です" : v.note}
        </p>
      </div>
    </div>
  );
}

export function SpeechStatsCard({ stats }: { stats: SpeechStats }) {
  return (
    <div>
      <p style={{ color: "#5CC8FF", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>話し方</p>
      <div className="grid grid-cols-2 gap-2">
        <div
          className="rounded-xl p-3"
          style={{ background: "#141414", border: "1px solid #262626" }}
        >
          <p style={{ color: "#888", fontSize: 11 }}>1回の答えの長さ（平均）</p>
          <p style={{ color: "#F0F0F0", fontSize: 18, fontWeight: 800 }}>
            {stats.avgChars}
            <span style={{ fontSize: 11, marginLeft: 2 }}>文字</span>
          </p>
          <p style={{ color: "#666", fontSize: 10.5 }}>目安 150〜300文字</p>
        </div>
        <div
          className="rounded-xl p-3"
          style={{ background: "#141414", border: "1px solid #262626" }}
        >
          <p style={{ color: "#888", fontSize: 11 }}>言いよどみ（えー・あの など）</p>
          <p style={{ color: "#F0F0F0", fontSize: 18, fontWeight: 800 }}>
            {stats.fillers}
            <span style={{ fontSize: 11, marginLeft: 2 }}>回</span>
          </p>
          <p style={{ color: "#666", fontSize: 10.5 }}>1回の答えで {stats.fillersPerAnswer} 回</p>
        </div>
      </div>
      <ul className="mt-2 list-disc pl-5">
        {speechAdvice(stats).map((t, i) => (
          <li key={i} style={{ color: "#CCCCCC", fontSize: 12, lineHeight: 1.7 }}>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DeliveryCard({ d }: { d: DeliveryStats }) {
  const tiles: { label: string; value: string; unit: string; note: string }[] = [];
  if (d.avgLatencySec != null)
    tiles.push({
      label: "答え始めるまでの間",
      value: d.avgLatencySec.toFixed(1),
      unit: "秒",
      note: "目安 1〜3秒",
    });
  tiles.push({
    label: "話の途中の長い沈黙",
    value: String(d.longPauses),
    unit: "回",
    note: "3秒以上止まった回数",
  });
  if (d.intonation != null)
    tiles.push({
      label: "声の強弱（抑揚）",
      value: d.intonation < 25 ? "小さめ" : d.intonation > 75 ? "大きめ" : "ちょうど良い",
      unit: "",
      note: `${d.intonation} / 100`,
    });
  if (d.gazePercent != null)
    tiles.push({
      label: "目線（画面を見て話せた割合）",
      value: String(d.gazePercent),
      unit: "%",
      note: "目安 70%以上",
    });
  const tips = deliveryAdvice(d);
  return (
    <div>
      <p style={{ color: "#5CC8FF", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
        間・声・目線
      </p>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-xl p-3"
            style={{ background: "#141414", border: "1px solid #262626" }}
          >
            <p style={{ color: "#888", fontSize: 11 }}>{t.label}</p>
            <p style={{ color: "#F0F0F0", fontSize: 18, fontWeight: 800 }}>
              {t.value}
              {t.unit && <span style={{ fontSize: 11, marginLeft: 2 }}>{t.unit}</span>}
            </p>
            <p style={{ color: "#666", fontSize: 10.5 }}>{t.note}</p>
          </div>
        ))}
      </div>
      {d.wave.length > 4 && (
        <div
          className="mt-2 rounded-xl p-3"
          style={{ background: "#141414", border: "1px solid #262626" }}
        >
          <p style={{ color: "#888", fontSize: 11, marginBottom: 6 }}>
            声の波（答えている間の声の大きさ）
          </p>
          <svg
            viewBox={`0 0 ${d.wave.length * 3} 40`}
            className="h-10 w-full"
            preserveAspectRatio="none"
          >
            {d.wave.map((v, i) => {
              const h = Math.max(1.5, (v / 100) * 38);
              return (
                <rect key={i} x={i * 3} y={20 - h / 2} width={2} height={h} rx={1} fill="#5CC8FF" />
              );
            })}
          </svg>
        </div>
      )}
      {tips.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {tips.map((t, i) => (
            <li key={i} style={{ color: "#CCCCCC", fontSize: 12, lineHeight: 1.7 }}>
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
