-- ポスポス用の Supabase プロジェクト（pospos・東京）で実行する。ガチキャリAIのプロジェクトとは別
-- モニター募集の一斉送信の送り先。tools/leads_import.py で CSV から入れて、会社ホームページの Worker の Cron が毎朝少しずつ送る
-- 送ってよいのは、お店が自分のホームページなどで仕事用として公開しているアドレスだけ（特定電子メール法）。source_url にその場所を残す
create table if not exists public.posupos_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  shop_name text not null,
  shop_type text,
  prefecture text,
  email text not null unique,          -- 小文字にそろえて入れる
  source_url text,                     -- アドレスが公開されていたページ
  note text,
  status text not null default 'new',  -- new / sent / failed / stopped / applied
  sent_at timestamptz,
  error text,
  stopped_at timestamptz,              -- 配信停止
  stop_token uuid not null default gen_random_uuid()
);
create index if not exists posupos_leads_new_idx on public.posupos_leads (created_at) where status = 'new' and stopped_at is null;
alter table public.posupos_leads enable row level security;
-- 画面から直接は読めない（service role だけ）
