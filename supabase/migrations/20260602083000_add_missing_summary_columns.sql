-- Add missing summary persistence columns introduced by recent interview evaluation updates.
ALTER TABLE public.interview_summaries
  ADD COLUMN IF NOT EXISTS consistency_score integer,
  ADD COLUMN IF NOT EXISTS consistency_level text,
  ADD COLUMN IF NOT EXISTS inconsistencies text[],
  ADD COLUMN IF NOT EXISTS company_fit_score integer,
  ADD COLUMN IF NOT EXISTS company_fit_comment text;
