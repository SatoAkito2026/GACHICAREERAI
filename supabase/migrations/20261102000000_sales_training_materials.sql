-- 営業ロープレの資料に「営業の教え・考え方」（training）を足す。
-- 会社が教えている営業の考え方・技（ピッチ・5インパルス・羊の法則など）。先生（助言・評価）のいちばん大事な基準にする
alter table public.sales_materials drop constraint if exists sales_materials_kind_check;
alter table public.sales_materials
  add constraint sales_materials_kind_check
  check (kind in ('script', 'training', 'product', 'minutes', 'other'));
