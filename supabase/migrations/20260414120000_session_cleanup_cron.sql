-- Enable pg_cron extension (requires superuser; no-op if already enabled)
create extension if not exists pg_cron with schema extensions;

-- Grant usage so the cron job can run under the postgres role
grant usage on schema cron to postgres;

-- Schedule hourly cleanup: delete sessions older than 12 hours
-- Cascade deletes will remove associated players, player_answers, etc.
select cron.schedule(
  'cleanup-old-sessions',
  '0 * * * *',
  $$
    delete from sessions
    where created_at < now() - interval '12 hours';
  $$
);
