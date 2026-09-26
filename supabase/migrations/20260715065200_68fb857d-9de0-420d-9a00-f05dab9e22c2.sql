ALTER TABLE public.interview_invitations
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.actors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interview_purpose text;
CREATE INDEX IF NOT EXISTS interview_invitations_actor_id_idx ON public.interview_invitations(actor_id);