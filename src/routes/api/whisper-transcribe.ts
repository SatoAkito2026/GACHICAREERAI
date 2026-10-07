import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getServiceRoleKey } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// 25MB — OpenAI Whisper's hard limit; reject anything larger before forwarding.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// 無音や雑音のとき、Whisper は動画の締めの言葉などを勝手に書き起こすことがある。
// 本人が言っていない言葉で評価されないよう、よく出るものを取り除く
const HALLUCINATIONS = [
  /(最後まで)?ご(視聴|覧(いただき)?)(いただき)?(、)?(本当に)?ありがとうございま(した|す)[。！!]*/g,
  /チャンネル登録(と高評価)?(を)?(よろしく(お願いします)?|お願いします)[。！!]*/g,
  /高評価(と|、)?チャンネル登録(を)?(よろしく(お願いします)?|お願いします)[。！!]*/g,
  /(字幕|翻訳)(作成|提供|制作)(者)?[：:]?.*$/g,
  /次回もお楽しみに[。！!]*/g,
];

function removeHallucinations(text: string): string {
  let t = text;
  for (const re of HALLUCINATIONS) t = t.replace(re, "");
  t = t.trim();
  // 句読点だけが残ったら、何も言っていない扱いにする
  return /^[\s、。,.!！?？]*$/.test(t) ? "" : t;
}

export const Route = createFileRoute("/api/whisper-transcribe")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const openaiKey = process.env.OPENAI_API_KEY;
          if (!openaiKey) {
            return new Response(JSON.stringify({ error: "OpenAI key missing" }), {
              status: 500,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }

          const formData = await request.formData();
          const audioFile = formData.get("audio") as File;
          const token = formData.get("token");

          if (!audioFile) {
            return new Response(JSON.stringify({ error: "No audio file" }), {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }

          // 招待トークンを必須にし、有効な(未期限切れの)招待に紐づくリクエストのみ許可する。
          // これにより匿名ユーザーが OpenAI API を無料の文字起こしプロキシとして悪用するのを防ぐ。
          if (!token || typeof token !== "string") {
            return new Response(JSON.stringify({ error: "Missing token" }), {
              status: 401,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }

          const serviceKey = getServiceRoleKey();
          if (!serviceKey) {
            return new Response(JSON.stringify({ error: "Server config missing" }), {
              status: 500,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
          const supabase = createClient(getSupabaseUrl(), serviceKey);
          const { data: invitation } = await supabase
            .from("interview_invitations")
            .select("token, expires_at")
            .eq("token", token)
            .maybeSingle();

          if (
            !invitation ||
            (invitation.expires_at &&
              new Date(invitation.expires_at as string).getTime() < Date.now())
          ) {
            return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
              status: 403,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }

          // ファイルサイズの上限チェック(コスト暴走・巨大ファイル攻撃の防止)
          if (typeof audioFile.size === "number" && audioFile.size > MAX_AUDIO_BYTES) {
            return new Response(JSON.stringify({ error: "Audio file too large" }), {
              status: 413,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }

          const whisperForm = new FormData();
          const uploadedName =
            typeof (audioFile as File).name === "string" && (audioFile as File).name
              ? (audioFile as File).name
              : "audio.webm";
          whisperForm.append("file", audioFile, uploadedName);
          whisperForm.append("model", "whisper-1");
          whisperForm.append("language", "ja");
          // 句読点つきの自然な日本語で書き起こしてもらうためのヒント
          whisperForm.append("prompt", "就職・転職の面接での受け答えです。");

          const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${openaiKey}` },
            body: whisperForm,
          });

          if (!whisperRes.ok) {
            const err = await whisperRes.text();
            console.error("Whisper error:", err);
            return new Response(JSON.stringify({ error: "Whisper failed" }), {
              status: 500,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }

          const { text: raw } = (await whisperRes.json()) as { text: string };
          const text = removeHallucinations(raw ?? "");
          return new Response(JSON.stringify({ text }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (e) {
          console.error(e);
          return new Response(JSON.stringify({ error: "Internal error" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      },
    },
  },
});
