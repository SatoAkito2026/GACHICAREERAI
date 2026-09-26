DROP POLICY "Applicants manage own applications" ON public.job_applications;

CREATE POLICY "Applicants insert own applications" ON public.job_applications
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = applicant_user_id);

CREATE POLICY "Applicants view own applications" ON public.job_applications
FOR SELECT TO authenticated
USING (auth.uid() = applicant_user_id);

CREATE POLICY "Applicants delete own applications" ON public.job_applications
FOR DELETE TO authenticated
USING (auth.uid() = applicant_user_id);

-- Applicants may update only non-evaluative fields on their own row.
-- Evaluative columns (status, rank, score, summary, strengths, concerns) are
-- additionally protected by the protect_job_application_eval_columns trigger.
CREATE POLICY "Applicants update own applications" ON public.job_applications
FOR UPDATE TO authenticated
USING (auth.uid() = applicant_user_id)
WITH CHECK (auth.uid() = applicant_user_id);