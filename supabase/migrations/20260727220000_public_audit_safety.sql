-- Public AI Visibility Audit safety envelope.
--
-- Server/service-role only:
--   * true rolling-hour request claims by privacy-preserving client hash;
--   * atomic global UTC-day paid-AI ceiling;
--   * 24-hour result cache and short generation lease for deduplication.
--
-- No raw IP, URL, page HTML, Turnstile token or query string is stored.
-- Additive and idempotent; safe to re-apply.

CREATE TABLE IF NOT EXISTS public.public_audit_rate_events (
  client_key  text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS public_audit_rate_events_client_time_idx
  ON public.public_audit_rate_events (client_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS public_audit_rate_events_time_idx
  ON public.public_audit_rate_events (occurred_at);

CREATE TABLE IF NOT EXISTS public.public_audit_daily_usage (
  day        date PRIMARY KEY,
  used       integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.public_audit_cache (
  cache_key    text PRIMARY KEY,
  state        text NOT NULL CHECK (state IN ('processing', 'ready')),
  result       jsonb,
  locked_until timestamptz,
  expires_at   timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (state = 'processing' AND result IS NULL AND locked_until IS NOT NULL)
    OR
    (state = 'ready' AND result IS NOT NULL AND expires_at IS NOT NULL)
  )
);

ALTER TABLE public.public_audit_rate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_audit_daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_audit_cache ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.public_audit_rate_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.public_audit_daily_usage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.public_audit_cache FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_public_audit_request(
  p_client_key text,
  p_limit integer,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS TABLE (allowed boolean, used integer, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_used integer;
  oldest_kept timestamptz;
BEGIN
  IF p_client_key IS NULL OR length(p_client_key) <> 64 OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid public audit request claim';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public-audit-rate:' || p_client_key, 0)
  );

  -- Opportunistically cap stale-row growth across one-time or rotating client
  -- identities. The batch is bounded so a public request cannot trigger a long
  -- cleanup transaction; the time-only index keeps selection cheap.
  WITH stale AS (
    SELECT ctid
      FROM public.public_audit_rate_events
      WHERE occurred_at <= p_now - interval '2 hours'
      LIMIT 1000
  )
  DELETE FROM public.public_audit_rate_events AS events
    USING stale
    WHERE events.ctid = stale.ctid;

  DELETE FROM public.public_audit_rate_events
    WHERE client_key = p_client_key
      AND occurred_at <= p_now - interval '1 hour';

  SELECT count(*)::integer, min(occurred_at)
    INTO current_used, oldest_kept
    FROM public.public_audit_rate_events
    WHERE client_key = p_client_key
      AND occurred_at > p_now - interval '1 hour';

  IF current_used >= p_limit THEN
    RETURN QUERY SELECT
      false,
      current_used,
      greatest(1, ceil(extract(epoch FROM (oldest_kept + interval '1 hour' - p_now)))::integer);
    RETURN;
  END IF;

  INSERT INTO public.public_audit_rate_events (client_key, occurred_at)
    VALUES (p_client_key, p_now);

  RETURN QUERY SELECT true, current_used + 1, 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_audit_cache(
  p_cache_key text,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cached jsonb;
BEGIN
  IF p_cache_key IS NULL OR length(p_cache_key) <> 64 THEN
    RAISE EXCEPTION 'invalid public audit cache key';
  END IF;

  SELECT result INTO cached
    FROM public.public_audit_cache
    WHERE cache_key = p_cache_key
      AND state = 'ready'
      AND expires_at > p_now;

  RETURN cached;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_public_audit_ai(
  p_cache_key text,
  p_day date,
  p_cap integer,
  p_lock_seconds integer DEFAULT 90,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS TABLE (decision text, used integer, cached_result jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cache_row public.public_audit_cache%ROWTYPE;
  day_used integer;
BEGIN
  IF p_cache_key IS NULL OR length(p_cache_key) <> 64
     OR p_cap < 1 OR p_cap > 10000
     OR p_lock_seconds < 10 OR p_lock_seconds > 600 THEN
    RAISE EXCEPTION 'invalid public audit AI claim';
  END IF;

  -- Every caller acquires locks in this order. The day lock makes the global
  -- ceiling exact across different URLs; the cache lock deduplicates one URL.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public-audit-day:' || p_day::text, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public-audit-cache:' || p_cache_key, 0)
  );

  SELECT * INTO cache_row
    FROM public.public_audit_cache
    WHERE cache_key = p_cache_key;

  IF cache_row.state = 'ready' AND cache_row.expires_at > p_now THEN
    SELECT coalesce(u.used, 0) INTO day_used
      FROM public.public_audit_daily_usage u
      WHERE u.day = p_day;
    RETURN QUERY SELECT 'cached'::text, coalesce(day_used, 0), cache_row.result;
    RETURN;
  END IF;

  IF cache_row.state = 'processing' AND cache_row.locked_until > p_now THEN
    SELECT coalesce(u.used, 0) INTO day_used
      FROM public.public_audit_daily_usage u
      WHERE u.day = p_day;
    RETURN QUERY SELECT 'busy'::text, coalesce(day_used, 0), NULL::jsonb;
    RETURN;
  END IF;

  INSERT INTO public.public_audit_daily_usage AS u (day, used, updated_at)
    VALUES (p_day, 1, p_now)
  ON CONFLICT (day) DO UPDATE
    SET used = u.used + 1, updated_at = p_now
    WHERE u.used + 1 <= p_cap
  RETURNING u.used INTO day_used;

  IF day_used IS NULL THEN
    SELECT u.used INTO day_used
      FROM public.public_audit_daily_usage u
      WHERE u.day = p_day;
    RETURN QUERY SELECT 'limit'::text, coalesce(day_used, 0), NULL::jsonb;
    RETURN;
  END IF;

  INSERT INTO public.public_audit_cache AS c (
    cache_key, state, result, locked_until, expires_at, updated_at
  )
  VALUES (
    p_cache_key,
    'processing',
    NULL,
    p_now + pg_catalog.make_interval(secs => p_lock_seconds),
    NULL,
    p_now
  )
  ON CONFLICT (cache_key) DO UPDATE SET
    state = 'processing',
    result = NULL,
    locked_until = excluded.locked_until,
    expires_at = NULL,
    updated_at = excluded.updated_at;

  RETURN QUERY SELECT 'claimed'::text, day_used, NULL::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_public_audit_cache(
  p_cache_key text,
  p_result jsonb,
  p_ttl_seconds integer DEFAULT 86400,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_cache_key IS NULL OR length(p_cache_key) <> 64
     OR p_result IS NULL OR jsonb_typeof(p_result) <> 'object'
     OR p_ttl_seconds < 60 OR p_ttl_seconds > 172800 THEN
    RAISE EXCEPTION 'invalid public audit cache completion';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public-audit-cache:' || p_cache_key, 0)
  );

  INSERT INTO public.public_audit_cache AS c (
    cache_key, state, result, locked_until, expires_at, updated_at
  )
  VALUES (
    p_cache_key,
    'ready',
    p_result,
    NULL,
    p_now + pg_catalog.make_interval(secs => p_ttl_seconds),
    p_now
  )
  ON CONFLICT (cache_key) DO UPDATE SET
    state = 'ready',
    result = excluded.result,
    locked_until = NULL,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_public_audit_request(text, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_audit_cache(text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_public_audit_ai(text, date, integer, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_public_audit_cache(text, jsonb, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_public_audit_request(text, integer, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_audit_cache(text, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_public_audit_ai(text, date, integer, integer, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_public_audit_cache(text, jsonb, integer, timestamptz)
  TO service_role;
