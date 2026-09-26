ALTER TABLE public.screening_candidates
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.actors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_screening_candidates_actor_id
  ON public.screening_candidates(actor_id);