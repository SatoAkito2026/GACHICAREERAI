CREATE TABLE public.actors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  agency_name TEXT,
  school TEXT,
  sns_handles JSONB NOT NULL DEFAULT '{}'::jsonb,
  follower_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  past_works JSONB NOT NULL DEFAULT '[]'::jsonb,
  influence_summary TEXT,
  suggested_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_researched_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.actors TO authenticated;
GRANT ALL ON public.actors TO service_role;
ALTER TABLE public.actors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can view actors" ON public.actors FOR SELECT TO authenticated USING (true);

CREATE TABLE public.actor_ticket_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  company_user_id UUID NOT NULL,
  production_title TEXT,
  production_type TEXT,
  venue_capacity INTEGER,
  genre TEXT,
  role_description TEXT,
  fit_percentage INTEGER,
  fit_reasoning TEXT,
  predicted_tickets_low INTEGER,
  predicted_tickets_high INTEGER,
  prediction_basis TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.actor_ticket_predictions TO authenticated;
GRANT ALL ON public.actor_ticket_predictions TO service_role;
ALTER TABLE public.actor_ticket_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can view predictions" ON public.actor_ticket_predictions FOR SELECT TO authenticated USING (true);

CREATE TABLE public.actor_audition_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES public.actors(id) ON DELETE CASCADE,
  company_user_id UUID NOT NULL,
  audition_date DATE,
  note TEXT,
  predicted_tickets INTEGER,
  actual_tickets INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.actor_audition_notes TO authenticated;
GRANT ALL ON public.actor_audition_notes TO service_role;
ALTER TABLE public.actor_audition_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Companies manage their own audition notes" ON public.actor_audition_notes FOR ALL TO authenticated USING (auth.uid() = company_user_id) WITH CHECK (auth.uid() = company_user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_actors_updated_at BEFORE UPDATE ON public.actors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_actor_ticket_predictions_updated_at BEFORE UPDATE ON public.actor_ticket_predictions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_actor_audition_notes_updated_at BEFORE UPDATE ON public.actor_audition_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();