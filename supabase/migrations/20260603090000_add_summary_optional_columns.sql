-- Ensure interview_summaries has the newer evaluation columns.
ALTER TABLE public.interview_summaries
  ADD COLUMN IF NOT EXISTS personality_model JSONB,
  ADD COLUMN IF NOT EXISTS company_fit_score INTEGER,
  ADD COLUMN IF NOT EXISTS company_fit_comment TEXT,
  ADD COLUMN IF NOT EXISTS consistency_score INTEGER,
  ADD COLUMN IF NOT EXISTS consistency_level TEXT,
  ADD COLUMN IF NOT EXISTS inconsistencies TEXT[];
