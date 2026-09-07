-- Enforce the same quota on the first claim and on subsequent claims.
-- Keep service-role ownership and the existing RPC contract. No counter resets.
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
  IF p_user IS NULL OR p_period IS NULL OR p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     OR p_bucket IS NULL OR btrim(p_bucket) = ''
     OR p_cap IS NULL OR p_cap < -1 OR p_units IS NULL OR p_units <= 0 THEN
    RAISE EXCEPTION 'invalid_ai_usage_claim' USING ERRCODE = '22023';
  END IF;

  -- Seed a zero counter, then perform a conditional atomic update. Seeding
  -- serializes competing first claims through the primary key as well.
  INSERT INTO public.ai_usage (user_id, period, bucket, used)
    VALUES (p_user, p_period, p_bucket, 0)
    ON CONFLICT (user_id, period, bucket) DO NOTHING;

  UPDATE public.ai_usage AS u
    SET used = u.used + p_units, updated_at = now()
    WHERE u.user_id = p_user AND u.period = p_period AND u.bucket = p_bucket
      AND u.used >= 0
      AND u.used::bigint + p_units <= 2147483647
      AND (p_cap = -1 OR u.used::bigint + p_units <= p_cap)
    RETURNING u.used INTO new_used;

  IF new_used IS NOT NULL THEN
    RETURN QUERY SELECT new_used, p_cap, true;
    RETURN;
  END IF;

  SELECT u.used INTO new_used FROM public.ai_usage AS u
    WHERE u.user_id = p_user AND u.period = p_period AND u.bucket = p_bucket;
  IF new_used IS NULL OR new_used < 0 OR new_used::bigint + p_units > 2147483647 THEN
    RAISE EXCEPTION 'ai_usage_counter_unavailable' USING ERRCODE = '22003';
  END IF;
  RETURN QUERY SELECT new_used, p_cap, false;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_usage(uuid, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_ai_usage(uuid, text, text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_usage(uuid, text, text, integer, integer) TO service_role;
