-- TikTok 動画の再生数・いいね（管理画面で入れる）。次の台本づくりで、伸びたテーマ・タイトルを参考にする
alter table public.tiktok_videos
  add column if not exists views integer,
  add column if not exists likes integer;
