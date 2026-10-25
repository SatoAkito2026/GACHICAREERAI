/**
 * 提携先（POSPOS）の AI 一次面接：応募者の画面から呼ぶ API。会員登録なし。面接 URL の合言葉（token）だけで使える。
 * 合言葉に結びついた面接の分だけ読み書きし、ほかの応募者・ほかのお店の情報は返さない。
 *
 * POST /api/partner-interview { token, action, ... }
 *   session                     → 受けられるか・お店の名前・選ぶ質問（会話で答えたあとに閉じた面接は、ここで「使えない」にする）
 *   screening { answers }       → 選ぶ質問の答えを確かめて保存する（その職種・お店の種類の質問・選べる答えだけ受け付ける）
 *   start { consent: true }     → 録画への同意を残して会話をはじめる（選ぶ質問の答えを保存してから）。最初のあいさつと声を返す
 *   turn { candidateText }      → 応募者の答えを受けて、面接官の返事と声を返す（会話はサーバーに残す）
 *   media-url { kind, index, ext } → 写真・録画を Storage へ直接送るための署名つき URL
 *   media-done { kind, index, ext } → 送れたかを確かめて記録する
 *   finish                      → 雰囲気のまとめを作る（終わったあとに1回だけ）
 */
import { createFileRoute } from "@tanstack/react-router";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { jsonResponse, serviceClient } from "@/lib/talent";
import {
  JOB_LABELS,
  PARTNER_BUCKET,
  PARTNER_MAX_ANSWERS,
  PARTNER_MAX_MINUTES,
  PARTNER_PHOTO_COUNT,
  PARTNER_TIME_UP_TEXT,
  type PartnerInterviewRow,
  type TranscriptLine,
  effectiveStatus,
  isPartnerEnd,
  mediaFolder,
  partnerGreeting,
  partnerSpeak,
  partnerSystemPrompt,
  screeningQuestions,
  toClaudeMessages,
  validateScreening,
  writePartnerSummary,
} from "@/lib/partner-interview";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("session"), token: z.string().min(20).max(100) }),
  z.object({
    action: z.literal("screening"),
    token: z.string().min(20).max(100),
    answers: z.record(
      z.string().max(30),
      z.union([z.string().max(30), z.array(z.string().max(30)).max(10), z.literal(true)]),
    ),
  }),
  z.object({
    action: z.literal("start"),
    token: z.string().min(20).max(100),
    consent: z.literal(true),
  }),
  z.object({
    action: z.literal("turn"),
    token: z.string().min(20).max(100),
    candidateText: z.string().trim().min(1).max(2000),
  }),
  z.object({
    action: z.enum(["media-url", "media-done"]),
    token: z.string().min(20).max(100),
    kind: z.enum(["photo", "video"]),
    index: z
      .number()
      .int()
      .min(0)
      .max(PARTNER_PHOTO_COUNT - 1),
    ext: z.enum(["jpg", "webm", "mp4"]),
  }),
  z.object({ action: z.literal("finish"), token: z.string().min(20).max(100) }),
]);

const UNAVAILABLE = { available: false as const };

async function loadByToken(supabase: SupabaseClient, token: string) {
  const { data } = await supabase
    .from("partner_interviews")
    .select("*")
    .eq("token", token)
    .is("deleted_at", null)
    .is("purged_at", null)
    .maybeSingle();
  return (data as PartnerInterviewRow | null) ?? null;
}

function mediaPath(row: PartnerInterviewRow, kind: "photo" | "video", index: number, ext: string) {
  return kind === "photo"
    ? `${mediaFolder(row)}/photo-${index + 1}.jpg`
    : `${mediaFolder(row)}/video.${ext === "mp4" ? "mp4" : "webm"}`;
}

export const Route = createFileRoute("/api/partner-interview/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return jsonResponse({ error: "invalid json" }, 400);
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) return jsonResponse({ error: "invalid input" }, 400);
        const body = parsed.data;
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "server config missing" }, 500);
        const row = await loadByToken(supabase, body.token);
        if (!row) return jsonResponse(UNAVAILABLE);
        const status = effectiveStatus(row);
        // 期限切れなどで DB の状態が古いままなら、ここで直しておく
        if (status !== row.status && status === "expired")
          await supabase.from("partner_interviews").update({ status }).eq("id", row.id);

        // ---- 受けられるか ----
        if (body.action === "session") {
          if (status === "done" || status === "expired") return jsonResponse(UNAVAILABLE);
          if (status === "in_progress" && row.answered_count > 0) {
            // 答えはじめてから閉じた（開き直した）面接は、続きからは受けられない
            await supabase
              .from("partner_interviews")
              .update({ status: "expired" })
              .eq("id", row.id)
              .eq("status", "in_progress");
            return jsonResponse(UNAVAILABLE);
          }
          return jsonResponse({
            available: true,
            storeName: row.store_name,
            jobLabel: JOB_LABELS[row.job_type],
            questions: screeningQuestions(row.business_type, row.job_type),
          });
        }

        // ---- 選ぶ質問の答え（会話で答える前なら、何度でも選び直せる） ----
        if (body.action === "screening") {
          const canAnswer =
            status === "waiting" || (status === "in_progress" && row.answered_count === 0);
          if (!canAnswer) return jsonResponse(UNAVAILABLE);
          const screening = validateScreening(body.answers, row.business_type, row.job_type);
          if (!screening) return jsonResponse({ error: "invalid answers" }, 400);
          const { data: saved } = await supabase
            .from("partner_interviews")
            .update({ screening })
            .eq("id", row.id)
            .in("status", ["waiting", "in_progress"])
            .eq("answered_count", 0)
            .select("id");
          if (!saved?.length) return jsonResponse(UNAVAILABLE);
          return jsonResponse({ ok: true });
        }

        // ---- はじめる（まだ1つも答えていなければ、はじめからやり直せる） ----
        if (body.action === "start") {
          const canStart =
            status === "waiting" || (status === "in_progress" && row.answered_count === 0);
          if (!canStart) return jsonResponse(UNAVAILABLE);
          // 選ぶ質問の答えを保存してからでないと、会話は始められない
          if (!Array.isArray(row.screening) || row.screening.length === 0)
            return jsonResponse({ error: "screening required" }, 409);
          if (row.photo_paths.length || row.video_path) {
            // やり直し：前に撮った写真・録画は消す
            const folder = mediaFolder(row);
            const { data: listed } = await supabase.storage
              .from(PARTNER_BUCKET)
              .list(folder, { limit: 100 });
            const paths = (listed ?? []).map((f) => `${folder}/${f.name}`);
            if (paths.length) await supabase.storage.from(PARTNER_BUCKET).remove(paths);
          }
          const greeting = partnerGreeting(row);
          const now = new Date().toISOString();
          const { data: claimed } = await supabase
            .from("partner_interviews")
            .update({
              status: "in_progress",
              started_at: now,
              consent_agreed_at: now,
              transcript: [{ role: "interviewer", text: greeting }],
              answered_count: 0,
              photo_paths: [],
              video_path: null,
            })
            .eq("id", row.id)
            .in("status", ["waiting", "in_progress"])
            .eq("answered_count", 0)
            .select("id");
          if (!claimed?.length) return jsonResponse(UNAVAILABLE);
          return jsonResponse({
            available: true,
            aiText: greeting,
            audioBase64: await partnerSpeak(greeting),
          });
        }

        // ---- 受け答え ----
        if (body.action === "turn") {
          if (status !== "in_progress" || !row.started_at)
            return jsonResponse({ error: "ended" }, 409);
          const transcript: TranscriptLine[] = [
            ...(row.transcript ?? []),
            { role: "candidate", text: body.candidateText },
          ];
          const elapsedMin = (Date.now() - new Date(row.started_at).getTime()) / 60000;
          let aiText: string;
          if (
            elapsedMin >= PARTNER_MAX_MINUTES + 1 ||
            row.answered_count + 1 >= PARTNER_MAX_ANSWERS
          ) {
            // 時間・回数を大きく過ぎたら、AI を呼ばずに締める
            aiText = PARTNER_TIME_UP_TEXT;
          } else {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) return jsonResponse({ error: "server config missing" }, 500);
            const anthropic = new Anthropic({ apiKey });
            try {
              const res = await anthropic.messages.create(
                {
                  model: "claude-sonnet-4-6",
                  max_tokens: 300,
                  system: partnerSystemPrompt(row, elapsedMin),
                  messages: toClaudeMessages(transcript),
                },
                { timeout: 25000, maxRetries: 1 },
              );
              const first = res.content[0];
              aiText =
                first?.type === "text" && first.text.trim() ? first.text.trim() : "続けてどうぞ。";
            } catch (e) {
              // 会話はまだ残していないので、応募者はもう一度話せばよい
              console.error("[partner-interview] claude failed", e);
              return jsonResponse({ error: "ai failed" }, 502);
            }
          }
          const isEnded = isPartnerEnd(aiText);
          const now = new Date().toISOString();
          // 同じ答えを二重に送られても、1回分だけ残す（答えた回数で確かめる）
          const { data: saved } = await supabase
            .from("partner_interviews")
            .update({
              transcript: [...transcript, { role: "interviewer", text: aiText }],
              answered_count: row.answered_count + 1,
              ...(isEnded ? { status: "done", finished_at: now } : {}),
            })
            .eq("id", row.id)
            .eq("status", "in_progress")
            .eq("answered_count", row.answered_count)
            .select("id");
          if (!saved?.length) return jsonResponse({ error: "conflict" }, 409);
          return jsonResponse({ aiText, audioBase64: await partnerSpeak(aiText), isEnded });
        }

        // ---- 写真・録画のアップロード（受けている途中か、終わってから30分まで） ----
        if (body.action === "media-url" || body.action === "media-done") {
          const recentlyDone =
            status === "done" &&
            row.finished_at &&
            Date.now() - new Date(row.finished_at).getTime() < 30 * 60 * 1000;
          if (status !== "in_progress" && !recentlyDone)
            return jsonResponse({ error: "ended" }, 409);
          if ((body.kind === "photo") !== (body.ext === "jpg"))
            return jsonResponse({ error: "invalid input" }, 400);
          const path = mediaPath(row, body.kind, body.index, body.ext);
          if (body.action === "media-url") {
            const { data, error } = await supabase.storage
              .from(PARTNER_BUCKET)
              .createSignedUploadUrl(path, { upsert: true });
            if (error || !data) return jsonResponse({ error: "upload url failed" }, 500);
            return jsonResponse({ path: data.path, uploadToken: data.token });
          }
          // 送れたかを、Storage に実際にあるかで確かめてから記録する
          const folder = mediaFolder(row);
          const name = path.slice(folder.length + 1);
          const { data: listed } = await supabase.storage
            .from(PARTNER_BUCKET)
            .list(folder, { search: name, limit: 10 });
          if (!listed?.some((f) => f.name === name))
            return jsonResponse({ error: "not uploaded" }, 400);
          if (body.kind === "photo") {
            const photos = [...new Set([...(row.photo_paths ?? []), path])].sort();
            await supabase
              .from("partner_interviews")
              .update({ photo_paths: photos })
              .eq("id", row.id);
          } else {
            await supabase.from("partner_interviews").update({ video_path: path }).eq("id", row.id);
          }
          return jsonResponse({ ok: true });
        }

        // ---- 終わり：雰囲気のまとめ（AI を1回だけ） ----
        if (status !== "done" || row.summary) return jsonResponse({ ok: true });
        try {
          const summary = await writePartnerSummary(row);
          await supabase
            .from("partner_interviews")
            .update({ summary })
            .eq("id", row.id)
            .is("summary", null);
        } catch (e) {
          // 失敗しても、毎時の Cron がもう一度作る
          console.error("[partner-interview] summary failed", e);
        }
        return jsonResponse({ ok: true });
      },
    },
  },
});
