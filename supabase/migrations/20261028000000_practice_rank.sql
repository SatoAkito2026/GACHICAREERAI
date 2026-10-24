-- 練習の点数が、練習した人の中で上位何%か（1人につき一番良い点数で比べる）
create or replace function public.practice_rank(p_mode text, p_score numeric)
returns table(total bigint, above bigint)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select i.user_id, max((s.practice_feedback->>'readiness_score')::numeric) as b
    from interview_summaries s
    join interviews i on i.id = s.interview_id
    where i.mode = p_mode
      and jsonb_typeof(s.practice_feedback->'readiness_score') = 'number'
    group by i.user_id
  )
  select count(*)::bigint, (count(*) filter (where b > p_score))::bigint from best;
$$;
revoke execute on function public.practice_rank(text, numeric) from public, anon, authenticated;
