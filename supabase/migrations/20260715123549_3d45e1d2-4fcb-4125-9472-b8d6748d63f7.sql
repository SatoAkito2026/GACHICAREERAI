CREATE TABLE public.actor_screening_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  production_title TEXT,
  synopsis TEXT,
  production_type TEXT,
  role_description TEXT,
  required_conditions TEXT,
  preferred_conditions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.actor_screening_presets TO authenticated;
GRANT ALL ON public.actor_screening_presets TO service_role;
ALTER TABLE public.actor_screening_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages actor screening presets"
  ON public.actor_screening_presets FOR ALL
  USING (auth.uid() = company_user_id)
  WITH CHECK (auth.uid() = company_user_id);
CREATE INDEX idx_actor_screening_presets_user ON public.actor_screening_presets(company_user_id);
CREATE TRIGGER update_actor_screening_presets_updated_at
  BEFORE UPDATE ON public.actor_screening_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();