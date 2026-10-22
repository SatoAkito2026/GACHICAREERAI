-- 企業は面接の結果ごとにコインで買う（同じ人でも結果ごとに別の値段・別の購入）
-- interview_id が空の行は「その人の結果をすべて見られる」（これまでの購入・求人への応募）
alter table public.profile_unlocks
  add column if not exists interview_id uuid;

alter table public.profile_unlocks
  drop constraint if exists profile_unlocks_company_user_id_candidate_user_id_key;

create unique index if not exists profile_unlocks_person_uidx
  on public.profile_unlocks (company_user_id, candidate_user_id)
  where interview_id is null;
create unique index if not exists profile_unlocks_interview_uidx
  on public.profile_unlocks (company_user_id, interview_id)
  where interview_id is not null;

drop function if exists public.spend_coins_for_unlock(uuid, uuid, integer, numeric);

-- コインで結果を見る（1回の処理で：コインを減らす → 閲覧権を記録 → 本人にポイント）
create or replace function public.spend_coins_for_unlock(
  p_company uuid,
  p_candidate uuid,
  p_interview uuid,
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
  perform pg_advisory_xact_lock(hashtext('unlock:' || p_company::text));
  if exists (
    select 1 from profile_unlocks
    where company_user_id = p_company
      and candidate_user_id = p_candidate
      and (interview_id is null or interview_id = p_interview)
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

  insert into profile_unlocks (company_user_id, candidate_user_id, interview_id, amount, coins)
  values (p_company, p_candidate, p_interview, round(v_yen)::integer, p_coins)
  returning id into v_unlock;

  v_points := floor(v_yen * p_share_rate)::integer;
  if v_points > 0 then
    insert into point_ledger (user_id, points, reason, ref_id)
    values (p_candidate, v_points, 'unlock_share', v_unlock::text);
  end if;

  return query select v_unlock, round(v_yen)::integer, v_points;
end;
$$;

revoke all on function public.spend_coins_for_unlock(uuid, uuid, uuid, integer, numeric) from public, anon, authenticated;
grant execute on function public.spend_coins_for_unlock(uuid, uuid, uuid, integer, numeric) to service_role;
