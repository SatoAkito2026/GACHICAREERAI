/**
 * 学校・塾モード：生徒の練習管理
 * 生徒が学校の招待コードを入力すると参加でき、先生はその生徒の練習の結果を見られる。
 * 生徒はいつでも抜けられる（抜けると先生からは見えなくなる）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** 先生（学校アカウント）なら、その学校の id と名前を返す */
export async function getSchool(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ id: string; name: string; joinCode: string | null } | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_mode, company_id")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.user_mode !== "business_school" || !profile.company_id) return null;
  const { data: school } = await supabase
    .from("companies")
    .select("id, name, join_code")
    .eq("id", profile.company_id)
    .maybeSingle();
  return school ? { id: school.id, name: school.name, joinCode: school.join_code } : null;
}

// 読み間違えやすい文字（0/O, 1/I/L）は使わない
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export async function issueJoinCode(supabase: SupabaseClient, schoolId: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
    const { error } = await supabase
      .from("companies")
      .update({ join_code: code })
      .eq("id", schoolId);
    if (!error) return code;
  }
  throw new Error("could not issue join code");
}

export type PracticeRow = {
  id: string;
  created_at: string;
  mode: string;
  job_type: string | null;
  feedback: Record<string, any> | null;
};

/** 生徒の練習（個人・受験生の両方）を新しい順に返す */
export async function loadPractice(
  supabase: SupabaseClient,
  studentIds: string[],
  limit = 2000,
): Promise<(PracticeRow & { user_id: string })[]> {
  if (studentIds.length === 0) return [];
  const { data: interviews } = await supabase
    .from("interviews")
    .select("id, user_id, created_at, mode, job_type, impression")
    .in("user_id", studentIds)
    .in("mode", ["individual", "student"])
    .neq("impression", "途中退出")
    .order("created_at", { ascending: false })
    .limit(limit);
  const list = interviews ?? [];
  const ids = list.map((i) => i.id);
  const feedback = new Map<string, Record<string, any> | null>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from("interview_summaries")
      .select("interview_id, practice_feedback")
      .in("interview_id", ids.slice(i, i + 200));
    for (const s of data ?? []) feedback.set(s.interview_id, s.practice_feedback as any);
  }
  return list.map((i) => ({
    id: i.id,
    user_id: i.user_id,
    created_at: i.created_at,
    mode: i.mode,
    job_type: i.job_type,
    feedback: feedback.get(i.id) ?? null,
  }));
}
