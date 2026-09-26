-- Add candidate_traits and past_activities columns to interview_summaries
ALTER TABLE interview_summaries
  ADD COLUMN IF NOT EXISTS candidate_traits TEXT,
  ADD COLUMN IF NOT EXISTS past_activities TEXT;
