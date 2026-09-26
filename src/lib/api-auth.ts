import { createClient } from "@supabase/supabase-js";

/**
 * Supabase の接続情報はすべて環境変数から読む。
 * - SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY: 公開値（wrangler.jsonc の vars）
 * - SUPABASE_SERVICE_ROLE_KEY: 全権限を持つ機密情報（wrangler secret）。コードに直書きしないこと。
 */
export function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL ?? "";
}

function getSupabaseAnonKey(): string {
  return process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
}

export function getServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * APIルートハンドラ用の認証チェック。
 * Authorization: Bearer <token> を検証し、検証済みの userId を返す。
 * 失敗時は { error: Response } を返す。
 */
export async function verifyApiUser(
  request: Request,
): Promise<{ userId: string; token: string } | { error: Response }> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  const unauthorized = () =>
    new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return { error: unauthorized() };

  const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { error: unauthorized() };

  return { userId: data.user.id, token };
}

/**
 * 検証済みトークンを使い、RLS を尊重して当該ユーザーの有効なプランを取得する。
 * plan が "pro"/"company_pro"/"individual_pro" 等で、期限内であれば "pro" を返す。
 * それ以外（未契約・期限切れ・取得失敗）は "free" を返す。
 */
export async function getVerifiedPlan(token: string, userId: string): Promise<"pro" | "free"> {
  const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase
    .from("profiles")
    .select("plan, plan_expires_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return "free";

  const plan = typeof data.plan === "string" ? data.plan : "";
  const expiresAt = data.plan_expires_at ? new Date(data.plan_expires_at) : null;
  const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false;

  const isPaid = plan !== "" && plan !== "free";
  return isPaid && !isExpired ? "pro" : "free";
}

/**
 * プランごとの月間面接回数の上限（サーバー側の信頼できる定義）。
 * クライアントの PLAN_LIMITS と一致させること。Infinity = 無制限。
 */
const PLAN_INTERVIEW_LIMITS: Record<string, number> = {
  free: 2,
  individual_light: 15,
  individual_pro: 25,
  company_metered: Infinity,
  company_light: 10,
  company_pro: 50,
  // 後方互換（旧プラン名）
  pro: 25,
  standard: 15,
};

function normalizeServerPlan(value: unknown, expiresAt: Date | null): string {
  const plan = typeof value === "string" ? value : "free";
  if (plan === "free") return "free";
  // 有効期限切れは free に降格
  if (expiresAt && expiresAt.getTime() < Date.now()) return "free";
  return plan;
}

/**
 * サーバー側で月間面接回数のクォータを検証する。
 * 上限に達している場合は 429 の Response を返す。
 * AI を呼び出す各エンドポイントで verifyApiUser の後に呼び出すこと。
 */
export async function checkInterviewQuota(
  token: string,
  userId: string,
): Promise<{ ok: true } | { error: Response }> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase
    .from("profiles")
    .select("plan, plan_expires_at, period_interview_count")
    .eq("id", userId)
    .maybeSingle();

  // 取得失敗時は安全側に倒し free の上限を適用する
  const expiresAt = data?.plan_expires_at ? new Date(data.plan_expires_at) : null;
  const plan = error || !data ? "free" : normalizeServerPlan(data.plan, expiresAt);
  const limit = PLAN_INTERVIEW_LIMITS[plan] ?? PLAN_INTERVIEW_LIMITS.free;
  const count = data?.period_interview_count != null ? Number(data.period_interview_count) : 0;

  if (Number.isFinite(limit) && count >= limit) {
    return {
      error: new Response(
        JSON.stringify({ error: "quota_exceeded", message: "月間の利用上限に達しました" }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } },
      ),
    };
  }

  return { ok: true };
}

/**
 * プランごとの同時ログイン可能端末数の上限（サーバー側の信頼できる定義）。
 * free/light = 1台、pro = 4台。未定義プランは安全側に倒し1台とする。
 */
const MAX_DEVICES_BY_PLAN: Record<string, number> = {
  free: 1,
  individual_light: 1,
  individual_pro: 4,
  company_metered: 1,
  company_light: 1,
  company_pro: 1,
  // 後方互換（旧プラン名）
  pro: 4,
  standard: 1,
};

/**
 * 検証済みユーザーのプランに応じた端末台数上限を返す。
 * プラン取得に失敗した場合は安全側に倒し1台を返す。
 */
export async function getDeviceLimit(token: string, userId: string): Promise<number> {
  const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase
    .from("profiles")
    .select("plan, plan_expires_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return MAX_DEVICES_BY_PLAN.free;

  const expiresAt = data.plan_expires_at ? new Date(data.plan_expires_at) : null;
  const plan = normalizeServerPlan(data.plan, expiresAt);
  return MAX_DEVICES_BY_PLAN[plan] ?? MAX_DEVICES_BY_PLAN.free;
}

/**
/** JST基準の"today"をYYYY-MM-DDで返す */
function todayJstDateKey(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/**
 * plan_feature_limits テーブルから、プラン×機能の上限回数を取得する。
 * limit_count = -1 は無制限として扱う。行が無ければfallbackを使う
 * (運用中にDB側の設定が消えてもアプリが壊れないようにするため)。
 */
async function getPlanFeatureLimit(
  serviceSupabase: any,
  plan: string,
  featureKey: string,
  fallback: number,
): Promise<number> {
  const { data } = await serviceSupabase
    .from("plan_feature_limits")
    .select("limit_count")
    .eq("plan", plan)
    .eq("feature_key", featureKey)
    .maybeSingle();
  if (data?.limit_count == null) return fallback;
  return data.limit_count === -1 ? Infinity : data.limit_count;
}

/**
 * チャット画像添付の1日あたりクォータを検証し、OKなら消費(カウントを1増やす)する。
 * 上限値は plan_feature_limits テーブル(feature_key="chat_image_upload")で管理する。
 * feature_usage_counters を信頼できる利用回数の記録先として使う
 * (このテーブルはservice role以外からの書き込みを許可していないため、
 *  ここサーバー側からのみ安全にインクリメントできる)。
 */
export async function checkAndConsumeImageQuota(
  serviceSupabase: any,
  userId: string,
  plan: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const limit = await getPlanFeatureLimit(serviceSupabase, plan, "chat_image_upload", 2);
  const windowKey = todayJstDateKey();
  const featureKey = "chat_image_upload";

  const { data: existing } = await serviceSupabase
    .from("feature_usage_counters")
    .select("id, count")
    .eq("user_id", userId)
    .eq("feature_key", featureKey)
    .eq("window_key", windowKey)
    .maybeSingle();

  const currentCount = existing?.count ?? 0;
  if (Number.isFinite(limit) && currentCount >= limit) {
    return { ok: false, message: `本日の画像送信の上限（${limit}回）に達しました` };
  }

  if (existing) {
    await serviceSupabase
      .from("feature_usage_counters")
      .update({ count: currentCount + 1, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await serviceSupabase.from("feature_usage_counters").insert({
      user_id: userId,
      feature_key: featureKey,
      window_type: "day",
      window_key: windowKey,
      count: 1,
    });
  }

  return { ok: true };
}

/**
 * 書類生成(generate-document)のプラン別アクセス制御。
 * 上限値は plan_feature_limits テーブル(feature_key="doc_generation_<docType>")で管理する。
 * limit_count=0のプランは完全ブロック、-1は無制限、それ以外は日次の回数上限。
 */
export async function checkAndConsumeDocumentQuota(
  serviceSupabase: any,
  userId: string,
  plan: string,
  docType: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const featureKey = `doc_generation_${docType}`;
  const limit = await getPlanFeatureLimit(serviceSupabase, plan, featureKey, 0);

  if (limit === 0) {
    return { ok: false, message: "この機能はプロプラン限定です。プランのアップグレードが必要です" };
  }
  if (!Number.isFinite(limit)) return { ok: true }; // 無制限

  const windowKey = todayJstDateKey();

  const { data: existing } = await serviceSupabase
    .from("feature_usage_counters")
    .select("id, count")
    .eq("user_id", userId)
    .eq("feature_key", featureKey)
    .eq("window_key", windowKey)
    .maybeSingle();

  const currentCount = existing?.count ?? 0;
  if (currentCount >= limit) {
    return {
      ok: false,
      message: `本日の生成回数の上限（${limit}回）に達しました。プロプランなら無制限で使えます`,
    };
  }

  if (existing) {
    await serviceSupabase
      .from("feature_usage_counters")
      .update({ count: currentCount + 1, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await serviceSupabase.from("feature_usage_counters").insert({
      user_id: userId,
      feature_key: featureKey,
      window_type: "day",
      window_key: windowKey,
      count: 1,
    });
  }

  return { ok: true };
}

/**
 * 自己分析レポート生成のプラン別アクセス制御。
 * 上限値は plan_feature_limits テーブル(feature_key="self_analysis_basic"/"self_analysis_detailed")で管理する。
 */
function currentMonthKey(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 7); // YYYY-MM
}

export async function checkAndConsumeSelfAnalysisQuota(
  serviceSupabase: any,
  userId: string,
  plan: string,
  reportType: "basic" | "detailed",
): Promise<{ ok: true } | { ok: false; message: string }> {
  const featureKey = `self_analysis_${reportType}`;
  const limit = await getPlanFeatureLimit(
    serviceSupabase,
    plan,
    featureKey,
    reportType === "detailed" ? 0 : 3,
  );

  if (limit === 0) {
    return {
      ok: false,
      message: "詳細自己分析レポートはプロプラン限定です。プランのアップグレードが必要です",
    };
  }
  if (!Number.isFinite(limit)) return { ok: true }; // 無制限

  const windowKey = currentMonthKey();

  const { data: existing } = await serviceSupabase
    .from("feature_usage_counters")
    .select("id, count")
    .eq("user_id", userId)
    .eq("feature_key", featureKey)
    .eq("window_key", windowKey)
    .maybeSingle();

  const currentCount = existing?.count ?? 0;
  if (currentCount >= limit) {
    return {
      ok: false,
      message: `今月の自己分析レポート利用上限（${limit}回）に達しました。プロプランなら無制限で使えます`,
    };
  }

  if (existing) {
    await serviceSupabase
      .from("feature_usage_counters")
      .update({ count: currentCount + 1, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await serviceSupabase.from("feature_usage_counters").insert({
      user_id: userId,
      feature_key: featureKey,
      window_type: "month",
      window_key: windowKey,
      count: 1,
    });
  }

  return { ok: true };
}

/**
 * 「今日の質問」の在庫が尽きた時にAIが新しい質問を生成する回数の
 * 1日あたりの上限。plan_feature_limits(feature_key="daily_question_ai_generation")で管理する。
 * 生成そのものが一番コストの高い処理のため、無料機能ではあるが
 * 連打で青天井にならないよう歯止めをかける。
 */
export async function checkAndConsumeDailyQuestionGenQuota(
  serviceSupabase: any,
  userId: string,
  plan: string,
): Promise<{ ok: true } | { ok: false }> {
  const featureKey = "daily_question_ai_generation";
  const limit = await getPlanFeatureLimit(serviceSupabase, plan, featureKey, 1);
  if (!Number.isFinite(limit)) return { ok: true };

  const windowKey = todayJstDateKey();

  const { data: existing } = await serviceSupabase
    .from("feature_usage_counters")
    .select("id, count")
    .eq("user_id", userId)
    .eq("feature_key", featureKey)
    .eq("window_key", windowKey)
    .maybeSingle();

  const currentCount = existing?.count ?? 0;
  if (currentCount >= limit) return { ok: false };

  if (existing) {
    await serviceSupabase
      .from("feature_usage_counters")
      .update({ count: currentCount + 1, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await serviceSupabase.from("feature_usage_counters").insert({
      user_id: userId,
      feature_key: featureKey,
      window_type: "day",
      window_key: windowKey,
      count: 1,
    });
  }

  return { ok: true };
}

/**
 * 単純な「ブロックか無制限か」だけのプラン制御用の汎用ヘルパー
 * (企業研究AI・志望校研究AI等、回数カウントを伴わない機能向け)。
 */
export async function checkPlanFeatureAccess(
  serviceSupabase: any,
  plan: string,
  featureKey: string,
  blockedMessage: string,
  fallback = 0,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const limit = await getPlanFeatureLimit(serviceSupabase, plan, featureKey, fallback);
  if (limit === 0) return { ok: false, message: blockedMessage };
  return { ok: true };
}
