-- Private, immutable output retained before acknowledging a generation.
-- No generated output, quota, funding or publishing is created by installation.
CREATE TABLE public.ai_generation_results (
  receipt_id uuid PRIMARY KEY REFERENCES public.ai_generation_usage_receipts(id),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  discarded_at timestamptz,
  CHECK ((payload IS NULL) = (discarded_at IS NOT NULL)),
  -- JSONB rendering adds separator spaces. The application caps compact UTF-8
  -- output at 200000 bytes; this bound allows its canonical rendering overhead.
  CHECK (payload IS NULL OR (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 250000))
);
CREATE INDEX ai_generation_results_owner_recent ON public.ai_generation_results
  (user_id, created_at DESC, receipt_id DESC) WHERE payload IS NOT NULL;
ALTER TABLE public.ai_generation_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_generation_results FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ai_generation_results TO service_role;

CREATE FUNCTION public.record_generation_result(p_id uuid, p_user uuid, p_result jsonb)
RETURNS TABLE (receipt_id uuid, state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  receipt public.ai_generation_usage_receipts%ROWTYPE;
  prior public.ai_generation_results%ROWTYPE;
  kind text;
BEGIN
  IF p_id IS NULL OR p_user IS NULL OR p_result IS NULL
     OR jsonb_typeof(p_result) <> 'object' OR octet_length(p_result::text) > 250000
     OR p_result->'version' IS DISTINCT FROM '1'::jsonb
     OR jsonb_typeof(p_result->'output') IS DISTINCT FROM 'object'
     OR coalesce(p_result->>'projectId','') !~ '^[A-Za-z0-9_-]{1,64}$'
     OR coalesce(btrim(p_result->>'title'),'') = '' OR length(p_result->>'title') > 300 THEN
    RAISE EXCEPTION 'invalid_generation_result' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO receipt FROM public.ai_generation_usage_receipts r
    WHERE r.id = p_id AND r.user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'generation_result_receipt_not_found' USING ERRCODE = '22023';
  END IF;
  kind := CASE WHEN receipt.bucket = 'imageGeneration' THEN 'image' ELSE 'content' END;
  IF p_result->>'kind' IS DISTINCT FROM kind THEN
    RAISE EXCEPTION 'generation_result_kind_mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO prior FROM public.ai_generation_results r WHERE r.receipt_id = p_id;
  IF FOUND THEN
    IF prior.user_id <> p_user OR prior.payload IS DISTINCT FROM p_result THEN
      RAISE EXCEPTION 'generation_result_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT p_id, 'retained'::text;
    RETURN;
  END IF;
  IF receipt.state <> 'reserved' THEN
    RAISE EXCEPTION 'generation_result_receipt_settled' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.ai_generation_results (receipt_id,user_id,payload)
    VALUES (p_id,p_user,p_result);
  -- Same transaction/receipt lock as retention: no retained result can have
  -- its quota released, and no completion is acknowledged without its output.
  UPDATE public.ai_generation_usage_receipts r SET state = 'completed', settled_at = now()
    WHERE r.id = p_id;
  RETURN QUERY SELECT p_id, 'retained'::text;
END;
$$;

CREATE FUNCTION public.discard_generation_result(p_id uuid, p_user uuid)
RETURNS TABLE (receipt_id uuid, state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- A tombstone preserves replay identity, so a late record call cannot
  -- resurrect output after an explicit discard. Quota and expenses stay put.
  PERFORM 1 FROM public.ai_generation_usage_receipts r
    WHERE r.id = p_id AND r.user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'generation_result_receipt_not_found' USING ERRCODE = '22023';
  END IF;
  UPDATE public.ai_generation_results r SET payload = NULL,
    discarded_at = coalesce(r.discarded_at,now())
    WHERE r.receipt_id = p_id AND r.user_id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'generation_result_not_found' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT p_id, 'discarded'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.record_generation_result(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_generation_result(uuid,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.discard_generation_result(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_generation_result(uuid,uuid) TO service_role;

CREATE FUNCTION public.list_generation_results(
  p_user uuid, p_project text DEFAULT NULL, p_before timestamptz DEFAULT NULL, p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (receipt_id uuid, created_at timestamptz, kind text, project_id text, title text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_user IS NULL OR (p_project IS NOT NULL AND p_project !~ '^[A-Za-z0-9_-]{1,64}$')
    OR ((p_before IS NULL) <> (p_before_id IS NULL)) THEN
    RAISE EXCEPTION 'invalid_generation_result_cursor' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT r.receipt_id, r.created_at, r.payload->>'kind', r.payload->>'projectId', r.payload->>'title'
    FROM public.ai_generation_results r
    WHERE r.user_id = p_user AND r.payload IS NOT NULL
      AND (p_project IS NULL OR r.payload->>'projectId' = p_project)
      AND (p_before IS NULL OR (r.created_at,r.receipt_id) < (p_before,p_before_id))
    ORDER BY r.created_at DESC, r.receipt_id DESC LIMIT 20;
END;
$$;
CREATE FUNCTION public.read_generation_result(p_id uuid, p_user uuid)
RETURNS TABLE (receipt_id uuid, created_at timestamptz, payload jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.receipt_id,r.created_at,r.payload FROM public.ai_generation_results r
    WHERE r.receipt_id = p_id AND r.user_id = p_user AND r.payload IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.list_generation_results(uuid,text,timestamptz,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_generation_results(uuid,text,timestamptz,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.read_generation_result(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_generation_result(uuid,uuid) TO service_role;
