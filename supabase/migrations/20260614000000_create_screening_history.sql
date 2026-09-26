-- Screening history: one row per screening run (pro-only feature)
CREATE TABLE public.screening_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  job_type text,
  required_conditions jsonb,
  preferred_conditions jsonb,
  ideal_person jsonb,
  must_have_conditions text,
  highly_valued_experience text,
  avoid_personality text,
  expected_outcome text,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_score integer,
  candidate_count integer
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.screening_history TO authenticated;
GRANT ALL ON public.screening_history TO service_role;

ALTER TABLE public.screening_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own screening history"
  ON public.screening_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own screening history"
  ON public.screening_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own screening history"
  ON public.screening_history FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_screening_history_user_created
  ON public.screening_history (user_id, created_at DESC);
