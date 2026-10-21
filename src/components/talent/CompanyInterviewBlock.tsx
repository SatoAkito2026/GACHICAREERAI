/**
 * 企業向け：1回分の模擬面接の評価。
 * 本人向けの練習アドバイス（点数・改善点・模範回答）は出さず、
 * 7つの評価（根拠つき）と採用担当向けの見立て、会話・録画だけを見せる。
 */
import { useState } from "react";
import { C, CompetencyBars, EvidenceQuote, Tag } from "@/components/talent/TalentUI";
import { AVATAR_STYLE_LABELS } from "@/lib/career-options";

export type CompanyInterview = {
  id: string;
  date: string;
  jobType: string | null;
  recordingUrl: string | null;
  competencies: {
    key: string;
    label: string;
    score: number | null;
    reason: string;
    evidence: string[];
  }[];
  recruiterView: {
    summary: string;
    strengths: { point: string; evidence: string[] }[];
    workStyle: string;
    confirmPoints: string[];
    suggestedQuestions: string[];
  } | null;
  transcript: { q: string; a: string }[];
  /** 練習の設定（古い面接には無い） */
  settings?: {
    avatar_style: string | null;
    interview_type: string | null;
    max_minutes: number | null;
    job_type: string | null;
    target_company: string | null;
    custom_questions: string[];
  } | null;
};

function competencyAverage(iv: CompanyInterview): string | null {
  const scores = iv.competencies.map((c) => c.score).filter((n): n is number => n !== null);
  if (scores.length === 0) return null;
  return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
}

export function CompanyInterviewBlock({
  iv,
  defaultOpen,
}: {
  iv: CompanyInterview;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showTranscript, setShowTranscript] = useState(false);
  const avg = competencyAverage(iv);
  const rv = iv.recruiterView;
  return (
    <div className="rounded-xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>
          {new Date(iv.date).toLocaleDateString("ja-JP")} ・ {iv.jobType || "職種指定なし"}
          {iv.recordingUrl && <Tag color={C.accent}>録画</Tag>}
        </span>
        <span style={{ color: C.accent, fontWeight: 700, fontSize: 13 }}>
          {avg ? `評価の平均 ${avg} / 5` : "評価なし"}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-4 px-4 pb-4">
          {iv.settings && <SettingsRow settings={iv.settings} />}
          {iv.recordingUrl && (
            <video
              src={iv.recordingUrl}
              controls
              preload="metadata"
              className="w-full rounded-lg"
              style={{ background: "#000", maxHeight: 420 }}
            />
          )}

          {rv ? (
            <div className="flex flex-col gap-3 rounded-lg p-3" style={{ background: C.card2 }}>
              <p className="text-[12px]" style={{ color: C.accent, fontWeight: 700 }}>
                採用担当者向けの見立て
              </p>
              {rv.summary && (
                <p style={{ color: C.text, fontSize: 13, lineHeight: 1.8 }}>{rv.summary}</p>
              )}
              {rv.strengths.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[12px]" style={{ color: C.sub, fontWeight: 700 }}>
                    仕事で活きそうな強み
                  </p>
                  {rv.strengths.map((s, i) => (
                    <div key={i}>
                      <p className="text-[13px]" style={{ color: C.text, fontWeight: 600 }}>
                        ・{s.point}
                      </p>
                      <div className="mt-1 flex flex-col gap-1">
                        {s.evidence.map((q, j) => (
                          <EvidenceQuote key={j} quote={q} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {rv.workStyle && <InfoRow title="仕事の進め方・話し方の傾向" text={rv.workStyle} />}
              <ListBox title="面談で確かめるとよい点" items={rv.confirmPoints} />
              <ListBox title="面談で聞くとよい質問" items={rv.suggestedQuestions} />
            </div>
          ) : (
            <p className="text-[12px]" style={{ color: C.muted }}>
              この回は、採用担当者向けの見立てを作る前の練習です（下の7つの評価と会話をご覧ください）。
            </p>
          )}

          {iv.competencies.some((c) => c.score !== null) && (
            <div className="flex flex-col gap-3">
              <CompetencyBars
                competencies={iv.competencies.map((c) => ({
                  key: c.key,
                  label: c.label,
                  score: c.score,
                  evidence_count: c.evidence.length,
                  interviews: 1,
                }))}
              />
              {iv.competencies
                .filter((c) => c.score !== null)
                .map((c) => (
                  <div key={c.key}>
                    <p className="text-[12px]" style={{ color: C.text, fontWeight: 600 }}>
                      {c.label}：<span style={{ color: C.sub, fontWeight: 400 }}>{c.reason}</span>
                    </p>
                    <div className="mt-1 flex flex-col gap-1">
                      {c.evidence.map((q, j) => (
                        <EvidenceQuote key={j} quote={q} />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {iv.transcript.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowTranscript(!showTranscript)}
                className="text-[13px]"
                style={{ color: C.accent }}
              >
                {showTranscript ? "会話を閉じる" : `面接の会話を見る（${iv.transcript.length}問）`}
              </button>
              {showTranscript && (
                <div className="mt-2 flex flex-col gap-2">
                  {iv.transcript.map((t, j) => (
                    <div
                      key={j}
                      className="rounded-lg p-3 text-[13px]"
                      style={{ background: C.card2, lineHeight: 1.7 }}
                    >
                      <p style={{ color: C.muted }}>面接官：{t.q}</p>
                      <p className="mt-1" style={{ color: C.text }}>
                        回答：{t.a || "（回答なし）"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-[12px]" style={{ color: C.sub, fontWeight: 700 }}>
        {title}
      </p>
      <p className="text-[13px]" style={{ color: C.text, lineHeight: 1.7 }}>
        {text}
      </p>
    </div>
  );
}

function ListBox({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1 text-[12px]" style={{ color: C.sub, fontWeight: 700 }}>
        {title}
      </p>
      <ul className="list-disc pl-5 text-[13px]" style={{ color: C.text, lineHeight: 1.7 }}>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function SettingsRow({ settings }: { settings: NonNullable<CompanyInterview["settings"]> }) {
  const tags = [
    settings.job_type ? `職種：${settings.job_type}` : null,
    settings.avatar_style
      ? `面接官：${AVATAR_STYLE_LABELS[settings.avatar_style] ?? settings.avatar_style}`
      : null,
    settings.max_minutes ? `${settings.max_minutes}分まで` : null,
    settings.target_company ? `応募先の想定：${settings.target_company}` : null,
  ].filter(Boolean) as string[];
  return (
    <div className="flex flex-col gap-2 rounded-lg p-3" style={{ background: C.card2 }}>
      <p className="text-[12px]" style={{ color: C.sub, fontWeight: 700 }}>
        この練習の設定
      </p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
      </div>
      {settings.custom_questions.length > 0 && (
        <div>
          <p className="text-[12px]" style={{ color: C.muted }}>
            本人が「聞いてほしい」と設定した質問
          </p>
          <ul className="list-disc pl-5 text-[12px]" style={{ color: C.text, lineHeight: 1.7 }}>
            {settings.custom_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
