ALTER TABLE public.interview_summaries
  ADD COLUMN IF NOT EXISTS ai_comment TEXT,
  ADD COLUMN IF NOT EXISTS next_steps JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resignation_risk_percent INTEGER,
  ADD COLUMN IF NOT EXISTS resignation_risk_level TEXT,
  ADD COLUMN IF NOT EXISTS resignation_risk_factors JSONB DEFAULT '[]'::jsonb;