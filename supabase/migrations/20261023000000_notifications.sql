-- アプリ内のお知らせ（ベル）と、スマホ・パソコンへのプッシュ通知の登録先
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text,
  auth text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- 読み書きはサーバー（service_role）だけ。本人は自分のお知らせを読める
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
drop policy if exists "Users view own notifications" on public.notifications;
create policy "Users view own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
grant select on public.notifications to authenticated;
grant all on public.notifications, public.push_subscriptions to service_role;
