/**
 * 人材プロフィール（公開プロフィール・企業の人材検索）で共通に使う表示部品
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Quote, Send } from "lucide-react";
import { getAuthHeaders } from "@/lib/chat-api";

export const C = {
  bg: "#0F0F0F",
  card: "#1A1A1A",
  card2: "#222222",
  border: "#333333",
  text: "#F0F0F0",
  sub: "#CCCCCC",
  muted: "#888888",
  accent: "#C8FF00",
  danger: "#FF5C5C",
};

export const CAREER_STAGE_LABELS: Record<string, string> = {
  student: "学生（就職活動中）",
  job_seeker: "求職中",
  employed: "在職中（転職を検討）",
  career_change: "異業種への転職を検討",
  senior: "シニア・定年後の再就職",
  other: "その他",
};

export const COMPETENCY_LABELS: Record<string, string> = {
  communication: "伝える力",
  logic: "論理的に考える力",
  initiative: "主体性",
  teamwork: "協調性",
  resilience: "粘り強さ",
  sincerity: "誠実さ",
  learning: "学ぶ姿勢",
};

export type SummaryCompetency = {
  key: string;
  label: string;
  score: number | null;
  evidence_count: number;
  interviews: number;
};

export type TalentSummary = {
  overview: string;
  strengths: { title: string; description: string; evidence: { quote: string; date: string }[] }[];
  growth_areas: string[];
  work_style: string;
  competencies: SummaryCompetency[];
  score_trend: { date: string; score: number }[];
  interview_count: number;
  generated_at: string;
};

/** ログイン中のユーザーとしてAPIを呼ぶ */
export async function talentApi<T = any>(
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: T & { error?: string; needsCompany?: boolean } }> {
  const headers: Record<string, string> = { ...(await getAuthHeaders()) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "通信に失敗しました" } as any };
  }
}

export function PageFrame({
  title,
  subtitle,
  children,
  width = 880,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  return (
    <main className="px-4 py-8" style={{ maxWidth: width, margin: "0 auto" }}>
      <h1 style={{ color: C.text, fontSize: 24, fontWeight: 700 }}>{title}</h1>
      {subtitle && (
        <p className="mt-2" style={{ color: C.sub, fontSize: 14, lineHeight: 1.7 }}>
          {subtitle}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-5">{children}</div>
    </main>
  );
}

export function Card({
  children,
  title,
  right,
}: {
  children: ReactNode;
  title?: string;
  right?: ReactNode;
}) {
  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: C.card, border: `1px solid ${C.border}` }}
    >
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  loading,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
}) {
  const style =
    variant === "primary"
      ? { background: C.accent, color: "#0F0F0F", border: `1px solid ${C.accent}` }
      : variant === "danger"
        ? { background: "transparent", color: C.danger, border: `1px solid ${C.danger}` }
        : { background: "transparent", color: C.text, border: `1px solid ${C.border}` };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[14px] disabled:opacity-50"
      style={{ ...style, fontWeight: 600 }}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Loading({ text = "読み込み中..." }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm" style={{ color: C.muted }}>
      <Loader2 size={16} className="animate-spin" />
      {text}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="text-[13px]" style={{ color: C.danger }}>
      {children}
    </p>
  );
}

export function Tag({ children, color = C.sub }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-block rounded-md px-2 py-0.5 text-[12px]"
      style={{ background: C.card2, color, border: `1px solid ${C.border}` }}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const map: Record<string, [string, string]> = {
    pending: ["返事待ち", "#FFC857"],
    accepted: ["承諾済み", C.accent],
    declined: ["辞退", C.muted],
    withdrawn: ["取り下げ", C.muted],
  };
  const [label, color] = map[status] ?? [status, C.muted];
  return <Tag color={color}>{label}</Tag>;
}

/** 能力ごとの点数（1〜5）。根拠がない力は「根拠なし」と表示する */
export function CompetencyBars({ competencies }: { competencies: SummaryCompetency[] }) {
  if (!competencies?.length) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {competencies.map((c) => (
        <div key={c.key} className="flex items-center gap-3">
          <span className="w-[120px] shrink-0 text-[13px]" style={{ color: C.sub }}>
            {c.label}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: C.card2 }}>
            {c.score !== null && (
              <div
                className="h-full rounded-full"
                style={{ width: `${(c.score / 5) * 100}%`, background: C.accent }}
              />
            )}
          </div>
          <span className="w-[92px] shrink-0 text-right text-[12px]" style={{ color: C.muted }}>
            {c.score !== null ? (
              <>
                <b style={{ color: C.text, fontSize: 14 }}>{c.score.toFixed(1)}</b> / 5
              </>
            ) : (
              "根拠なし"
            )}
          </span>
        </div>
      ))}
      <p className="mt-1 text-[11px]" style={{ color: C.muted }}>
        点数は面接での本人の発言を根拠にしたものです。発言に根拠がない力は評価していません。
      </p>
    </div>
  );
}

export function EvidenceQuote({ quote, date }: { quote: string; date?: string }) {
  return (
    <div
      className="flex gap-2 rounded-lg px-3 py-2 text-[13px]"
      style={{ background: C.card2, color: C.sub, borderLeft: `3px solid ${C.accent}` }}
    >
      <Quote size={13} className="mt-0.5 shrink-0" color={C.accent} />
      <span>
        {quote}
        {date && (
          <span className="ml-2 text-[11px]" style={{ color: C.muted }}>
            （{date}の面接）
          </span>
        )}
      </span>
    </div>
  );
}

function ScoreTrend({ trend }: { trend: { date: string; score: number }[] }) {
  if (!trend?.length) return null;
  return (
    <div className="flex items-end gap-1.5" style={{ height: 90 }}>
      {trend.map((t, i) => (
        <div
          key={i}
          className="flex flex-1 flex-col items-center gap-1"
          title={`${t.date} ${t.score}点`}
        >
          <span className="text-[10px]" style={{ color: C.muted }}>
            {t.score}
          </span>
          <div
            className="w-full rounded-t"
            style={{
              height: Math.max(4, (t.score / 100) * 60),
              background: C.accent,
              opacity: 0.4 + (0.6 * (i + 1)) / trend.length,
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** 人物まとめ（企業に見える内容） */
export function SummaryView({ summary }: { summary: TalentSummary | null }) {
  if (!summary) {
    return (
      <p className="text-[14px]" style={{ color: C.muted }}>
        まだ人物まとめがありません。模擬面接を受けると作られます。
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {summary.overview && (
        <div>
          <h3 className="mb-2 text-[14px]" style={{ color: C.muted, fontWeight: 600 }}>
            人物像
          </h3>
          <p style={{ color: C.text, fontSize: 14, lineHeight: 1.8 }}>{summary.overview}</p>
        </div>
      )}

      {summary.strengths?.length > 0 && (
        <div>
          <h3 className="mb-2 text-[14px]" style={{ color: C.muted, fontWeight: 600 }}>
            強みと、その根拠になった発言
          </h3>
          <div className="flex flex-col gap-4">
            {summary.strengths.map((s, i) => (
              <div key={i}>
                <p style={{ color: C.text, fontSize: 15, fontWeight: 700 }}>{s.title}</p>
                <p className="mt-1" style={{ color: C.sub, fontSize: 13, lineHeight: 1.7 }}>
                  {s.description}
                </p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {s.evidence.map((e, j) => (
                    <EvidenceQuote key={j} quote={e.quote} date={e.date} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-[14px]" style={{ color: C.muted, fontWeight: 600 }}>
          能力の評価（{summary.interview_count}回の面接から）
        </h3>
        <CompetencyBars competencies={summary.competencies} />
      </div>

      {summary.work_style && (
        <div>
          <h3 className="mb-2 text-[14px]" style={{ color: C.muted, fontWeight: 600 }}>
            力を発揮しやすそうな働き方
          </h3>
          <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.7 }}>{summary.work_style}</p>
        </div>
      )}

      {summary.growth_areas?.length > 0 && (
        <div>
          <h3 className="mb-2 text-[14px]" style={{ color: C.muted, fontWeight: 600 }}>
            伸びしろ
          </h3>
          <ul className="list-disc pl-5" style={{ color: C.sub, fontSize: 14, lineHeight: 1.8 }}>
            {summary.growth_areas.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.score_trend?.length > 1 && (
        <div>
          <h3 className="mb-2 text-[14px]" style={{ color: C.muted, fontWeight: 600 }}>
            総合点の推移
          </h3>
          <ScoreTrend trend={summary.score_trend} />
        </div>
      )}
    </div>
  );
}

type ThreadData = {
  request: { id: string; status: string; message: string; createdAt: string };
  me: "company" | "candidate";
  companyName: string;
  candidateName: string;
  messages: { id: string; mine: boolean; body: string; createdAt: string; read: boolean }[];
};

function timeLabel(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 企業とユーザーのメッセージのやり取り */
export function MessageThread({
  requestId,
  onChanged,
}: {
  requestId: string;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await talentApi<ThreadData>(
      `/api/talent/messages?requestId=${encodeURIComponent(requestId)}`,
    );
    if (r.ok) {
      setData(r.data);
      setError("");
    } else setError(r.data.error ?? "読み込みに失敗しました");
  }, [requestId]);

  useEffect(() => {
    void load().then(() => onChanged?.());
    const t = setInterval(() => void load(), 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [data?.messages.length]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    const r = await talentApi("/api/talent/messages", { requestId, body: text });
    setSending(false);
    if (!r.ok) return setError(r.data.error ?? "送信に失敗しました");
    setText("");
    await load();
  };

  if (!data) return error ? <ErrorText>{error}</ErrorText> : <Loading />;
  const other = data.me === "company" ? `${data.candidateName} さん` : data.companyName;

  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-lg px-3 py-2 text-[13px]"
        style={{ background: C.card2, color: C.sub, whiteSpace: "pre-wrap" }}
      >
        <span style={{ color: C.muted }}>申し込み時のメッセージ（{data.companyName}）</span>
        <br />
        {data.request.message}
      </div>
      <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
        {data.messages.length === 0 && (
          <p className="py-4 text-center text-[13px]" style={{ color: C.muted }}>
            まだメッセージはありません。{other}とのやり取りを始めましょう。
          </p>
        )}
        {data.messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%]">
              <div
                className="rounded-2xl px-3.5 py-2 text-[14px]"
                style={{
                  background: m.mine ? C.accent : C.card2,
                  color: m.mine ? "#0F0F0F" : C.text,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.6,
                }}
              >
                {m.body}
              </div>
              <p
                className={`mt-0.5 text-[10px] ${m.mine ? "text-right" : ""}`}
                style={{ color: C.muted }}
              >
                {timeLabel(m.createdAt)}
                {m.mine && m.read ? " ・既読" : ""}
              </p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {data.request.status === "accepted" ? (
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder={`${other}へのメッセージ`}
            className="flex-1 resize-none rounded-lg px-3 py-2 text-[14px] outline-none"
            style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || !text.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-lg disabled:opacity-40"
            style={{ background: C.accent }}
            aria-label="送信"
          >
            {sending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} color="#0F0F0F" />
            )}
          </button>
        </div>
      ) : (
        <p className="text-[12px]" style={{ color: C.muted }}>
          面談の申し込みが承諾されると、メッセージを送れるようになります。
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      <p className="text-[11px]" style={{ color: C.muted }}>
        連絡先の交換や面談の日程は、当事者どうしで直接決めてください。運営はやり取りに関与しません。
      </p>
    </div>
  );
}

export const inputStyle = {
  background: C.bg,
  border: `1px solid ${C.border}`,
  color: C.text,
} as const;

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px]" style={{ color: C.text, fontWeight: 600 }}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[11px]" style={{ color: C.muted }}>
          {hint}
        </span>
      )}
    </label>
  );
}
