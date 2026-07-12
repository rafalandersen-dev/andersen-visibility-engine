-- GSC background sync (Sprint 17b)
-- 1. Defense-in-depth: remove client-role grants on google_connections (RLS
--    already has no policies, so clients were denied anyway; the grants were
--    the default ones and serve no purpose).
-- 2. A cron shared secret that NEVER leaves the database/server: generated
--    in-Postgres, stored in Supabase Vault as 'gsc_cron_secret'.
-- 3. public.gsc_cron_secret(): service-role-only RPC the cron-sync route uses
--    to verify the Bearer header presented by the pg_cron job.
-- 4. pg_cron job 'gsc-daily-sync' (05:20 UTC daily) that POSTs to the app's
--    cron-sync endpoint via pg_net with the vault secret as Bearer.
-- Idempotent: safe to re-apply.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Grant hardening (RLS deny-all already blocks these roles; belt & braces).
REVOKE ALL ON public.google_connections FROM anon, authenticated;

-- 2. Vault secret (create once; value generated inside Postgres).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'gsc_cron_secret') THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'gsc_cron_secret', 'Bearer secret for the GSC daily background sync cron job');
  END IF;
END $$;

-- 3. Service-role-only accessor used by the cron-sync route for verification.
CREATE OR REPLACE FUNCTION public.gsc_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gsc_cron_secret'
$$;

REVOKE ALL ON FUNCTION public.gsc_cron_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gsc_cron_secret() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gsc_cron_secret() TO service_role;

-- 4. Daily cron job. GSC data lags ~3 days, so one sync per day is plenty; the
--    route additionally skips projects synced within the last 20 hours.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gsc-daily-sync') THEN
    PERFORM cron.unschedule('gsc-daily-sync');
  END IF;
  PERFORM cron.schedule(
    'gsc-daily-sync',
    '20 5 * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://milogrowth.com/api/google/search-console/cron-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gsc_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 110000
    );
    $cron$
  );
END $$;
