-- 模擬面接ごとの設定（面接官のスタイル・職種・応募先・聞いてほしい質問など）。企業の人材検索で表示・絞り込みに使う
alter table public.interviews
  add column if not exists practice_settings jsonb;
