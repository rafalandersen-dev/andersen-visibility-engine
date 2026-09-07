-- Test-mode diagnostics only. No entitlement, customer, plan or subscription writes.
CREATE TABLE public.stripe_sandbox_events (
  event_id text PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 255),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 120),
  event_created bigint NOT NULL CHECK (event_created >= 0),
  object_id text NOT NULL CHECK (length(object_id) BETWEEN 1 AND 255),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_sandbox_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_sandbox_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.stripe_sandbox_events TO service_role;
CREATE OR REPLACE FUNCTION public.record_stripe_sandbox_event(
  p_event text,p_type text,p_created bigint,p_object text,p_fingerprint text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.stripe_sandbox_events%ROWTYPE;
BEGIN
  -- A small owner-only acceptance journal; no unbounded diagnostic accumulation.
  PERFORM pg_catalog.pg_advisory_xact_lock(72100020260907);
  IF NOT EXISTS(SELECT 1 FROM public.stripe_sandbox_events WHERE event_id=p_event)
     AND (SELECT count(*) FROM public.stripe_sandbox_events)>=2000 THEN
    RAISE EXCEPTION 'stripe_sandbox_journal_full';
  END IF;
  INSERT INTO public.stripe_sandbox_events(event_id,event_type,event_created,object_id,fingerprint)
    VALUES(p_event,p_type,p_created,p_object,p_fingerprint) ON CONFLICT(event_id) DO NOTHING;
  IF FOUND THEN RETURN 'recorded'; END IF;
  SELECT * INTO r FROM public.stripe_sandbox_events WHERE event_id=p_event;
  IF r.fingerprint IS DISTINCT FROM p_fingerprint OR r.event_type IS DISTINCT FROM p_type
     OR r.event_created IS DISTINCT FROM p_created OR r.object_id IS DISTINCT FROM p_object THEN
    RAISE EXCEPTION 'stripe_sandbox_event_conflict';
  END IF;
  RETURN 'duplicate';
END $$;
REVOKE ALL ON FUNCTION public.record_stripe_sandbox_event(text,text,bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_stripe_sandbox_event(text,text,bigint,text,text) TO service_role;
