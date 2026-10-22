-- TikTok 用の動画（毎日自動で作る「ガチキャリAIを使ってみた」動画）
create table if not exists public.tiktok_videos (
  id uuid primary key default gen_random_uuid(),
  theme text not null,
  title text not null,
  caption text not null default '',
  script jsonb not null,
  status text not null default 'rendering' check (status in ('rendering', 'ready', 'posted', 'failed')),
  storage_path text,
  size_bytes integer,
  duration_sec numeric,
  tiktok_publish_id text,
  error text,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);
create index if not exists tiktok_videos_created_idx on public.tiktok_videos (created_at desc);

-- 読み書きはサーバー（service_role）だけ
alter table public.tiktok_videos enable row level security;
grant all on public.tiktok_videos to service_role;

-- 動画の置き場所（非公開。管理画面からは期限つきのURLで見る）
insert into storage.buckets (id, name, public, file_size_limit)
values ('tiktok-videos', 'tiktok-videos', false, 104857600)
on conflict (id) do nothing;
