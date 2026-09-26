-- Add score columns to interview_summaries so the candidate ranking can read them.
ALTER TABLE public.interview_summaries
  ADD COLUMN IF NOT EXISTS overall_score integer,
  ADD COLUMN IF NOT EXISTS risk_score integer,
  ADD COLUMN IF NOT EXISTS risk_level text;
