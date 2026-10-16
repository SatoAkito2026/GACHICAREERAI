-- 学校・塾モード：生徒と学校をつなぐ（生徒が招待コードを入力して参加する）
alter table public.companies
  add column if not exists join_code text unique;

create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.companies(id) on delete cascade,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  -- 学校に表示する名前（参加するときに生徒が入力する）
  display_name text not null default '',
  created_at timestamptz not null default now(),
  unique (school_id, student_user_id)
);

create index if not exists school_memberships_student_idx on public.school_memberships (student_user_id);

-- 書き込みはサーバーのAPI経由（service role）。ブラウザからは自分の参加情報の閲覧だけ許可する。
alter table public.school_memberships enable row level security;
drop policy if exists "Students view own memberships" on public.school_memberships;
create policy "Students view own memberships" on public.school_memberships
  for select using (auth.uid() = student_user_id);
grant select on public.school_memberships to authenticated;
grant all on public.school_memberships to service_role;
