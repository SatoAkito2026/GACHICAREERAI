-- 企業のコイン（まとめ買い・有効期限6か月）と、買われた本人のポイント
--
-- コイン：企業が Stripe で買う。人材の詳しい評価を見るときに使う。古い（期限が近い）ものから使う。
--   有効期限を6か月以内にしているので、資金決済法の前払式支払手段の届出の対象外。
-- ポイント：企業がコインで人材を見ると、使われたコインの円換算の1/4が本人に入る（1ポイント＝1円）。
--   今はライト・プロの月額の支払いにだけ使える（現金・ギフトカードとの交換はしない）。

create table if not exists public.coin_lots (
  id uuid primary key default gen_random_uuid(),
  company_user_id uuid not null references auth.users(id) on delete cascade,
  coins_total integer not null check (coins_total > 0),
  coins_remaining integer not null check (coins_remaining >= 0),
  amount_jpy integer not null check (amount_jpy >= 0),
  stripe_payment_intent_id text unique,
  purchased_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists coin_lots_company_idx on public.coin_lots (company_user_id, expires_at);

-- 人材を見るのに使ったコイン（amount は円換算）
alter table public.profile_unlocks
  add column if not exists coins integer not null default 0;

create table if not exists public.point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  points integer not null,
  reason text not null check (reason in ('unlock_share', 'plan_payment', 'refund', 'adjust')),
  ref_id text,
  created_at timestamptz not null default now()
);
create index if not exists point_ledger_user_idx on public.point_ledger (user_id, created_at desc);

-- 書き込みはサーバーのAPI経由（service role）。ブラウザからは自分の行の閲覧だけ。
alter table public.coin_lots enable row level security;
alter table public.point_ledger enable row level security;
drop policy if exists "Companies view own coin lots" on public.coin_lots;
create policy "Companies view own coin lots" on public.coin_lots
  for select using (auth.uid() = company_user_id);
drop policy if exists "Users view own points" on public.point_ledger;
create policy "Users view own points" on public.point_ledger
  for select using (auth.uid() = user_id);
grant select on public.coin_lots, public.point_ledger to authenticated;
grant all on public.coin_lots, public.point_ledger to service_role;

-- コインで人材を見る（1回の処理で：コインを減らす → 閲覧権を記録 → 本人にポイント）
create or replace function public.spend_coins_for_unlock(
  p_company uuid,
  p_candidate uuid,
  p_coins integer,
  p_share_rate numeric default 0.25
)
returns table (unlock_id uuid, amount_jpy integer, points integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_need integer := p_coins;
  v_yen numeric := 0;
  v_take integer;
  v_unlock uuid;
  v_points integer;
  r record;
begin
  if p_coins <= 0 then
    raise exception 'invalid_coins';
  end if;
  if exists (
    select 1 from profile_unlocks
    where company_user_id = p_company and candidate_user_id = p_candidate
  ) then
    raise exception 'already_unlocked';
  end if;

  for r in
    select id, coins_remaining, coins_total, coin_lots.amount_jpy as lot_yen
    from coin_lots
    where company_user_id = p_company and expires_at > now() and coins_remaining > 0
    order by expires_at asc
    for update
  loop
    exit when v_need <= 0;
    v_take := least(v_need, r.coins_remaining);
    update coin_lots set coins_remaining = coins_remaining - v_take where id = r.id;
    v_yen := v_yen + v_take::numeric * r.lot_yen / r.coins_total;
    v_need := v_need - v_take;
  end loop;

  if v_need > 0 then
    raise exception 'insufficient_coins';
  end if;

  insert into profile_unlocks (company_user_id, candidate_user_id, amount, coins)
  values (p_company, p_candidate, round(v_yen)::integer, p_coins)
  returning id into v_unlock;

  v_points := floor(v_yen * p_share_rate)::integer;
  if v_points > 0 then
    insert into point_ledger (user_id, points, reason, ref_id)
    values (p_candidate, v_points, 'unlock_share', v_unlock::text);
  end if;

  return query select v_unlock, round(v_yen)::integer, v_points;
end;
$$;

-- ポイントを使う（残高が足りなければエラー。同じ人が同時に使っても二重に減らない）
create or replace function public.spend_points(p_user uuid, p_points integer, p_reason text, p_ref text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_points <= 0 then
    raise exception 'invalid_points';
  end if;
  perform pg_advisory_xact_lock(hashtext('points:' || p_user::text));
  select coalesce(sum(points), 0) into v_balance from point_ledger where user_id = p_user;
  if v_balance < p_points then
    raise exception 'insufficient_points';
  end if;
  insert into point_ledger (user_id, points, reason, ref_id)
  values (p_user, -p_points, p_reason, p_ref);
  return v_balance - p_points;
end;
$$;

revoke all on function public.spend_coins_for_unlock(uuid, uuid, integer, numeric) from public, anon, authenticated;
revoke all on function public.spend_points(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.spend_coins_for_unlock(uuid, uuid, integer, numeric) to service_role;
grant execute on function public.spend_points(uuid, integer, text, text) to service_role;
