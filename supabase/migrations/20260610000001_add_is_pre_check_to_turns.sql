-- Add is_pre_check flag to interview_turns
-- This marks turns that were added by the interviewer as pre-check questions
ALTER TABLE interview_turns
  ADD COLUMN IF NOT EXISTS is_pre_check BOOLEAN NOT NULL DEFAULT false;
