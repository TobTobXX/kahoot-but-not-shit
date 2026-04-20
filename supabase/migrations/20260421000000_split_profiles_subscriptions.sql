-- Split profiles into two tables.
--
-- profiles     — id, username. Public read, owner can update username.
-- subscriptions — id, is_pro, stripe_*. Owner-read only; written by
--                 service_role (stripe-webhook / cancel-subscription).
--
-- NOTE: the three edge functions (stripe-webhook, cancel-subscription,
-- create-checkout-session) still query the profiles table for stripe columns.
-- They need updating separately to point at subscriptions.

-- -----------------------------------------------------------------------------
-- 1. Create subscriptions
-- -----------------------------------------------------------------------------
CREATE TABLE public.subscriptions (
  id                          uuid    NOT NULL,
  is_pro                      boolean NOT NULL DEFAULT false,
  stripe_customer_id          text,
  stripe_subscription_id      text,
  stripe_cancel_at_period_end boolean NOT NULL DEFAULT false,
  CONSTRAINT subscriptions_pkey
    PRIMARY KEY (id),
  CONSTRAINT subscriptions_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE
);


-- -----------------------------------------------------------------------------
-- 2. Drop storage policies that depend on profiles.is_pro before altering
--    the table (recreated in section 7 to reference subscriptions instead)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Pro users can upload images"    ON storage.objects;
DROP POLICY IF EXISTS "Pro users can update own images" ON storage.objects;
DROP POLICY IF EXISTS "Pro users can delete own images" ON storage.objects;


-- -----------------------------------------------------------------------------
-- 3. Migrate existing stripe data out of profiles
-- -----------------------------------------------------------------------------
INSERT INTO public.subscriptions
  (id, is_pro, stripe_customer_id, stripe_subscription_id, stripe_cancel_at_period_end)
SELECT
  id, is_pro, stripe_customer_id, stripe_subscription_id, stripe_cancel_at_period_end
FROM public.profiles;

ALTER TABLE public.profiles
  DROP COLUMN is_pro,
  DROP COLUMN stripe_customer_id,
  DROP COLUMN stripe_subscription_id,
  DROP COLUMN stripe_cancel_at_period_end;


-- -----------------------------------------------------------------------------
-- 4. RLS — profiles
-- Everyone can read; owner can update username only.
-- The old column-level anon grant (GRANT SELECT (id, username)) is replaced
-- by a full table grant now that profiles has no sensitive columns.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_own"                      ON public.profiles;
DROP POLICY IF EXISTS "Public can read profile usernames"  ON public.profiles;

-- Upgrade anon from column-level to full table grant
REVOKE SELECT (id, username) ON public.profiles FROM anon;
GRANT  SELECT               ON public.profiles TO anon;
GRANT  SELECT               ON public.profiles TO authenticated;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING     (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- -----------------------------------------------------------------------------
-- 5. RLS — subscriptions
-- Owner can read own row. Writes are via service_role (edge functions),
-- which bypasses RLS.
-- -----------------------------------------------------------------------------
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (id = auth.uid());

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL    ON public.subscriptions TO service_role;


-- -----------------------------------------------------------------------------
-- 6. Update handle_new_user trigger to also seed subscriptions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles     (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.subscriptions (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.handle_new_user() OWNER TO postgres;


-- -----------------------------------------------------------------------------
-- 7. Update get_my_subscription_period_end to read from subscriptions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_subscription_period_end()
RETURNS timestamp without time zone
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sub_id  text;
  v_cust_id text;
  v_result  timestamp;
BEGIN
  SELECT stripe_subscription_id, stripe_customer_id
    INTO v_sub_id, v_cust_id
    FROM public.subscriptions
   WHERE id = auth.uid();

  IF v_sub_id IS NULL AND v_cust_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_sub_id IS NOT NULL THEN
    SELECT coalesce(
        current_period_end,
        to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
      )
      INTO v_result
      FROM stripe.subscriptions
     WHERE id = v_sub_id
     LIMIT 1;
  END IF;

  IF v_result IS NULL AND v_cust_id IS NOT NULL THEN
    SELECT coalesce(
        current_period_end,
        to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
      )
      INTO v_result
      FROM stripe.subscriptions
     WHERE customer = v_cust_id
     ORDER BY coalesce(
        current_period_end,
        to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
      ) DESC NULLS LAST
     LIMIT 1;
  END IF;

  RETURN v_result;
END;
$$;
ALTER FUNCTION public.get_my_subscription_period_end() OWNER TO postgres;


-- -----------------------------------------------------------------------------
-- 8. Recreate storage policies referencing subscriptions.is_pro
-- -----------------------------------------------------------------------------
CREATE POLICY "Pro users can upload images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.subscriptions
       WHERE id = auth.uid() AND is_pro = true
    )
  );

CREATE POLICY "Pro users can update own images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.subscriptions
       WHERE id = auth.uid() AND is_pro = true
    )
  )
  WITH CHECK (
    bucket_id = 'images'
    AND EXISTS (
      SELECT 1 FROM public.subscriptions
       WHERE id = auth.uid() AND is_pro = true
    )
  );

CREATE POLICY "Pro users can delete own images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.subscriptions
       WHERE id = auth.uid() AND is_pro = true
    )
  );
