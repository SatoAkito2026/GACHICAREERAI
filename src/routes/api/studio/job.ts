/**
 * TikTok 動画づくり：台本と音声を作る（GitHub Actions だけが呼ぶ。合言葉 STUDIO_SECRET）
 *
 * POST /api/studio/job → { id, title, lines, result, audio[], sampleRate, interviewerRate, ... }
 * POST /api/studio/job?onlyIfNoneToday=1 → 今日の動画がもうあれば { skipped: true }
 * POST /api/studio/job?format=ad&platform=tiktok|instagram → 広告（決まった台本。instagram は 4:5）
 * POST /api/studio/job?format=rewrite|ranking → 型を決めて作る（指定がなければ、毎日の型からランダム）
 */
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, serviceClient } from "@/lib/talent";
import {
  adScript,
  STUDIO_SAMPLE_RATE,
  isStudioRequest,
  lineTempo,
  RANKING_COMMENT_STYLE,
  speakLines,
  writeRankingScript,
  writeRewriteScript,
} from "@/lib/studio";

/** 毎日の動画の型（ランダムに選ぶ） */
const DAILY_FORMATS = ["rewrite", "ranking"] as const;

export const Route = createFileRoute("/api/studio/job")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isStudioRequest(request)) return jsonResponse({ error: "forbidden" }, 403);
        const supabase = await serviceClient();
        if (!supabase) return jsonResponse({ error: "Server config missing" }, 500);

        // 決まった時刻の実行（1日2回）では、今日（日本時間）の動画がもうあれば作らない
        if (new URL(request.url).searchParams.get("onlyIfNoneToday")) {
          const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
          jst.setUTCHours(0, 0, 0, 0);
          const todayStart = new Date(jst.getTime() - 9 * 60 * 60 * 1000).toISOString();
          const { count } = await supabase
            .from("tiktok_videos")
            .select("id", { count: "exact", head: true })
            .in("status", ["rendering", "ready", "posted"])
            .neq("theme", "ad")
            .gte("created_at", todayStart);
          if ((count ?? 0) > 0) return jsonResponse({ skipped: true });
        }

        // 広告：決まった台本で、ナレーターと面接官の声だけ作る
        const params = new URL(request.url).searchParams;
        if (params.get("format") === "ad") {
          try {
            const script = adScript(
              params.get("platform") === "instagram" ? "instagram" : "tiktok",
            );
            // 広告は面接官の声をはっきり・自然な速さに（毎日の動画のように速くしない）
            const audio = await speakLines(script.lines, undefined, { clearInterviewer: true });
            const { data: row, error } = await supabase
              .from("tiktok_videos")
              .insert({
                theme: script.theme,
                title: script.title,
                caption: script.caption,
                script: script as never,
                status: "rendering",
                platform: script.platform,
              })
              .select("id")
              .single();
            if (error || !row) throw error ?? new Error("insert failed");
            return jsonResponse({
              id: row.id,
              ...script,
              audio,
              sampleRate: STUDIO_SAMPLE_RATE,
              tempos: script.lines.map((l) => lineTempo(l.speaker)),
              interviewerRate: 1,
            });
          } catch (e) {
            console.error("[studio/job ad]", e);
            return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500);
          }
        }

        // これまでの動画（テーマ・タイトル・再生数）から、伸びたものを真似し、続けて同じテーマにしない
        const { data: history } = await supabase
          .from("tiktok_videos")
          .select("theme, title, views, likes")
          .neq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(40);
        // 型：指定がなければ、毎日の型からランダムに選ぶ（前の寸劇の型は writeScript に残している）
        const asked = params.get("format");
        const format =
          DAILY_FORMATS.find((f) => f === asked) ??
          DAILY_FORMATS[Math.floor(Math.random() * DAILY_FORMATS.length)];
        if (format === "ranking") {
          try {
            // ランキング型：面接AIを出さない話題。タイトルとランキングはナレーター、書き込みは別の声で早口に
            const script = await writeRankingScript(history ?? []);
            const audio = await speakLines(
              script.lines,
              script.roles.map((r) => (r === "comment" ? RANKING_COMMENT_STYLE : null)),
            );
            const { data: row, error } = await supabase
              .from("tiktok_videos")
              .insert({
                theme: script.theme,
                title: script.title.join(""),
                caption: script.caption,
                script: script as never,
                status: "rendering",
              })
              .select("id")
              .single();
            if (error || !row) throw error ?? new Error("insert failed");
            return jsonResponse({
              id: row.id,
              ...script,
              audio,
              sampleRate: STUDIO_SAMPLE_RATE,
              tempos: script.lines.map((l) => lineTempo(l.speaker)),
              interviewerRate: 1,
            });
          } catch (e) {
            console.error("[studio/job ranking]", e);
            return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500);
          }
        }
        try {
          // 言い換え型（◯◯と聞かれた時の最高な答え方）
          const script = await writeRewriteScript(history ?? []);
          const audio = await speakLines(
            script.lines,
            script.roles.map((r) =>
              r === "ng"
                ? "日本の面接で、本音をそのまま言ってしまう受験者。少し気まずそうに、でも自然にスラスラ話す。"
                : r === "ok"
                  ? "日本の面接で、自信を持ってはきはき、よどみなく自然に話す受験者。少し速めのテンポで。"
                  : null,
            ),
            // 面接官はアプリの面接と同じ、はっきりした声（速さは下の tempos で1.5倍）
            { clearInterviewer: true },
          );
          const { data: row, error } = await supabase
            .from("tiktok_videos")
            .insert({
              theme: script.theme,
              title: script.title,
              caption: script.caption,
              script: script as never,
              status: "rendering",
            })
            .select("id")
            .single();
          if (error || !row) throw error ?? new Error("insert failed");
          return jsonResponse({
            id: row.id,
            ...script,
            audio,
            sampleRate: STUDIO_SAMPLE_RATE,
            // 音の高さを変えずに速くする倍率（撮影側の ffmpeg の atempo と、画面の時刻表の両方で使う）
            tempos: script.lines.map((l) => lineTempo(l.speaker)),
            interviewerRate: 1,
          });
        } catch (e) {
          console.error("[studio/job]", e);
          return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500);
        }
      },
    },
  },
});
