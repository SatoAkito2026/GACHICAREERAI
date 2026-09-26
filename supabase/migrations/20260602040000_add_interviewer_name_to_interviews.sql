-- Add interviewer_name column to interviews (idempotent)
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS interviewer_name text;
