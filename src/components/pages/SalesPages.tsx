/**
 * 営業ロープレ（企業の社員研修）の画面
 * - 会社：招待コード・資料（AIに覚えさせる）・社員ごとの練習の状況・最近のロープレ
 * - 社員：会社に参加 → 場面・手ごわさ・進め方を選んで始める → 結果の一覧
 * - 結果：会話と営業用の評価（本人と会社の両方が見る）
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { BusinessShell, PrivateShell } from "@/components/ModeShell";
import {
  Button,
  C,
  Card,
  ErrorText,
  Field,
  Loading,
  PageFrame,
  inputStyle,
  talentApi,
} from "@/components/talent/TalentUI";
import { extractPdfText } from "@/lib/pdf-text";

const SCENARIO_OPTIONS = [
  {
    key: "door",
    label: "訪問販売",
    emoji: "🏠",
    desc: "アポなしで訪問。インターホン越しに話を聞いてもらう",
  },
  {
    key: "inbound",
    label: "反響営業",
    emoji: "📩",
    desc: "資料請求したお客さんに電話。ニーズを聞いて提案",
  },
  {
    key: "teleapo",
    label: "テレアポ",
    emoji: "📞",
    desc: "知らない会社に電話して、面談の約束をとる",
  },
  {
    key: "b2b",
    label: "法人営業（商談）",
    emoji: "🏢",
    desc: "会社の担当者と商談。課題を聞いて次のステップへ",
  },
] as const;
const KIND_OPTIONS = [
  { key: "script", label: "トークスクリプト" },
  { key: "product", label: "商品・料金" },
  { key: "minutes", label: "商談の議事録" },
  { key: "other", label: "そのほか" },
] as const;
type MaterialKind = (typeof KIND_OPTIONS)[number]["key"];
type MaterialScenario = "all" | (typeof SCENARIO_OPTIONS)[number]["key"];
const DIFFICULTY_OPTIONS = [
  { key: "easy", label: "やさしい", desc: "話を聞いてくれる" },
  { key: "normal", label: "ふつう", desc: "よくある断り文句" },
  { key: "hard", label: "手ごわい", desc: "忙しい・すぐ切ろうとする" },
] as const;

function date(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("ja-JP") : "—";
}
function score(v: number | null | undefined): string {
  return typeof v === "number" ? `${v.toFixed(1)} / 5` : "—";
}

// ---------------- 会社 ----------------

type CompanyData = {
  company: { name: string; joinCode: string };
  members: {
    userId: string;
    name: string;
    joinedAt: string;
    count: number;
    lastAt: string | null;
    latest: number | null;
    average: number | null;
  }[];
  materials: {
    id: string;
    kind: MaterialKind;
    scenario: MaterialScenario;
    title: string;
    length: number;
    preview: string;
    createdAt: string;
  }[];
  recent: {
    id: string;
    userId: string;
    scenarioLabel: string;
    outcome: string | null;
    average: number | null;
    startedAt: string;
  }[];
};

export function SalesCompanyPage() {
  const [data, setData] = useState<CompanyData | null>(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<MaterialKind>("script");
  const [matScenario, setMatScenario] = useState<MaterialScenario>("all");
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);

  const load = useCallback(async () => {
    const r = await talentApi<CompanyData>("/api/sales/company");
    if (r.ok) setData(r.data);
    else setError(r.data.error ?? "読み込みに失敗しました");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const r = await talentApi("/api/sales/company", body);
    if (!r.ok) toast.error(r.data.error ?? "うまくいきませんでした");
    return r;
  };

  const newCode = async () => {
    if (
      !window.confirm(
        "招待コードを作り直します。今のコードは使えなくなります（参加済みの社員はそのままです）。",
      )
    )
      return;
    if ((await post({ action: "newCode" })).ok) void load();
  };

  const readFile = async (file: File) => {
    setReading(true);
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const text = isPdf ? await extractPdfText(file) : await file.text();
      if (!text.trim()) {
        toast.error("ファイルから文字を読み取れませんでした");
        return;
      }
      setContent(text.slice(0, 20000));
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 80));
      if (text.length > 20000) toast.message("長いので、はじめの2万文字だけ使います");
    } catch {
      toast.error("ファイルを読み込めませんでした");
    } finally {
      setReading(false);
    }
  };

  const addMaterial = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    const r = await post({
      action: "addMaterial",
      kind,
      scenario: matScenario,
      title: title.trim(),
      content: content.trim(),
    });
    setSaving(false);
    if (r.ok) {
      toast.success("資料を追加しました");
      setTitle("");
      setContent("");
      void load();
    }
  };

  const nameOf = (userId: string) =>
    data?.members.find((m) => m.userId === userId)?.name ?? "（退出した社員）";

  return (
    <BusinessShell>
      <PageFrame
        width={1000}
        title="営業ロープレ（社員研修）"
        subtitle="社員が AI のお客さん役を相手に、訪問販売・反響営業・テレアポ・法人営業を声で練習できます。社員は会員登録して、下の招待コードで参加します。結果（会話と営業の評価）はこの画面で見られます。1社あたり月100回まで無料です。"
      >
        {error ? (
          <ErrorText>{error}</ErrorText>
        ) : !data ? (
          <Loading />
        ) : (
          <>
            <Card>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[12px]" style={{ color: C.muted }}>
                    {data.company.name} の招待コード（営業ロープレ）
                  </p>
                  <p style={{ color: C.accent, fontSize: 30, fontWeight: 800, letterSpacing: 4 }}>
                    {data.company.joinCode}
                  </p>
                  <p className="text-[12px]" style={{ color: C.sub, lineHeight: 1.7 }}>
                    社員は個人として会員登録し、「マイページ →
                    会社の営業ロープレに参加」でこのコードを入力します。
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void navigator.clipboard
                        ?.writeText(data.company.joinCode)
                        .then(() => toast.success("コピーしました"))
                    }
                  >
                    <Copy size={14} /> コピー
                  </Button>
                  <Button variant="ghost" onClick={() => void newCode()}>
                    <RefreshCw size={14} /> 作り直す
                  </Button>
                </div>
              </div>
            </Card>

            <Card title="AIに覚えさせる資料">
              <p className="mb-3 text-[13px]" style={{ color: C.sub, lineHeight: 1.7 }}>
                トークスクリプトがある場合は「トークスクリプト」として入れてください。AI
                の先生がその流れを基準に助言・評価します。商品の説明・料金表・商談の議事録などを入れると、お客さん役がその商品の前提で話します（文字だけを保存します。30件・1件2万文字まで）。営業の基本の型（場面ごとの流れ・切り返し・特定商取引法など）は、最初から
                AI に入っていて、週に1回ネットで最新のコツを調べて更新しています。
              </p>
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="種類">
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value as MaterialKind)}
                      className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
                      style={inputStyle}
                    >
                      {KIND_OPTIONS.map((k) => (
                        <option key={k.key} value={k.key}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="使う場面">
                    <select
                      value={matScenario}
                      onChange={(e) => setMatScenario(e.target.value as MaterialScenario)}
                      className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
                      style={inputStyle}
                    >
                      <option value="all">すべての場面</option>
                      {SCENARIO_OPTIONS.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="資料の名前">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={80}
                    placeholder="例：浄水器Aの商品説明／〇〇社との商談の議事録"
                    className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
                    style={inputStyle}
                  />
                </Field>
                <Field label="中身" hint="PDF・テキストファイルからも読み込めます">
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    maxLength={20000}
                    rows={7}
                    placeholder="ここに貼り付けるか、下のボタンからファイルを選んでください"
                    className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
                    style={inputStyle}
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    className="cursor-pointer rounded-lg px-4 py-2.5 text-[14px]"
                    style={{ border: `1px solid ${C.border}`, color: C.text, fontWeight: 600 }}
                  >
                    {reading ? "読み込み中…" : "ファイルを選ぶ（PDF・テキスト）"}
                    <input
                      type="file"
                      accept=".pdf,.txt,.md,.csv,application/pdf,text/plain"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void readFile(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <Button
                    onClick={() => void addMaterial()}
                    loading={saving}
                    disabled={!title.trim() || !content.trim()}
                  >
                    資料を追加
                  </Button>
                  <span className="text-[12px]" style={{ color: C.muted }}>
                    {content.length.toLocaleString()} / 20,000文字
                  </span>
                </div>
              </div>
              {data.materials.length > 0 && (
                <ul className="mt-4 flex flex-col gap-2">
                  {data.materials.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-start justify-between gap-3 rounded-xl p-3"
                      style={{ background: C.card2, border: `1px solid ${C.border}` }}
                    >
                      <div className="min-w-0">
                        <p className="text-[14px]" style={{ color: C.text, fontWeight: 700 }}>
                          <span
                            className="mr-2 rounded px-1.5 py-0.5 text-[11px]"
                            style={{
                              background: m.kind === "script" ? C.accent : C.card,
                              color: m.kind === "script" ? "#000" : C.sub,
                              border: `1px solid ${C.border}`,
                            }}
                          >
                            {KIND_OPTIONS.find((k) => k.key === m.kind)?.label ?? "そのほか"}
                          </span>
                          {m.title}
                        </p>
                        <p className="mt-1 truncate text-[12px]" style={{ color: C.muted }}>
                          {m.scenario === "all"
                            ? "すべての場面"
                            : SCENARIO_OPTIONS.find((o) => o.key === m.scenario)?.label}
                          ・{m.length.toLocaleString()}文字・{date(m.createdAt)}・{m.preview}
                        </p>
                      </div>
                      <button
                        aria-label="消す"
                        onClick={() => {
                          if (!window.confirm(`「${m.title}」を消します。`)) return;
                          void post({ action: "deleteMaterial", id: m.id }).then((r) => {
                            if (r.ok) void load();
                          });
                        }}
                        style={{ color: C.danger }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title={`参加している社員 ${data.members.length}人`}>
              {data.members.length === 0 ? (
                <p className="py-4 text-center text-[14px]" style={{ color: C.muted }}>
                  まだ参加している社員はいません。上の招待コードを社員に伝えてください。
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]" style={{ color: C.text }}>
                    <thead>
                      <tr style={{ color: C.muted }}>
                        <th className="py-2 text-left">名前</th>
                        <th className="py-2 text-right">回数</th>
                        <th className="py-2 text-right">最新の評価</th>
                        <th className="py-2 text-right">平均</th>
                        <th className="py-2 text-right">最後に練習</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.members.map((m) => (
                        <tr key={m.userId} style={{ borderTop: `1px solid ${C.border}` }}>
                          <td className="py-2.5" style={{ fontWeight: 700 }}>
                            {m.name}
                          </td>
                          <td className="py-2.5 text-right">{m.count}回</td>
                          <td className="py-2.5 text-right">{score(m.latest)}</td>
                          <td className="py-2.5 text-right">{score(m.average)}</td>
                          <td className="py-2.5 text-right">{date(m.lastAt)}</td>
                          <td className="py-2.5 text-right">
                            <button
                              className="text-[12px]"
                              style={{ color: C.muted }}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `${m.name} さんを外します。結果も見えなくなります。`,
                                  )
                                )
                                  return;
                                void post({ action: "removeMember", userId: m.userId }).then(
                                  (r) => {
                                    if (r.ok) void load();
                                  },
                                );
                              }}
                            >
                              外す
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="最近のロープレ">
              {data.recent.length === 0 ? (
                <p className="py-4 text-center text-[14px]" style={{ color: C.muted }}>
                  まだありません
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.recent.map((r) => (
                    <li key={r.id}>
                      <Link
                        to="/sales/result/$id"
                        params={{ id: r.id }}
                        className="flex items-center justify-between gap-3 rounded-xl p-3"
                        style={{
                          background: C.card2,
                          border: `1px solid ${C.border}`,
                          color: C.text,
                        }}
                      >
                        <span className="min-w-0 text-[14px]">
                          <b>{nameOf(r.userId)}</b>
                          <span style={{ color: C.muted }}>
                            {"　"}
                            {r.scenarioLabel}・{date(r.startedAt)}
                            {r.outcome ? `・${r.outcome}` : ""}
                          </span>
                        </span>
                        <span
                          className="shrink-0 text-[15px]"
                          style={{ color: C.accent, fontWeight: 800 }}
                        >
                          {score(r.average)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </PageFrame>
    </BusinessShell>
  );
}

// ---------------- 社員 ----------------

type MemberData = {
  membership: { companyName: string; displayName: string } | null;
  remainingToday: number;
  list: {
    id: string;
    scenarioLabel: string;
    difficulty: string;
    outcome: string | null;
    average: number | null;
    startedAt: string;
  }[];
};

export function SalesMemberPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<MemberData | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [scenario, setScenario] = useState<(typeof SCENARIO_OPTIONS)[number]["key"]>("door");
  const [difficulty, setDifficulty] =
    useState<(typeof DIFFICULTY_OPTIONS)[number]["key"]>("normal");
  const [coach, setCoach] = useState<"coach" | "full">("coach");

  const load = useCallback(async () => {
    const r = await talentApi<MemberData>("/api/sales/roleplay");
    if (r.ok) setData(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const join = async () => {
    setJoining(true);
    const r = await talentApi<{ companyName: string }>("/api/sales/join", { code, name });
    setJoining(false);
    if (!r.ok) return void toast.error(r.data.error ?? "参加に失敗しました");
    toast.success(`${r.data.companyName} の営業ロープレに参加しました`);
    void load();
  };

  return (
    <PrivateShell>
      <PageFrame
        title="営業ロープレ"
        subtitle="AI のお客さん役を相手に、声で営業の練習をします。終わると、営業の観点で評価と直し方が出ます。結果は会社の担当者も見られます。"
      >
        {!data ? (
          <Loading />
        ) : !data.membership ? (
          <Card title="会社の営業ロープレに参加する">
            <p className="mb-3 text-[13px]" style={{ color: C.sub, lineHeight: 1.7 }}>
              会社から聞いた招待コードと、会社に表示するお名前を入れてください。参加すると、あなたのロープレの結果を会社の担当者が見られるようになります。
            </p>
            <div className="flex flex-col gap-3">
              <Field label="招待コード">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="例：ABCD234"
                  className="rounded-lg px-3 py-2.5 text-[16px] outline-none"
                  style={{ ...inputStyle, letterSpacing: 2 }}
                />
              </Field>
              <Field label="お名前（会社に表示）">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                  placeholder="例：山田 太郎"
                  className="rounded-lg px-3 py-2.5 text-[16px] outline-none"
                  style={inputStyle}
                />
              </Field>
              <Button
                onClick={() => void join()}
                loading={joining}
                disabled={!code.trim() || !name.trim()}
              >
                参加する
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <p className="text-[13px]" style={{ color: C.muted }}>
              {data.membership.companyName}（{data.membership.displayName} さん）・今日はあと
              {data.remainingToday}回
            </p>
            <Card title="1. 場面を選ぶ">
              <div className="grid gap-2 sm:grid-cols-2">
                {SCENARIO_OPTIONS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setScenario(s.key)}
                    className="rounded-xl p-3 text-left"
                    style={{
                      background: scenario === s.key ? "rgba(200,255,0,0.08)" : C.card2,
                      border: `2px solid ${scenario === s.key ? C.accent : C.border}`,
                      color: C.text,
                    }}
                  >
                    <p className="text-[15px]" style={{ fontWeight: 800 }}>
                      {s.emoji} {s.label}
                    </p>
                    <p className="mt-1 text-[12px]" style={{ color: C.sub }}>
                      {s.desc}
                    </p>
                  </button>
                ))}
              </div>
            </Card>
            <Card title="2. お客さんの手ごわさ">
              <div className="grid grid-cols-3 gap-2">
                {DIFFICULTY_OPTIONS.map((d) => (
                  <button
                    key={d.key}
                    onClick={() => setDifficulty(d.key)}
                    className="rounded-xl p-3 text-center"
                    style={{
                      background: difficulty === d.key ? "rgba(200,255,0,0.08)" : C.card2,
                      border: `2px solid ${difficulty === d.key ? C.accent : C.border}`,
                      color: C.text,
                    }}
                  >
                    <p className="text-[14px]" style={{ fontWeight: 800 }}>
                      {d.label}
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: C.sub }}>
                      {d.desc}
                    </p>
                  </button>
                ))}
              </div>
            </Card>
            <Card title="3. 進め方">
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    {
                      key: "coach",
                      label: "まずいところで止めて助言",
                      desc: "失敗しそうな一言で止めて、言い直し方を教えます（3回まで）",
                    },
                    {
                      key: "full",
                      label: "最後までやる",
                      desc: "本番のつもりで止めずに最後まで。終わったら評価します",
                    },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setCoach(m.key)}
                    className="rounded-xl p-3 text-left"
                    style={{
                      background: coach === m.key ? "rgba(200,255,0,0.08)" : C.card2,
                      border: `2px solid ${coach === m.key ? C.accent : C.border}`,
                      color: C.text,
                    }}
                  >
                    <p className="text-[14px]" style={{ fontWeight: 800 }}>
                      {m.label}
                    </p>
                    <p className="mt-1 text-[12px]" style={{ color: C.sub }}>
                      {m.desc}
                    </p>
                  </button>
                ))}
              </div>
            </Card>
            <Button
              disabled={data.remainingToday <= 0}
              onClick={() =>
                void navigate({ to: "/sales/play", search: { scenario, difficulty, coach } })
              }
            >
              ロープレをはじめる
            </Button>

            <Card title="これまでのロープレ">
              {data.list.length === 0 ? (
                <p className="py-4 text-center text-[14px]" style={{ color: C.muted }}>
                  まだありません
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.list.map((r) => (
                    <li key={r.id}>
                      <Link
                        to="/sales/result/$id"
                        params={{ id: r.id }}
                        className="flex items-center justify-between gap-3 rounded-xl p-3"
                        style={{
                          background: C.card2,
                          border: `1px solid ${C.border}`,
                          color: C.text,
                        }}
                      >
                        <span className="text-[14px]">
                          {r.scenarioLabel}
                          <span style={{ color: C.muted }}>
                            ・{date(r.startedAt)}
                            {r.outcome ? `・${r.outcome}` : ""}
                          </span>
                        </span>
                        <span className="text-[15px]" style={{ color: C.accent, fontWeight: 800 }}>
                          {score(r.average)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <button
              className="self-start text-[12px]"
              style={{ color: C.muted }}
              onClick={() => {
                if (
                  !window.confirm(
                    "会社の営業ロープレから抜けます。会社はあなたの結果を見られなくなります。",
                  )
                )
                  return;
                void talentApi("/api/sales/join", { action: "leave" }).then(() => load());
              }}
            >
              会社から抜ける
            </button>
          </>
        )}
      </PageFrame>
    </PrivateShell>
  );
}

// ---------------- 結果 ----------------

type ResultData = {
  memberName: string | null;
  scenarioLabel: string;
  difficultyLabel: string;
  coachMode: string;
  persona: { name: string; profile: string };
  status: string;
  outcome: string | null;
  startedAt: string;
  transcript: { role: "seller" | "customer" | "coach"; text: string; retracted: boolean }[];
  evaluation: {
    average: number;
    skills: { key: string; label: string; score: number; comment: string; quote: string | null }[];
    good: string[];
    improvements: { point: string; example: string }[];
    summary: string;
    outcome: string;
  } | null;
};

export function SalesResultPage({ id }: { id: string }) {
  const [data, setData] = useState<ResultData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void talentApi<ResultData>(`/api/sales/result?id=${encodeURIComponent(id)}`).then((r) => {
      if (r.ok) setData(r.data);
      else setError(r.data.error ?? "読み込めませんでした");
    });
  }, [id]);

  return (
    <div style={{ background: C.bg, minHeight: "100svh" }}>
      <PageFrame
        title="営業ロープレの結果"
        subtitle={
          data
            ? `${data.memberName ? `${data.memberName} さん・` : ""}${data.scenarioLabel}・お客さん：${data.difficultyLabel}・${new Date(data.startedAt).toLocaleString("ja-JP")}`
            : undefined
        }
      >
        <button
          className="self-start text-[13px]"
          style={{ color: C.sub }}
          onClick={() => window.history.back()}
        >
          ← もどる
        </button>
        {error ? (
          <ErrorText>{error}</ErrorText>
        ) : !data ? (
          <Loading />
        ) : (
          <>
            {data.evaluation ? (
              <>
                <Card>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-[12px]" style={{ color: C.muted }}>
                        6つの観点の平均
                      </p>
                      <p
                        style={{ color: C.accent, fontSize: 40, fontWeight: 900, lineHeight: 1.1 }}
                      >
                        {data.evaluation.average.toFixed(1)}
                        <span style={{ fontSize: 16, color: C.sub }}> / 5</span>
                      </p>
                    </div>
                    {data.evaluation.outcome && (
                      <span
                        className="rounded-full px-3 py-1 text-[13px]"
                        style={{
                          background: C.card2,
                          border: `1px solid ${C.border}`,
                          color: C.text,
                          fontWeight: 700,
                        }}
                      >
                        結果：{data.evaluation.outcome}
                      </span>
                    )}
                  </div>
                  {data.evaluation.summary && (
                    <p className="mt-3 text-[14px]" style={{ color: C.text, lineHeight: 1.7 }}>
                      {data.evaluation.summary}
                    </p>
                  )}
                </Card>
                <Card title="観点ごとの評価">
                  <ul className="flex flex-col gap-3">
                    {data.evaluation.skills.map((s) => (
                      <li key={s.key}>
                        <div
                          className="flex items-center justify-between text-[14px]"
                          style={{ color: C.text }}
                        >
                          <span style={{ fontWeight: 700 }}>{s.label}</span>
                          <span style={{ color: C.accent, fontWeight: 800 }}>{s.score} / 5</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full" style={{ background: C.card2 }}>
                          <div
                            className="h-2 rounded-full"
                            style={{ width: `${(s.score / 5) * 100}%`, background: C.accent }}
                          />
                        </div>
                        {s.comment && (
                          <p className="mt-1 text-[13px]" style={{ color: C.sub, lineHeight: 1.6 }}>
                            {s.comment}
                          </p>
                        )}
                        {s.quote && (
                          <p className="mt-1 text-[12px]" style={{ color: C.muted }}>
                            根拠：「{s.quote}」
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
                {data.evaluation.good.length > 0 && (
                  <Card title="よかったところ">
                    <ul
                      className="flex list-disc flex-col gap-1.5 pl-5 text-[14px]"
                      style={{ color: C.text, lineHeight: 1.7 }}
                    >
                      {data.evaluation.good.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </Card>
                )}
                {data.evaluation.improvements.length > 0 && (
                  <Card title="次に直すところ">
                    <ul className="flex flex-col gap-3">
                      {data.evaluation.improvements.map((m, i) => (
                        <li
                          key={i}
                          className="rounded-xl p-3"
                          style={{ background: C.card2, border: `1px solid ${C.border}` }}
                        >
                          <p
                            className="text-[14px]"
                            style={{ color: C.text, fontWeight: 700, lineHeight: 1.6 }}
                          >
                            {m.point}
                          </p>
                          {m.example && (
                            <p
                              className="mt-1.5 text-[13px]"
                              style={{ color: C.accent, lineHeight: 1.6 }}
                            >
                              言い方の例：「{m.example}」
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <p className="text-[14px]" style={{ color: C.sub }}>
                  このロープレは評価がありません（途中で終わったか、まだ評価していません）。
                </p>
              </Card>
            )}
            <Card title={`会話（お客さん：${data.persona.name}さん）`}>
              <p className="mb-3 text-[12px]" style={{ color: C.muted }}>
                {data.persona.profile}
              </p>
              <ul className="flex flex-col gap-2">
                {data.transcript.map((l, i) => (
                  <li
                    key={i}
                    className="rounded-xl px-3 py-2 text-[14px]"
                    style={{
                      background:
                        l.role === "coach"
                          ? "rgba(255,200,0,0.1)"
                          : l.role === "seller"
                            ? C.card2
                            : "transparent",
                      border: `1px solid ${l.role === "coach" ? "#B8860B" : C.border}`,
                      color: l.retracted ? C.muted : C.text,
                      textDecoration: l.retracted ? "line-through" : undefined,
                      lineHeight: 1.6,
                    }}
                  >
                    <span className="mr-2 text-[11px]" style={{ color: C.muted, fontWeight: 700 }}>
                      {l.role === "coach" ? "助言" : l.role === "seller" ? "営業" : "お客さん"}
                    </span>
                    {l.text}
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </PageFrame>
    </div>
  );
}
