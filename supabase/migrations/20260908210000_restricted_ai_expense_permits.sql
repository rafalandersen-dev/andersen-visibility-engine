-- Optional one-attempt admission for isolated, explicitly authorized tests.
-- This migration funds nothing and issues no permits. Existing budgets keep
-- their current behavior until an administrator explicitly restricts them.
ALTER TABLE public.ai_expense_budgets
  ADD COLUMN IF NOT EXISTS requires_permit boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.ai_expense_permits (
  request_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  job_id uuid NOT NULL,
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  provider text NOT NULL CHECK (length(btrim(provider)) BETWEEN 1 AND 80),
  model text NOT NULL CHECK (length(btrim(model)) BETWEEN 1 AND 160),
  operation text NOT NULL CHECK (length(btrim(operation)) BETWEEN 1 AND 80),
  ceiling_microusd bigint NOT NULL CHECK (ceiling_microusd BETWEEN 1 AND 1000000000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  revoked boolean NOT NULL DEFAULT false
);
ALTER TABLE public.ai_expense_permits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_expense_permits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_expense_permits TO service_role;

-- Preserve the existing RPC signature so already-deployed/background callers
-- are denied normally when a budget requires a preallocated attempt identity.
CREATE OR REPLACE FUNCTION public.reserve_ai_expense(
  p_request uuid, p_user uuid, p_job uuid, p_provider text, p_model text,
  p_operation text, p_ceiling bigint
) RETURNS TABLE (allowed boolean, reason text, period text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_period text := to_char(now() AT TIME ZONE 'UTC','YYYY-MM');
  v_account text := 'user:' || p_user::text;
  g public.ai_expense_budgets%ROWTYPE;
  a public.ai_expense_budgets%ROWTYPE;
  permit public.ai_expense_permits%ROWTYPE;
BEGIN
  IF p_request IS NULL OR p_user IS NULL OR p_job IS NULL
     OR p_provider IS NULL OR length(btrim(p_provider)) NOT BETWEEN 1 AND 80
     OR p_model IS NULL OR length(btrim(p_model)) NOT BETWEEN 1 AND 160
     OR p_operation IS NULL OR length(btrim(p_operation)) NOT BETWEEN 1 AND 80
     OR p_ceiling IS NULL OR p_ceiling NOT BETWEEN 1 AND 1000000000000 THEN
    RAISE EXCEPTION 'invalid_expense_reservation' USING ERRCODE='22023';
  END IF;
  -- Same lock order as reconciliation: global, account, then attempt/permit.
  SELECT * INTO g FROM public.ai_expense_budgets b
    WHERE b.scope='global' AND b.period=v_period FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false,'budget_unconfigured',v_period; RETURN; END IF;
  SELECT * INTO a FROM public.ai_expense_budgets b
    WHERE b.scope=v_account AND b.period=v_period FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false,'budget_unconfigured',v_period; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.ai_expense_requests r WHERE r.request_id=p_request) THEN
    RETURN QUERY SELECT false,'duplicate_request',v_period; RETURN;
  END IF;
  IF g.paused OR a.paused THEN RETURN QUERY SELECT false,'budget_paused',v_period; RETURN; END IF;

  SELECT * INTO permit FROM public.ai_expense_permits p
    WHERE p.request_id=p_request FOR UPDATE;
  IF NOT FOUND THEN
    IF g.requires_permit OR a.requires_permit THEN
      RETURN QUERY SELECT false,'permit_required',v_period; RETURN;
    END IF;
  ELSE
    -- Validate an existing permit even when the budget is later unrestricted.
    -- A permit cannot authorize another identity, model, operation, amount or
    -- month. A lower reserve would undermine the approved provider cost bound.
    IF permit.revoked OR permit.expires_at <= clock_timestamp()
       OR permit.period <> v_period OR permit.user_id <> p_user
       OR permit.job_id <> p_job OR permit.provider <> p_provider
       OR permit.model <> p_model OR permit.operation <> p_operation
       OR permit.ceiling_microusd <> p_ceiling THEN
      RETURN QUERY SELECT false,'permit_invalid',v_period; RETURN;
    END IF;
  END IF;

  IF g.spent_microusd+g.reserved_microusd+p_ceiling>g.cap_microusd
     OR a.spent_microusd+a.reserved_microusd+p_ceiling>a.cap_microusd THEN
    RETURN QUERY SELECT false,'budget_exhausted',v_period; RETURN;
  END IF;
  -- This insertion both consumes the permit and reserves money atomically.
  -- Unknown/failed/settled requests keep the identity forever; no retry grant.
  INSERT INTO public.ai_expense_requests(request_id,user_id,job_id,period,provider,model,operation,reserved_microusd)
    VALUES(p_request,p_user,p_job,v_period,p_provider,p_model,p_operation,p_ceiling);
  UPDATE public.ai_expense_budgets b SET reserved_microusd=b.reserved_microusd+p_ceiling
    WHERE b.period=v_period AND b.scope IN ('global',v_account);
  RETURN QUERY SELECT true,'reserved',v_period;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint) TO service_role;
