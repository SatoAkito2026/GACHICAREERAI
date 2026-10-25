/**
 * 社内管理ダッシュボードAPI（profiles.is_admin = true のユーザーだけ）
 *
 * GET /api/admin-dashboard-data
 *
 * 今のサービスの形（個人の月額・企業のコイン・AI面接の従量課金・結果ごとの購入・本人ポイント）に合わせて、
 * お金・伸び・個人・人材の市場・企業・ポイント・要対応 をまとめて返す。
 * 月は日本時間で区切る。個人を特定できる情報は返さない（企業名だけは運営として表示する）。
 * AIのコストは利用回数からの概算。正確な請求額は Anthropic / OpenAI の管理画面で確認する。
 */
import { COMPANY_INTERVIEW_PRICE_JPY, PRACTICE_RULES } from "@/lib/plan-rules";
import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey, verifyApiUser } from "@/lib/api-auth";

const noStore = { "Cache-Control": "no-store" };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...noStore },
  });
}

// AIのコストの概算（1回の練習あたり：会話15往復＋総評。Whisper・音声合成も15分ぶん）
const USD_JPY = 155;
const COST_PER_INTERVIEW_USD =
  15 * (2000 * (3 / 1e6) + 150 * (15 / 1e6)) + // 会話
  (3000 * (3 / 1e6) + 800 * (15 / 1e6)) + // 総評
  15 * 0.006 + // Whisper
  15 * 150 * (15 / 1e6); // 音声合成
const COST_PER_GENERATION_USD = 4000 * (3 / 1e6) + 2000 * (15 / 1e6); // 書類・自己分析・企業研究

const JST = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
/** 日本時間の日付（YYYY-MM-DD） */
const jstDate = (iso: string | Date) =>
  new Date(new Date(iso).getTime() + JST).toISOString().slice(0, 10);
/** 日本時間の月初（UTC の ISO） */
function jstMonthStart(offsetMonths = 0): string {
  const j = new Date(Date.now() + JST);
  const d = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth() + offsetMonths, 1));
  return new Date(d.getTime() - JST).toISOString();
}

const BIG = 20000;

/** 全件を取る（Supabase は1回1000件までなので、区切って取る） */
async function all<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  filter?: (q: any) => any,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < BIG; from += 1000) {
    let q = supabase
      .from(table)
      .select(columns)
      .range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) {
      console.error(`[admin-dashboard] ${table}`, error.message);
      break;
    }
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function count(
  supabase: SupabaseClient,
  table: string,
  filter?: (q: any) => any,
): Promise<number> {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: n } = await q;
  return n ?? 0;
}

function ranking(values: (string | null | undefined)[], top = 8) {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = (v ?? "").trim();
    if (!k || k === "模擬面接" || k === "受験") continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([name, n]) => ({ name, count: n }));
}

/** 直近30日の日ごとの件数（0の日も埋める） */
function daily(dates: string[]) {
  const m = new Map<string, number>();
  for (const d of dates) m.set(jstDate(d), (m.get(jstDate(d)) ?? 0) + 1);
  const out: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const key = jstDate(new Date(Date.now() - i * DAY));
    out.push({ date: key.slice(5).replace("-", "/"), count: m.get(key) ?? 0 });
  }
  return out;
}

/** 直近12週の週ごとの件数（日本時間の月曜はじまり。ラベルは週の初日） */
function weekly(dates: string[]) {
  const weekStart = (key: string) => {
    const d = new Date(`${key}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const m = new Map<string, number>();
  for (const d of dates) {
    const k = weekStart(jstDate(d));
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const thisWeek = new Date(`${weekStart(jstDate(new Date()))}T00:00:00Z`);
  const out: { date: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const key = new Date(thisWeek.getTime() - i * 7 * DAY).toISOString().slice(0, 10);
    out.push({ date: `${key.slice(5).replace("-", "/")}〜`, count: m.get(key) ?? 0 });
  }
  return out;
}

/** 直近12か月の月ごとの件数（日本時間） */
function monthly(dates: string[]) {
  const m = new Map<string, number>();
  for (const d of dates) {
    const k = jstDate(d).slice(0, 7);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const j = new Date(Date.now() + JST);
  const out: { date: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    out.push({
      date: `${d.getUTCFullYear() % 100}/${d.getUTCMonth() + 1}月`,
      count: m.get(key) ?? 0,
    });
  }
  return out;
}

export const Route = createFileRoute("/api/admin-dashboard-data")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const serviceKey = getServiceRoleKey();
        if (!serviceKey) return json({ error: "Supabase config missing" }, 500);
        const supabase = createClient(getSupabaseUrl(), serviceKey);
        const { data: me } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", auth.userId)
          .maybeSingle();
        if (!(me as { is_admin?: boolean } | null)?.is_admin)
          return json({ error: "forbidden" }, 403);

        const monthStart = jstMonthStart(0);
        const prevMonthStart = jstMonthStart(-1);
        const since30 = new Date(Date.now() - 30 * DAY).toISOString();
        const since7 = new Date(Date.now() - 7 * DAY).toISOString();
        const nowIso = new Date().toISOString();
        const thisMonthKey = jstDate(new Date()).slice(0, 7);

        const [
          profiles,
          practices,
          coinLots,
          unlocks,
          metered,
          points,
          candidates,
          shown,
          contacts,
          usage,
          companies,
          openJobs,
          applications,
          staleSummaries,
        ] = await Promise.all([
          all<{
            id: string;
            plan: string | null;
            plan_expires_at: string | null;
            user_mode: string | null;
            created_at: string;
          }>(supabase, "profiles", "id, plan, plan_expires_at, user_mode, created_at"),
          all<{ user_id: string; created_at: string; job_type: string | null; mode: string }>(
            supabase,
            "interviews",
            "user_id, created_at, job_type, mode",
            (q) => q.in("mode", ["individual", "student"]).gte("created_at", prevMonthStart),
          ),
          all<{
            company_user_id: string;
            coins_total: number;
            coins_remaining: number;
            amount_jpy: number;
            purchased_at: string;
            expires_at: string;
          }>(
            supabase,
            "coin_lots",
            "company_user_id, coins_total, coins_remaining, amount_jpy, purchased_at, expires_at",
          ),
          all<{
            company_user_id: string;
            candidate_user_id: string;
            interview_id: string | null;
            amount: number;
            coins: number;
            created_at: string;
          }>(
            supabase,
            "profile_unlocks",
            "company_user_id, candidate_user_id, interview_id, amount, coins, created_at",
          ),
          all<{ created_at: string }>(supabase, "interview_invitations", "created_at", (q) =>
            q
              .is("practice_mode", null)
              // 請求されるのは候補者が面接を始めた回だけ
              .in("status", ["started", "completed", "abandoned"])
              .gte("created_at", prevMonthStart),
          ),
          all<{ user_id: string; points: number; reason: string; created_at: string }>(
            supabase,
            "point_ledger",
            "user_id, points, reason, created_at",
          ),
          all<{ user_id: string; is_public: boolean }>(
            supabase,
            "candidate_profiles",
            "user_id, is_public",
          ),
          all<{ id: string; user_id: string; job_type: string | null }>(
            supabase,
            "interviews",
            "id, user_id, job_type",
            (q) => q.eq("shown_to_companies", true),
          ),
          all<{ status: string; created_at: string }>(
            supabase,
            "contact_requests",
            "status, created_at",
          ),
          all<{ feature_key: string; count: number; window_key: string }>(
            supabase,
            "feature_usage_counters",
            "feature_key, count, window_key",
            (q) => q.like("window_key", `${thisMonthKey}%`),
          ),
          all<{ id: string; name: string; owner_id: string | null }>(
            supabase,
            "companies",
            "id, name, owner_id",
          ),
          count(supabase, "job_postings", (q) => q.eq("status", "open")),
          all<{ created_at: string }>(supabase, "job_applications", "created_at", (q) =>
            q.gte("created_at", prevMonthStart),
          ),
          count(supabase, "candidate_profiles", (q) => q.eq("summary_stale", true)),
        ]);

        const inMonth = (iso: string) => iso >= monthStart;
        const inPrevMonth = (iso: string) => iso >= prevMonthStart && iso < monthStart;

        // ---- お金 ----
        const activePlan = (p: (typeof profiles)[number]) =>
          p.plan && (!p.plan_expires_at || p.plan_expires_at > nowIso) ? p.plan : "free";
        const lightCount = profiles.filter((p) => activePlan(p) === "individual_light").length;
        const proCount = profiles.filter((p) => activePlan(p) === "individual_pro").length;
        const subscription =
          lightCount * PRACTICE_RULES.individual_light.priceJpy +
          proCount * PRACTICE_RULES.individual_pro.priceJpy;
        const coinSales = coinLots
          .filter((l) => inMonth(l.purchased_at))
          .reduce((a, l) => a + l.amount_jpy, 0);
        const coinSalesPrev = coinLots
          .filter((l) => inPrevMonth(l.purchased_at))
          .reduce((a, l) => a + l.amount_jpy, 0);
        const meteredCount = metered.filter((m) => inMonth(m.created_at)).length;
        const meteredPrev = metered.filter((m) => inPrevMonth(m.created_at)).length;
        const meteredSales = meteredCount * COMPANY_INTERVIEW_PRICE_JPY;
        const revenue = subscription + coinSales + meteredSales;

        const practicesThisMonth = practices.filter((p) => inMonth(p.created_at));
        const generations = usage.reduce((a, u) => a + (u.count ?? 0), 0);
        const aiCost = Math.round(
          ((practicesThisMonth.length + meteredCount) * COST_PER_INTERVIEW_USD +
            generations * COST_PER_GENERATION_USD) *
            USD_JPY,
        );
        const pointsIssuedThisMonth = points
          .filter((p) => p.points > 0 && p.reason === "unlock_share" && inMonth(p.created_at))
          .reduce((a, p) => a + p.points, 0);

        // 使われていないコイン（まだサービスを提供していない＝前受けのお金）と、30日以内に期限が来る分
        const liveLots = coinLots.filter((l) => l.expires_at > nowIso && l.coins_remaining > 0);
        const unusedYen = Math.round(
          liveLots.reduce(
            (a, l) => a + (l.amount_jpy * l.coins_remaining) / Math.max(1, l.coins_total),
            0,
          ),
        );
        const in30 = new Date(Date.now() + 30 * DAY).toISOString();
        const expiringYen = Math.round(
          liveLots
            .filter((l) => l.expires_at <= in30)
            .reduce(
              (a, l) => a + (l.amount_jpy * l.coins_remaining) / Math.max(1, l.coins_total),
              0,
            ),
        );

        // ---- 伸び ----
        const isBusiness = (m: string | null) => (m ?? "").startsWith("business_");
        const individuals = profiles.filter((p) => !isBusiness(p.user_mode));
        const newThisMonth = profiles.filter((p) => inMonth(p.created_at)).length;
        const newPrevMonth = profiles.filter((p) => inPrevMonth(p.created_at)).length;
        const paid = lightCount + proCount;

        // ---- 個人 ----
        const active7 = new Set(
          practices.filter((p) => p.created_at >= since7).map((p) => p.user_id),
        ).size;
        const active30 = new Set(
          practices.filter((p) => p.created_at >= since30).map((p) => p.user_id),
        ).size;
        const practicedEver = await (async () => {
          const rows = await all<{ user_id: string }>(supabase, "interviews", "user_id", (q) =>
            q.in("mode", ["individual", "student"]),
          );
          return new Set(rows.map((r) => r.user_id)).size;
        })();
        const publicUsers = candidates.filter((c) => c.is_public).length;
        const paidUnlocks = unlocks.filter((u) => u.amount > 0);
        const boughtPeople = new Set(paidUnlocks.map((u) => u.candidate_user_id)).size;
        const usageBy = (key: string) =>
          usage.filter((u) => u.feature_key === key).reduce((a, u) => a + (u.count ?? 0), 0);

        // ---- 人材の市場 ----
        const publicIds = new Set(candidates.filter((c) => c.is_public).map((c) => c.user_id));
        const shownPublic = shown.filter((s) => publicIds.has(s.user_id));
        const unlocksThisMonth = paidUnlocks.filter((u) => inMonth(u.created_at));
        const contactsLive = contacts.filter((c) => c.status !== "withdrawn");
        const answered = contactsLive.filter(
          (c) => c.status === "accepted" || c.status === "declined",
        );
        const accepted = contactsLive.filter((c) => c.status === "accepted").length;
        const pendingOld = contactsLive.filter(
          (c) =>
            c.status === "pending" && c.created_at < new Date(Date.now() - 3 * DAY).toISOString(),
        ).length;

        // ---- 企業 ----
        const companyByOwner = new Map(
          companies.filter((c) => c.owner_id).map((c) => [c.owner_id!, c.name]),
        );
        const meteredCompanies = profiles.filter((p) => p.plan === "company_metered").length;
        const buyers = new Map<string, { coins: number; yen: number; results: number }>();
        for (const l of coinLots) {
          if (l.amount_jpy <= 0) continue;
          const b = buyers.get(l.company_user_id) ?? { coins: 0, yen: 0, results: 0 };
          b.coins += l.coins_total;
          b.yen += l.amount_jpy;
          buyers.set(l.company_user_id, b);
        }
        for (const u of paidUnlocks) {
          const b = buyers.get(u.company_user_id) ?? { coins: 0, yen: 0, results: 0 };
          b.results += 1;
          buyers.set(u.company_user_id, b);
        }
        const topCompanies = [...buyers.entries()]
          .sort((a, b) => b[1].yen - a[1].yen || b[1].results - a[1].results)
          .slice(0, 8)
          .map(([id, b]) => ({ name: companyByOwner.get(id) ?? "（会社名なし）", ...b }));

        // ---- ポイント ----
        const issued = points.filter((p) => p.points > 0).reduce((a, p) => a + p.points, 0);
        const used = -points.filter((p) => p.points < 0).reduce((a, p) => a + p.points, 0);

        return json({
          generatedAt: nowIso,
          money: {
            revenue,
            subscription,
            coinSales,
            coinSalesPrev,
            meteredSales,
            meteredCount,
            meteredPrev,
            aiCost,
            pointsIssuedThisMonth,
            profit: revenue - aiCost - pointsIssuedThisMonth,
            unusedYen,
            expiringYen,
          },
          growth: {
            totalUsers: profiles.length,
            individuals: individuals.length,
            companies: companies.length,
            newThisMonth,
            newPrevMonth,
            paid,
            lightCount,
            proCount,
            paidRate: individuals.length ? Math.round((paid / individuals.length) * 1000) / 10 : 0,
            signupsDaily: daily(
              profiles.filter((p) => p.created_at >= since30).map((p) => p.created_at),
            ),
            signupsWeekly: weekly(profiles.map((p) => p.created_at)),
            signupsMonthly: monthly(profiles.map((p) => p.created_at)),
            practicesDaily: daily(
              practices.filter((p) => p.created_at >= since30).map((p) => p.created_at),
            ),
          },
          individual: {
            funnel: [
              { name: "登録", count: individuals.length },
              { name: "練習した", count: practicedEver },
              { name: "公開中", count: publicUsers },
              { name: "結果が買われた", count: boughtPeople },
            ],
            active7,
            active30,
            practicesThisMonth: practicesThisMonth.length,
            practicesPrevMonth: practices.filter((p) => inPrevMonth(p.created_at)).length,
            perActive: active30
              ? Math.round(
                  (practices.filter((p) => p.created_at >= since30).length / active30) * 10,
                ) / 10
              : 0,
            features: [
              { name: "模擬面接", count: practicesThisMonth.length },
              { name: "書類生成", count: usageBy("doc_generation") },
              { name: "自己分析", count: usageBy("self_analysis") },
              { name: "企業研究", count: usageBy("company_research") },
            ],
            jobRanking: ranking(
              practicesThisMonth.filter((p) => p.mode === "individual").map((p) => p.job_type),
            ),
          },
          market: {
            publicUsers,
            shownResults: shownPublic.length,
            unlocksThisMonth: unlocksThisMonth.length,
            unlocksTotal: paidUnlocks.length,
            coinsSpentThisMonth: unlocksThisMonth.reduce((a, u) => a + u.coins, 0),
            contacts: contactsLive.length,
            acceptRate: answered.length ? Math.round((accepted / answered.length) * 100) : null,
            shownJobRanking: ranking(shownPublic.map((s) => s.job_type)),
          },
          company: {
            companies: companies.length,
            meteredCompanies,
            openJobs,
            applicationsThisMonth: applications.filter((a) => inMonth(a.created_at)).length,
            applicationsPrevMonth: applications.filter((a) => inPrevMonth(a.created_at)).length,
            buyingCompanies: [...buyers.values()].filter((b) => b.yen > 0).length,
            topCompanies,
          },
          points: { issued, used, balance: issued - used },
          alerts: {
            pendingContactsOver3Days: pendingOld,
            staleSummaries,
            expiringYen,
          },
        });
      },
    },
  },
});
