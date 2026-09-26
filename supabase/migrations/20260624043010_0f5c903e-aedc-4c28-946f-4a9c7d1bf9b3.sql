-- Remove the overly-permissive public SELECT policy
DROP POLICY IF EXISTS "Anyone can read invitation by token" ON public.interview_invitations;

-- Token-based lookup via a security definer function that returns only
-- the non-sensitive fields needed by the candidate-facing interview page.
CREATE OR REPLACE FUNCTION public.get_interview_invitation(_token uuid)
RETURNS TABLE (
  candidate_name text,
  job_type text,
  status text,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT candidate_name, job_type, status, expires_at
  FROM public.interview_invitations
  WHERE token = _token
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_interview_invitation(uuid) TO anon, authenticated;