-- 人材プロフィール公開・企業のチケット購入・面談申し込み・メッセージ
-- 既存テーブルは変更しない（追加のみ）。

-- ユーザーの公開プロフィール（初期値は非公開）
create table if not exists public.candidate_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  is_public boolean not null default false,
  display_name text,
  headline text,
  career_stage text,
  desired_jobs text,
  desired_locations text,
  self_pr text,
  record_practice boolean not null default false,
  show_recording boolean not null default false,
  consented_at timestamptz,
  summary jsonb,
  summary_stale boolean not null default true,
  summary_updated_at timestamptz,
  interview_count integer not null default 0,
  average_score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists candidate_profiles_public_idx
  on public.candidate_profiles (is_public, summary_updated_at desc);

-- 企業がチケットで閲覧権を得た記録（企業×ユーザーで1回）
create table if not exists public.profile_unlocks (
  id uuid primary key default gen_random_uuid(),
  company_user_id uuid not null references auth.users(id) on delete cascade,
  candidate_user_id uuid not null references auth.users(id) on delete cascade,
  stripe_payment_intent_id text unique,
  amount integer not null default 0,
  created_at timestamptz not null default now(),
  unique (company_user_id, candidate_user_id)
);

create index if not exists profile_unlocks_candidate_idx on public.profile_unlocks (candidate_user_id);

-- 面談の申し込み（ユーザーが承諾 / 辞退する）
create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  company_user_id uuid not null references auth.users(id) on delete cascade,
  candidate_user_id uuid not null references auth.users(id) on delete cascade,
  message text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (company_user_id, candidate_user_id)
);

create index if not exists contact_requests_candidate_idx on public.contact_requests (candidate_user_id, created_at desc);
create index if not exists contact_requests_company_idx on public.contact_requests (company_user_id, created_at desc);

-- 承諾後のメッセージ
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.contact_requests(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists contact_messages_request_idx on public.contact_messages (request_id, created_at);

-- 書き込みはすべてサーバーのAPI経由（service role）。ブラウザからは自分に関係する行の閲覧だけ許可する。
alter table public.candidate_profiles enable row level security;
alter table public.profile_unlocks enable row level security;
alter table public.contact_requests enable row level security;
alter table public.contact_messages enable row level security;

drop policy if exists "own candidate profile" on public.candidate_profiles;
create policy "own candidate profile" on public.candidate_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "own unlocks" on public.profile_unlocks;
create policy "own unlocks" on public.profile_unlocks
  for select using (auth.uid() = company_user_id or auth.uid() = candidate_user_id);

drop policy if exists "own contact requests" on public.contact_requests;
create policy "own contact requests" on public.contact_requests
  for select using (auth.uid() = company_user_id or auth.uid() = candidate_user_id);

drop policy if exists "own contact messages" on public.contact_messages;
create policy "own contact messages" on public.contact_messages
  for select using (
    exists (
      select 1 from public.contact_requests r
      where r.id = request_id
        and (auth.uid() = r.company_user_id or auth.uid() = r.candidate_user_id)
    )
  );
