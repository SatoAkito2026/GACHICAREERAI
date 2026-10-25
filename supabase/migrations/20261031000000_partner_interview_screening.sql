-- 提携先（POSPOS）の AI 一次面接：短い答えで済む質問は画面で選んでもらう（選ぶ質問）。その答えを残す列。
-- 中身は [{ "key": "days", "label": "週に何日くらい入れますか", "value": "3日" }, …]（いくつでも選ぶ質問は「、」でつなぐ）
alter table public.partner_interviews
  add column if not exists screening jsonb not null default '[]'::jsonb;
