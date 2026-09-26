ALTER TABLE public.interviews
ADD COLUMN IF NOT EXISTS screening_candidate_id UUID;