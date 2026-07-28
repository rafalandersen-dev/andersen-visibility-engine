-- Separate the public-audit outbound-fetch budget from the paid-AI budget.
--
-- A failed or non-HTML fetch must not consume an AI slot, while user-controlled
-- outbound requests still require an exact global ceiling.

ALTER TABLE public.public_audit_daily_usage
  ADD COLUMN IF NOT EXISTS fetches integer NOT NULL DEFAULT 0 CHECK (fetches >= 0);

CREATE OR REPLACE FUNCTION public.claim_public_audit_fetch(
  p_day date,
  p_cap integer,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS TABLE (allowed boolean, used integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  day_used integer;
BEGIN
  IF p_day IS NULL OR p_cap < 1 OR p_cap > 10000 THEN
    RAISE EXCEPTION 'invalid public audit fetch claim';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public-audit-fetch-day:' || p_day::text, 0)
  );

  INSERT INTO public.public_audit_daily_usage AS usage (
    day, used, fetches, updated_at
  )
  VALUES (p_day, 0, 1, p_now)
  ON CONFLICT (day) DO UPDATE
    SET fetches = usage.fetches + 1, updated_at = p_now
    WHERE usage.fetches + 1 <= p_cap
  RETURNING usage.fetches INTO day_used;

  IF day_used IS NULL THEN
    SELECT usage.fetches INTO day_used
      FROM public.public_audit_daily_usage AS usage
      WHERE usage.day = p_day;
    RETURN QUERY SELECT false, coalesce(day_used, 0);
    RETURN;
  END IF;

  RETURN QUERY SELECT true, day_used;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_public_audit_fetch(date, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_public_audit_fetch(date, integer, timestamptz)
  TO service_role;
