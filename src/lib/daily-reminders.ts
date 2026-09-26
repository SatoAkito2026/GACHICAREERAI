/**
 * 毎日のリマインドメール送信バッチ
 *
 * Cloudflare Cron Trigger から1時間に1回呼び出される想定。
 * daily_reminder_preferences.send_hour が現在時刻(JST)と一致し、
 * かつ今日まだ送っていないユーザーに、Resend経由でリマインドメールを送る。
 * 今日既に「今日の質問」に回答済みのユーザーには送らない(不要な催促を避ける)。
 */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey } from "@/lib/api-auth";

function currentJstHour(): number {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours();
}

function todayJstDateKey(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

async function sendReminderEmail(
  resendApiKey: string,
  to: string,
  appUrl: string,
): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "インタビアAI <notify@interview-copilot-ai.akitogroup.jp>",
        to: [to],
        subject: "今日の質問、まだ答えていませんか？",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #111;">今日の質問、答えてみませんか？</h2>
            <p style="color: #444; line-height: 1.7;">
              毎日少しずつ答えることで、自己PR・面接対策の材料が自然と貯まっていきます。
              今日の分はまだ回答されていないようです。5問だけでも、ぜひ答えてみてください。
            </p>
            <a href="${appUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#C8FF00;color:#0F0F0F;font-weight:bold;text-decoration:none;border-radius:999px;">
              今すぐ答える
            </a>
          </div>
        `,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error("[daily-reminders] send failed", e);
    return false;
  }
}

export async function runDailyReminderJob(): Promise<{
  sent: number;
  skipped: number;
  failed: number;
}> {
  const serviceKey = getServiceRoleKey();
  const resendApiKey = process.env.RESEND_API_KEY;
  const appUrl = process.env.APP_URL ?? "https://interview-copilot-ai.akitogroup.jp";

  if (!serviceKey || !resendApiKey) {
    console.error("[daily-reminders] missing config (service key or Resend key)");
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const supabase = createClient(getSupabaseUrl(), serviceKey);
  const hour = currentJstHour();
  const today = todayJstDateKey();

  const { data: candidates, error } = await supabase
    .from("daily_reminder_preferences")
    .select("user_id, last_sent_at")
    .eq("enabled", true)
    .eq("send_hour", hour);

  if (error || !candidates) {
    console.error("[daily-reminders] fetch candidates failed", error);
    return { sent: 0, skipped: 0, failed: 0 };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of candidates) {
    // 今日既に送信済みならスキップ(1時間おきに複数回起動されても二重送信しない)
    if (c.last_sent_at && c.last_sent_at.slice(0, 10) === today) {
      skipped++;
      continue;
    }

    // 今日既に「今日の質問」に回答済みなら、催促は不要
    const { count: answeredToday } = await supabase
      .from("daily_question_responses")
      .select("*", { count: "exact", head: true })
      .eq("user_id", c.user_id)
      .gte("created_at", `${today}T00:00:00+09:00`);

    if ((answeredToday ?? 0) > 0) {
      skipped++;
      // 回答済みでも「送信日」は更新しておき、その日にもう送らないようにする
      await supabase
        .from("daily_reminder_preferences")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("user_id", c.user_id);
      continue;
    }

    const { data: authUser } = await supabase.auth.admin.getUserById(c.user_id);
    const email = authUser?.user?.email;
    if (!email) {
      skipped++;
      continue;
    }

    const ok = await sendReminderEmail(resendApiKey, email, appUrl);
    if (ok) {
      sent++;
      await supabase
        .from("daily_reminder_preferences")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("user_id", c.user_id);
    } else {
      failed++;
    }
  }

  console.log(`[daily-reminders] hour=${hour} sent=${sent} skipped=${skipped} failed=${failed}`);
  return { sent, skipped, failed };
}
