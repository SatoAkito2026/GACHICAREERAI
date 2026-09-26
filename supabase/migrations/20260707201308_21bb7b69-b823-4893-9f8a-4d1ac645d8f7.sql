ALTER TABLE public.interview_invitations
  ADD COLUMN IF NOT EXISTS practice_max_minutes integer,
  ADD COLUMN IF NOT EXISTS practice_depth text,
  ADD COLUMN IF NOT EXISTS uploaded_resume_text text;

ALTER TABLE public.user_career_profiles
  ADD COLUMN IF NOT EXISTS practice_preferences jsonb;