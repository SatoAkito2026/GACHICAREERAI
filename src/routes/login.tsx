import { createFileRoute, Navigate, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, registerDevice } from "@/hooks/use-auth";
import type { AuthResponse } from "@supabase/supabase-js";
import { CheckoutModal } from "@/components/CheckoutModal";
import { PLAN_LABELS, PLAN_PRICES } from "@/hooks/use-plan";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { next?: string; ref?: string } => ({
    ...(typeof s.next === "string" && s.next.startsWith("/") ? { next: s.next } : {}),
    ...(typeof s.ref === "string" && s.ref.trim() ? { ref: s.ref.trim() } : {}),
  }),
  component: LoginPage,
});

type Step =
  | "auth"
  | "biz-type"
  | "company-setup"
  | "company-plan"
  | "school-setup"
  | "actor-setup"
  | "actor-plan";
type LoginMode = "private" | "business";

const SCHOOL_TYPES = [
  "大学院",
  "大学",
  "高校",
  "中学",
  "小学",
  "高専",
  "専門学校",
  "予備校",
  "塾",
  "その他",
];

function LoginPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { next, ref } = Route.useSearch();
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [loginMode, setLoginMode] = useState<LoginMode>("private");
  const loginModeRef = useRef<LoginMode>("private");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>("auth");
  const [bizType, setBizType] = useState<"company" | "school" | "actor" | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [schoolType, setSchoolType] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [signupData, setSignupData] = useState<AuthResponse["data"] | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<
    "company_light" | "company_pro" | "actor_pro" | null
  >(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const handledRef = useRef(false);

  const REFERRAL_STORAGE_KEY = "pending_referral_code";

  // ?ref=コード付きでこのページに来たら、確認メール待ち等でセッションが
  // すぐ確立しない場合に備えて、一旦localStorageに保持しておく
  useEffect(() => {
    if (ref) {
      try {
        localStorage.setItem(REFERRAL_STORAGE_KEY, ref);
      } catch {
        // ignore
      }
    }
  }, [ref]);

  // セッションが確立したタイミング(サインアップ直後・メール確認後の初回ログインどちらでも)で、
  // 保留中の紹介コードがあれば記録する
  const flushPendingReferral = async (accessToken: string) => {
    let pending: string | null = null;
    try {
      pending = localStorage.getItem(REFERRAL_STORAGE_KEY);
    } catch {
      pending = null;
    }
    if (!pending) return;
    try {
      const res = await fetch("/api/record-referral", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ referralCode: pending }),
      });
      if (res.ok) {
        localStorage.removeItem(REFERRAL_STORAGE_KEY);
      }
    } catch (e) {
      console.error("[referral] record failed", e);
    }
  };

  useEffect(() => {
    if (session?.access_token) {
      void flushPendingReferral(session.access_token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  const handleModeChange = (newMode: LoginMode) => {
    loginModeRef.current = newMode;
    setLoginMode(newMode);
  };

  if (!loading && session && step === "auth" && !submitting && !handledRef.current) {
    if (next) {
      window.location.href = next;
      return null;
    }
    return <Navigate to="/private" />;
  }
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setSubmitting(true);
    try {
      const currentMode = loginModeRef.current;
      if (authMode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        handledRef.current = true;
        if (data.session?.access_token) {
          void registerDevice(data.session.access_token);
          void flushPendingReferral(data.session.access_token);
        }
        if (next) {
          window.location.href = next;
          return;
        }
        if (data.user) {
          // 管理者アカウントは、選択したモードに関わらず問答無用で管理ダッシュボードへ
          const { data: adminCheck } = await (supabase
            .from("profiles")
            .select("is_admin, is_agency")
            .eq("id", data.user.id)
            .maybeSingle() as any);
          if (adminCheck?.is_admin) {
            navigate({ to: "/private/admin" });
            return;
          }
          if (adminCheck?.is_agency) {
            navigate({ to: "/private/agency" });
            return;
          }

          // ログイン時に選択したモードでuser_modeを更新する
          if (currentMode === "business") {
            // 既存のuser_modeを確認
            const { data: profile } = await (supabase
              .from("profiles")
              .select("user_mode, company_id")
              .eq("id", data.user.id)
              .maybeSingle() as any);
            const existingMode = profile?.user_mode ?? "private_individual";

            // 既にbusiness系なら更新不要、private系ならbusiness_companyに更新
            if (
              existingMode !== "business_company" &&
              existingMode !== "business_school" &&
              existingMode !== "business_actor"
            ) {
              await (supabase
                .from("profiles")
                .update({ user_mode: "business_company" } as any)
                .eq("id", data.user.id) as any);
            }
            navigate({ to: "/business" });
          } else {
            // private選択時
            const { data: profile } = await (supabase
              .from("profiles")
              .select("user_mode")
              .eq("id", data.user.id)
              .maybeSingle() as any);
            const existingMode = profile?.user_mode ?? "private_individual";

            // 既にbusiness系ならprivate_individualに更新
            if (
              existingMode === "business_company" ||
              existingMode === "business_school" ||
              existingMode === "business_actor"
            ) {
              await (supabase
                .from("profiles")
                .update({ user_mode: "private_individual" } as any)
                .eq("id", data.user.id) as any);
            }
            navigate({ to: "/private" });
          }
        } else {
          navigate({ to: currentMode === "business" ? "/business" : "/private" });
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/private/welcome` },
        });
        if (error) throw error;
        setSignupData(data);
        if (data.session) {
          handledRef.current = true;
          if (data.session.access_token) {
            void registerDevice(data.session.access_token);
          }
          // 紹介リンク経由の登録なら、代理店を紐付ける(メール確認が必要な場合は
          // ログイン成功時にもflushPendingReferralが呼ばれるので、そちらで記録される)
          if (data.session.access_token) {
            void flushPendingReferral(data.session.access_token);
          }
          if (currentMode === "business") {
            setStep("biz-type");
          } else {
            await (supabase
              .from("profiles")
              .update({ user_mode: "private_individual" } as any)
              .eq("id", data.session.user.id) as any);
            navigate({ to: "/private/welcome" });
          }
        } else {
          setInfo("確認メールを送信しました。メールを確認してください。");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました。");
    } finally {
      setSubmitting(false);
    }
  };

  const cardStyle = {
    background: "#1A1A1A",
    border: "1px solid #333333",
    borderRadius: 16,
    padding: 32,
  };

  // Business新規登録 → 企業か学校か選択
  if (step === "biz-type") {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ background: "#0F0F0F" }}
      >
        <div className="w-full max-w-lg" style={cardStyle}>
          <h1 style={{ color: "#F0F0F0", fontSize: 20, fontWeight: 700 }}>
            どちらで利用しますか？
          </h1>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <button
              onClick={() => {
                setBizType("company");
                setStep("company-setup");
              }}
              className="flex flex-col items-center gap-2 rounded-xl py-8 transition-all hover:border-[#C8FF00]"
              style={{ background: "#222", border: "1px solid #333", color: "#F0F0F0" }}
            >
              <span style={{ fontSize: 40 }}>🏢</span>
              <span style={{ fontWeight: 600, fontSize: 16 }}>企業</span>
              <span style={{ color: "#888", fontSize: 12 }}>採用担当向け</span>
            </button>
            <button
              onClick={() => {
                setBizType("school");
                setStep("school-setup");
              }}
              className="flex flex-col items-center gap-2 rounded-xl py-8 transition-all hover:border-[#C8FF00]"
              style={{ background: "#222", border: "1px solid #333", color: "#F0F0F0" }}
            >
              <span style={{ fontSize: 40 }}>🏫</span>
              <span style={{ fontWeight: 600, fontSize: 16 }}>学校・塾</span>
              <span style={{ color: "#888", fontSize: 12 }}>学校・予備校・塾向け</span>
            </button>
            <button
              onClick={() => {
                setBizType("actor");
                setStep("actor-setup");
              }}
              className="flex flex-col items-center gap-2 rounded-xl py-8 transition-all hover:border-[#C8FF00]"
              style={{ background: "#222", border: "1px solid #333", color: "#F0F0F0" }}
            >
              <span style={{ fontSize: 40 }}>🎭</span>
              <span style={{ fontWeight: 600, fontSize: 16 }}>芸能・キャスティング</span>
              <span style={{ color: "#888", fontSize: 12 }}>制作・キャスティング会社向け</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 企業情報入力
  if (step === "company-setup") {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ background: "#0F0F0F" }}
      >
        <div className="w-full max-w-sm" style={cardStyle}>
          <h1 style={{ color: "#F0F0F0", fontSize: 20, fontWeight: 700 }}>
            会社情報を入力してください
          </h1>
          <p className="mt-1" style={{ color: "#888888", fontSize: 13 }}>
            あとからマイページで変更できます
          </p>
          <div className="mt-6">
            <label style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 500 }}>会社名</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="株式会社〇〇"
              className="mt-1 flex h-10 w-full rounded-md px-3 text-sm focus:outline-none"
              style={{ background: "#121212", border: "1px solid #333", color: "#F0F0F0" }}
            />
          </div>
          {error && (
            <p className="mt-4 text-sm" style={{ color: "#ff6b6b" }}>
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={async () => {
              if (!companyName.trim() || !signupData?.session?.user) return;
              setSetupLoading(true);
              setError("");
              try {
                const { data: company, error: ce } = await supabase
                  .from("companies")
                  .insert({ name: companyName.trim(), owner_id: signupData.session!.user.id })
                  .select("id")
                  .single();
                if (ce) throw ce;
                await (supabase
                  .from("profiles")
                  .update({
                    user_mode: "business_company",
                    company_id: company.id,
                    company_role: "admin",
                    plan: "company_metered",
                  } as any)
                  .eq("id", signupData.session!.user.id) as any);
                setStep("company-plan");
              } catch (e) {
                setError(e instanceof Error ? e.message : "エラーが発生しました");
              } finally {
                setSetupLoading(false);
              }
            }}
            disabled={setupLoading || !companyName.trim()}
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-semibold disabled:opacity-50"
            style={{ background: "#C8FF00", color: "#0F0F0F" }}
          >
            {setupLoading ? "処理中..." : "次へ →"}
          </button>
          <button
            type="button"
            onClick={() => setStep("biz-type")}
            className="mt-4 w-full text-center text-sm"
            style={{ color: "#888" }}
          >
            ← 戻る
          </button>
        </div>
      </div>
    );
  }

  // 企業プラン選択
  if (step === "company-plan") {
    const planCards: {
      key: "company_metered" | "company_light" | "company_pro";
      name: string;
      price: string;
      desc: string;
      highlight: boolean;
    }[] = [
      {
        key: "company_metered",
        name: "従量課金プラン",
        price: PLAN_PRICES.company_metered,
        desc: "月額なし・書類選考は無料無制限・AI面接は使った分だけ。まずお試しに最適。",
        highlight: false,
      },
      {
        key: "company_light",
        name: "ライトプラン",
        price: PLAN_PRICES.company_light,
        desc: "AI面接20回/月込み・PDF出力可。超過は¥330/回（税込）。",
        highlight: false,
      },
      {
        key: "company_pro",
        name: "プロプラン",
        price: PLAN_PRICES.company_pro,
        desc: "AI面接50回/月込み・書類選考ランキング・独自アバター・優先サポート。",
        highlight: true,
      },
    ];
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4 py-10"
        style={{ background: "#0F0F0F" }}
      >
        <div className="w-full max-w-3xl" style={cardStyle}>
          <h1 style={{ color: "#F0F0F0", fontSize: 20, fontWeight: 700 }}>
            プランをお選びください
          </h1>
          <p className="mt-1" style={{ color: "#888888", fontSize: 13 }}>
            あとから変更できます
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {planCards.map((p) => (
              <div
                key={p.key}
                className="flex flex-col rounded-xl p-5"
                style={{
                  background: "#222",
                  border: p.highlight ? "2px solid #C8FF00" : "1px solid #333",
                }}
              >
                <div className="flex items-center justify-between">
                  <span style={{ color: "#F0F0F0", fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                  {p.highlight && (
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px]"
                      style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 600 }}
                    >
                      おすすめ
                    </span>
                  )}
                </div>
                <div className="mt-2" style={{ color: "#F0F0F0", fontSize: 20, fontWeight: 700 }}>
                  {p.price}
                </div>
                <p
                  className="mt-3 flex-1 text-[12px]"
                  style={{ color: "#888888", lineHeight: 1.6 }}
                >
                  {p.desc}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (p.key === "company_metered") {
                      navigate({ to: "/business/company" });
                    } else {
                      setCheckoutPlan(p.key);
                    }
                  }}
                  className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-semibold"
                  style={{ background: "#C8FF00", color: "#0F0F0F" }}
                >
                  {p.key === "company_metered" ? "このプランで始める" : "申し込む"}
                </button>
              </div>
            ))}
          </div>
        </div>
        {checkoutPlan && (
          <CheckoutModal
            plan={checkoutPlan}
            onClose={() => {
              setCheckoutPlan(null);
              navigate({ to: "/business/company" });
            }}
          />
        )}
      </div>
    );
  }

  // 学校情報入力
  if (step === "school-setup") {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ background: "#0F0F0F" }}
      >
        <div className="w-full max-w-sm" style={cardStyle}>
          <h1 style={{ color: "#F0F0F0", fontSize: 20, fontWeight: 700 }}>
            学校情報を入力してください
          </h1>
          <p className="mt-1" style={{ color: "#888888", fontSize: 13 }}>
            あとからマイページで変更できます
          </p>
          <div className="mt-6">
            <label style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 500 }}>学校名・塾名</label>
            <input
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="〇〇高校 / 〇〇予備校"
              className="mt-1 flex h-10 w-full rounded-md px-3 text-sm focus:outline-none"
              style={{ background: "#121212", border: "1px solid #333", color: "#F0F0F0" }}
            />
          </div>
          <div className="mt-4">
            <label style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 500 }}>種別</label>
            <select
              value={schoolType}
              onChange={(e) => setSchoolType(e.target.value)}
              className="mt-1 flex h-10 w-full rounded-md px-3 text-sm focus:outline-none"
              style={{ background: "#121212", border: "1px solid #333", color: "#F0F0F0" }}
            >
              <option value="" disabled>
                選択してください
              </option>
              {SCHOOL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p className="mt-4 text-sm" style={{ color: "#ff6b6b" }}>
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={async () => {
              if (!schoolName.trim() || !schoolType || !signupData?.session?.user) return;
              setSetupLoading(true);
              setError("");
              try {
                const { data: company, error: ce } = await supabase
                  .from("companies")
                  .insert({
                    name: schoolName.trim(),
                    owner_id: signupData.session!.user.id,
                    settings: { school_type: schoolType },
                  })
                  .select("id")
                  .single();
                if (ce) throw ce;
                await (supabase
                  .from("profiles")
                  .update({
                    user_mode: "business_school",
                    company_id: company.id,
                    company_role: "admin",
                  } as any)
                  .eq("id", signupData.session!.user.id) as any);
                navigate({ to: "/business/school" });
              } catch (e) {
                setError(e instanceof Error ? e.message : "エラーが発生しました");
              } finally {
                setSetupLoading(false);
              }
            }}
            disabled={setupLoading || !schoolName.trim() || !schoolType}
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-semibold disabled:opacity-50"
            style={{ background: "#C8FF00", color: "#0F0F0F" }}
          >
            {setupLoading ? "処理中..." : "始める →"}
          </button>
          <button
            type="button"
            onClick={() => setStep("biz-type")}
            className="mt-4 w-full text-center text-sm"
            style={{ color: "#888" }}
          >
            ← 戻る
          </button>
        </div>
      </div>
    );
  }

  if (step === "actor-setup") {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ background: "#0F0F0F" }}
      >
        <div className="w-full max-w-sm" style={cardStyle}>
          <h1 style={{ color: "#F0F0F0", fontSize: 20, fontWeight: 700 }}>
            会社・事務所名を入力してください
          </h1>
          <p className="mt-1" style={{ color: "#888888", fontSize: 13 }}>
            あとからマイページで変更できます
          </p>
          <div className="mt-6">
            <label style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 500 }}>
              制作・キャスティング会社名
            </label>
            <input
              type="text"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              placeholder="株式会社〇〇プロダクション"
              className="mt-1 flex h-10 w-full rounded-md px-3 text-sm focus:outline-none"
              style={{ background: "#121212", border: "1px solid #333", color: "#F0F0F0" }}
            />
          </div>
          {error && (
            <p className="mt-4 text-sm" style={{ color: "#ff6b6b" }}>
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={async () => {
              if (!agencyName.trim() || !signupData?.session?.user) return;
              setSetupLoading(true);
              setError("");
              try {
                const { data: company, error: ce } = await supabase
                  .from("companies")
                  .insert({ name: agencyName.trim(), owner_id: signupData.session!.user.id })
                  .select("id")
                  .single();
                if (ce) throw ce;
                await (supabase
                  .from("profiles")
                  .update({
                    user_mode: "business_actor",
                    company_id: company.id,
                    company_role: "admin",
                  } as any)
                  .eq("id", signupData.session!.user.id) as any);
                setStep("actor-plan");
              } catch (e) {
                setError(e instanceof Error ? e.message : "エラーが発生しました");
              } finally {
                setSetupLoading(false);
              }
            }}
            disabled={setupLoading || !agencyName.trim()}
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-semibold disabled:opacity-50"
            style={{ background: "#C8FF00", color: "#0F0F0F" }}
          >
            {setupLoading ? "処理中..." : "始める →"}
          </button>
          <button
            type="button"
            onClick={() => setStep("biz-type")}
            className="mt-4 w-full text-center text-sm"
            style={{ color: "#888" }}
          >
            ← 戻る
          </button>
        </div>
      </div>
    );
  }

  if (step === "actor-plan") {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4 py-10"
        style={{ background: "#0F0F0F" }}
      >
        <div className="w-full max-w-sm" style={cardStyle}>
          <h1 style={{ color: "#F0F0F0", fontSize: 20, fontWeight: 700 }}>
            芸能・キャスティングプラン
          </h1>
          <p className="mt-1" style={{ color: "#888888", fontSize: 13 }}>
            役者データベースのご利用には、このプランへのお申し込みが必要です。
          </p>
          <div
            className="mt-6 rounded-xl p-5"
            style={{ background: "#222", border: "2px solid #C8FF00" }}
          >
            <div style={{ color: "#F0F0F0", fontWeight: 600, fontSize: 15 }}>
              {PLAN_LABELS.actor_pro}
            </div>
            <div className="mt-2" style={{ color: "#F0F0F0", fontSize: 24, fontWeight: 700 }}>
              {PLAN_PRICES.actor_pro}
            </div>
            <p className="mt-3 text-[12px]" style={{ color: "#888888", lineHeight: 1.6 }}>
              役者データベース・書類選考・経歴確認面接、すべての機能が使い放題です。
            </p>
            <button
              type="button"
              onClick={() => setCheckoutPlan("actor_pro")}
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-semibold"
              style={{ background: "#C8FF00", color: "#0F0F0F" }}
            >
              申し込む
            </button>
          </div>
        </div>
        {checkoutPlan && (
          <CheckoutModal
            plan={checkoutPlan}
            onClose={() => {
              setCheckoutPlan(null);
              navigate({ to: "/business/actor" });
            }}
          />
        )}
      </div>
    );
  }

  // メインのログイン画面
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">ガチキャリAI</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {authMode === "login" ? "ログイン" : "新規登録"}
        </p>

        <div className="mt-5 flex gap-2">
          {[
            { key: "private" as LoginMode, label: "👤 個人・受験生" },
            { key: "business" as LoginMode, label: "🏢 企業・学校" },
          ].map((opt) => {
            const active = loginMode === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleModeChange(opt.key)}
                className="flex-1 text-sm transition-colors"
                style={
                  active
                    ? {
                        background: "#C8FF00",
                        color: "#0F0F0F",
                        fontWeight: 600,
                        borderRadius: 8,
                        padding: "8px 20px",
                      }
                    : {
                        background: "#2A2A2A",
                        color: "#888888",
                        border: "1px solid #333",
                        borderRadius: 8,
                        padding: "8px 20px",
                      }
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">メールアドレス</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">パスワード</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-green-600">{info}</p>}
          {authMode === "signup" && (
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="terms"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer"
                style={{ accentColor: "#C8FF00" }}
              />
              <label
                htmlFor="terms"
                className="text-[12px] leading-relaxed"
                style={{ color: "#888888" }}
              >
                <Link
                  to="/terms"
                  className="underline"
                  style={{ color: "#C8FF00" }}
                  target="_blank"
                >
                  利用規約
                </Link>
                および
                <Link
                  to="/privacy"
                  className="underline"
                  style={{ color: "#C8FF00" }}
                  target="_blank"
                >
                  プライバシーポリシー
                </Link>
                に同意します
              </label>
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || (authMode === "signup" && !agreedToTerms)}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "処理中..." : authMode === "login" ? "ログイン" : "登録する"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setAuthMode(authMode === "login" ? "signup" : "login");
            setError("");
            setInfo("");
          }}
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {authMode === "login"
            ? "アカウントをお持ちでない方はこちら"
            : "すでにアカウントをお持ちの方はこちら"}
        </button>
      </div>
    </div>
  );
}
