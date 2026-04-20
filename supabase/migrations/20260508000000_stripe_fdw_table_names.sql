-- Update get_my_subscription_period_end to use the new per-environment table
-- names: stripe.subscriptions_dev (dev) and stripe.subscriptions_prod (prod).
-- Both live in the same "stripe" FDW schema; which one is present determines
-- the environment.

create or replace function public.get_my_subscription_period_end()
returns timestamp
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_sub_id   text;
  v_cust_id  text;
  v_result   timestamp;
  v_table    text;
begin
  select stripe_subscription_id, stripe_customer_id
    into v_sub_id, v_cust_id
  from public.profiles
  where id = auth.uid();

  -- Nothing to look up
  if v_sub_id is null and v_cust_id is null then
    return null;
  end if;

  -- Detect which Stripe FDW table is present in the "stripe" schema
  if exists (
    select 1 from information_schema.foreign_tables
    where foreign_table_schema = 'stripe'
      and foreign_table_name   = 'subscriptions_prod'
  ) then
    v_table := 'subscriptions_prod';
  elsif exists (
    select 1 from information_schema.foreign_tables
    where foreign_table_schema = 'stripe'
      and foreign_table_name   = 'subscriptions_dev'
  ) then
    v_table := 'subscriptions_dev';
  else
    return null;
  end if;

  -- Prefer a direct subscription-ID lookup; fall back to customer-ID lookup
  if v_sub_id is not null then
    execute format(
      $q$select coalesce(
           current_period_end,
           to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
         )
         from stripe.%I where id = $1 limit 1$q$,
      v_table
    ) into v_result using v_sub_id;
  end if;

  if v_result is null and v_cust_id is not null then
    execute format(
      $q$select coalesce(
           current_period_end,
           to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
         )
         from stripe.%I where customer = $1
         order by coalesce(
           current_period_end,
           to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
         ) desc nulls last limit 1$q$,
      v_table
    ) into v_result using v_cust_id;
  end if;

  return v_result;
end;
$$;

grant execute on function public.get_my_subscription_period_end() to authenticated;
