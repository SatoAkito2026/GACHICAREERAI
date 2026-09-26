DROP POLICY IF EXISTS "Signed-in users can view actors" ON public.actors;
CREATE POLICY "Companies can view their own actors" ON public.actors FOR SELECT TO authenticated USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Signed-in users can view predictions" ON public.actor_ticket_predictions;
CREATE POLICY "Companies can view their own predictions" ON public.actor_ticket_predictions FOR SELECT TO authenticated USING (auth.uid() = company_user_id);