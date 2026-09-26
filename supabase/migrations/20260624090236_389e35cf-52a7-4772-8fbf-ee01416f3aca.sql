ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_meter_subscription_id text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS screening_count_this_month integer NOT NULL DEFAULT 0;