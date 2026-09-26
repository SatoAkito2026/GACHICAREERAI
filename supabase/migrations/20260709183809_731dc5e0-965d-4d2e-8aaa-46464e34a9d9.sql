-- Prevent privilege escalation via client UPDATEs on profiles and companies.
-- Only the service role (server-side billing/admin code) may change protected columns.
-- For any other role, protected columns are reverted to their previous values.

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.is_admin := OLD.is_admin;
    NEW.plan := OLD.plan;
    NEW.plan_expires_at := OLD.plan_expires_at;
    NEW.stripe_customer_id := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
    NEW.period_interview_count := OLD.period_interview_count;
    NEW.interview_count_this_month := OLD.interview_count_this_month;
    NEW.screening_count_this_month := OLD.screening_count_this_month;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_privileged_columns_trg ON public.profiles;
CREATE TRIGGER protect_profile_privileged_columns_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_privileged_columns();

CREATE OR REPLACE FUNCTION public.protect_company_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.plan := OLD.plan;
    NEW.plan_expires_at := OLD.plan_expires_at;
    NEW.seats := OLD.seats;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_company_billing_columns_trg ON public.companies;
CREATE TRIGGER protect_company_billing_columns_trg
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_company_billing_columns();