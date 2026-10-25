-- ポスポスのモニター募集（akitogroup.jp/posupos-monitor のフォーム）
-- 申し込みは会社ホームページの Worker が service role で入れる。契約が切れる前のお知らせも Worker の Cron が送る
create table if not exists public.posupos_monitors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  shop_name text not null,
  shop_type text,
  stores text,
  prefecture text,
  name text not null,
  email text not null,
  tel text,
  current_pos text,
  contract_end date,            -- 今のレジの契約が切れる月（その月の1日）。わからない・契約なしは null
  contract_note text,           -- 「わからない」「契約なし」など
  remind_ok boolean not null default false,  -- 契約が切れる前に案内してよい（本人の同意）
  message text,
  status text not null default 'new',        -- new / contacted / trial / customer / declined
  reminded_at timestamptz,
  stopped_at timestamptz,                    -- 配信停止
  stop_token uuid not null default gen_random_uuid()
);
create index if not exists posupos_monitors_remind_idx on public.posupos_monitors (contract_end) where remind_ok and stopped_at is null and reminded_at is null;
alter table public.posupos_monitors enable row level security;
-- 画面から直接は読めない（service role だけ）
