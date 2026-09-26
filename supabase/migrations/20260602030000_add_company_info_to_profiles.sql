-- Add company information columns to profiles for the pro-plan company info feature.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS company_number text,
  ADD COLUMN IF NOT EXISTS company_address text,
  ADD COLUMN IF NOT EXISTS founded_year text,
  ADD COLUMN IF NOT EXISTS employee_count text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS hiring_positions text,
  ADD COLUMN IF NOT EXISTS ideal_candidate text,
  ADD COLUMN IF NOT EXISTS company_culture text,
  ADD COLUMN IF NOT EXISTS salary_range text,
  ADD COLUMN IF NOT EXISTS remote_policy text,
  ADD COLUMN IF NOT EXISTS company_strengths text,
  ADD COLUMN IF NOT EXISTS competitive_advantage text,
  ADD COLUMN IF NOT EXISTS successful_hire_traits text,
  ADD COLUMN IF NOT EXISTS failed_hire_traits text,
  ADD COLUMN IF NOT EXISTS first_job_description text,
  ADD COLUMN IF NOT EXISTS business_description text;
