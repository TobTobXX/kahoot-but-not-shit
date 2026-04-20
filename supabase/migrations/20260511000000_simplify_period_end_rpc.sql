-- Simplify get_my_subscription_period_end now that the Stripe FDW is available
-- in all environments. The FDW exposes stripe.subscriptions directly; no
-- dev/prod branching is needed. Drop the p_env overload from 20260509.

drop function if exists public.get_my_subscription_period_end(text);

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
begin
  select stripe_subscription_id, stripe_customer_id
    into v_sub_id, v_cust_id
  from public.profiles
  where id = auth.uid();

  if v_sub_id is null and v_cust_id is null then
    return null;
  end if;

  if v_sub_id is not null then
    select coalesce(
        current_period_end,
        to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
      )
      into v_result
    from stripe.subscriptions
    where id = v_sub_id
    limit 1;
  end if;

  if v_result is null and v_cust_id is not null then
    select coalesce(
        current_period_end,
        to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
      )
      into v_result
    from stripe.subscriptions
    where customer = v_cust_id
    order by coalesce(
        current_period_end,
        to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
      ) desc nulls last
    limit 1;
  end if;

  return v_result;
end;
$$;

grant execute on function public.get_my_subscription_period_end() to authenticated;
