-- Add columns referenced by InterviewCoach/screening company-info select that were missing.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS competitors text,
  ADD COLUMN IF NOT EXISTS interview_focus text;
