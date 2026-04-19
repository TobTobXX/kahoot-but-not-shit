-- Stripe FDW integration.
--
-- The Stripe wrapper (enabled via Supabase dashboard → Integrations → Postgres
-- Wrappers) auto-creates the foreign schema and tables.  Test-mode instances
-- use the schema "stripe_test"; live instances use "stripe".
--
-- The function below detects which schema is present at call-time so the same
-- migration works in both environments without modification.

create or replace function public.get_my_subscription_period_end()
returns timestamp
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_sub_id  text;
  v_cust_id text;
  v_result  timestamp;
  v_schema  text;
begin
  select stripe_subscription_id, stripe_customer_id
    into v_sub_id, v_cust_id
  from public.profiles
  where id = auth.uid();

  -- Nothing to look up
  if v_sub_id is null and v_cust_id is null then
    return null;
  end if;

  -- Detect which Stripe FDW schema is present
  if exists (
    select 1 from information_schema.foreign_tables
    where foreign_table_schema = 'stripe_test'
      and foreign_table_name   = 'subscriptions'
  ) then
    v_schema := 'stripe_test';
  elsif exists (
    select 1 from information_schema.foreign_tables
    where foreign_table_schema = 'stripe'
      and foreign_table_name   = 'subscriptions'
  ) then
    v_schema := 'stripe';
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
         from %I.subscriptions where id = $1 limit 1$q$,
      v_schema
    ) into v_result using v_sub_id;
  end if;

  if v_result is null and v_cust_id is not null then
    execute format(
      $q$select coalesce(
           current_period_end,
           to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
         )
         from %I.subscriptions where customer = $1
         order by coalesce(
           current_period_end,
           to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
         ) desc nulls last limit 1$q$,
      v_schema
    ) into v_result using v_cust_id;
  end if;

  return v_result;
end;
$$;

grant execute on function public.get_my_subscription_period_end() to authenticated;
