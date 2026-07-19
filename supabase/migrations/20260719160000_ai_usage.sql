-- AI spend metering (Sprint 18, increment 3)
--
-- The plan limits have been advertised on the pricing page since launch and
-- enforced in exactly zero places: monthlyContentGenerations, monthlyMiloScores
-- and their siblings had no call sites at all. The only thing limiting AI spend
-- was how many clicks it took a user to generate something — which is precisely
-- the friction the redesign removes, so this has to land before generation gets
-- easier.
--
-- Deliberately NOT reusing oauth_rate_limits: its cleanup is unscoped and runs
-- daily, which would silently reset a calendar-month window.
--
-- Service-role only. Idempotent: safe to re-apply.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id     uuid NOT NULL,
  period      text NOT NULL,           -- 'YYYY-MM', calendar month, UTC
  bucket      text NOT NULL,           -- e.g. 'contentGeneration', 'miloScore'
  used        integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period, bucket)
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage FROM anon, authenticated;

-- Atomically claim `units` from a bucket. Returns the usage AFTER the claim and
-- whether it was allowed, so a caller cannot read, decide and write in three
-- steps and lose a race with a second tab at the cap boundary.
-- A cap of -1 means unlimited — still recorded, so spend stays visible.
CREATE OR REPLACE FUNCTION public.claim_ai_usage(
  p_user uuid, p_period text, p_bucket text, p_cap integer, p_units integer DEFAULT 1
)
RETURNS TABLE (used integer, cap integer, allowed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_used integer;
BEGIN
  INSERT INTO public.ai_usage AS u (user_id, period, bucket, used)
  VALUES (p_user, p_period, p_bucket, p_units)
  ON CONFLICT (user_id, period, bucket) DO UPDATE
    SET used = u.used + p_units, updated_at = now()
    WHERE p_cap < 0 OR u.used + p_units <= p_cap
  RETURNING u.used INTO new_used;

  IF new_used IS NULL THEN
    -- The row existed but the WHERE blocked the update: the claim is over cap.
    SELECT u.used INTO new_used FROM public.ai_usage u
      WHERE u.user_id = p_user AND u.period = p_period AND u.bucket = p_bucket;
    RETURN QUERY SELECT coalesce(new_used, 0), p_cap, false;
  ELSE
    RETURN QUERY SELECT new_used, p_cap, true;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_usage(uuid, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_ai_usage(uuid, text, text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_usage(uuid, text, text, integer, integer) TO service_role;
