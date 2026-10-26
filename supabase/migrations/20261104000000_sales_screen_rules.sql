-- 営業ロープレの資料：会社ごとの手数料の見分けルール。
-- keep：お客さんの費用として必ず残す言葉（例：契約事務手数料）／remove：社内の情報として必ず消す言葉（例：開通手数料・獲得単価）
alter table public.companies
  add column if not exists sales_keep_terms text[] not null default '{}',
  add column if not exists sales_remove_terms text[] not null default '{}';
