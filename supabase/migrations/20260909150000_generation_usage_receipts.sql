-- Generation quota is separate from supplier expense. Only a confirmed,
-- server-owned reservation can be returned after a technical failure.
-- Existing monthly counters and native expense records are not reset.
CREATE TABLE public.ai_generation_usage_receipts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  bucket text NOT NULL CHECK (bucket IN ('contentGeneration', 'imageGeneration')),
  operation text NOT NULL CHECK (operation IN (
    'generateContentCore', 'generateContentAssetFn', 'generateArticleImageCore'
  )),
  native_attempt_id uuid,
  units integer NOT NULL CHECK (units = 1),
  claim_cap integer NOT NULL CHECK (claim_cap >= -1),
  state text NOT NULL CHECK (state IN ('reserved', 'completed', 'released', 'denied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  CHECK ((bucket = 'imageGeneration') = (operation = 'generateArticleImageCore')),
  CHECK ((state = 'reserved') = (settled_at IS NULL))
);
CREATE INDEX ai_generation_usage_receipts_owner_period
  ON public.ai_generation_usage_receipts (user_id, period, created_at DESC);
ALTER TABLE public.ai_generation_usage_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_generation_usage_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ai_generation_usage_receipts TO service_role;

CREATE FUNCTION public.claim_generation_usage(
  p_id uuid, p_user uuid, p_period text, p_bucket text, p_cap integer,
  p_operation text, p_native_attempt uuid DEFAULT NULL
)
RETURNS TABLE (used integer, cap integer, allowed boolean, receipt_id uuid, claim_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  inserted_id uuid;
  existing public.ai_generation_usage_receipts%ROWTYPE;
  claimed record;
BEGIN
  IF p_id IS NULL OR p_user IS NULL OR p_period IS NULL
     OR p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     OR p_bucket IS NULL OR p_bucket NOT IN ('contentGeneration', 'imageGeneration')
     OR p_cap IS NULL OR p_cap < -1 OR p_operation IS NULL
     OR p_operation NOT IN ('generateContentCore', 'generateContentAssetFn', 'generateArticleImageCore')
     OR ((p_bucket = 'imageGeneration') <> (p_operation = 'generateArticleImageCore')) THEN
    RAISE EXCEPTION 'invalid_generation_usage_claim' USING ERRCODE = '22023';
  END IF;

  -- This unique insert serializes a replay before touching the shared counter.
  INSERT INTO public.ai_generation_usage_receipts
    (id, user_id, period, bucket, operation, native_attempt_id, units, claim_cap, state)
    VALUES (p_id, p_user, p_period, p_bucket, p_operation, p_native_attempt, 1, p_cap, 'reserved')
    ON CONFLICT (id) DO NOTHING RETURNING id INTO inserted_id;
  IF inserted_id IS NULL THEN
    SELECT * INTO existing FROM public.ai_generation_usage_receipts WHERE id = p_id;
    IF existing.user_id <> p_user OR existing.period <> p_period OR existing.bucket <> p_bucket
       OR existing.operation <> p_operation OR existing.claim_cap <> p_cap
       OR existing.native_attempt_id IS DISTINCT FROM p_native_attempt THEN
      RAISE EXCEPTION 'generation_usage_identity_conflict' USING ERRCODE = '22023';
    END IF;
    -- A receipt is never authority to start another provider call, even after
    -- release. Recovery can inspect the receipt; a retry needs a fresh identity.
    RETURN QUERY SELECT coalesce(u.used, 0), p_cap, false, p_id, 'replayed'::text
      FROM (SELECT 1) seed LEFT JOIN public.ai_usage u
      ON u.user_id = p_user AND u.period = p_period AND u.bucket = p_bucket;
    RETURN;
  END IF;

  SELECT * INTO claimed FROM public.claim_ai_usage(p_user, p_period, p_bucket, p_cap, 1);
  IF NOT claimed.allowed THEN
    UPDATE public.ai_generation_usage_receipts SET state = 'denied', settled_at = now()
      WHERE id = p_id;
  END IF;
  RETURN QUERY SELECT claimed.used::integer, claimed.cap::integer, claimed.allowed::boolean,
    p_id, CASE WHEN claimed.allowed THEN 'reserved' ELSE 'denied' END;
END;
$$;

CREATE FUNCTION public.settle_generation_usage(p_id uuid, p_user uuid, p_outcome text)
RETURNS TABLE (receipt_id uuid, state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  receipt public.ai_generation_usage_receipts%ROWTYPE;
  counter_used integer;
BEGIN
  IF p_id IS NULL OR p_user IS NULL OR p_outcome IS NULL
     OR p_outcome NOT IN ('completed', 'released') THEN
    RAISE EXCEPTION 'invalid_generation_usage_settlement' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO receipt FROM public.ai_generation_usage_receipts r
    WHERE r.id = p_id AND r.user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'generation_usage_receipt_not_found' USING ERRCODE = '22023';
  END IF;
  IF receipt.state = p_outcome THEN
    RETURN QUERY SELECT receipt.id, receipt.state;
    RETURN;
  END IF;
  IF receipt.state <> 'reserved' THEN
    RAISE EXCEPTION 'generation_usage_already_settled' USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'released' THEN
    -- Decrement only this original month/bucket and only once. Corrupt or
    -- missing counters fail closed instead of manufacturing a refund.
    UPDATE public.ai_usage u SET used = u.used - receipt.units, updated_at = now()
      WHERE u.user_id = receipt.user_id AND u.period = receipt.period
        AND u.bucket = receipt.bucket AND u.used >= receipt.units
      RETURNING u.used INTO counter_used;
    IF counter_used IS NULL THEN
      RAISE EXCEPTION 'generation_usage_counter_unavailable' USING ERRCODE = '22003';
    END IF;
  END IF;
  UPDATE public.ai_generation_usage_receipts r SET state = p_outcome, settled_at = now()
    WHERE r.id = receipt.id;
  RETURN QUERY SELECT receipt.id, p_outcome;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_generation_usage(uuid, uuid, text, text, integer, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_generation_usage(uuid, uuid, text, text, integer, text, uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.settle_generation_usage(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_generation_usage(uuid, uuid, text)
  TO service_role;
