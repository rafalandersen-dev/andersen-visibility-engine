-- Monthly Auto-Scheduler (owner spec 2026-07-23).
-- Each month the runner fills NEXT month's content calendar for opted-in
-- projects (generate → prep → schedule) within the plan quota. This migration
-- adds only the trigger plumbing — no new tables: drafted assets live in the
-- workspace blob and armed go-lives reuse scheduled_publishes.
-- Same trust model as the scheduled-publish cron: an in-Postgres Vault secret,
-- exposed only through a service-role RPC, presented as a Bearer token to the
-- app endpoint.

-- 1. Cron shared secret (generated in-Postgres; never leaves the database).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'auto_scheduler_secret') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'auto_scheduler_secret',
      'Bearer secret for the monthly auto-scheduler cron runner'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.auto_scheduler_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'auto_scheduler_secret'
$$;

REVOKE ALL ON FUNCTION public.auto_scheduler_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_scheduler_secret() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_scheduler_secret() TO service_role;

-- 2. Monthly trigger: 06:00 UTC on the 25th — early enough that every enabled
--    project has its September (etc.) plan ready days before the month starts,
--    late enough that the current month's numbers are settled. The run itself
--    is idempotent-by-guardrail: already-booked slots are skipped, quota is
--    re-read, and re-running only fills what is still empty.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-auto-scheduler') THEN
    PERFORM cron.unschedule('monthly-auto-scheduler');
  END IF;
  PERFORM cron.schedule(
    'monthly-auto-scheduler',
    '0 6 25 * *',
    $cron$
    SELECT net.http_post(
      url := 'https://milogrowth.com/api/auto-scheduler/run',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'auto_scheduler_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 290000
    );
    $cron$
  );
END $$;
