DROP POLICY IF EXISTS "Companies update applications to their jobs" ON public.job_applications;
CREATE POLICY "Companies update applications to their jobs" ON public.job_applications
FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.job_postings jp WHERE jp.id = job_applications.job_posting_id AND jp.company_user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.job_postings jp WHERE jp.id = job_applications.job_posting_id AND jp.company_user_id = auth.uid()));