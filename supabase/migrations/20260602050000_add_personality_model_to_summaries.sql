-- Store the candidate's 4-axis personality model derived during the interview.
ALTER TABLE public.interview_summaries
  ADD COLUMN IF NOT EXISTS personality_model jsonb;
