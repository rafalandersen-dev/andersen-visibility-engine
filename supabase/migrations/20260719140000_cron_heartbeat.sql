-- Runner heartbeat (Sprint 18, increment 1)
--
-- Without this, a dead cron and an empty queue are indistinguishable: both look
-- like "nothing happened". Meanwhile a user's article silently never goes live
-- while the UI still reports "Scheduled" — the purest form of the failure this
-- whole increment exists to prevent. The runner stamps a row every tick; the
-- app can then derive an overdue state from the age of that stamp.
--
-- Service-role only, like every other operational table here.
-- Idempotent: safe to re-apply.

CREATE TABLE IF NOT EXISTS public.cron_heartbeats (
  job_name     text PRIMARY KEY,
  last_run_at  timestamptz NOT NULL DEFAULT now(),
  last_summary jsonb
);

ALTER TABLE public.cron_heartbeats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cron_heartbeats FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_cron_heartbeat(job text, summary jsonb DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.cron_heartbeats (job_name, last_run_at, last_summary)
  VALUES (job, now(), summary)
  ON CONFLICT (job_name)
  DO UPDATE SET last_run_at = now(), last_summary = EXCLUDED.last_summary;
$$;

REVOKE ALL ON FUNCTION public.record_cron_heartbeat(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_cron_heartbeat(text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cron_heartbeat(text, jsonb) TO service_role;

-- Null when the job has never run, which the caller must treat as "unknown",
-- not as "fresh".
CREATE OR REPLACE FUNCTION public.cron_heartbeat_age_seconds(job text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXTRACT(EPOCH FROM (now() - last_run_at))::integer
  FROM public.cron_heartbeats WHERE job_name = job
$$;

REVOKE ALL ON FUNCTION public.cron_heartbeat_age_seconds(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_heartbeat_age_seconds(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_heartbeat_age_seconds(text) TO service_role;
