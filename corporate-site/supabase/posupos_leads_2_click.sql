-- ポスポス用の Supabase プロジェクト（pospos・東京）で実行する
-- 一斉送信のメールのリンクを押した日と、フォローのメールを送った日
alter table public.posupos_leads add column if not exists clicked_at timestamptz;
alter table public.posupos_leads add column if not exists followup_at timestamptz;
alter table public.posupos_leads add column if not exists osm_id text;   -- OpenStreetMap から集めたときの元のID
