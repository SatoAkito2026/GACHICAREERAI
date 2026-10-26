-- 営業ロープレの資料：社内だけの情報（手数料・成果報酬・利益など）を AI で取り除いたかどうか。
-- 確かめ終わった資料（screened = true）だけをロープレの AI に渡す。今ある資料は false になり、毎時の Cron で確かめ直す
alter table public.sales_materials
  add column if not exists screened boolean not null default false,
  -- 取り除いた箇所の数（-1：社内の情報だけの資料なので使わない）
  add column if not exists redacted integer not null default 0;
