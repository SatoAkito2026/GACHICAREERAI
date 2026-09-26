-- Protect evaluative columns on job_applications from applicant tampering
CREATE OR REPLACE FUNCTION public.protect_job_application_eval_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    -- Only the company that owns the job posting may write evaluative fields.
    IF NOT EXISTS (
      SELECT 1 FROM public.job_postings jp
      WHERE jp.id = NEW.job_posting_id AND jp.company_user_id = auth.uid()
    ) THEN
      NEW.status := OLD.status;
      NEW.score := OLD.score;
      NEW.rank := OLD.rank;
      NEW.summary := OLD.summary;
      NEW.strengths := OLD.strengths;
      NEW.concerns := OLD.concerns;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_job_application_eval_columns ON public.job_applications;
CREATE TRIGGER protect_job_application_eval_columns
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.protect_job_application_eval_columns();