import { createFileRoute } from "@tanstack/react-router";
import { verifyApiUser, checkInterviewQuota } from "@/lib/api-auth";
import Anthropic from "@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const extractJson = (content: string): string => {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return content.slice(start, end + 1);
  return content;
};

export const Route = createFileRoute("/api/research-company")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const auth = await verifyApiUser(request);
        if ("error" in auth) return auth.error;
        const quota = await checkInterviewQuota(auth.token, auth.userId);
        if ("error" in quota) return quota.error;
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500);

        let body: { company_name?: unknown; company_number?: unknown; company_url?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const companyName =
          typeof body.company_name === "string" ? body.company_name.trim().slice(0, 200) : "";
        const companyNumber =
          typeof body.company_number === "string"
            ? body.company_number
                .replace(/[^0-9T]/gi, "")
                .replace(/^T/i, "")
                .slice(0, 13)
            : "";
        // URL は形式を検証し、改行などの注入を防ぐ。不正な場合は空文字に落とす。
        const rawCompanyUrl =
          typeof body.company_url === "string" ? body.company_url.trim().slice(0, 500) : "";
        const isValidHttpUrl = (value: string): boolean => {
          if (!value || /[\s\r\n]/.test(value)) return false;
          try {
            const u = new URL(value);
            return u.protocol === "http:" || u.protocol === "https:";
          } catch {
            return false;
          }
        };
        const companyUrl = isValidHttpUrl(rawCompanyUrl) ? rawCompanyUrl : "";

        if (!companyName) return json({ error: "company_name is required" }, 400);

        const system = `あなたは日本企業の採用リサーチアシスタントです。
指定された会社について、公式サイト・採用ページ・企業理念・ニュース・競合情報を徹底的に調査し、
採用面接官が質問・評価に活用できる詳細な会社情報を収集してください。

【調査で必ず把握する項目】
- 会社の事業内容・強み・競合（業界内のポジション）
- 求める人物像（採用ページ・求人票・代表メッセージから）
- 社風・文化・行動指針（ミッション/ビジョン/バリューから）
- 活躍している社員の特徴（採用ページの社員インタビューから）
- 採用でよく失敗するパターン（求める人物像の裏側から推測）
- 入社後最初に任される仕事（求人票・業務内容から）
- 面接で必ず確認すべき候補者の特性・価値観

必ず指定されたJSON形式のみで返答してください。推測で埋める場合も自然な日本語で記述すること。`;

        const user = `次の会社について徹底的に調査してください。
会社名: ${companyName}
法人番号: ${companyNumber || "不明"}${companyUrl ? `\n企業URL: ${companyUrl}（このサイトの情報を最優先で参照）` : ""}

以下のキーを持つJSONで返してください（値は日本語。手がかりがない項目のみ空文字）:
{
  "company_name": "",
  "address": "（本社所在地）",
  "founded_year": "",
  "employee_count": "（概数。例：約500名）",
  "industry": "",
  "business_description": "（事業内容を詳しく。何をどんな顧客に提供しているか）",
  "ideal_candidate": "（求める人物像。採用ページ・企業理念から詳しく）",
  "company_culture": "（社風・文化・行動指針。ミッション/ビジョン/バリューから）",
  "successful_hire_traits": "（活躍している社員の特徴。具体的に）",
  "failed_hire_traits": "（採用で失敗しやすい人物像。求める人物像の裏側から推測）",
  "first_job_description": "（入社後最初に任される仕事・業務内容）",
  "company_strengths": "（自社の強み・競合との差別化ポイント）",
  "competitors": "（主な競合他社）",
  "interview_focus": "（この会社の面接で特に確認すべき候補者の特性・価値観）"
}`;

        const anthropic = new Anthropic({ apiKey: anthropicKey });
        let content = "{}";
        try {
          const aiResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 2000,
            system,
            messages: [{ role: "user", content: user }],
          });
          content = aiResponse.content[0]?.type === "text" ? aiResponse.content[0].text : "{}";
        } catch (e) {
          console.error("[research-company] Anthropic request failed:", e);
          return json({ error: "AI request failed" }, 502);
        }
        let parsed: Record<string, string> = {};
        try {
          parsed = JSON.parse(extractJson(content));
        } catch {
          parsed = {};
        }

        return json({
          company_name: String(parsed.company_name ?? ""),
          address: String(parsed.address ?? ""),
          founded_year: String(parsed.founded_year ?? ""),
          employee_count: String(parsed.employee_count ?? ""),
          industry: String(parsed.industry ?? ""),
          business_description: String(parsed.business_description ?? ""),
          ideal_candidate: String(parsed.ideal_candidate ?? ""),
          company_culture: String(parsed.company_culture ?? ""),
          successful_hire_traits: String(parsed.successful_hire_traits ?? ""),
          failed_hire_traits: String(parsed.failed_hire_traits ?? ""),
          first_job_description: String(parsed.first_job_description ?? ""),
          company_strengths: String(parsed.company_strengths ?? ""),
          competitors: String(parsed.competitors ?? ""),
          interview_focus: String(parsed.interview_focus ?? ""),
        });
      },
    },
  },
});
