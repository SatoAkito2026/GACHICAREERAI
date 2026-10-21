-- 企業に見せる面接の結果を本人が選ぶ（プランごとに上限あり：無料5・ライト10・プロ上限なし）
alter table public.interviews
  add column if not exists shown_to_companies boolean not null default false;

create index if not exists interviews_shown_to_companies_idx
  on public.interviews (user_id)
  where shown_to_companies;

-- これまでは新しい面接から自動で企業に見えていたので、各ユーザーの新しい5件を公開にしておく
update public.interviews i
set shown_to_companies = true
from (
  select id,
         row_number() over (partition by user_id order by created_at desc) as rn
  from public.interviews
  where mode = 'individual'
    and coalesce(impression, '') <> '途中退出'
) r
where i.id = r.id
  and r.rn <= 5;
