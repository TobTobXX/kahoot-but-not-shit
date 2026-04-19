-- Add Stripe billing columns to profiles.
-- stripe_customer_id  — links a Supabase user to their Stripe Customer object.
-- stripe_subscription_id — the active subscription ID; used to correlate renewal
--                          and cancellation webhook events.
-- Both are NULL until the user completes their first checkout session.

ALTER TABLE public.profiles
  ADD COLUMN stripe_customer_id     text,
  ADD COLUMN stripe_subscription_id text;
