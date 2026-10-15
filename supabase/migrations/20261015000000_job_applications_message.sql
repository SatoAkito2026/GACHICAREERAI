-- 求人への応募：応募するときのひとことを保存する
alter table public.job_applications
  add column if not exists message text not null default '';
