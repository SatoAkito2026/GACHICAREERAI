-- 履歴の保存単位を「候補者1人＝1レコード」に変更
-- 旧テーブル screening_history は退避（リネーム）して過去データを保持する

ALTER TABLE IF EXISTS public.screening_history RENAME TO screening_history_legacy;

CREATE TABLE public.screening_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  job_type text,
  required_conditions jsonb,
  preferred_conditions jsonb,
  ideal_person jsonb,
  must_have_conditions text,
  highly_valued_experience text,
  avoid_personality text,
  expected_outcome text,
  candidate_name text,
  file_name text,
  resume_excerpt text,
  rank text,
  score integer,
  score_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  concerns jsonb NOT NULL DEFAULT '[]'::jsonb,
  check_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  positive_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  negative_evidence jsonb NOT NULL DEFAULT '[]'::jsonb
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.screening_candidates TO authenticated;
GRANT ALL ON public.screening_candidates TO service_role;

ALTER TABLE public.screening_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own screening candidates"
  ON public.screening_candidates FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own screening candidates"
  ON public.screening_candidates FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own screening candidates"
  ON public.screening_candidates FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_screening_candidates_user_created
  ON public.screening_candidates (user_id, created_at DESC);

CREATE INDEX idx_screening_candidates_batch
  ON public.screening_candidates (batch_id);
