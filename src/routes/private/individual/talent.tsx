import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PrivateShell } from "@/components/ModeShell";
import {
  Button,
  C,
  CAREER_STAGE_LABELS,
  Card,
  ErrorText,
  Field,
  Loading,
  PageFrame,
  SummaryView,
  Tag,
  inputStyle,
  talentApi,
  type TalentSummary,
} from "@/components/talent/TalentUI";

export const Route = createFileRoute("/private/individual/talent")({
  head: () => ({ meta: [{ title: "公開プロフィール｜ガチキャリAI" }] }),
  component: TalentProfilePage,
});

type Profile = {
  public_code: string;
  is_public: boolean;
  display_name: string | null;
  headline: string | null;
  career_stage: string | null;
  desired_jobs: string | null;
  desired_locations: string | null;
  self_pr: string | null;
  record_practice: boolean;
  show_recording: boolean;
  consented_at: string | null;
  summary: TalentSummary | null;
  summary_updated_at: string | null;
  interview_count: number;
};

const EMPTY = {
  display_name: "",
  headline: "",
  career_stage: "",
  desired_jobs: "",
  desired_locations: "",
  self_pr: "",
  record_practice: false,
  show_recording: false,
};

function TalentProfilePage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [practiceCount, setPracticeCount] = useState(0);
  const [unlockCount, setUnlockCount] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState<"" | "save" | "publish" | "refresh">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const apply = (p: Profile | null) => {
    setProfile(p);
    if (p) {
      setForm({
        display_name: p.display_name ?? "",
        headline: p.headline ?? "",
        career_stage: p.career_stage ?? "",
        desired_jobs: p.desired_jobs ?? "",
        desired_locations: p.desired_locations ?? "",
        self_pr: p.self_pr ?? "",
        record_practice: p.record_practice,
        show_recording: p.show_recording,
      });
    }
  };

  useEffect(() => {
    void talentApi<{ profile: Profile | null; practiceCount: number; unlockCount: number }>(
      "/api/talent/my-profile",
    ).then((r) => {
      if (r.ok) {
        apply(r.data.profile);
        setPracticeCount(r.data.practiceCount);
        setUnlockCount(r.data.unlockCount);
      } else setError(r.data.error ?? "読み込みに失敗しました");
      setLoading(false);
    });
  }, []);

  const save = async (extra: Record<string, unknown> = {}, kind: "save" | "publish" = "save") => {
    setSaving(kind);
    setError("");
    setNotice("");
    const r = await talentApi<{ profile: Profile }>("/api/talent/my-profile", {
      ...form,
      ...extra,
    });
    setSaving("");
    if (!r.ok) return setError(r.data.error ?? "保存に失敗しました");
    apply(r.data.profile);
    setNotice(
      "is_public" in extra
        ? extra.is_public
          ? "プロフィールを公開しました"
          : "プロフィールを非公開にしました"
        : "保存しました",
    );
  };

  const refresh = async () => {
    setSaving("refresh");
    setError("");
    const r = await talentApi<{ summary: TalentSummary | null }>("/api/talent/my-profile", {
      action: "refresh",
    });
    setSaving("");
    if (!r.ok) return setError(r.data.error ?? "更新に失敗しました");
    setProfile((p) => (p ? { ...p, summary: r.data.summary } : p));
    setNotice("人物まとめを更新しました");
  };

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <PrivateShell>
      <PageFrame
        title="公開プロフィール"
        subtitle={
          <>
            模擬面接の評価をもとにした「人物まとめ」を企業に公開できます。企業は名前を伏せた状態で見て、気になった人だけチケットを購入し、名前・詳しい評価・録画（許可した場合）を見ます。
            <br />
            公開・非公開はいつでも切り替えられます。
          </>
        }
      >
        {loading ? (
          <Loading />
        ) : (
          <>
            <Card
              title="公開の状態"
              right={
                profile?.is_public ? (
                  <Tag color={C.accent}>公開中</Tag>
                ) : (
                  <Tag color={C.muted}>非公開</Tag>
                )
              }
            >
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label="模擬面接（個人）" value={`${practiceCount}回`} />
                <Stat label="詳しく見た企業" value={`${unlockCount}社`} />
                <Stat label="人物まとめ" value={profile?.summary ? "作成済み" : "未作成"} />
              </div>
              {practiceCount === 0 && (
                <p className="mt-4 text-[13px]" style={{ color: C.sub }}>
                  公開するには、先に模擬面接を1回以上受けてください。{" "}
                  <Link to="/private/individual/practice" style={{ color: C.accent }}>
                    模擬面接を受ける →
                  </Link>
                </p>
              )}
            </Card>

            <Card title="プロフィール">
              <div className="flex flex-col gap-4">
                <Field
                  label="お名前"
                  hint="チケットを購入した企業と、面談を申し込んだ企業にだけ表示されます"
                >
                  <input
                    value={form.display_name}
                    onChange={set("display_name")}
                    maxLength={60}
                    className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
                    style={inputStyle}
                    placeholder="山田 太郎"
                  />
                </Field>
                <Field
                  label="ひとこと（見出し）"
                  hint="名前を伏せた一覧に表示されます。名前・学校名・会社名は書かないでください"
                >
                  <input
                    value={form.headline}
                    onChange={set("headline")}
                    maxLength={80}
                    className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
                    style={inputStyle}
                    placeholder="例：営業5年、人と話すのが好きです"
                  />
                </Field>
                <Field label="いまの状況">
                  <select
                    value={form.career_stage}
                    onChange={set("career_stage")}
                    className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
                    style={inputStyle}
                  >
                    <option value="">選択してください</option>
                    {Object.entries(CAREER_STAGE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="希望の職種">
                    <input
                      value={form.desired_jobs}
                      onChange={set("desired_jobs")}
                      maxLength={200}
                      className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
                      style={inputStyle}
                      placeholder="例：営業、カスタマーサポート"
                    />
                  </Field>
                  <Field label="希望の勤務地">
                    <input
                      value={form.desired_locations}
                      onChange={set("desired_locations")}
                      maxLength={200}
                      className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
                      style={inputStyle}
                      placeholder="例：東京都、リモート可"
                    />
                  </Field>
                </div>
                <Field
                  label="自己PR"
                  hint="名前を伏せた状態でも企業に表示されます。個人が特定される内容は書かないでください"
                >
                  <textarea
                    value={form.self_pr}
                    onChange={set("self_pr")}
                    maxLength={1500}
                    rows={5}
                    className="resize-y rounded-lg px-3 py-2.5 text-[14px] outline-none"
                    style={inputStyle}
                  />
                </Field>

                <div className="flex flex-col gap-2 rounded-lg p-3" style={{ background: C.card2 }}>
                  <Toggle
                    checked={form.record_practice}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        record_practice: v,
                        show_recording: v ? f.show_recording : false,
                      }))
                    }
                    label="これからの模擬面接（個人）をカメラで録画して残す"
                    hint="新しいものから3回分まで残ります"
                  />
                  <Toggle
                    checked={form.show_recording}
                    disabled={!form.record_practice}
                    onChange={(v) => setForm((f) => ({ ...f, show_recording: v }))}
                    label="録画を、チケットを購入した企業に見せる"
                    hint="オフにすると企業には録画が見えません"
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => void save()} loading={saving === "save"}>
                    保存する
                  </Button>
                </div>
              </div>
            </Card>

            <Card title={profile?.is_public ? "公開をやめる" : "企業に公開する"}>
              {profile?.is_public ? (
                <div className="flex flex-col gap-3">
                  <p className="text-[14px]" style={{ color: C.sub }}>
                    非公開にすると、企業の検索に表示されなくなり、新しい面談の申し込みも届かなくなります（すでにチケットを購入した企業は、購入時点の内容を引き続き見られます）。
                  </p>
                  <div>
                    <Button
                      variant="danger"
                      onClick={() => void save({ is_public: false }, "publish")}
                      loading={saving === "publish"}
                    >
                      非公開にする
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <ul
                    className="list-disc pl-5 text-[13px]"
                    style={{ color: C.sub, lineHeight: 1.9 }}
                  >
                    <li>
                      名前を伏せた状態で企業に見えるもの：ひとこと・いまの状況・希望職種・希望勤務地・自己PR・人物まとめ（強みと根拠になった発言の一部、能力の評価）
                    </li>
                    <li>
                      チケットを購入した企業にだけ見えるもの：お名前・面接ごとの詳しい評価・面接の会話・録画（許可した場合）
                    </li>
                    <li>メールアドレス・電話番号・住所・生年月日は企業に見せません</li>
                    <li>企業からの面談の申し込みは、承諾するか辞退するかを自分で選べます</li>
                    <li>ガチキャリAIは企業を紹介・推薦したり、採用に関与したりしません</li>
                  </ul>
                  <label className="flex items-start gap-2 text-[13px]" style={{ color: C.text }}>
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-1"
                    />
                    上の内容を理解し、プロフィールを企業に公開することに同意します
                  </label>
                  <div>
                    <Button
                      onClick={() => void save({ is_public: true, consent }, "publish")}
                      disabled={!consent || practiceCount === 0}
                      loading={saving === "publish"}
                    >
                      同意して公開する
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            <Card
              title="企業に見える人物まとめ"
              right={
                profile ? (
                  <Button
                    variant="ghost"
                    onClick={() => void refresh()}
                    loading={saving === "refresh"}
                  >
                    最新の面接で更新
                  </Button>
                ) : undefined
              }
            >
              {!profile ? (
                <p className="text-[14px]" style={{ color: C.muted }}>
                  プロフィールを保存すると、ここに企業から見える人物まとめが表示されます。
                </p>
              ) : (
                <>
                  <SummaryView summary={profile.summary} />
                  {profile.summary_updated_at && (
                    <p className="mt-4 text-[11px]" style={{ color: C.muted }}>
                      最終更新：{new Date(profile.summary_updated_at).toLocaleString("ja-JP")}
                      （模擬面接を受けると、1時間以内に自動で更新されます）
                    </p>
                  )}
                </>
              )}
            </Card>

            <ErrorText>{error}</ErrorText>
            {notice && (
              <p className="text-[13px]" style={{ color: C.accent }}>
                {notice}
              </p>
            )}
          </>
        )}
      </PageFrame>
    </PrivateShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: C.card2 }}>
      <p className="text-[11px]" style={{ color: C.muted }}>
        {label}
      </p>
      <p className="mt-1 text-[16px]" style={{ color: C.text, fontWeight: 700 }}>
        {value}
      </p>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-2 text-[13px] ${disabled ? "opacity-40" : ""}`}
      style={{ color: C.text }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
      <span>
        {label}
        {hint && (
          <span className="block text-[11px]" style={{ color: C.muted }}>
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
