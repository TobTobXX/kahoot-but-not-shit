-- Stripe FDW integration.
--
-- PREREQUISITE: The Stripe wrapper must be enabled in the Supabase dashboard
-- (Integrations → Postgres Wrappers → Stripe) with your Stripe API key before
-- this migration is applied.  The dashboard creates the `stripe_wrapper` FDW
-- and the `stripe_server` foreign server automatically.

create schema if not exists stripe;

-- Foreign table: only the columns we need to look up subscription period end.
create foreign table if not exists stripe.subscriptions (
  id                   text,
  customer             text,
  currency             text,
  current_period_start timestamp,
  current_period_end   timestamp,
  attrs                jsonb
)
  server stripe_server
  options (
    object       'subscriptions',
    rowid_column 'id'
  );

-- Security-definer RPC callable by authenticated users.
-- Joins the calling user's profile to the Stripe subscriptions foreign table
-- and returns current_period_end for their active subscription.
-- Returns NULL when the user has no subscription on record.
create or replace function public.get_my_subscription_period_end()
returns timestamp
language sql
security definer
stable
set search_path = public
as $$
  select s.current_period_end
  from public.profiles p
  join stripe.subscriptions s on s.id = p.stripe_subscription_id
  where p.id = auth.uid()
    and p.stripe_subscription_id is not null
  limit 1;
$$;

grant execute on function public.get_my_subscription_period_end() to authenticated;
