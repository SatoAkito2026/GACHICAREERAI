-- 動画の出し先（TikTok／Instagram）。管理画面でタブを分けて管理する
alter table public.tiktok_videos
  add column if not exists platform text not null default 'tiktok';
