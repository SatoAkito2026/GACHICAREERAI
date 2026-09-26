import { Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  STATUS_OPTIONS,
  INDUSTRY_OPTIONS,
  GRADE_OPTIONS,
  SUBJECT_OPTIONS,
} from "@/lib/career-options";
import { MyDocumentsSection } from "@/components/MyDocumentsSection";

const INPUT_STYLE = {
  background: "#0F0F0F",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  color: "#F0F0F0",
  padding: "10px 12px",
  width: "100%",
  fontSize: 14,
} as const;
const LABEL_STYLE = { color: "#AAAAAA", fontSize: 13, fontWeight: 600 } as const;
const CARD_STYLE = {
  background: "#1A1A1A",
  border: "1px solid #2A2A2A",
  borderRadius: 16,
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-4 block">
      <span style={LABEL_STYLE}>{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 p-5" style={CARD_STYLE}>
      <h2 className="mb-4 text-[15px]" style={{ color: "#C8FF00", fontWeight: 700 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function RemovableRow({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  return (
    <div
      className="mb-3 flex items-start gap-2 rounded-lg p-3"
      style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
    >
      <div className="flex-1 space-y-2">{children}</div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-full px-2 py-1 text-[12px]"
        style={{ color: "#FF6B6B" }}
      >
        削除
      </button>
    </div>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 rounded-full px-4 py-2 text-[13px]"
      style={{ border: "1px dashed #444444", color: "#CCCCCC" }}
    >
      + {label}
    </button>
  );
}

type Education = { school_name: string; degree: string; status: string };
type Certification = { name: string; acquired_on: string };
type WorkHistory = { company_name: string; position: string; period: string; description: string };
type DesiredSchool = { school_name: string; faculty: string; priority: number };
type MockExam = {
  exam_name: string;
  taken_on: string;
  deviation_value: string;
  judgment: string;
  target_school: string;
};
type CustomField = { label: string; value: string };

export function ProfileContent({
  mode,
  backTo,
}: {
  mode: "individual" | "student";
  backTo: string;
}) {
  const isStudent = mode === "student";
  const { session, loading } = useAuth();

  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderHour, setReminderHour] = useState(20);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [furigana, setFurigana] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");
  const [grade, setGrade] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [strongSubject, setStrongSubject] = useState("");
  const [weakSubject, setWeakSubject] = useState("");
  const [researchTopic, setResearchTopic] = useState("");
  const [selfPr, setSelfPr] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [languageSkill, setLanguageSkill] = useState("");
  const [pcSkill, setPcSkill] = useState("");
  const [hobby, setHobby] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [jobType, setJobType] = useState("");
  const [desiredSalary, setDesiredSalary] = useState("");
  const [desiredLocation, setDesiredLocation] = useState("");
  const [workStyle, setWorkStyle] = useState("");
  const [relocatable, setRelocatable] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [education, setEducation] = useState<Education[]>([]);
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [workHistory, setWorkHistory] = useState<WorkHistory[]>([]);
  const [desiredSchools, setDesiredSchools] = useState<DesiredSchool[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  const [mockExams, setMockExams] = useState<MockExam[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data } = await (supabase
        .from("daily_reminder_preferences")
        .select("enabled, send_hour")
        .eq("user_id", session.user.id)
        .maybeSingle() as any);
      if (data) {
        setReminderEnabled(data.enabled);
        setReminderHour(data.send_hour);
      }
    })();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data, error } = await (supabase
        .from("user_career_profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("mode", mode)
        .maybeSingle() as any);
      if (error) {
        console.error(error);
      } else if (data) {
        const basicInfo = (data.basic_info ?? {}) as Record<string, string>;
        setName(basicInfo.name ?? "");
        setFurigana(basicInfo.furigana ?? "");
        setBirthdate(basicInfo.birthdate ?? "");
        setGender(basicInfo.gender ?? "");
        setPhone(basicInfo.phone ?? "");
        setPostalCode(basicInfo.postal_code ?? "");
        setAddress(basicInfo.address ?? "");
        setEmergencyContact(basicInfo.emergency_contact ?? "");
        setCurrentStatus(basicInfo.current_status ?? "");
        setGrade(basicInfo.grade ?? "");
        setSchoolName(basicInfo.school_name ?? "");
        setGuardianName(basicInfo.guardian_name ?? "");
        setStrongSubject(basicInfo.strong_subject ?? "");
        setWeakSubject(basicInfo.weak_subject ?? "");
        setResearchTopic(basicInfo.research_topic ?? "");
        setLanguageSkill(basicInfo.language_skill ?? "");
        setPcSkill(basicInfo.pc_skill ?? "");
        setHobby(basicInfo.hobby ?? "");
        setPortfolioUrl(basicInfo.portfolio_url ?? "");
        setSelfPr(data.self_pr ?? "");
        setSkills((data.skills as string[]) ?? []);
        const dc = (data.desired_conditions as Record<string, string>) ?? {};
        setJobType(dc.job_type ?? "");
        setDesiredSalary(dc.desired_salary ?? "");
        setDesiredLocation(dc.desired_location ?? "");
        setWorkStyle(dc.work_style ?? "");
        setRelocatable(dc.relocatable ?? "");
        setAvailableFrom(dc.available_from ?? "");
        setEducation((data.education_history as Education[]) ?? []);
        setCertifications((data.certifications as Certification[]) ?? []);
        setWorkHistory((data.work_history as WorkHistory[]) ?? []);
        setDesiredSchools((data.desired_schools as DesiredSchool[]) ?? []);
        setActivities(
          ((data.extracurricular_activities as { text: string }[]) ?? []).map((a) => a.text),
        );
        setMockExams((data.mock_exam_results as MockExam[]) ?? []);
        setCustomFields((data.custom_fields as CustomField[]) ?? []);
      }
      setFetching(false);
    })();
  }, [session]);

  if (loading || fetching) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "#0F0F0F" }}
      >
        <p className="text-sm" style={{ color: "#888888" }}>
          読み込み中...
        </p>
      </div>
    );
  }
  if (!session) return <Navigate to="/login" />;

  const handleSaveReminder = async (nextEnabled: boolean, nextHour: number) => {
    if (!session) return;
    setReminderSaving(true);
    try {
      await (supabase
        .from("daily_reminder_preferences")
        .upsert({ user_id: session.user.id, enabled: nextEnabled, send_hour: nextHour } as any, {
          onConflict: "user_id",
        }) as any);
    } catch (e) {
      console.error(e);
      toast.error("リマインド設定の保存に失敗しました");
    } finally {
      setReminderSaving(false);
    }
  };

  const addSkill = () => {
    const v = skillInput.trim();
    if (!v) return;
    setSkills((prev) => [...prev, v]);
    setSkillInput("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await (supabase.from("user_career_profiles").upsert(
        {
          user_id: session.user.id,
          mode,
          basic_info: isStudent
            ? {
                name,
                furigana,
                birthdate,
                gender,
                phone,
                postal_code: postalCode,
                address,
                emergency_contact: emergencyContact,
                grade,
                school_name: schoolName,
                guardian_name: guardianName,
                strong_subject: strongSubject,
                weak_subject: weakSubject,
                research_topic: researchTopic,
              }
            : {
                name,
                furigana,
                birthdate,
                gender,
                phone,
                postal_code: postalCode,
                address,
                emergency_contact: emergencyContact,
                current_status: currentStatus,
                language_skill: languageSkill,
                pc_skill: pcSkill,
                hobby,
                portfolio_url: portfolioUrl,
              },
          self_pr: selfPr,
          certifications,
          mock_exam_results: isStudent ? mockExams : [],
          custom_fields: customFields,
          ...(isStudent
            ? {
                desired_schools: desiredSchools,
                extracurricular_activities: activities.map((text) => ({ text })),
              }
            : {
                skills,
                education_history: education,
                desired_conditions: {
                  job_type: jobType,
                  desired_salary: desiredSalary,
                  desired_location: desiredLocation,
                  work_style: workStyle,
                  relocatable,
                  available_from: availableFrom,
                },
                work_history: workHistory,
              }),
        } as any,
        { onConflict: "user_id,mode" },
      ) as any);
      if (error) throw error;
      toast.success("プロフィールを保存しました");
    } catch (err) {
      console.error(err);
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="min-h-screen px-6 py-10"
      style={{ background: "#0F0F0F", fontFamily: "'Inter', sans-serif" }}
    >
      <div className="mx-auto max-w-xl">
        <Link to={backTo} style={{ color: "#888888", fontSize: 13 }}>
          ← 戻る
        </Link>
        <h1 className="mt-4 text-[22px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
          プロフィール
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "#999999" }}>
          登録時に答えた内容も、ここでいつでも見返して編集できます。
        </p>

        <form onSubmit={handleSubmit}>
          <SectionCard title="基本情報">
            <div className="grid grid-cols-2 gap-4">
              <Field label="お名前">
                <input style={INPUT_STYLE} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="ふりがな">
                <input
                  style={INPUT_STYLE}
                  value={furigana}
                  onChange={(e) => setFurigana(e.target.value)}
                />
              </Field>
            </div>
            {isStudent ? (
              <div className="grid grid-cols-2 gap-4">
                <Field label="現在の学年">
                  <select
                    style={INPUT_STYLE}
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                  >
                    <option value="">選択してください</option>
                    {GRADE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="現在の学校名">
                  <input
                    style={INPUT_STYLE}
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <Field label="現在の状況">
                <select
                  style={INPUT_STYLE}
                  value={currentStatus}
                  onChange={(e) => setCurrentStatus(e.target.value)}
                >
                  <option value="">選択してください</option>
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label="生年月日">
                <input
                  type="date"
                  style={INPUT_STYLE}
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                />
              </Field>
              <Field label="電話番号">
                <input
                  style={INPUT_STYLE}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="090-1234-5678"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="郵便番号">
                <input
                  style={INPUT_STYLE}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="123-4567"
                />
              </Field>
              <Field label="現住所">
                <input
                  style={INPUT_STYLE}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="東京都〇〇区..."
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="性別（任意）">
                <select
                  style={INPUT_STYLE}
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="">選択しない</option>
                  <option value="男性">男性</option>
                  <option value="女性">女性</option>
                  <option value="回答しない">回答しない</option>
                </select>
              </Field>
              <Field label="緊急連絡先（任意）">
                <input
                  style={INPUT_STYLE}
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  placeholder="氏名・続柄・電話番号"
                />
              </Field>
            </div>
            {isStudent ? (
              <Field label="保護者氏名（任意）">
                <input
                  style={INPUT_STYLE}
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                />
              </Field>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="語学力（任意）">
                    <input
                      style={INPUT_STYLE}
                      value={languageSkill}
                      onChange={(e) => setLanguageSkill(e.target.value)}
                      placeholder="例：TOEIC 800点、英検準1級"
                    />
                  </Field>
                  <Field label="PCスキル（任意）">
                    <input
                      style={INPUT_STYLE}
                      value={pcSkill}
                      onChange={(e) => setPcSkill(e.target.value)}
                      placeholder="例：Excel関数、Photoshop"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="趣味・特技（任意）">
                    <input
                      style={INPUT_STYLE}
                      value={hobby}
                      onChange={(e) => setHobby(e.target.value)}
                    />
                  </Field>
                  <Field label="ポートフォリオ/SNS URL（任意）">
                    <input
                      style={INPUT_STYLE}
                      value={portfolioUrl}
                      onChange={(e) => setPortfolioUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </Field>
                </div>
              </>
            )}
          </SectionCard>

          <SectionCard title={isStudent ? "自己PR・得意/苦手科目" : "自己PR・強み"}>
            <Field label="自己PR">
              <textarea
                style={{ ...INPUT_STYLE, minHeight: 90, resize: "vertical" }}
                value={selfPr}
                onChange={(e) => setSelfPr(e.target.value)}
              />
            </Field>
            {isStudent ? (
              <div className="grid grid-cols-2 gap-4">
                <Field label="得意科目">
                  <select
                    style={INPUT_STYLE}
                    value={strongSubject}
                    onChange={(e) => setStrongSubject(e.target.value)}
                  >
                    <option value="">選択してください</option>
                    {SUBJECT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="苦手科目">
                  <select
                    style={INPUT_STYLE}
                    value={weakSubject}
                    onChange={(e) => setWeakSubject(e.target.value)}
                  >
                    <option value="">選択してください</option>
                    {SUBJECT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : null}
            {isStudent && (
              <Field label="課題研究・小論文テーマ（任意）">
                <input
                  style={INPUT_STYLE}
                  value={researchTopic}
                  onChange={(e) => setResearchTopic(e.target.value)}
                />
              </Field>
            )}
            {!isStudent && (
              <Field label="スキル・強み">
                <div className="flex flex-wrap gap-2">
                  {skills.map((s, i) => (
                    <span
                      key={`${s}-${i}`}
                      className="flex items-center gap-1 rounded-full px-3 py-1 text-[13px]"
                      style={{ background: "#2A2A2A", color: "#F0F0F0" }}
                    >
                      {s}
                      <button
                        type="button"
                        onClick={() => setSkills((prev) => prev.filter((_, idx) => idx !== i))}
                        style={{ color: "#FF6B6B" }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    style={INPUT_STYLE}
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                        e.preventDefault();
                        addSkill();
                      }
                    }}
                    placeholder="例：粘り強さ（Enterで追加）"
                  />
                  <button
                    type="button"
                    onClick={addSkill}
                    className="shrink-0 rounded-lg px-4 text-[13px]"
                    style={{ background: "#2A2A2A", color: "#F0F0F0" }}
                  >
                    追加
                  </button>
                </div>
              </Field>
            )}
          </SectionCard>

          {isStudent ? (
            <SectionCard title="志望校">
              {desiredSchools.map((s, i) => (
                <RemovableRow
                  key={i}
                  onRemove={() => setDesiredSchools((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <input
                    style={INPUT_STYLE}
                    placeholder="学校名"
                    value={s.school_name}
                    onChange={(e) =>
                      setDesiredSchools((prev) =>
                        prev.map((row, idx) =>
                          idx === i ? { ...row, school_name: e.target.value } : row,
                        ),
                      )
                    }
                  />
                  <input
                    style={INPUT_STYLE}
                    placeholder="学部・学科"
                    value={s.faculty}
                    onChange={(e) =>
                      setDesiredSchools((prev) =>
                        prev.map((row, idx) =>
                          idx === i ? { ...row, faculty: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </RemovableRow>
              ))}
              <AddButton
                label="志望校を追加"
                onClick={() =>
                  setDesiredSchools((prev) => [
                    ...prev,
                    { school_name: "", faculty: "", priority: prev.length + 1 },
                  ])
                }
              />
            </SectionCard>
          ) : (
            <SectionCard title="希望条件">
              <Field label="希望する職種・業界">
                <select
                  style={INPUT_STYLE}
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value)}
                >
                  <option value="">選択してください</option>
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="希望年収">
                  <input
                    style={INPUT_STYLE}
                    value={desiredSalary}
                    onChange={(e) => setDesiredSalary(e.target.value)}
                    placeholder="例：400万円〜"
                  />
                </Field>
                <Field label="希望勤務地">
                  <input
                    style={INPUT_STYLE}
                    value={desiredLocation}
                    onChange={(e) => setDesiredLocation(e.target.value)}
                    placeholder="例：東京都内"
                  />
                </Field>
              </div>
              <Field label="希望する働き方">
                <input
                  style={INPUT_STYLE}
                  value={workStyle}
                  onChange={(e) => setWorkStyle(e.target.value)}
                  placeholder="例：フルリモート可、フレックス希望"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="転勤可否">
                  <select
                    style={INPUT_STYLE}
                    value={relocatable}
                    onChange={(e) => setRelocatable(e.target.value)}
                  >
                    <option value="">選択してください</option>
                    <option value="可">可</option>
                    <option value="不可">不可</option>
                    <option value="要相談">要相談</option>
                  </select>
                </Field>
                <Field label="入社可能時期">
                  <input
                    style={INPUT_STYLE}
                    value={availableFrom}
                    onChange={(e) => setAvailableFrom(e.target.value)}
                    placeholder="例：即日、2ヶ月後〜"
                  />
                </Field>
              </div>
            </SectionCard>
          )}

          {isStudent && (
            <SectionCard title="模試結果">
              {mockExams.map((m, i) => (
                <RemovableRow
                  key={i}
                  onRemove={() => setMockExams((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      style={INPUT_STYLE}
                      placeholder="模試名（例：〇〇模試）"
                      value={m.exam_name}
                      onChange={(e) =>
                        setMockExams((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, exam_name: e.target.value } : row,
                          ),
                        )
                      }
                    />
                    <input
                      type="date"
                      style={INPUT_STYLE}
                      value={m.taken_on}
                      onChange={(e) =>
                        setMockExams((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, taken_on: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      style={INPUT_STYLE}
                      placeholder="偏差値"
                      value={m.deviation_value}
                      onChange={(e) =>
                        setMockExams((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, deviation_value: e.target.value } : row,
                          ),
                        )
                      }
                    />
                    <input
                      style={INPUT_STYLE}
                      placeholder="判定（例：B判定）"
                      value={m.judgment}
                      onChange={(e) =>
                        setMockExams((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, judgment: e.target.value } : row,
                          ),
                        )
                      }
                    />
                    <input
                      style={INPUT_STYLE}
                      placeholder="対象の志望校"
                      value={m.target_school}
                      onChange={(e) =>
                        setMockExams((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, target_school: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </div>
                </RemovableRow>
              ))}
              <AddButton
                label="模試結果を追加"
                onClick={() =>
                  setMockExams((prev) => [
                    ...prev,
                    {
                      exam_name: "",
                      taken_on: "",
                      deviation_value: "",
                      judgment: "",
                      target_school: "",
                    },
                  ])
                }
              />
            </SectionCard>
          )}

          {!isStudent && (
            <SectionCard title="学歴">
              {education.map((ed, i) => (
                <RemovableRow
                  key={i}
                  onRemove={() => setEducation((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <input
                    style={INPUT_STYLE}
                    placeholder="学校名"
                    value={ed.school_name}
                    onChange={(e) =>
                      setEducation((prev) =>
                        prev.map((row, idx) =>
                          idx === i ? { ...row, school_name: e.target.value } : row,
                        ),
                      )
                    }
                  />
                  <input
                    style={INPUT_STYLE}
                    placeholder="学部・学科（任意）"
                    value={ed.degree}
                    onChange={(e) =>
                      setEducation((prev) =>
                        prev.map((row, idx) =>
                          idx === i ? { ...row, degree: e.target.value } : row,
                        ),
                      )
                    }
                  />
                  <select
                    style={INPUT_STYLE}
                    value={ed.status}
                    onChange={(e) =>
                      setEducation((prev) =>
                        prev.map((row, idx) =>
                          idx === i ? { ...row, status: e.target.value } : row,
                        ),
                      )
                    }
                  >
                    <option value="">状態を選択</option>
                    <option value="在学中">在学中</option>
                    <option value="卒業">卒業</option>
                    <option value="中退">中退</option>
                  </select>
                </RemovableRow>
              ))}
              <AddButton
                label="学歴を追加"
                onClick={() =>
                  setEducation((prev) => [...prev, { school_name: "", degree: "", status: "" }])
                }
              />
            </SectionCard>
          )}

          <SectionCard title="資格">
            {certifications.map((c, i) => (
              <RemovableRow
                key={i}
                onRemove={() => setCertifications((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <input
                  style={INPUT_STYLE}
                  placeholder="資格名"
                  value={c.name}
                  onChange={(e) =>
                    setCertifications((prev) =>
                      prev.map((row, idx) => (idx === i ? { ...row, name: e.target.value } : row)),
                    )
                  }
                />
                <input
                  style={INPUT_STYLE}
                  placeholder="取得時期（例：2024年3月）"
                  value={c.acquired_on}
                  onChange={(e) =>
                    setCertifications((prev) =>
                      prev.map((row, idx) =>
                        idx === i ? { ...row, acquired_on: e.target.value } : row,
                      ),
                    )
                  }
                />
              </RemovableRow>
            ))}
            <AddButton
              label="資格を追加"
              onClick={() => setCertifications((prev) => [...prev, { name: "", acquired_on: "" }])}
            />
          </SectionCard>

          {isStudent ? (
            <SectionCard title="課外活動・部活動">
              {activities.map((a, i) => (
                <RemovableRow
                  key={i}
                  onRemove={() => setActivities((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <input
                    style={INPUT_STYLE}
                    placeholder="例：バスケットボール部 部長"
                    value={a}
                    onChange={(e) =>
                      setActivities((prev) =>
                        prev.map((row, idx) => (idx === i ? e.target.value : row)),
                      )
                    }
                  />
                </RemovableRow>
              ))}
              <AddButton
                label="活動を追加"
                onClick={() => setActivities((prev) => [...prev, ""])}
              />
            </SectionCard>
          ) : (
            <SectionCard title="職歴">
              {workHistory.map((w, i) => (
                <RemovableRow
                  key={i}
                  onRemove={() => setWorkHistory((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <input
                    style={INPUT_STYLE}
                    placeholder="会社名"
                    value={w.company_name}
                    onChange={(e) =>
                      setWorkHistory((prev) =>
                        prev.map((row, idx) =>
                          idx === i ? { ...row, company_name: e.target.value } : row,
                        ),
                      )
                    }
                  />
                  <input
                    style={INPUT_STYLE}
                    placeholder="役職・職種"
                    value={w.position}
                    onChange={(e) =>
                      setWorkHistory((prev) =>
                        prev.map((row, idx) =>
                          idx === i ? { ...row, position: e.target.value } : row,
                        ),
                      )
                    }
                  />
                  <input
                    style={INPUT_STYLE}
                    placeholder="期間（例：2021年4月〜現在）"
                    value={w.period}
                    onChange={(e) =>
                      setWorkHistory((prev) =>
                        prev.map((row, idx) =>
                          idx === i ? { ...row, period: e.target.value } : row,
                        ),
                      )
                    }
                  />
                  <textarea
                    style={{ ...INPUT_STYLE, minHeight: 60, resize: "vertical" }}
                    placeholder="業務内容（任意）"
                    value={w.description}
                    onChange={(e) =>
                      setWorkHistory((prev) =>
                        prev.map((row, idx) =>
                          idx === i ? { ...row, description: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </RemovableRow>
              ))}
              <AddButton
                label="職歴を追加"
                onClick={() =>
                  setWorkHistory((prev) => [
                    ...prev,
                    { company_name: "", position: "", period: "", description: "" },
                  ])
                }
              />
            </SectionCard>
          )}

          {!isStudent && (
            <div className="mt-6">
              <MyDocumentsSection mode={mode} />
            </div>
          )}

          <SectionCard title="カスタム項目（自由に追加）">
            {customFields.map((f, i) => (
              <RemovableRow
                key={i}
                onRemove={() => setCustomFields((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <input
                  style={INPUT_STYLE}
                  placeholder="項目名（例：資格取得予定、部活の役職 等）"
                  value={f.label}
                  onChange={(e) =>
                    setCustomFields((prev) =>
                      prev.map((row, idx) => (idx === i ? { ...row, label: e.target.value } : row)),
                    )
                  }
                />
                <input
                  style={INPUT_STYLE}
                  placeholder="内容"
                  value={f.value}
                  onChange={(e) =>
                    setCustomFields((prev) =>
                      prev.map((row, idx) => (idx === i ? { ...row, value: e.target.value } : row)),
                    )
                  }
                />
              </RemovableRow>
            ))}
            <AddButton
              label="項目を追加"
              onClick={() => setCustomFields((prev) => [...prev, { label: "", value: "" }])}
            />
          </SectionCard>

          <button
            type="submit"
            disabled={saving}
            className="mt-6 w-full rounded-full py-3 text-[15px] transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
          >
            {saving ? "保存中..." : "保存する"}
          </button>
        </form>
      </div>
    </div>
  );
}
