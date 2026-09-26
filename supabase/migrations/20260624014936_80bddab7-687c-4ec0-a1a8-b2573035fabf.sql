-- ============================================================
-- Base tables (created first; existing migration files only ALTER these)
-- ============================================================

-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ---------- profiles ----------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',
  plan_expires_at timestamptz,
  period_interview_count integer NOT NULL DEFAULT 0,
  interview_count_this_month integer NOT NULL DEFAULT 0,
  screening_count_this_month integer NOT NULL DEFAULT 0,
  period_start_at timestamptz,
  stripe_subscription_id text,
  stripe_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- auto-create a profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- interviews ----------
CREATE TABLE public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_name text,
  job_type text,
  transfer_count integer,
  priorities text[],
  coach_personality text,
  mode text,
  impression text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interviews TO authenticated;
GRANT ALL ON public.interviews TO service_role;

ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own interviews"
  ON public.interviews FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own interviews"
  ON public.interviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own interviews"
  ON public.interviews FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own interviews"
  ON public.interviews FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_interviews_user_created
  ON public.interviews (user_id, created_at DESC);

-- ---------- interview_summaries ----------
CREATE TABLE public.interview_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL UNIQUE REFERENCES public.interviews(id) ON DELETE CASCADE,
  overview text,
  check_next text[],
  onboarding text,
  red_flags text,
  positives text,
  radar_scores jsonb,
  risk_factors text[],
  adoption_reasons text[],
  concerns text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_summaries TO authenticated;
GRANT ALL ON public.interview_summaries TO service_role;

ALTER TABLE public.interview_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view summaries of their interviews"
  ON public.interview_summaries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid()));
CREATE POLICY "Users can insert summaries of their interviews"
  ON public.interview_summaries FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid()));
CREATE POLICY "Users can update summaries of their interviews"
  ON public.interview_summaries FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid()));
CREATE POLICY "Users can delete summaries of their interviews"
  ON public.interview_summaries FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid()));

-- ---------- interview_turns ----------
CREATE TABLE public.interview_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  question text,
  memo text,
  analysis text,
  risk_tags text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_turns TO authenticated;
GRANT ALL ON public.interview_turns TO service_role;

ALTER TABLE public.interview_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view turns of their interviews"
  ON public.interview_turns FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid()));
CREATE POLICY "Users can insert turns of their interviews"
  ON public.interview_turns FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid()));
CREATE POLICY "Users can delete turns of their interviews"
  ON public.interview_turns FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.user_id = auth.uid()));

CREATE INDEX idx_interview_turns_interview
  ON public.interview_turns (interview_id, turn_number);

-- ============================================================
-- Existing migration files, applied in chronological order
-- ============================================================

-- 20260602025321_add_scores_to_interview_summaries
ALTER TABLE public.interview_summaries
  ADD COLUMN IF NOT EXISTS overall_score integer,
  ADD COLUMN IF NOT EXISTS risk_score integer,
  ADD COLUMN IF NOT EXISTS risk_level text;

-- 20260602030000_add_company_info_to_profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS company_number text,
  ADD COLUMN IF NOT EXISTS company_address text,
  ADD COLUMN IF NOT EXISTS founded_year text,
  ADD COLUMN IF NOT EXISTS employee_count text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS hiring_positions text,
  ADD COLUMN IF NOT EXISTS ideal_candidate text,
  ADD COLUMN IF NOT EXISTS company_culture text,
  ADD COLUMN IF NOT EXISTS salary_range text,
  ADD COLUMN IF NOT EXISTS remote_policy text,
  ADD COLUMN IF NOT EXISTS company_strengths text,
  ADD COLUMN IF NOT EXISTS competitive_advantage text,
  ADD COLUMN IF NOT EXISTS successful_hire_traits text,
  ADD COLUMN IF NOT EXISTS failed_hire_traits text,
  ADD COLUMN IF NOT EXISTS first_job_description text,
  ADD COLUMN IF NOT EXISTS business_description text;

-- 20260602040000_add_interviewer_name_to_interviews
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS interviewer_name text;

-- 20260602050000_add_personality_model_to_summaries
ALTER TABLE public.interview_summaries
  ADD COLUMN IF NOT EXISTS personality_model jsonb;

-- 20260602083000_add_missing_summary_columns
ALTER TABLE public.interview_summaries
  ADD COLUMN IF NOT EXISTS consistency_score integer,
  ADD COLUMN IF NOT EXISTS consistency_level text,
  ADD COLUMN IF NOT EXISTS inconsistencies text[],
  ADD COLUMN IF NOT EXISTS company_fit_score integer,
  ADD COLUMN IF NOT EXISTS company_fit_comment text;

-- 20260603090000_add_summary_optional_columns
ALTER TABLE public.interview_summaries
  ADD COLUMN IF NOT EXISTS personality_model JSONB,
  ADD COLUMN IF NOT EXISTS company_fit_score INTEGER,
  ADD COLUMN IF NOT EXISTS company_fit_comment TEXT,
  ADD COLUMN IF NOT EXISTS consistency_score INTEGER,
  ADD COLUMN IF NOT EXISTS consistency_level TEXT,
  ADD COLUMN IF NOT EXISTS inconsistencies TEXT[];

-- 20260610000000_add_candidate_traits_to_summaries
ALTER TABLE public.interview_summaries
  ADD COLUMN IF NOT EXISTS candidate_traits TEXT,
  ADD COLUMN IF NOT EXISTS past_activities TEXT;

-- 20260610000001_add_is_pre_check_to_turns
ALTER TABLE public.interview_turns
  ADD COLUMN IF NOT EXISTS is_pre_check BOOLEAN NOT NULL DEFAULT false;

-- 20260612000000_add_handover_to_summaries
ALTER TABLE public.interview_summaries
  ADD COLUMN IF NOT EXISTS handover TEXT;

-- 20260614000000_create_screening_history
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

-- 20260614010000_add_competitors_and_interview_focus_to_profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS competitors text,
  ADD COLUMN IF NOT EXISTS interview_focus text;

-- 20260614020000_screening_candidates_per_person
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

-- 20260614030000_add_company_info_used_to_screening_candidates
ALTER TABLE public.screening_candidates
  ADD COLUMN IF NOT EXISTS company_info_used jsonb NOT NULL DEFAULT '[]'::jsonb;