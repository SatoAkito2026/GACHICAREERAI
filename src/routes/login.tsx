import { toJapaneseError } from "@/lib/error-messages";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { SafeNavigate } from "@/components/SafeNavigate";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, registerDevice } from "@/hooks/use-auth";
import { useMode, type UserMode } from "@/hooks/use-mode";
import { REFERRAL_STORAGE_KEY } from "@/lib/referral-client";
import type { AuthResponse } from "@supabase/supabase-js";
import { CheckoutModal } from "@/components/CheckoutModal";
import { PLAN_LABELS, PLAN_PRICES } from "@/hooks/use-plan";

// 学校・塾／芸能・キャスティング向けは今は受け付けない（機能は残して入口だけ隠す）
const SHOW_SCHOOL_AND_ACTOR = false;

export const Route = createFileRoute("/login")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { next?: string; mode?: "business"; ref?: string; signup?: "1" } => ({
    ...(typeof s.next === "string" && s.next.startsWith("/") ? { next: s.next } : {}),
    // 友だち紹介のリンクから来たとき
    ...(typeof s.ref === "string" && /^[A-Za-z0-9]{4,12}$/.test(s.ref) ? { ref: s.ref } : {}),
    // 企業として新規登録し、確認メールのリンクから戻ってきたとき
    ...(s.mode === "business" ? { mode: "business" as const } : {}),
    // トップページの「無料ではじめる」から来たとき（はじめから新規登録の画面にする）
    ...(s.signup === "1" || s.signup === 1 ? { signup: "1" as const } : {}),
  }),
  component: LoginPage,
});

type Step = "auth" | "biz-type" | "company-setup" | "school-setup" | "actor-setup" | "actor-plan";
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
  const { next, mode: searchMode, ref, signup } = Route.useSearch();
  const { setMode, isBusiness, loading: modeLoading } = useMode();
  // 紹介リンクから来た人は、はじめから新規登録の画面にする
  const [authMode, setAuthMode] = useState<"login" | "signup">(ref || signup ? "signup" : "login");
  const [showPassword, setShowPassword] = useState(false);

  // 紹介コードを、登録が終わるまで覚えておく（登録後の /private/welcome で使う）
  useEffect(() => {
    if (!ref) return;
    try {
      localStorage.setItem(REFERRAL_STORAGE_KEY, ref.toUpperCase());
    } catch {
      // 保存できなくても登録はできる
    }
  }, [ref]);
  const [loginMode, setLoginMode] = useState<LoginMode>(searchMode ?? "private");
  const loginModeRef = useRef<LoginMode>(searchMode ?? "private");
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

  const handleModeChange = (newMode: LoginMode) => {
    loginModeRef.current = newMode;
    setLoginMode(newMode);
  };

  // 企業として新規登録 → 確認メールのリンクで戻ってきたら、会社の登録に進む
  useEffect(() => {
    if (loading || modeLoading || !session || handledRef.current) return;
    if (searchMode === "business" && !isBusiness && step === "auth") {
      handledRef.current = true;
      setSignupData({ session, user: session.user } as AuthResponse["data"]);
      setStep("biz-type");
    }
  }, [loading, modeLoading, session, searchMode, isBusiness, step]);

  if (!loading && session && step === "auth" && !submitting && !handledRef.current) {
    if (next) {
      window.location.href = next;
      return null;
    }
    if (modeLoading || (searchMode === "business" && !isBusiness)) return null;
    // すでにログイン中なら、いまのモードの画面へ
    return <SafeNavigate to={isBusiness ? "/business" : "/private"} />;
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
        }
        if (next) {
          window.location.href = next;
          return;
        }
        if (data.user) {
          // 管理者アカウントは、選択したモードに関わらず問答無用で管理ダッシュボードへ
          const { data: adminCheck } = await (supabase
            .from("profiles")
            .select("is_admin")
            .eq("id", data.user.id)
            .maybeSingle() as any);
          if (adminCheck?.is_admin) {
            navigate({ to: "/private/admin" });
            return;
          }

          // ログイン時に選んだモードで入る（画面側のモードも一緒に切り替える）
          const { data: profile } = await (supabase
            .from("profiles")
            .select("user_mode, company_id")
            .eq("id", data.user.id)
            .maybeSingle() as any);
          const existingMode = (profile?.user_mode ?? "private_individual") as UserMode;
          const existingIsBusiness = existingMode.startsWith("business_");
          if (currentMode === "business") {
            if (!existingIsBusiness && !profile?.company_id) {
              // 会社の登録がまだなら、会社の登録に進む
              setSignupData({ session: data.session, user: data.user } as AuthResponse["data"]);
              setStep("biz-type");
              return;
            }
            await setMode(existingIsBusiness ? existingMode : "business_company", data.user.id);
            navigate({ to: "/business" });
          } else {
            await setMode(existingIsBusiness ? "private_individual" : existingMode, data.user.id);
            navigate({ to: "/private" });
          }
        } else {
          navigate({ to: currentMode === "business" ? "/business" : "/private" });
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // 確認メールのリンクから戻ったときも、選んだモードで続ける
            emailRedirectTo:
              currentMode === "business"
                ? `${window.location.origin}/login?mode=business`
                : `${window.location.origin}/private/welcome`,
          },
        });
        if (error) throw error;
        setSignupData(data);
        if (data.session) {
          handledRef.current = true;
          if (data.session.access_token) {
            void registerDevice(data.session.access_token);
          }
          if (currentMode === "business") {
            setStep("biz-type");
          } else {
            await setMode("private_individual", data.session.user.id);
            navigate({ to: "/private/welcome" });
          }
        } else {
          setInfo("確認メールを送信しました。メールを確認してください。");
        }
      }
    } catch (err) {
      setError(toJapaneseError(err));
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
          <div
            className={`mt-6 grid gap-4 ${SHOW_SCHOOL_AND_ACTOR ? "grid-cols-3" : "grid-cols-1"}`}
          >
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
            {SHOW_SCHOOL_AND_ACTOR && (
              <>
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
              </>
            )}
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
                    company_name: companyName.trim(),
                    company_role: "admin",
                  } as any)
                  .eq("id", signupData.session!.user.id) as any);
                // 企業は月額プランなし（人材の閲覧はコイン、求人掲載は今は無料）
                await setMode("business_company", signupData.session!.user.id);
                navigate({ to: "/business/company" });
              } catch (e) {
                setError(toJapaneseError(e));
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
                await setMode("business_school", signupData.session!.user.id);
                navigate({ to: "/business/school" });
              } catch (e) {
                setError(toJapaneseError(e));
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
                await setMode("business_actor", signupData.session!.user.id);
                setStep("actor-plan");
              } catch (e) {
                setError(toJapaneseError(e));
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
        <Link to="/" className="flex items-center gap-2">
          <img src="/icons/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
          <span className="text-xl font-semibold text-foreground">ガチキャリAI</span>
        </Link>
        <p className="mt-3 text-[17px] text-foreground" style={{ fontWeight: 700 }}>
          {authMode === "login" ? "ログイン" : "無料で新規登録"}
        </p>
        {authMode === "signup" && (
          <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "#AAAAAA" }}>
            メールアドレスとパスワードだけで、1分で始められます。クレジットカードはいりません。
          </p>
        )}
        {ref && (
          <p
            className="mt-3 rounded-lg px-3 py-2 text-[12px]"
            style={{ background: "#16200A", border: "1px solid #3A4A12", color: "#E6F7B0" }}
          >
            🎁 友だちの招待です。登録して練習を1回終えると、練習のボーナスが3回もらえます。
          </p>
        )}

        <div className="mt-5 flex gap-2">
          {[
            { key: "private" as LoginMode, label: "👤 個人の方" },
            { key: "business" as LoginMode, label: "🏢 企業の方" },
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
                        padding: "8px 10px",
                      }
                    : {
                        background: "#2A2A2A",
                        color: "#888888",
                        border: "1px solid #333",
                        borderRadius: 8,
                        padding: "8px 10px",
                      }
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-[11.5px]" style={{ color: "#777" }}>
          {loginMode === "private"
            ? "就活・転職・入試の面接を練習したい方"
            : "人材を探したい・AI面接を使いたい採用担当の方"}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
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
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={authMode === "signup" ? "6文字以上" : ""}
                autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 pr-14 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px]"
                style={{ color: "#888" }}
              >
                {showPassword ? "隠す" : "表示"}
              </button>
            </div>
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
            {submitting ? "処理中..." : authMode === "login" ? "ログイン" : "無料で登録する"}
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
            ? "はじめての方は こちらから無料登録"
            : "すでにアカウントをお持ちの方はこちら"}
        </button>
        <Link to="/" className="mt-3 block text-center text-[12px]" style={{ color: "#666" }}>
          ガチキャリAIとは？（トップページへ）
        </Link>
      </div>
    </div>
  );
}
