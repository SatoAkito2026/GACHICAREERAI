alter table public.job_postings
  add column if not exists employment_type text,
  add column if not exists working_hours text,
  add column if not exists holidays text,
  add column if not exists benefits text,
  add column if not exists selection_process text,
  add column if not exists application_requirements text,
  add column if not exists ideal_candidate text,
  add column if not exists successful_hire_traits text,
  add column if not exists company_appeal text,
  add column if not exists thumbnail_path text;