import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey, verifyApiUser } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// HTMLに埋め込む前にユーザー入力をエスケープし、HTMLインジェクションを防ぐ。
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// interviewUrl から /interview/<token> のトークン(UUID)を取り出す。
function extractToken(interviewUrl: string): string | null {
  const match = interviewUrl.match(/\/interview\/([0-9a-fA-F-]{36})(?:[/?#]|$)/);
  return match ? match[1] : null;
}

export const Route = createFileRoute("/api/send-interview-email")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;

        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
          return json({ error: "RESEND_API_KEY missing" }, 500);
        }

        const serviceKey = getServiceRoleKey();
        if (!serviceKey) {
          return json({ error: "Supabase config missing" }, 500);
        }

        const body = (await request.json()) as {
          to: string;
          candidateName: string;
          companyName: string;
          interviewUrl: string;
          jobType: string | null;
        };

        const { to, candidateName, companyName, interviewUrl, jobType } = body;

        if (!to || !interviewUrl) {
          return json({ error: "Missing required fields" }, 400);
        }

        // 認証済みユーザーが実際に発行した招待に対してのみ送信を許可する。
        // interviewUrl のトークンから招待を引き、user_id が本人であること、
        // 宛先が招待に登録された候補者メールと一致することを検証する。
        const token = extractToken(interviewUrl);
        if (!token) {
          return json({ error: "Invalid interview URL" }, 400);
        }

        const supabase = createClient(getSupabaseUrl(), serviceKey);
        const { data: invitation, error: inviteError } = await supabase
          .from("interview_invitations")
          .select("user_id, candidate_email")
          .eq("token", token)
          .maybeSingle();

        if (inviteError || !invitation) {
          return json({ error: "Invitation not found" }, 404);
        }
        if (invitation.user_id !== auth.userId) {
          return json({ error: "Forbidden" }, 403);
        }

        const normalize = (v: string) => v.trim().toLowerCase();
        if (
          !invitation.candidate_email ||
          normalize(invitation.candidate_email) !== normalize(to)
        ) {
          return json({ error: "Recipient does not match invitation" }, 403);
        }

        // 表示用の値は全てエスケープしてからHTMLに埋め込む。
        const safeCompanyName = escapeHtml(companyName ?? "");
        const safeCandidateName = escapeHtml(candidateName ?? "");
        const safeJobType = escapeHtml(jobType ?? "未設定");
        const safeInterviewUrl = escapeHtml(interviewUrl);

        const subject = `【面接のご案内】${companyName ?? ""}`;

        const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Hiragino Kaku Gothic Pro', 'メイリオ', sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #0F0F0F; padding: 32px; text-align: center; }
    .header h1 { color: #C8FF00; font-size: 22px; margin: 0 0 8px; }
    .header p { color: #888888; font-size: 13px; margin: 0; }
    .body { padding: 32px; }
    .body p { color: #333333; font-size: 15px; line-height: 1.8; margin: 0 0 16px; }
    .info-box { background: #f8f8f8; border-left: 4px solid #C8FF00; padding: 16px 20px; margin: 24px 0; border-radius: 4px; }
    .info-box p { margin: 6px 0; font-size: 14px; color: #555555; }
    .url-box { background: #f0f0f0; border-radius: 8px; padding: 16px 20px; margin: 24px 0; }
    .url-box p { margin: 0 0 8px; font-size: 12px; color: #888888; }
    .url-box a { color: #0066cc; font-size: 13px; word-break: break-all; }
    .btn-wrap { text-align: center; margin: 28px 0; }
    .btn { display: inline-block; background: #C8FF00; color: #0F0F0F; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px; }
    .note { background: #fffbf0; border: 1px solid #f0d060; border-radius: 8px; padding: 16px 20px; margin: 24px 0; }
    .note p { margin: 4px 0; font-size: 13px; color: #665500; }
    .footer { background: #f5f5f5; padding: 24px; text-align: center; border-top: 1px solid #eeeeee; }
    .footer p { color: #999999; font-size: 12px; margin: 4px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${safeCompanyName}</h1>
      <p>面接のご案内</p>
    </div>
    <div class="body">
      <p>${safeCandidateName} 様</p>
      <p>このたびは${safeCompanyName}の採用選考にご応募いただき、誠にありがとうございます。<br>書類選考を通過されましたので、面接URLをお送りいたします。</p>
      <div class="info-box">
        <p>📋 <strong>職種：</strong>${safeJobType}</p>
        <p>⏱ <strong>所要時間：</strong>20〜40分程度</p>
        <p>📅 <strong>有効期限：</strong>7日間</p>
        <p>🎥 <strong>必要なもの：</strong>カメラ・マイク付きのPC・スマートフォン</p>
      </div>
      <p>以下のURLから面接にご参加ください。</p>
      <div class="url-box">
        <p>▼ 面接URL</p>
        <a href="${safeInterviewUrl}">${safeInterviewUrl}</a>
      </div>
      <div class="btn-wrap">
        <a href="${safeInterviewUrl}" class="btn">面接を開始する →</a>
      </div>
      <div class="note">
        <p>⚠️ このURLは<strong>1回限り</strong>有効です。</p>
        <p>⚠️ 静かな場所・安定したインターネット環境でご参加ください。</p>
        <p>⚠️ ご不明な点はこのメールに返信してください。</p>
      </div>
    </div>
    <div class="footer">
      <p><strong>${safeCompanyName}</strong></p>
      <p>このメールはAI採用システムから自動送信されています。</p>
    </div>
  </div>
</body>
</html>`;

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${(companyName ?? "").replace(/[\r\n<>]/g, "")} <info@akitogroup.jp>`,
            to: [to],
            subject,
            html,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          console.error("Resend error:", err);
          return json({ error: "メール送信に失敗しました" }, 500);
        }

        return json({ success: true });
      },
    },
  },
});
