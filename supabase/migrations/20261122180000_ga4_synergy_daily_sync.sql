-- Daily GA4 report for the Synergy pilot (owner-only test rollout, property
-- 528831108; pinned and rollout-checked by the server, see src/lib/ga4-daily.server.ts).
--
-- 1. ga4_daily_reports: the authoritative server-fetched snapshot per owner and
--    project. Kept OUT of the workspace on purpose: browser saves upsert whole
--    project entities, so a server write into the project could be overwritten
--    by a tab that loaded the project earlier. The panel reads this row and
--    overlays it for display; manual entries stay in the workspace untouched.
--    Rows cascade away with the property selection (disconnect deletes it).
-- 2. Vault secret 'ga4_daily_cron_secret', generated in-database, never leaves
--    the database or the server; service-role-only accessor for the route.
-- 3. pg_cron job 'ga4-synergy-daily-sync' (05:40 UTC daily) POSTs to the app's
--    daily-sync endpoint via pg_net with that secret as Bearer.
--
-- Security model mirrors ga4_project_properties: RLS enabled, NO anon or
-- authenticated grants or policies, service role only. Additive and idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.ga4_daily_reports (
  user_id uuid NOT NULL,
  project_id text NOT NULL,
  property_id text NOT NULL CHECK (property_id ~ '^[0-9]{1,20}$'),
  period_start date,
  period_end date,
  snapshot jsonb CHECK (snapshot IS NULL OR jsonb_typeof(snapshot) = 'object'),
  last_attempt_at timestamptz NOT NULL,
  last_success_at timestamptz,
  last_error text CHECK (last_error IN (
    'not_available', 'not_configured', 'not_connected', 'expired', 'no_property',
    'access_denied', 'api_disabled', 'unavailable', 'failed'
  )),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id),
  FOREIGN KEY (user_id, project_id)
    REFERENCES public.ga4_project_properties (user_id, project_id) ON DELETE CASCADE,
  -- A snapshot always carries its 28-day period and success time.
  CHECK ((snapshot IS NULL) = (period_end IS NULL)
     AND (period_start IS NULL) = (period_end IS NULL)
     AND (snapshot IS NULL OR last_success_at IS NOT NULL)
     AND (period_end IS NULL OR period_end - period_start = 27))
);

ALTER TABLE public.ga4_daily_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ga4_daily_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ga4_daily_reports TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'ga4_daily_cron_secret') THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'ga4_daily_cron_secret', 'Bearer secret for the GA4 Synergy daily sync cron job');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ga4_daily_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ga4_daily_cron_secret'
$$;

REVOKE ALL ON FUNCTION public.ga4_daily_cron_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ga4_daily_cron_secret() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ga4_daily_cron_secret() TO service_role;

-- 05:40 UTC: after the GSC job (05:20), and after midnight in Europe/Stockholm,
-- so the period already ends on the property's last complete day.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ga4-synergy-daily-sync') THEN
    PERFORM cron.unschedule('ga4-synergy-daily-sync');
  END IF;
  PERFORM cron.schedule(
    'ga4-synergy-daily-sync',
    '40 5 * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://milogrowth.com/api/google/analytics/daily-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ga4_daily_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 110000
    );
    $cron$
  );
END $$;
