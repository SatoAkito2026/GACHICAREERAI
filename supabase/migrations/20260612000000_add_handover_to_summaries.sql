-- Add handover column to interview_summaries.
-- This stores the "次回担当者への申し送り" text, which is now generated
-- together with the rest of the summary (in the same AI call as overview,
-- checkNext, onboarding, etc.) instead of via a separate on-demand button.
-- Generating it as part of the single summary call ensures the on-screen
-- text, the copied report, and the printed PDF always show the exact same
-- text, since they all read from the same `summary.handover` value.
ALTER TABLE interview_summaries
  ADD COLUMN IF NOT EXISTS handover TEXT;
