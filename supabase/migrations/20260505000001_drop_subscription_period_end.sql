-- subscription_period_end is no longer needed: we read current_period_end
-- live from Stripe via the stripe_wrapper FDW (see next migration).
ALTER TABLE public.profiles DROP COLUMN IF EXISTS subscription_period_end;
