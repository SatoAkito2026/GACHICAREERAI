-- 提携先（POSPOS）のお店の、アルバイト・キャストの応募者向け AI 一次面接。
-- ガチキャリAI の練習・企業の AI 面接・人材プロフィールとは完全に別の表にする（つながりは持たない）。
-- 読み書きはサーバー（service role）だけ。RLS を有効にし、ブラウザからは直接読めない。
create table if not exists public.partner_interviews (
  id uuid primary key default gen_random_uuid(),
  -- 提携先（今は pospos だけ）
  partner text not null default 'pospos' check (partner in ('pospos')),
  -- 提携先のお店の id。どの入口も必ずこれで絞り込む
  store_id uuid not null,
  store_name text not null check (char_length(store_name) <= 60),
  business_type text not null check (business_type in ('night', 'restaurant')),
  job_type text not null check (
    job_type in ('cast', 'host', 'staff', 'driver', 'hall', 'kitchen', 'manager', 'other')
  ),
  custom_questions jsonb not null default '[]'::jsonb,
  candidate_name text check (candidate_name is null or char_length(candidate_name) <= 30),
  -- 面接 URL の合言葉（推測できない長い文字）
  token text not null unique,
  -- waiting: まだ開いていない / in_progress: 受けている途中 / done: 終わった / expired: 期限切れ・途中でやめた
  status text not null default 'waiting'
    check (status in ('waiting', 'in_progress', 'done', 'expired')),
  -- 応募者が答えた回数（0 のうちは、はじめからやり直せる）
  answered_count integer not null default 0,
  -- 会話（[{ role: "interviewer" | "candidate", text }]）
  transcript jsonb not null default '[]'::jsonb,
  -- 雰囲気のまとめ（{ impression, notes, availability }。点数はつけない）
  summary jsonb,
  -- Storage（partner-interviews バケット）の中の置き場所
  photo_paths text[] not null default '{}',
  video_path text,
  consent_agreed_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null,
  -- お店が消した日時（行は残して月の作成数に数える。中身はすべて消す）
  deleted_at timestamptz,
  -- 90日たって中身を自動で消した日時
  purged_at timestamptz
);

create index if not exists partner_interviews_store_idx
  on public.partner_interviews (partner, store_id, created_at desc);
create index if not exists partner_interviews_created_idx
  on public.partner_interviews (created_at);

alter table public.partner_interviews enable row level security;
revoke all on public.partner_interviews from anon, authenticated;
grant all on public.partner_interviews to service_role;

-- 録画・顔の写真の置き場所（非公開。お店には期限つきの URL だけを渡す）
insert into storage.buckets (id, name, public, file_size_limit)
values ('partner-interviews', 'partner-interviews', false, 52428800)
on conflict (id) do nothing;
