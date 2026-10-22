-- 友だち紹介：紹介した人・された人の両方に、練習の追加回数（ボーナス）をあげる
-- ボーナスはお金ではなく練習回数だけ（現金・ポイントは渡さない）

-- 紹介コード（1人1つ）
create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

-- 紹介の記録。紹介された人が最初の練習を終えたら rewarded にしてボーナスを渡す
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'rewarded')),
  created_at timestamptz not null default now(),
  rewarded_at timestamptz
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);

-- 練習のボーナス回数の出入り（+ はもらった、- は使った）。残りは合計
create table if not exists public.practice_bonus_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  reason text not null check (reason in ('referral_inviter', 'referral_invited', 'used', 'adjust')),
  ref_id text,
  created_at timestamptz not null default now()
);
create index if not exists practice_bonus_ledger_user_idx on public.practice_bonus_ledger (user_id);

-- 書き込みはサーバー（service_role）だけ。本人は自分の分を読める
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.practice_bonus_ledger enable row level security;
drop policy if exists "Users view own referral code" on public.referral_codes;
create policy "Users view own referral code" on public.referral_codes
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users view own bonus" on public.practice_bonus_ledger;
create policy "Users view own bonus" on public.practice_bonus_ledger
  for select to authenticated using (user_id = auth.uid());
grant select on public.referral_codes, public.practice_bonus_ledger to authenticated;
grant all on public.referral_codes, public.referrals, public.practice_bonus_ledger to service_role;
