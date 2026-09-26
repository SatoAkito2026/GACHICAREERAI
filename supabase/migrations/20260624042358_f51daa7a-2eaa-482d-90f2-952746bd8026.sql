CREATE TABLE public.interview_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_name text,
  candidate_email text,
  job_type text,
  screening_candidate_id uuid REFERENCES public.screening_candidates(id),
  screening_data jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'started', 'completed')),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.interview_invitations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_invitations TO authenticated;
GRANT ALL ON public.interview_invitations TO service_role;
GRANT SELECT ON public.interview_invitations TO anon;

CREATE POLICY "Users can manage their own invitations"
  ON public.interview_invitations
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anyone can read invitation by token"
  ON public.interview_invitations
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX idx_invitations_token ON public.interview_invitations (token);
CREATE INDEX idx_invitations_user ON public.interview_invitations (user_id, created_at DESC);