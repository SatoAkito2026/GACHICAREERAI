-- 改修⑤：各候補者の評価で実際に参照した会社情報の項目を保存する
ALTER TABLE public.screening_candidates
  ADD COLUMN IF NOT EXISTS company_info_used jsonb NOT NULL DEFAULT '[]'::jsonb;
