ALTER TABLE public.actors ADD COLUMN IF NOT EXISTS search_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS actors_search_count_idx ON public.actors (search_count DESC);