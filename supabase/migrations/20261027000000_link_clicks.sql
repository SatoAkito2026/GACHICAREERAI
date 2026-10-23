-- TikTok などのプロフィールに貼るリンク（/tiktok）が押された回数。管理画面で見る
create table if not exists public.link_clicks (
  id bigserial primary key,
  source text not null,
  created_at timestamptz not null default now()
);
create index if not exists link_clicks_source_created_idx on public.link_clicks (source, created_at);
alter table public.link_clicks enable row level security;
