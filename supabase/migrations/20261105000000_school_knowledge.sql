-- 受験モード：志望校について AI がウェブで調べた内容（特色・教育方針・求める生徒像・面接の形式とよく聞かれること）。
-- 学校（＋学部・学科）ごとに1行。ほかの生徒も使い回す。読み書きはサーバー（service role）だけ
create table if not exists public.school_knowledge (
  -- 学校名と学部をそろえた文字（src/lib/school-research.ts の schoolKey）
  key text primary key,
  school_name text not null check (char_length(school_name) <= 100),
  faculty text not null default '' check (char_length(faculty) <= 100),
  school_type text not null default 'other',
  -- 見つからなかった学校は false（30日は調べ直さない）
  found boolean not null default true,
  content text not null default '' check (char_length(content) <= 6000),
  sources jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.school_knowledge enable row level security;
revoke all on public.school_knowledge from anon, authenticated;
grant all on public.school_knowledge to service_role;
