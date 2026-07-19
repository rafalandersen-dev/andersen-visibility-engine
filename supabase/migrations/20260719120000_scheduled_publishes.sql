-- Scheduled publishing (Sprint 18)
--
-- Until now publishing was always immediate-on-action: "Approve" in the editor
-- published live straight away and no code path ever read the planned date, so
-- the calendar was a hand-maintained label that the publish pipeline ignored.
-- This migration adds the durable half of real scheduling.
--
-- Why a table rather than scanning workspace JSONB: the cron job has to find
-- due items across EVERY user. Content lives in workspaces.data (a JSONB blob),
-- which cannot be indexed usefully for "all assets whose publish_at <= now",
-- so a scan would grow linearly with the user base on every tick. This table is
-- the queue; workspaces.data stays the source of truth for the content itself.
--
-- Service-role only: RLS on with NO policies (deny-all for anon/authenticated),
-- matching google_connections. Clients schedule through an authenticated server
-- fn, never by touching this table directly.
--
-- Idempotent: safe to re-apply.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. The queue.
--    project_id / asset_id are TEXT, not UUID: they are client-generated ids
--    from the workspace JSONB (uid()), not database keys.
CREATE TABLE IF NOT EXISTS public.scheduled_publishes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  project_id   text NOT NULL,
  asset_id     text NOT NULL,
  publish_at   timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'pending',
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  claimed_at   timestamptz,
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_publishes_status_check
    CHECK (status IN ('pending', 'publishing', 'published', 'failed', 'cancelled'))
);

ALTER TABLE public.scheduled_publishes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_publishes FROM anon, authenticated;

-- Due-work lookup for the cron runner.
CREATE INDEX IF NOT EXISTS scheduled_publishes_due_idx
  ON public.scheduled_publishes (status, publish_at);

-- Per-user listing (the UI reads a user's schedule through a server fn).
CREATE INDEX IF NOT EXISTS scheduled_publishes_user_idx
  ON public.scheduled_publishes (user_id, status);

-- At most ONE live schedule per asset. Re-scheduling cancels the old row first.
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_publishes_active_asset_idx
  ON public.scheduled_publishes (asset_id)
  WHERE status IN ('pending', 'publishing');

-- 2. Atomic claim.
--    FOR UPDATE SKIP LOCKED means two overlapping cron ticks can never hand the
--    same row to two runners — the second tick skips locked rows instead of
--    blocking. Without this, a slow publish that outlives the 5-minute interval
--    would be published twice.
--
--    IMPORTANT — only 'pending' rows are claimed. Rows stuck in 'publishing'
--    are NEVER blindly retried, because the connectors are only idempotent when
--    handed an existing id: publishWordPressContentFn CREATES a new post when
--    data.postId is absent (wordpress.functions.ts:193) and upsertArticle
--    likewise creates without articleGid. If a runner died between a successful
--    connector call and recording the returned id, a retry would publish a
--    SECOND copy on the customer's live site. Interrupted rows are therefore
--    surfaced for a human decision by reap_stale_scheduled_publishes() below.
--
--    Retrying a KNOWN failure is safe and is handled in the runner: when a
--    connector reports an error, no post was created, so the row goes back to
--    'pending' until max_attempts.
CREATE OR REPLACE FUNCTION public.claim_scheduled_publishes(
  batch_size integer DEFAULT 20,
  max_attempts integer DEFAULT 3
)
RETURNS SETOF public.scheduled_publishes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT sp.id
    FROM public.scheduled_publishes sp
    WHERE sp.status = 'pending'
      AND sp.publish_at <= now()
      AND sp.attempts < max_attempts
    ORDER BY sp.publish_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.scheduled_publishes sp
  SET status     = 'publishing',
      claimed_at = now(),
      attempts   = sp.attempts + 1,
      updated_at = now()
  FROM due
  WHERE sp.id = due.id
  RETURNING sp.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_scheduled_publishes(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_scheduled_publishes(integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_scheduled_publishes(integer, integer) TO service_role;

-- 2b. Interrupted-run reaper.
--     A row left in 'publishing' past the stale window means the runner died
--     mid-flight and we do not know whether the post went live. We deliberately
--     do NOT republish. The row is parked as 'failed' with an explicit message
--     so the user checks the site and decides, rather than risking a duplicate.
--     Returns the parked rows so the runner can tell each ASSET why its publish
--     will never fire. Returning only a count meant the queue row went terminal
--     in silence while the editor kept promising "Goes live Tuesday 09:00".
DROP FUNCTION IF EXISTS public.reap_stale_scheduled_publishes(interval);

CREATE OR REPLACE FUNCTION public.reap_stale_scheduled_publishes(
  stale_after interval DEFAULT '15 minutes'
)
RETURNS TABLE (user_id uuid, asset_id text, last_error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.scheduled_publishes sp
  SET status     = 'failed',
      last_error = 'Publishing was interrupted and the outcome is unknown. Check whether the post went live before scheduling it again.',
      updated_at = now()
  WHERE sp.status = 'publishing'
    AND sp.claimed_at < now() - stale_after
  RETURNING sp.user_id, sp.asset_id, sp.last_error;
END;
$$;

REVOKE ALL ON FUNCTION public.reap_stale_scheduled_publishes(interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reap_stale_scheduled_publishes(interval) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_stale_scheduled_publishes(interval) TO service_role;

-- 3. Cron shared secret (generated in-Postgres; never leaves the database).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'publish_cron_secret') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'publish_cron_secret',
      'Bearer secret for the scheduled-publish cron runner'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.publish_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'publish_cron_secret'
$$;

REVOKE ALL ON FUNCTION public.publish_cron_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_cron_secret() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_cron_secret() TO service_role;

-- 4. Runner tick. Every 5 minutes: fine-grained enough that a user picking a
--    time sees it go live within the quarter-hour they expect, cheap enough to
--    be a no-op when the queue is empty.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-publish-run') THEN
    PERFORM cron.unschedule('scheduled-publish-run');
  END IF;
  PERFORM cron.schedule(
    'scheduled-publish-run',
    '*/5 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://milogrowth.com/api/publish/run-scheduled',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'publish_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 110000
    );
    $cron$
  );
END $$;
