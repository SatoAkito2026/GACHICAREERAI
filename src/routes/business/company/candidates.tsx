import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { BusinessShell } from "@/components/ModeShell";
import {
  useCandidateViewPaywall,
  CandidateViewPaywallScreen,
} from "@/components/CandidateViewPaywall";

export const Route = createFileRoute("/business/company/candidates")({
  head: () => ({ meta: [{ title: "ガチキャリダッシュボード｜企業" }] }),
  component: () => (
    <BusinessShell>
      <CandidatesPage />
    </BusinessShell>
  ),
});

type Candidate = {
  interviewId: string;
  candidateUserId: string;
  jobType: string | null;
  interviewedAt: string;
  prefecture: string | null;
  age: number | null;
  overview: string | null;
  positives: string | null;
  concerns: string | null;
  redFlags: string | null;
  radarScores: Record<string, number>;
  overallScore: number | null;
  isBookmarked: boolean;
};

const PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];

function CandidatesPage() {
  const { session, loading: authLoading } = useAuth();
  const { isPaid, loading: paywallLoading } = useCandidateViewPaywall();

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [minScore, setMinScore] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState("recent");
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);

  const loadCandidates = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (minScore) params.set("minScore", minScore);
      if (prefecture) params.set("prefecture", prefecture);
      if (minAge) params.set("minAge", minAge);
      if (maxAge) params.set("maxAge", maxAge);
      if (keyword) params.set("keyword", keyword);
      params.set("sort", sort);
      if (bookmarkedOnly) params.set("bookmarkedOnly", "true");

      const res = await fetch(`/api/candidate-database?${params.toString()}&_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (res.status === 402) {
        setCandidates([]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setCandidates(data.candidates ?? []);
    } catch (e) {
      console.error(e);
      toast.error("候補者一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPaid) void loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaid]);

  const handleToggleBookmark = async (candidateUserId: string) => {
    if (!session) return;
    // 楽観的に先に画面を更新
    setCandidates((prev) =>
      prev.map((c) =>
        c.candidateUserId === candidateUserId ? { ...c, isBookmarked: !c.isBookmarked } : c,
      ),
    );
    try {
      const res = await fetch("/api/toggle-candidate-bookmark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ candidateUserId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("保存に失敗しました");
      void loadCandidates();
    }
  };

  if (authLoading || paywallLoading) return null;
  if (!session) return <Navigate to="/login" />;
  if (!isPaid) return <CandidateViewPaywallScreen />;

  const inputStyle = {
    background: "#1A1A1A",
    border: "1px solid #2A2A2A",
    borderRadius: 8,
    color: "#F0F0F0",
    padding: "8px 10px",
    fontSize: 13,
  } as const;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-[22px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
        ガチキャリダッシュボード
      </h1>
      <p className="mt-2 text-[13px]" style={{ color: "#999999" }}>
        模擬面接を受けた登録者全員の総評（スコア・強み・懸念点・詳細な評価内訳）を無制限に閲覧できます。
        氏名・顔写真・詳細住所・電話番号・メールアドレスは表示されません。気になる録画は個別に購入できます。
      </p>

      {/* フィルター */}
      <div
        className="mt-6 grid grid-cols-2 gap-3 rounded-2xl p-5 md:grid-cols-4"
        style={{ background: "#161616", border: "1px solid #2A2A2A" }}
      >
        <div>
          <label style={{ color: "#888888", fontSize: 11 }}>最低スコア</label>
          <input
            type="number"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            placeholder="例: 70"
            className="mt-1 w-full"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ color: "#888888", fontSize: 11 }}>都道府県</label>
          <select
            value={prefecture}
            onChange={(e) => setPrefecture(e.target.value)}
            className="mt-1 w-full"
            style={inputStyle}
          >
            <option value="">指定しない</option>
            {PREFECTURES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ color: "#888888", fontSize: 11 }}>年齢</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              value={minAge}
              onChange={(e) => setMinAge(e.target.value)}
              placeholder="下限"
              style={{ ...inputStyle, width: "50%" }}
            />
            〜
            <input
              type="number"
              value={maxAge}
              onChange={(e) => setMaxAge(e.target.value)}
              placeholder="上限"
              style={{ ...inputStyle, width: "50%" }}
            />
          </div>
        </div>
        <div>
          <label style={{ color: "#888888", fontSize: 11 }}>並び替え</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="mt-1 w-full"
            style={inputStyle}
          >
            <option value="recent">新しい順</option>
            <option value="score_desc">スコアが高い順</option>
            <option value="score_asc">スコアが低い順</option>
            <option value="age_asc">年齢が若い順</option>
          </select>
        </div>
        <div className="col-span-2 md:col-span-3">
          <label style={{ color: "#888888", fontSize: 11 }}>
            キーワード（総評・強み・希望職種から検索）
          </label>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="例: リーダーシップ、営業"
            className="mt-1 w-full"
            style={inputStyle}
          />
        </div>
        <div className="flex items-end">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={bookmarkedOnly}
              onChange={(e) => setBookmarkedOnly(e.target.checked)}
              className="h-4 w-4"
            />
            <span style={{ color: "#F0F0F0", fontSize: 13 }}>★保存した人のみ</span>
          </label>
        </div>
        <div className="col-span-2 flex items-end md:col-span-4">
          <button
            onClick={loadCandidates}
            className="rounded-full px-6 py-2 text-[13px]"
            style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
          >
            この条件で検索
          </button>
        </div>
      </div>

      {/* 一覧 */}
      <div className="mt-6 flex flex-col gap-3">
        {loading ? (
          <p style={{ color: "#666666", fontSize: 13 }}>読み込み中...</p>
        ) : candidates.length === 0 ? (
          <p style={{ color: "#666666", fontSize: 13 }}>条件に合う候補者がいません。</p>
        ) : (
          candidates.map((c) => (
            <div
              key={c.interviewId}
              className="rounded-2xl p-5"
              style={{ background: "#161616", border: "1px solid #2A2A2A" }}
            >
              <div className="flex items-start justify-between">
                <button
                  className="flex-1 text-left"
                  onClick={() => setExpandedId(expandedId === c.interviewId ? null : c.interviewId)}
                >
                  <div className="flex items-center gap-3">
                    <span style={{ color: "#C8FF00", fontSize: 20, fontWeight: 800 }}>
                      {c.overallScore !== null ? `${c.overallScore}点` : "採点なし"}
                    </span>
                    <span style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700 }}>
                      {c.jobType || "希望職種未設定"}
                    </span>
                  </div>
                  <p className="mt-1" style={{ color: "#888888", fontSize: 12 }}>
                    {c.prefecture ?? "地域不明"}　{c.age !== null ? `${c.age}歳` : "年齢不明"}
                    　面接日：{new Date(c.interviewedAt).toLocaleDateString("ja-JP")}
                  </p>
                  {c.overview && (
                    <p
                      className="mt-2 line-clamp-2"
                      style={{ color: "#CCCCCC", fontSize: 12.5, lineHeight: 1.6 }}
                    >
                      {c.overview}
                    </p>
                  )}
                </button>
                <button
                  onClick={() => handleToggleBookmark(c.candidateUserId)}
                  className="shrink-0 pl-4 text-[26px]"
                  style={{ color: c.isBookmarked ? "#FFD700" : "#444444", lineHeight: 1 }}
                  title={c.isBookmarked ? "保存を解除" : "保存する"}
                >
                  {c.isBookmarked ? "★" : "☆"}
                </button>
              </div>

              {expandedId === c.interviewId && (
                <div className="mt-4 border-t pt-4" style={{ borderColor: "#2A2A2A" }}>
                  {c.positives && (
                    <div className="mb-3">
                      <p style={{ color: "#7CD98F", fontSize: 12, fontWeight: 700 }}>強み</p>
                      <p style={{ color: "#CCCCCC", fontSize: 12.5, lineHeight: 1.7 }}>
                        {c.positives}
                      </p>
                    </div>
                  )}
                  {c.concerns && (
                    <div className="mb-3">
                      <p style={{ color: "#FFA07A", fontSize: 12, fontWeight: 700 }}>懸念点</p>
                      <p style={{ color: "#CCCCCC", fontSize: 12.5, lineHeight: 1.7 }}>
                        {c.concerns}
                      </p>
                    </div>
                  )}
                  {Object.keys(c.radarScores ?? {}).length > 0 && (
                    <div className="mb-3">
                      <p
                        style={{ color: "#7CD4FF", fontSize: 12, fontWeight: 700, marginBottom: 4 }}
                      >
                        スコア内訳
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(c.radarScores).map(([k, v]) => (
                          <span
                            key={k}
                            className="rounded-full px-3 py-1"
                            style={{
                              background: "#0F0F0F",
                              border: "1px solid #2A2A2A",
                              color: "#CCCCCC",
                              fontSize: 11,
                            }}
                          >
                            {k}: {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <Link
                    to="/business/company/candidate-detail/$interviewId"
                    params={{ interviewId: c.interviewId }}
                    className="mt-2 inline-block rounded-full px-5 py-2 text-[12px]"
                    style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
                  >
                    この人の録画を見る（購入）→
                  </Link>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
