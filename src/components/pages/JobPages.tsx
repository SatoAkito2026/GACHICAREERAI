/**
 * 個人：求人を探す・応募する
 * 応募すると、その企業は練習の評価（採用担当者向け）を見られるようになり、メッセージでやりとりできる。
 */
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Briefcase, ChevronRight, MapPin, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PrivateShell } from "@/components/ModeShell";
import { talentApi } from "@/components/talent/TalentUI";

const THUMB_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/job-thumbnails/`;

type JobSummary = {
  id: string;
  title: string;
  job_type: string | null;
  employment_type: string | null;
  salary_range: string | null;
  location: string | null;
  work_style: string | null;
  thumbnail_path: string | null;
  created_at: string;
  company_name: string;
  applied: boolean;
};

type JobDetail = JobSummary & {
  description: string | null;
  working_hours: string | null;
  holidays: string | null;
  benefits: string | null;
  selection_process: string | null;
  application_requirements: string | null;
  ideal_candidate: string | null;
  company_appeal: string | null;
};

const card = { background: "#1A1A1A", border: "1px solid #2A2A2A" } as const;

export function JobListPage() {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [jobType, setJobType] = useState("");

  useEffect(() => {
    void talentApi<{ jobs: JobSummary[] }>("/api/jobs/public").then((r) => {
      if (r.ok) setJobs(r.data.jobs);
      else {
        setJobs([]);
        setError(r.data.error ?? "読み込みに失敗しました");
      }
    });
  }, []);

  const types = useMemo(
    () => [...new Set((jobs ?? []).map((j) => j.job_type).filter(Boolean))] as string[],
    [jobs],
  );
  const shown = (jobs ?? []).filter((j) => {
    if (jobType && j.job_type !== jobType) return false;
    if (!keyword.trim()) return true;
    const k = keyword.trim().toLowerCase();
    return [j.title, j.company_name, j.location, j.job_type]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(k);
  });

  return (
    <PrivateShell>
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <div>
          <h1 className="text-[22px]" style={{ color: "#F0F0F0", fontWeight: 800 }}>
            求人を探す
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "#999999", lineHeight: 1.7 }}>
            応募すると、その企業はあなたの模擬面接の評価を見られるようになり、メッセージでやりとりできます。
          </p>
        </div>

        <div className="flex gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="キーワード（職種・会社・場所）"
            className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-[14px] outline-none"
            style={{ ...card, color: "#F0F0F0" }}
          />
          {types.length > 0 && (
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              className="rounded-xl px-2 py-2.5 text-[13px] outline-none"
              style={{ ...card, color: "#F0F0F0" }}
            >
              <option value="">すべての職種</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>

        {!jobs ? (
          <p className="py-10 text-center text-[13px]" style={{ color: "#888888" }}>
            読み込み中...
          </p>
        ) : error ? (
          <p className="text-[13px]" style={{ color: "#FF6B6B" }}>
            {error}
          </p>
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-[13px]" style={{ color: "#888888" }}>
            {jobs.length === 0 ? "いま掲載中の求人はありません。" : "条件に合う求人がありません。"}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {shown.map((j) => (
              <Link
                key={j.id}
                to="/private/individual/jobs/$id"
                params={{ id: j.id }}
                className="flex gap-3 rounded-2xl p-3 active:scale-[0.99]"
                style={card}
              >
                {j.thumbnail_path ? (
                  <img
                    src={`${THUMB_BASE}${j.thumbnail_path}`}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div
                    className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: "#262626", color: "#C8FF00" }}
                  >
                    <Briefcase size={26} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px]" style={{ color: "#888888" }}>
                    {j.company_name}
                  </p>
                  <p
                    className="line-clamp-2 text-[15px]"
                    style={{ color: "#F0F0F0", fontWeight: 700 }}
                  >
                    {j.title}
                  </p>
                  <p className="mt-1 truncate text-[12px]" style={{ color: "#AAAAAA" }}>
                    {[j.job_type, j.employment_type, j.location].filter(Boolean).join(" ・ ")}
                  </p>
                  {j.applied && (
                    <span className="mt-1 inline-block text-[11px]" style={{ color: "#C8FF00" }}>
                      応募済み
                    </span>
                  )}
                </div>
                <ChevronRight size={18} color="#555" className="self-center" />
              </Link>
            ))}
          </div>
        )}
      </main>
    </PrivateShell>
  );
}

export function JobDetailPage({ id }: { id: string }) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  useEffect(() => {
    void talentApi<{ job: JobDetail; myName: string }>(
      `/api/jobs/public?id=${encodeURIComponent(id)}`,
    ).then((r) => {
      if (r.ok) {
        setJob(r.data.job);
        setName(r.data.myName ?? "");
      } else setError(r.data.error ?? "読み込みに失敗しました");
    });
  }, [id]);

  const apply = async () => {
    setSending(true);
    const r = await talentApi("/api/jobs/apply", { jobId: id, name, message });
    setSending(false);
    if (!r.ok) {
      toast.error(r.data.error ?? "応募に失敗しました");
      return;
    }
    toast.success("応募しました。企業からの連絡は「オファー」に届きます");
    setJob((j) => (j ? { ...j, applied: true } : j));
    setApplyOpen(false);
  };

  const sections: [string, string | null][] = job
    ? [
        ["仕事内容", job.description],
        ["応募条件", job.application_requirements],
        ["求める人物像", job.ideal_candidate],
        ["勤務時間", job.working_hours],
        ["休日・休暇", job.holidays],
        ["福利厚生", job.benefits],
        ["選考の流れ", job.selection_process],
        ["会社の魅力", job.company_appeal],
      ]
    : [];

  return (
    <PrivateShell>
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6 pb-32">
        <Link to="/private/individual/jobs" style={{ color: "#888888", fontSize: 13 }}>
          ← 求人一覧
        </Link>
        {error ? (
          <p className="text-[14px]" style={{ color: "#FF6B6B" }}>
            {error}
          </p>
        ) : !job ? (
          <p className="py-10 text-center text-[13px]" style={{ color: "#888888" }}>
            読み込み中...
          </p>
        ) : (
          <>
            {job.thumbnail_path && (
              <img
                src={`${THUMB_BASE}${job.thumbnail_path}`}
                alt=""
                className="max-h-64 w-full rounded-2xl object-cover"
              />
            )}
            <div>
              <p className="text-[13px]" style={{ color: "#888888" }}>
                {job.company_name}
              </p>
              <h1 className="text-[21px]" style={{ color: "#F0F0F0", fontWeight: 800 }}>
                {job.title}
              </h1>
            </div>
            <div className="flex flex-col gap-1.5 rounded-2xl p-4 text-[13px]" style={card}>
              {[
                [<Briefcase key="b" size={15} />, [job.job_type, job.employment_type]],
                [<Wallet key="w" size={15} />, [job.salary_range]],
                [<MapPin key="m" size={15} />, [job.location, job.work_style]],
              ].map(([icon, vals], i) => {
                const text = (vals as (string | null)[]).filter(Boolean).join(" ・ ");
                return text ? (
                  <p key={i} className="flex items-center gap-2" style={{ color: "#DDDDDD" }}>
                    <span style={{ color: "#C8FF00" }}>{icon}</span>
                    {text}
                  </p>
                ) : null;
              })}
            </div>
            {sections
              .filter(([, v]) => v && v.trim())
              .map(([k, v]) => (
                <section key={k}>
                  <h2 className="mb-1 text-[13px]" style={{ color: "#C8FF00", fontWeight: 700 }}>
                    {k}
                  </h2>
                  <p
                    className="whitespace-pre-wrap text-[14px]"
                    style={{ color: "#DDDDDD", lineHeight: 1.8 }}
                  >
                    {v}
                  </p>
                </section>
              ))}

            {applyOpen && !job.applied && (
              <div className="flex flex-col gap-3 rounded-2xl p-4" style={card}>
                <p className="text-[14px]" style={{ color: "#F0F0F0", fontWeight: 700 }}>
                  この求人に応募する
                </p>
                <label className="text-[12px]" style={{ color: "#AAAAAA" }}>
                  お名前（企業に表示されます）
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={50}
                    className="mt-1 w-full rounded-lg px-3 py-2.5 text-[14px] outline-none"
                    style={{ background: "#0F0F0F", border: "1px solid #333", color: "#F0F0F0" }}
                  />
                </label>
                <label className="text-[12px]" style={{ color: "#AAAAAA" }}>
                  ひとこと（任意）
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={1000}
                    rows={4}
                    placeholder="志望理由や、伝えたいことがあれば"
                    className="mt-1 w-full rounded-lg px-3 py-2.5 text-[14px] outline-none"
                    style={{ background: "#0F0F0F", border: "1px solid #333", color: "#F0F0F0" }}
                  />
                </label>
                <p className="text-[11px]" style={{ color: "#888888", lineHeight: 1.7 }}>
                  応募すると、この企業はあなたの模擬面接の評価（採用担当者向けの内容・会話。録画は許可している場合のみ）を見られるようになり、メッセージでやりとりできます。
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {job && (
        <div
          className="fixed inset-x-0 z-30 px-4 pb-3 pt-2"
          style={{
            bottom: "var(--bottom-nav-h, 0px)",
            background: "linear-gradient(to top, #0F0F0F 70%, transparent)",
          }}
        >
          <div className="mx-auto max-w-2xl">
            {job.applied ? (
              <Link
                to="/private/individual/offers"
                className="block w-full rounded-2xl py-3.5 text-center text-[15px]"
                style={{ background: "#262626", color: "#C8FF00", fontWeight: 700 }}
              >
                応募済み ・ やりとりを見る
              </Link>
            ) : (
              <button
                type="button"
                disabled={sending || (applyOpen && !name.trim())}
                onClick={() => (applyOpen ? void apply() : setApplyOpen(true))}
                className="w-full rounded-2xl py-3.5 text-[15px] disabled:opacity-50"
                style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 800 }}
              >
                {sending ? "送信中..." : applyOpen ? "この内容で応募する" : "応募する"}
              </button>
            )}
          </div>
        </div>
      )}
    </PrivateShell>
  );
}
