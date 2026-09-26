import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { BusinessShell } from "@/components/ModeShell";
import { useActorPaywall, ActorPaywallScreen } from "@/components/ActorPaywall";

type Actor = {
  id: string;
  name: string;
  agency_name: string | null;
  school: string | null;
  sns_handles: Record<string, string>;
  follower_counts: Record<string, number>;
  past_works: { title: string; type: string; role: string; year: number }[];
  influence_summary: string | null;
  suggested_roles: { role_type: string; reason: string }[];
  last_researched_at: string | null;
  search_count: number | null;
};

type RankRow = { id: string; name: string; agency_name: string | null; search_count: number };

type Prediction = {
  id: string;
  production_title: string | null;
  production_type: string | null;
  venue_capacity: number | null;
  genre: string | null;
  role_description: string | null;
  fit_percentage: number | null;
  fit_reasoning: string | null;
  predicted_tickets_low: number | null;
  predicted_tickets_high: number | null;
  prediction_basis: string | null;
  created_at: string;
};

type Note = {
  id: string;
  audition_date: string | null;
  note: string | null;
  predicted_tickets: number | null;
  actual_tickets: number | null;
  created_at: string;
};

type ScreeningHistoryRow = {
  rank: string | null;
  score: number | null;
  summary: string | null;
  job_type: string | null;
  created_at: string;
};

type AuditionHistoryRow = {
  job_type: string | null;
  impression: string | null;
  created_at: string;
};

const cardStyle = { background: "#1A1A1A", border: "1px solid #333333", borderRadius: 16 } as const;
const inputStyle = {
  background: "#0F0F0F",
  border: "1px solid #333333",
  borderRadius: 8,
  color: "#F0F0F0",
  padding: "9px 12px",
  width: "100%",
  fontSize: 13,
} as const;

export const Route = createFileRoute("/business/actor/database")({
  head: () => ({ meta: [{ title: "役者データベース｜インタビアAI" }] }),
  component: ActorsPage,
});

function ActorsPage() {
  const { user, session, loading } = useAuth();
  const { isPaid, loading: paywallLoading } = useActorPaywall();

  const [searchName, setSearchName] = useState("");
  const [searching, setSearching] = useState(false);
  const [notFoundName, setNotFoundName] = useState("");
  const [researching, setResearching] = useState(false);

  const [actor, setActor] = useState<Actor | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [screeningHistory, setScreeningHistory] = useState<ScreeningHistoryRow[]>([]);
  const [auditionHistory, setAuditionHistory] = useState<AuditionHistoryRow[]>([]);
  const [issuingInterview, setIssuingInterview] = useState(false);
  const [interviewUrl, setInterviewUrl] = useState("");
  const [ranking, setRanking] = useState<RankRow[]>([]);

  const [showPredictForm, setShowPredictForm] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [prodTitle, setProdTitle] = useState("");
  const [prodType, setProdType] = useState("");
  const [venueCapacity, setVenueCapacity] = useState("");
  const [genre, setGenre] = useState("");
  const [roleDescription, setRoleDescription] = useState("");

  const [noteText, setNoteText] = useState("");
  const [noteDate, setNoteDate] = useState("");
  const [noteActual, setNoteActual] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const loadRanking = async () => {
    const { data } = await supabase
      .from("actors")
      .select("id, name, agency_name, search_count")
      .gt("search_count", 0)
      .order("search_count", { ascending: false })
      .limit(10);
    setRanking((data ?? []) as RankRow[]);
  };

  // フックは早期 return より前で呼ぶ（読み込み中→表示で呼ぶ数が変わるとページが落ちるため）
  useEffect(() => {
    if (!session || !isPaid) return;
    void loadRanking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isPaid]);

  if (loading) {
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
  if (paywallLoading) return null;
  if (!isPaid)
    return (
      <BusinessShell>
        <ActorPaywallScreen />
      </BusinessShell>
    );

  const loadActorDetail = async (actorId: string) => {
    const [{ data: preds }, { data: n }, { data: sh }, { data: ah }] = await Promise.all([
      supabase
        .from("actor_ticket_predictions")
        .select("*")
        .eq("actor_id", actorId)
        .order("created_at", { ascending: false }),
      supabase
        .from("actor_audition_notes")
        .select("*")
        .eq("actor_id", actorId)
        .eq("company_user_id", user!.id)
        .order("created_at", { ascending: false }),
      // 他社を含む全ての書類選考履歴(どの企業が評価したかは非表示、評価内容のみ共有)
      supabase
        .from("screening_candidates")
        .select("rank, score, summary, job_type, created_at")
        .eq("actor_id", actorId)
        .order("created_at", { ascending: false })
        .limit(20),
      // 他社を含む全てのオーディション(面接)履歴(どの企業が実施したかは非表示)
      supabase
        .from("interviews")
        .select("job_type, impression, created_at")
        .eq("actor_id", actorId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setPredictions((preds ?? []) as Prediction[]);
    setNotes((n ?? []) as Note[]);
    setScreeningHistory((sh ?? []) as ScreeningHistoryRow[]);
    setAuditionHistory((ah ?? []) as AuditionHistoryRow[]);
  };

  const handleSearch = async () => {
    const name = searchName.trim();
    if (!name) return;
    setSearching(true);
    setActor(null);
    setNotFoundName("");
    try {
      const { data } = await supabase.from("actors").select("*").ilike("name", name).limit(1);
      if (data && data.length > 0) {
        const found = data[0] as unknown as Actor;
        setActor(found);
        await loadActorDetail(found.id);
        // 調べられた回数を記録(検索の人気ランキング用)
        await supabase
          .from("actors")
          .update({ search_count: (found.search_count ?? 0) + 1 } as never)
          .eq("id", found.id);
        void loadRanking();
      } else {
        // データベースに無ければ、その場で自動的にAI調査を開始する(ボタンの二度押し不要)
        setNotFoundName(name);
        await handleResearch(name);
      }
    } finally {
      setSearching(false);
    }
  };

  const handleResearch = async (name: string) => {
    if (!session) return;
    setResearching(true);
    try {
      const res = await fetch(`/api/research-actor?_t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { actorId: string };
      const { data: fresh } = await supabase
        .from("actors")
        .select("*")
        .eq("id", data.actorId)
        .maybeSingle();
      if (fresh) {
        setActor(fresh as unknown as Actor);
        setNotFoundName("");
        await loadActorDetail(fresh.id);
        toast.success("プロフィールを作成しました");
      }
    } catch (e) {
      console.error(e);
      toast.error("調査に失敗しました");
    } finally {
      setResearching(false);
    }
  };

  const handleIssueInterview = async () => {
    if (!actor || !session) return;
    setIssuingInterview(true);
    try {
      const res = await fetch(`/api/create-actor-interview?_t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
        body: JSON.stringify({ actorId: actor.id }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { token: string };
      setInterviewUrl(`${window.location.origin}/actor-interview/${data.token}`);
    } catch (err) {
      console.error(err);
      toast.error("URLの発行に失敗しました");
    } finally {
      setIssuingInterview(false);
    }
  };

  const handlePredict = async () => {
    if (!actor || !session) return;
    setPredicting(true);
    try {
      const res = await fetch(`/api/predict-ticket-sales?_t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
        body: JSON.stringify({
          actorId: actor.id,
          productionTitle: prodTitle || undefined,
          productionType: prodType || undefined,
          venueCapacity: venueCapacity ? Number(venueCapacity) : undefined,
          genre: genre || undefined,
          roleDescription: roleDescription || undefined,
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await loadActorDetail(actor.id);
      setShowPredictForm(false);
      setProdTitle("");
      setProdType("");
      setVenueCapacity("");
      setGenre("");
      setRoleDescription("");
      toast.success("予測を作成しました");
    } catch (e) {
      console.error(e);
      toast.error("予測の作成に失敗しました");
    } finally {
      setPredicting(false);
    }
  };

  const handleSaveNote = async () => {
    if (!actor || !user) return;
    setSavingNote(true);
    try {
      const { error } = await supabase.from("actor_audition_notes").insert({
        actor_id: actor.id,
        company_user_id: user.id,
        audition_date: noteDate || null,
        note: noteText || null,
        actual_tickets: noteActual ? Number(noteActual) : null,
      });
      if (error) throw error;
      setNoteText("");
      setNoteDate("");
      setNoteActual("");
      await loadActorDetail(actor.id);
      toast.success("記録を保存しました");
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました");
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <BusinessShell>
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-[22px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
          役者データベース
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "#999999" }}>
          公開情報（SNSフォロワー数・出演歴等）をAIが集約。企業間で共有される情報です。オーディション記録は自社限定で非公開です。
        </p>

        <div className="mt-6 flex gap-2">
          <input
            style={inputStyle}
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229)
                handleSearch();
            }}
            placeholder="役者名を入力して検索"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="shrink-0 rounded-lg px-4 py-2 text-[13px] disabled:opacity-50"
            style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
          >
            {searching ? "検索中..." : "検索"}
          </button>
        </div>

        {!actor && ranking.length > 0 && (
          <div className="mt-6 rounded-2xl p-5" style={cardStyle}>
            <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              よく調べられている役者
            </p>
            <p style={{ color: "#666666", fontSize: 10, marginBottom: 10 }}>
              データベースで検索された回数の多い順です。
            </p>
            <div className="flex flex-col gap-1.5">
              {ranking.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setSearchName(r.name);
                    setActor(null);
                    setNotFoundName("");
                    (async () => {
                      setSearching(true);
                      try {
                        const { data } = await supabase
                          .from("actors")
                          .select("*")
                          .eq("id", r.id)
                          .limit(1);
                        if (data && data.length > 0) {
                          const found = data[0] as unknown as Actor;
                          setActor(found);
                          await loadActorDetail(found.id);
                          await supabase
                            .from("actors")
                            .update({ search_count: (found.search_count ?? 0) + 1 } as never)
                            .eq("id", found.id);
                          void loadRanking();
                        }
                      } finally {
                        setSearching(false);
                      }
                    })();
                  }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[#222222]"
                  style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px]"
                    style={{
                      background:
                        i === 0 ? "#C8FF00" : i === 1 ? "#888888" : i === 2 ? "#CD7F32" : "#333333",
                      color: i <= 2 ? "#0F0F0F" : "#F0F0F0",
                      fontWeight: 700,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={{ color: "#F0F0F0", fontSize: 12 }}
                  >
                    {r.name}
                    <span style={{ color: "#666666", fontSize: 10, marginLeft: 6 }}>
                      {r.agency_name ?? ""}
                    </span>
                  </span>
                  <span style={{ color: "#C8FF00", fontSize: 11, fontWeight: 700 }}>
                    {r.search_count}回
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {notFoundName && (
          <div className="mt-4 rounded-2xl p-5 text-center" style={cardStyle}>
            <p style={{ color: "#F0F0F0", fontSize: 13 }}>
              「{notFoundName}」はまだ登録されていません。
            </p>
            <button
              onClick={() => handleResearch(notFoundName)}
              disabled={researching}
              className="mt-3 rounded-full px-4 py-2 text-[13px] disabled:opacity-50"
              style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
            >
              {researching ? "AIが調査中..." : "AIで調査して登録する"}
            </button>
          </div>
        )}

        {actor && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="rounded-2xl p-5" style={cardStyle}>
              <div className="flex items-start justify-between">
                <div>
                  <p style={{ color: "#F0F0F0", fontSize: 18, fontWeight: 700 }}>{actor.name}</p>
                  <p style={{ color: "#888888", fontSize: 12, marginTop: 2 }}>
                    {actor.agency_name ?? "所属不明"} {actor.school ? `・${actor.school}出身` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleResearch(actor.name)}
                  disabled={researching}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[11px]"
                  style={{ background: "#222222", border: "1px solid #333333", color: "#F0F0F0" }}
                >
                  {researching ? "更新中..." : "🔄 最新化"}
                </button>
              </div>

              {Object.keys(actor.follower_counts ?? {}).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(actor.follower_counts).map(([platform, count]) => (
                    <span
                      key={platform}
                      className="rounded-full px-2.5 py-1 text-[11px]"
                      style={{
                        background: "#0F0F0F",
                        border: "1px solid #2A2A2A",
                        color: "#C8FF00",
                      }}
                    >
                      {platform}: {count.toLocaleString("ja-JP")}人
                    </span>
                  ))}
                </div>
              )}

              {actor.influence_summary && (
                <p className="mt-3" style={{ color: "#CCCCCC", fontSize: 12, lineHeight: 1.7 }}>
                  {actor.influence_summary}
                </p>
              )}

              {actor.past_works?.length > 0 && (
                <div className="mt-3">
                  <p style={{ color: "#AAAAAA", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                    過去出演作品
                  </p>
                  {actor.past_works.map((w, i) => (
                    <p key={i} style={{ color: "#CCCCCC", fontSize: 11 }}>
                      {w.year ? `${w.year}年 ` : ""}
                      {w.title}（{w.type}・{w.role}）
                    </p>
                  ))}
                </div>
              )}

              {actor.suggested_roles?.length > 0 && (
                <div className="mt-3">
                  <p style={{ color: "#AAAAAA", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                    向いている役柄（AI提案）
                  </p>
                  {actor.suggested_roles.map((r, i) => (
                    <div
                      key={i}
                      className="mt-1 rounded-lg p-2"
                      style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                    >
                      <p style={{ color: "#F0F0F0", fontSize: 11, fontWeight: 700 }}>
                        {r.role_type}
                      </p>
                      <p style={{ color: "#888888", fontSize: 11 }}>{r.reason}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3" style={{ color: "#555555", fontSize: 10 }}>
                最終調査:{" "}
                {actor.last_researched_at
                  ? new Date(actor.last_researched_at).toLocaleDateString("ja-JP")
                  : "未調査"}
              </p>
            </div>

            {/* 経歴確認面接URL発行 */}
            <div className="rounded-2xl p-5" style={cardStyle}>
              <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                経歴確認面接
              </p>
              <p style={{ color: "#666666", fontSize: 10, marginBottom: 10 }}>
                演技力は評価しません。経歴の整合性と集客力の見込みだけを確認する面接です。
              </p>
              <button
                onClick={handleIssueInterview}
                disabled={issuingInterview}
                className="w-full rounded-lg px-3 py-2 text-[12px] disabled:opacity-50"
                style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
              >
                {issuingInterview ? "発行中..." : "🎥 経歴確認面接のURLを発行する"}
              </button>
              {interviewUrl && (
                <div
                  className="mt-2 flex items-center gap-2 rounded-lg p-2"
                  style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                >
                  <span className="flex-1 truncate" style={{ color: "#F0F0F0", fontSize: 11 }}>
                    {interviewUrl}
                  </span>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(interviewUrl);
                      toast.success("コピーしました");
                    }}
                    className="shrink-0 rounded-full px-2 py-1 text-[10px]"
                    style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
                  >
                    コピー
                  </button>
                </div>
              )}
            </div>

            {/* 過去の書類選考履歴(他社を含む。どの企業が評価したかは表示しない) */}
            {screeningHistory.length > 0 && (
              <div className="rounded-2xl p-5" style={cardStyle}>
                <p style={{ color: "#7CD4FF", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                  過去の書類選考履歴（自社・他社含む）
                </p>
                <p style={{ color: "#666666", fontSize: 10, marginBottom: 10 }}>
                  どの企業が評価したかは表示されません。評価内容のみ共有されています。
                </p>
                <div className="space-y-2">
                  {screeningHistory.map((h, i) => (
                    <div
                      key={i}
                      className="rounded-lg p-3"
                      style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          {h.rank && (
                            <span
                              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
                              style={{ background: "#333333", color: "#F0F0F0", fontWeight: 700 }}
                            >
                              {h.rank}
                            </span>
                          )}
                          <span style={{ color: "#F0F0F0", fontSize: 11 }}>
                            {h.job_type ?? "役者"}
                          </span>
                        </span>
                        <span style={{ color: "#666666", fontSize: 10 }}>
                          {new Date(h.created_at).toLocaleDateString("ja-JP")}
                        </span>
                      </div>
                      {h.summary && (
                        <p style={{ color: "#999999", fontSize: 11, marginTop: 4 }}>{h.summary}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 過去のオーディション(面接)履歴(他社を含む。どの企業が実施したかは表示しない) */}
            {auditionHistory.length > 0 && (
              <div className="rounded-2xl p-5" style={cardStyle}>
                <p style={{ color: "#E29CFF", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                  過去のオーディション履歴（自社・他社含む）
                </p>
                <p style={{ color: "#666666", fontSize: 10, marginBottom: 10 }}>
                  どの企業が実施したかは表示されません。いつ・どの作品でオーディションを受けたかのみ共有されています。
                </p>
                <div className="space-y-2">
                  {auditionHistory.map((h, i) => (
                    <div
                      key={i}
                      className="rounded-lg p-3"
                      style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                    >
                      <div className="flex items-center justify-between">
                        <span style={{ color: "#F0F0F0", fontSize: 11 }}>
                          {h.job_type ?? "役者（経歴確認面接）"}
                        </span>
                        <span style={{ color: "#666666", fontSize: 10 }}>
                          {new Date(h.created_at).toLocaleDateString("ja-JP")}
                        </span>
                      </div>
                      {h.impression && (
                        <p style={{ color: "#999999", fontSize: 11, marginTop: 4 }}>
                          結果：{h.impression}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 集客予測 */}
            <div className="rounded-2xl p-5" style={cardStyle}>
              <div className="flex items-center justify-between">
                <p style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700 }}>
                  集客予測・役柄適合率
                </p>
                <button
                  onClick={() => setShowPredictForm((v) => !v)}
                  className="rounded-full px-3 py-1.5 text-[11px]"
                  style={{ background: "#222222", border: "1px solid #333333", color: "#F0F0F0" }}
                >
                  {showPredictForm ? "閉じる" : "＋新規予測"}
                </button>
              </div>

              {showPredictForm && (
                <div className="mt-3 flex flex-col gap-2">
                  <input
                    style={inputStyle}
                    value={prodTitle}
                    onChange={(e) => setProdTitle(e.target.value)}
                    placeholder="公演タイトル"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      style={inputStyle}
                      value={prodType}
                      onChange={(e) => setProdType(e.target.value)}
                      placeholder="種別（映画/舞台/演劇）"
                    />
                    <input
                      style={inputStyle}
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                      placeholder="ジャンル"
                    />
                  </div>
                  <input
                    style={inputStyle}
                    type="number"
                    value={venueCapacity}
                    onChange={(e) => setVenueCapacity(e.target.value)}
                    placeholder="会場キャパシティ（人数）"
                  />
                  <textarea
                    style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                    value={roleDescription}
                    onChange={(e) => setRoleDescription(e.target.value)}
                    placeholder="今回の役柄・舞台内容"
                  />
                  <button
                    onClick={handlePredict}
                    disabled={predicting}
                    className="rounded-lg py-2 text-[13px] disabled:opacity-50"
                    style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
                  >
                    {predicting ? "AIが予測中..." : "予測を作成する"}
                  </button>
                </div>
              )}

              <div className="mt-3 space-y-2">
                {predictions.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg p-3"
                    style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                  >
                    <div className="flex items-center justify-between">
                      <p style={{ color: "#F0F0F0", fontSize: 12, fontWeight: 700 }}>
                        {p.production_title || "（無題の公演）"}
                      </p>
                      {p.fit_percentage != null && (
                        <span style={{ color: "#C8FF00", fontSize: 13, fontWeight: 700 }}>
                          適合率 {p.fit_percentage}%
                        </span>
                      )}
                    </div>
                    {(p.predicted_tickets_low != null || p.predicted_tickets_high != null) && (
                      <p style={{ color: "#7CD98F", fontSize: 12, marginTop: 4 }}>
                        予測動員数: {p.predicted_tickets_low ?? "?"} 〜{" "}
                        {p.predicted_tickets_high ?? "?"} 人
                      </p>
                    )}
                    {p.fit_reasoning && (
                      <p style={{ color: "#888888", fontSize: 11, marginTop: 4 }}>
                        {p.fit_reasoning}
                      </p>
                    )}
                    {p.prediction_basis && (
                      <p style={{ color: "#888888", fontSize: 11, marginTop: 2 }}>
                        {p.prediction_basis}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 自社限定オーディション記録 */}
            <div className="rounded-2xl p-5" style={cardStyle}>
              <p style={{ color: "#E29CFF", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                オーディション記録（自社限定・非公開）
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input
                  style={inputStyle}
                  type="date"
                  value={noteDate}
                  onChange={(e) => setNoteDate(e.target.value)}
                />
                <input
                  style={inputStyle}
                  type="number"
                  value={noteActual}
                  onChange={(e) => setNoteActual(e.target.value)}
                  placeholder="実際の動員数"
                />
              </div>
              <textarea
                style={{ ...inputStyle, marginTop: 8, minHeight: 60, resize: "vertical" }}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="オーディションの様子・所感など"
              />
              <button
                onClick={handleSaveNote}
                disabled={savingNote}
                className="mt-2 rounded-lg px-4 py-2 text-[12px] disabled:opacity-50"
                style={{ background: "#2A2A2A", color: "#F0F0F0", fontWeight: 700 }}
              >
                {savingNote ? "保存中..." : "記録を保存"}
              </button>

              <div className="mt-3 space-y-2">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="rounded-lg p-3"
                    style={{ background: "#0F0F0F", border: "1px solid #2A2A2A" }}
                  >
                    <p style={{ color: "#666666", fontSize: 11 }}>
                      {n.audition_date ?? new Date(n.created_at).toLocaleDateString("ja-JP")}
                    </p>
                    {n.note && (
                      <p style={{ color: "#CCCCCC", fontSize: 12, marginTop: 2 }}>{n.note}</p>
                    )}
                    {n.actual_tickets != null && (
                      <p style={{ color: "#7CD98F", fontSize: 11, marginTop: 2 }}>
                        実際の動員数: {n.actual_tickets}人
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </BusinessShell>
  );
}
