DO $$
DECLARE
  v_secret_id uuid;
BEGIN
  -- Insert bogus api key if none exists
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'stripe_fdw_api_key') THEN
    SELECT vault.create_secret(
      'sk_test_placeholder_replace_via_dashboard',
      'stripe_fdw_api_key'
    ) INTO v_secret_id;
  ELSE
    SELECT id INTO v_secret_id FROM vault.secrets WHERE name = 'stripe_fdw_api_key';
  END IF;

  -- Create the fdw table
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_foreign_server WHERE srvname = 'stripe_server') THEN
    EXECUTE format(
      'CREATE SERVER stripe_server FOREIGN DATA WRAPPER stripe_wrapper OPTIONS (api_key_id %L)',
      v_secret_id::text
    );
  END IF;

END;
$$;
