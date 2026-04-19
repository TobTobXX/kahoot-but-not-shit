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
  v_sub_id text;
  v_result timestamp;
begin
  select stripe_subscription_id into v_sub_id
  from public.profiles
  where id = auth.uid();

  if v_sub_id is null then
    return null;
  end if;

  if exists (
    select 1 from information_schema.foreign_tables
    where foreign_table_schema = 'stripe_test'
      and foreign_table_name   = 'subscriptions'
  ) then
    execute 'select current_period_end from stripe_test.subscriptions where id = $1 limit 1'
      into v_result using v_sub_id;
  elsif exists (
    select 1 from information_schema.foreign_tables
    where foreign_table_schema = 'stripe'
      and foreign_table_name   = 'subscriptions'
  ) then
    execute 'select current_period_end from stripe.subscriptions where id = $1 limit 1'
      into v_result using v_sub_id;
  end if;

  return v_result;
end;
$$;

grant execute on function public.get_my_subscription_period_end() to authenticated;
