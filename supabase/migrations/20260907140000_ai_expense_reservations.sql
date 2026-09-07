-- Internal provider expense, deliberately separate from customer result allowances.
-- USD millionths avoid floating point money. No budgets/prices are provisioned here.
CREATE TABLE IF NOT EXISTS public.ai_expense_budgets (
  scope text NOT NULL,
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  cap_microusd bigint NOT NULL CHECK (cap_microusd BETWEEN 0 AND 9007199254740991),
  reserved_microusd bigint NOT NULL DEFAULT 0 CHECK (reserved_microusd >= 0),
  spent_microusd bigint NOT NULL DEFAULT 0 CHECK (spent_microusd >= 0),
  paused boolean NOT NULL DEFAULT false,
  PRIMARY KEY (scope, period)
);
CREATE TABLE IF NOT EXISTS public.ai_expense_requests (
  request_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  job_id uuid NOT NULL,
  period text NOT NULL,
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  model text NOT NULL CHECK (length(model) BETWEEN 1 AND 160),
  operation text NOT NULL CHECK (length(operation) BETWEEN 1 AND 80),
  reserved_microusd bigint NOT NULL CHECK (reserved_microusd BETWEEN 1 AND 1000000000000),
  actual_microusd bigint CHECK (actual_microusd BETWEEN 0 AND 1000000000000),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','unknown','settled')),
  outcome text CHECK (outcome IN ('succeeded','failed','uncertain')),
  provider_request_id text CHECK (length(provider_request_id) <= 200),
  cost_source text CHECK (length(cost_source) <= 200),
  input_tokens bigint CHECK (input_tokens >= 0),
  output_tokens bigint CHECK (output_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  reconciled_at timestamptz,
  CHECK ((state='settled') = (actual_microusd IS NOT NULL)),
  CHECK (state<>'settled' OR (cost_source IS NOT NULL AND length(cost_source)>0))
);
CREATE INDEX IF NOT EXISTS ai_expense_requests_account_period
  ON public.ai_expense_requests(user_id,period,created_at);
ALTER TABLE public.ai_expense_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_expense_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_expense_budgets, public.ai_expense_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_expense_budgets, public.ai_expense_requests TO service_role;

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
BEGIN
  IF p_request IS NULL OR p_user IS NULL OR p_job IS NULL
     OR p_provider IS NULL OR length(btrim(p_provider)) NOT BETWEEN 1 AND 80
     OR p_model IS NULL OR length(btrim(p_model)) NOT BETWEEN 1 AND 160
     OR p_operation IS NULL OR length(btrim(p_operation)) NOT BETWEEN 1 AND 80
     OR p_ceiling IS NULL OR p_ceiling NOT BETWEEN 1 AND 1000000000000 THEN
    RAISE EXCEPTION 'invalid_expense_reservation' USING ERRCODE='22023';
  END IF;
  -- Always global, then account: independent requests share one lock order.
  SELECT * INTO g FROM public.ai_expense_budgets b
    WHERE b.scope='global' AND b.period=v_period FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false,'budget_unconfigured',v_period; RETURN; END IF;
  SELECT * INTO a FROM public.ai_expense_budgets b
    WHERE b.scope=v_account AND b.period=v_period FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false,'budget_unconfigured',v_period; RETURN; END IF;
  -- A retry must not execute the provider again, even if the request is settled.
  IF EXISTS (SELECT 1 FROM public.ai_expense_requests r WHERE r.request_id=p_request) THEN
    RETURN QUERY SELECT false,'duplicate_request',v_period; RETURN;
  END IF;
  IF g.paused OR a.paused THEN RETURN QUERY SELECT false,'budget_paused',v_period; RETURN; END IF;
  IF g.spent_microusd+g.reserved_microusd+p_ceiling>g.cap_microusd
     OR a.spent_microusd+a.reserved_microusd+p_ceiling>a.cap_microusd THEN
    RETURN QUERY SELECT false,'budget_exhausted',v_period; RETURN;
  END IF;
  INSERT INTO public.ai_expense_requests(request_id,user_id,job_id,period,provider,model,operation,reserved_microusd)
    VALUES(p_request,p_user,p_job,v_period,p_provider,p_model,p_operation,p_ceiling);
  UPDATE public.ai_expense_budgets b SET reserved_microusd=b.reserved_microusd+p_ceiling
    WHERE b.period=v_period AND b.scope IN ('global',v_account);
  RETURN QUERY SELECT true,'reserved',v_period;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_ai_expense(
  p_request uuid, p_user uuid, p_actual bigint, p_outcome text,
  p_cost_source text DEFAULT NULL, p_provider_request text DEFAULT NULL,
  p_input_tokens bigint DEFAULT NULL, p_output_tokens bigint DEFAULT NULL
) RETURNS TABLE (state text, overrun boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  r public.ai_expense_requests%ROWTYPE;
  v_account text;
BEGIN
  IF p_request IS NULL OR p_user IS NULL OR p_outcome IS NULL
     OR p_outcome NOT IN ('succeeded','failed','uncertain')
     OR (p_actual IS NOT NULL AND (p_actual NOT BETWEEN 0 AND 1000000000000
       OR p_cost_source IS NULL OR length(btrim(p_cost_source)) NOT BETWEEN 1 AND 200))
     OR length(p_cost_source)>200 OR length(p_provider_request)>200
     OR p_input_tokens<0 OR p_output_tokens<0 THEN
    RAISE EXCEPTION 'invalid_expense_reconciliation' USING ERRCODE='22023';
  END IF;
  SELECT * INTO r FROM public.ai_expense_requests x WHERE x.request_id=p_request AND x.user_id=p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_request_missing'; END IF;
  v_account := 'user:' || r.user_id::text;
  PERFORM 1 FROM public.ai_expense_budgets b WHERE b.scope='global' AND b.period=r.period FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_budget_missing'; END IF;
  PERFORM 1 FROM public.ai_expense_budgets b WHERE b.scope=v_account AND b.period=r.period FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_budget_missing'; END IF;
  SELECT * INTO r FROM public.ai_expense_requests x WHERE x.request_id=p_request FOR UPDATE;
  IF r.state='settled' THEN
    IF p_actual IS DISTINCT FROM r.actual_microusd OR p_outcome IS DISTINCT FROM r.outcome
       OR p_cost_source IS DISTINCT FROM r.cost_source
       OR p_provider_request IS DISTINCT FROM r.provider_request_id
       OR p_input_tokens IS DISTINCT FROM r.input_tokens OR p_output_tokens IS DISTINCT FROM r.output_tokens THEN
      RAISE EXCEPTION 'expense_reconciliation_conflict';
    END IF;
    RETURN QUERY SELECT r.state,r.actual_microusd>r.reserved_microusd; RETURN;
  END IF;
  IF p_actual IS NULL THEN
    -- No expiry refund: a timeout/crash does not prove the supplier did no work.
    UPDATE public.ai_expense_requests SET state='unknown',outcome=p_outcome,
      provider_request_id=coalesce(p_provider_request,provider_request_id),
      input_tokens=coalesce(p_input_tokens,input_tokens),output_tokens=coalesce(p_output_tokens,output_tokens),
      reconciled_at=now() WHERE request_id=p_request;
    RETURN QUERY SELECT 'unknown'::text,false; RETURN;
  END IF;
  UPDATE public.ai_expense_budgets b
    SET reserved_microusd=b.reserved_microusd-r.reserved_microusd,
        spent_microusd=b.spent_microusd+p_actual,
        paused=b.paused OR p_actual>r.reserved_microusd
    WHERE b.period=r.period AND b.scope IN ('global',v_account);
  UPDATE public.ai_expense_requests SET state='settled',actual_microusd=p_actual,outcome=p_outcome,
    cost_source=p_cost_source,provider_request_id=p_provider_request,
    input_tokens=p_input_tokens,output_tokens=p_output_tokens,reconciled_at=now()
    WHERE request_id=p_request;
  RETURN QUERY SELECT 'settled'::text,p_actual>r.reserved_microusd;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reconcile_ai_expense(uuid,uuid,bigint,text,text,text,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_ai_expense(uuid,uuid,bigint,text,text,text,bigint,bigint) TO service_role;
