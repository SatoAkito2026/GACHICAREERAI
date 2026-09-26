CREATE TABLE public.job_postings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL,
  job_type TEXT,
  description TEXT,
  salary_range TEXT,
  location TEXT,
  work_style TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  screening_preset_id UUID REFERENCES public.screening_criteria_presets ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_postings TO authenticated;
GRANT ALL ON public.job_postings TO service_role;
GRANT SELECT ON public.job_postings TO anon;
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Companies manage own job postings" ON public.job_postings FOR ALL USING (auth.uid() = company_user_id) WITH CHECK (auth.uid() = company_user_id);
CREATE POLICY "Anyone can view open job postings" ON public.job_postings FOR SELECT USING (status = 'open');

CREATE TABLE public.job_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_posting_id UUID NOT NULL REFERENCES public.job_postings ON DELETE CASCADE,
  applicant_user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  rank TEXT,
  score NUMERIC,
  summary TEXT,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  concerns JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_posting_id, applicant_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Applicants manage own applications" ON public.job_applications FOR ALL USING (auth.uid() = applicant_user_id) WITH CHECK (auth.uid() = applicant_user_id);
CREATE POLICY "Companies view applications to their jobs" ON public.job_applications FOR SELECT USING (EXISTS (SELECT 1 FROM public.job_postings jp WHERE jp.id = job_posting_id AND jp.company_user_id = auth.uid()));
CREATE POLICY "Companies update applications to their jobs" ON public.job_applications FOR UPDATE USING (EXISTS (SELECT 1 FROM public.job_postings jp WHERE jp.id = job_posting_id AND jp.company_user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_job_postings_updated_at BEFORE UPDATE ON public.job_postings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_job_applications_updated_at BEFORE UPDATE ON public.job_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();