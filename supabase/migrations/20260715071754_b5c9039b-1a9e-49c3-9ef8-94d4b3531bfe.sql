ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.actors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS interviews_actor_id_idx ON public.interviews(actor_id);

ALTER TABLE public.interview_invitations ADD COLUMN IF NOT EXISTS production_title text;
ALTER TABLE public.interview_invitations ADD COLUMN IF NOT EXISTS synopsis text;