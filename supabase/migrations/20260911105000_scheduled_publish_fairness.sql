-- Unreleased. Keep pre-dispatch retries separate from ambiguous connector outcomes.
ALTER TABLE public.scheduled_publishes
 ADD COLUMN preflight_attempts integer NOT NULL DEFAULT 0 CHECK(preflight_attempts BETWEEN 0 AND 12),
 ADD COLUMN preflight_started_at timestamptz,
 ADD COLUMN retry_after timestamptz;
CREATE INDEX scheduled_publishes_fair_due ON public.scheduled_publishes(user_id,publish_at,id)
 WHERE status='pending';

CREATE OR REPLACE FUNCTION public.claim_scheduled_publishes(batch_size integer DEFAULT 20,max_attempts integer DEFAULT 3)
RETURNS SETOF public.scheduled_publishes LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Serialize only the short claim transaction, not publication work. Count existing
 -- publishing rows as occupied owner slots so overlapping ticks cannot bypass fairness.
 IF NOT pg_try_advisory_xact_lock(hashtext('scheduled-publish-fair-claim')) THEN RETURN; END IF;
 RETURN QUERY WITH ranked AS (
   SELECT sp.id,sp.user_id,sp.publish_at,
     row_number() OVER(PARTITION BY sp.user_id ORDER BY sp.publish_at,sp.id) AS owner_position
   FROM public.scheduled_publishes sp
   WHERE sp.status='pending' AND sp.publish_at<=now()
     AND (sp.retry_after IS NULL OR sp.retry_after<=now())
     AND sp.attempts<least(3,greatest(1,coalesce(max_attempts,3)))
 ), due AS (
   SELECT sp.id FROM ranked r JOIN public.scheduled_publishes sp ON sp.id=r.id
   WHERE r.owner_position<=greatest(0,2-(SELECT count(*) FROM public.scheduled_publishes active WHERE active.user_id=r.user_id AND active.status='publishing'))
   ORDER BY r.owner_position,r.publish_at,r.id
   LIMIT least(20,greatest(1,coalesce(batch_size,20)))
   FOR UPDATE OF sp SKIP LOCKED
 )
 UPDATE public.scheduled_publishes sp SET status='publishing',claimed_at=now(),attempts=sp.attempts+1,updated_at=now()
 FROM due WHERE sp.id=due.id RETURNING sp.*;
END; $$;
REVOKE ALL ON FUNCTION public.claim_scheduled_publishes(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_scheduled_publishes(integer,integer) TO service_role;
