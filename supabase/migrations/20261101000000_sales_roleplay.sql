-- 営業ロープレ（企業の社員研修）：社員が AI のお客さん役を相手に、訪問販売・反響営業・テレアポ・法人営業を練習する。
-- 社員は自分のアカウントで会員登録し、会社の招待コードを入れて参加する。会社は社員の結果を見られる。
-- 面接の練習・人材プロフィールとは別物（7つの力・人材検索にはつながない）。読み書きはサーバー（service role）だけ。

-- 会社の招待コード（学校の join_code とは別。学校の参加に使えないよう分ける）
alter table public.companies
  add column if not exists sales_join_code text unique;

-- 社員と会社のつながり
create table if not exists public.sales_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 会社に表示する名前（参加するときに社員が入力する）
  display_name text not null default '' check (char_length(display_name) <= 50),
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index if not exists sales_memberships_user_idx on public.sales_memberships (user_id);

-- 会社が覚えさせる資料（商品の説明・トーク例・商談の議事録など。文字だけを残す）
create table if not exists public.sales_materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- script: トークスクリプト（先生はこの流れを基準に助言・評価する） / product: 商品・料金 / minutes: 商談の議事録 / other: そのほか
  kind text not null default 'other' check (kind in ('script', 'product', 'minutes', 'other')),
  -- どの場面で使うか（all: すべて）
  scenario text not null default 'all' check (scenario in ('all', 'door', 'inbound', 'teleapo', 'b2b')),
  title text not null check (char_length(title) <= 80),
  content text not null check (char_length(content) <= 20000),
  created_at timestamptz not null default now()
);
create index if not exists sales_materials_company_idx on public.sales_materials (company_id, created_at desc);

-- ロープレ1回分
create table if not exists public.sales_roleplays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- door: 訪問販売 / inbound: 反響営業 / teleapo: テレアポ / b2b: 法人営業（商談）
  scenario text not null check (scenario in ('door', 'inbound', 'teleapo', 'b2b')),
  -- easy / normal / hard（お客さんの手ごわさ）
  difficulty text not null default 'normal' check (difficulty in ('easy', 'normal', 'hard')),
  -- coach: まずいところで止めて助言する / full: 最後までやる
  coach_mode text not null default 'coach' check (coach_mode in ('coach', 'full')),
  -- AI が演じるお客さんの設定（名前・立場・状況。始めるときに決める）
  persona jsonb not null default '{}'::jsonb,
  -- [{ role: "seller" | "customer" | "coach", text }]
  transcript jsonb not null default '[]'::jsonb,
  -- 営業用の評価（点数・根拠・よかった点・直す点・言い換え例）
  evaluation jsonb,
  status text not null default 'in_progress' check (status in ('in_progress', 'done', 'abandoned')),
  -- 結果（アポ・成約など。お客さんが最後にどうしたか）
  outcome text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists sales_roleplays_company_idx on public.sales_roleplays (company_id, started_at desc);
create index if not exists sales_roleplays_user_idx on public.sales_roleplays (user_id, started_at desc);

alter table public.sales_memberships enable row level security;
alter table public.sales_materials enable row level security;
alter table public.sales_roleplays enable row level security;
revoke all on public.sales_memberships, public.sales_materials, public.sales_roleplays from anon, authenticated;
grant all on public.sales_memberships, public.sales_materials, public.sales_roleplays to service_role;

-- 営業の知識（場面ごと）。週に1回、AI がネットで調べて更新する（毎時の Cron。全社共通、会社の資料とは別）
create table if not exists public.sales_knowledge (
  scenario text primary key check (scenario in ('door', 'inbound', 'teleapo', 'b2b')),
  content text not null check (char_length(content) <= 8000),
  sources jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.sales_knowledge enable row level security;
revoke all on public.sales_knowledge from anon, authenticated;
grant all on public.sales_knowledge to service_role;
