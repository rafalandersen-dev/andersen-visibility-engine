-- Shared free-account circuit breaker for the internal AI expense ledger.
-- Requires 20260919120000_ai_expense_default_budgets.sql.
--
-- Security review (2026-09-19): a per-account cap alone is a Sybil bypass. Two
-- (or more) confirmed Free accounts can each keep reserving unknown-cost
-- attempts — successes retain their reservation until reconciled — and together
-- drain the entire USD50 platform cap through repeated CTA calls. The global
-- USD50 cap is owner-approved. A conservative operational default limits
-- free accounts to USD5 TOTAL across ALL free accounts,
-- within the USD50 global cap, so at least USD45 stays inaccessible to free
-- users. This is enforced by a SHARED pool budget row (scope 'global:free')
-- reserved atomically alongside the global and account rows.
--
-- Classification is fixed at attempt time and never trusted from the browser.
-- Only a server-verified owner or a KNOWN non-free effective plan bypasses the
-- pool (p_use_free_pool=false); an uncertain role/plan conservatively uses the
-- pool. Legacy seven/nine-argument callers bind to p_use_free_pool DEFAULT true,
-- so they remain conservative-compatible. The manual September rows (global +
-- owner, both USD50, provenance='manual') are never altered; a manual pool row,
-- if an operator ever creates one, is likewise respected. No money is funded.

-- Immutable-at-attempt classification. Existing (historical) requests default to
-- false: they were admitted before the pool existed and only ever touched the
-- global and account scopes, so reconciliation must leave the pool untouched.
ALTER TABLE public.ai_expense_requests
  ADD COLUMN IF NOT EXISTS uses_free_pool boolean NOT NULL DEFAULT false;

-- Replace the seven- and nine-argument reserves with a single ten-argument
-- overload. Dropping both first leaves exactly one privileged surface to audit;
-- older callers bind to the NULL caps and the conservative free-pool default.
DROP FUNCTION IF EXISTS public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint);
DROP FUNCTION IF EXISTS public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint);
CREATE OR REPLACE FUNCTION public.reserve_ai_expense(
  p_request uuid, p_user uuid, p_job uuid, p_provider text, p_model text,
  p_operation text, p_ceiling bigint,
  p_account_cap bigint DEFAULT NULL, p_global_cap bigint DEFAULT NULL,
  p_use_free_pool boolean DEFAULT true
) RETURNS TABLE (allowed boolean, reason text, period text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_period text := to_char(now() AT TIME ZONE 'UTC','YYYY-MM');
  v_account text := 'user:' || p_user::text;
  v_pool_cap bigint;
  v_scopes text[];
  g public.ai_expense_budgets%ROWTYPE;
  a public.ai_expense_budgets%ROWTYPE;
  fp public.ai_expense_budgets%ROWTYPE;
  permit public.ai_expense_permits%ROWTYPE;
BEGIN
  -- p_use_free_pool must be an explicit boolean. An explicit NULL is rejected so
  -- a caller can never silently opt out of the shared cap by nulling the flag.
  IF p_request IS NULL OR p_user IS NULL OR p_job IS NULL
     OR p_provider IS NULL OR length(btrim(p_provider)) NOT BETWEEN 1 AND 80
     OR p_model IS NULL OR length(btrim(p_model)) NOT BETWEEN 1 AND 160
     OR p_operation IS NULL OR length(btrim(p_operation)) NOT BETWEEN 1 AND 80
     OR p_ceiling IS NULL OR p_ceiling NOT BETWEEN 1 AND 1000000000000
     OR p_use_free_pool IS NULL
     OR (p_account_cap IS NOT NULL AND p_account_cap NOT BETWEEN 1 AND 9007199254740991)
     OR (p_global_cap IS NOT NULL AND p_global_cap NOT BETWEEN 1 AND 9007199254740991) THEN
    RAISE EXCEPTION 'invalid_expense_reservation' USING ERRCODE='22023';
  END IF;

  -- Lock order (shared with reconciliation): global, free pool (only when this
  -- attempt is a free one), account, then attempt/permit. Provisioning happens
  -- under each row lock: a missing row is created as 'auto', an existing 'auto'
  -- row's cap follows, and a 'manual' operator row is never touched.
  SELECT * INTO g FROM public.ai_expense_budgets b
    WHERE b.scope='global' AND b.period=v_period FOR UPDATE;
  IF g.scope IS NULL AND p_global_cap IS NOT NULL THEN
    INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,provenance)
      VALUES('global',v_period,p_global_cap,'auto')
      ON CONFLICT ON CONSTRAINT ai_expense_budgets_pkey DO NOTHING;
    SELECT * INTO g FROM public.ai_expense_budgets b
      WHERE b.scope='global' AND b.period=v_period FOR UPDATE;
  ELSIF g.scope IS NOT NULL AND g.provenance='auto'
        AND p_global_cap IS NOT NULL AND g.cap_microusd <> p_global_cap THEN
    UPDATE public.ai_expense_budgets b SET cap_microusd=p_global_cap
      WHERE b.scope='global' AND b.period=v_period;
    g.cap_microusd := p_global_cap;
  END IF;
  IF g.scope IS NULL THEN RETURN QUERY SELECT false,'budget_unconfigured',v_period; RETURN; END IF;

  -- The shared free pool cap is a fixed conservative default computed here, never
  -- supplied by the caller: min(USD5, current global cap). An auto pool row
  -- follows a global cap change; a manual pool row is respected unchanged.
  IF p_use_free_pool THEN
    v_pool_cap := least(5000000::bigint, g.cap_microusd);
    SELECT * INTO fp FROM public.ai_expense_budgets b
      WHERE b.scope='global:free' AND b.period=v_period FOR UPDATE;
    IF fp.scope IS NULL THEN
      INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,provenance)
        VALUES('global:free',v_period,v_pool_cap,'auto')
        ON CONFLICT ON CONSTRAINT ai_expense_budgets_pkey DO NOTHING;
      SELECT * INTO fp FROM public.ai_expense_budgets b
        WHERE b.scope='global:free' AND b.period=v_period FOR UPDATE;
    ELSIF fp.provenance='auto' AND fp.cap_microusd <> v_pool_cap THEN
      UPDATE public.ai_expense_budgets b SET cap_microusd=v_pool_cap
        WHERE b.scope='global:free' AND b.period=v_period;
      fp.cap_microusd := v_pool_cap;
    END IF;
    IF fp.scope IS NULL THEN RETURN QUERY SELECT false,'budget_unconfigured',v_period; RETURN; END IF;
  END IF;

  SELECT * INTO a FROM public.ai_expense_budgets b
    WHERE b.scope=v_account AND b.period=v_period FOR UPDATE;
  IF a.scope IS NULL AND p_account_cap IS NOT NULL THEN
    INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,provenance)
      VALUES(v_account,v_period,p_account_cap,'auto')
      ON CONFLICT ON CONSTRAINT ai_expense_budgets_pkey DO NOTHING;
    SELECT * INTO a FROM public.ai_expense_budgets b
      WHERE b.scope=v_account AND b.period=v_period FOR UPDATE;
  ELSIF a.scope IS NOT NULL AND a.provenance='auto'
        AND p_account_cap IS NOT NULL AND a.cap_microusd <> p_account_cap THEN
    UPDATE public.ai_expense_budgets b SET cap_microusd=p_account_cap
      WHERE b.scope=v_account AND b.period=v_period;
    a.cap_microusd := p_account_cap;
  END IF;
  IF a.scope IS NULL THEN RETURN QUERY SELECT false,'budget_unconfigured',v_period; RETURN; END IF;

  -- A retry must not execute the provider again, even if the request is settled.
  IF EXISTS (SELECT 1 FROM public.ai_expense_requests r WHERE r.request_id=p_request) THEN
    RETURN QUERY SELECT false,'duplicate_request',v_period; RETURN;
  END IF;
  IF g.paused OR a.paused OR (p_use_free_pool AND fp.paused) THEN
    RETURN QUERY SELECT false,'budget_paused',v_period; RETURN;
  END IF;

  SELECT * INTO permit FROM public.ai_expense_permits p
    WHERE p.request_id=p_request FOR UPDATE;
  IF NOT FOUND THEN
    IF g.requires_permit OR a.requires_permit OR (p_use_free_pool AND fp.requires_permit) THEN
      RETURN QUERY SELECT false,'permit_required',v_period; RETURN;
    END IF;
  ELSE
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
     OR a.spent_microusd+a.reserved_microusd+p_ceiling>a.cap_microusd
     OR (p_use_free_pool AND fp.spent_microusd+fp.reserved_microusd+p_ceiling>fp.cap_microusd) THEN
    RETURN QUERY SELECT false,'budget_exhausted',v_period; RETURN;
  END IF;

  INSERT INTO public.ai_expense_requests(request_id,user_id,job_id,period,provider,model,operation,reserved_microusd,uses_free_pool)
    VALUES(p_request,p_user,p_job,v_period,p_provider,p_model,p_operation,p_ceiling,p_use_free_pool);
  v_scopes := ARRAY['global', v_account];
  IF p_use_free_pool THEN v_scopes := array_append(v_scopes, 'global:free'); END IF;
  UPDATE public.ai_expense_budgets b SET reserved_microusd=b.reserved_microusd+p_ceiling
    WHERE b.period=v_period AND b.scope = ANY(v_scopes);
  RETURN QUERY SELECT true,'reserved',v_period;
END;
$$;

-- Reconciliation keeps its eight-argument signature and every existing
-- validation, idempotency and evidence rule. The only change: a free request
-- (uses_free_pool) also locks and settles the shared pool, in the same lock
-- order as reserve (global, pool, account). Historical/standard requests still
-- touch only the global and account scopes.
CREATE OR REPLACE FUNCTION public.reconcile_ai_expense(
  p_request uuid, p_user uuid, p_actual bigint, p_outcome text,
  p_cost_source text DEFAULT NULL, p_provider_request text DEFAULT NULL,
  p_input_tokens bigint DEFAULT NULL, p_output_tokens bigint DEFAULT NULL
) RETURNS TABLE (state text, overrun boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  r public.ai_expense_requests%ROWTYPE;
  v_account text;
  v_scopes text[];
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
  IF r.uses_free_pool THEN
    PERFORM 1 FROM public.ai_expense_budgets b WHERE b.scope='global:free' AND b.period=r.period FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'expense_budget_missing'; END IF;
  END IF;
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
  v_scopes := ARRAY['global', v_account];
  IF r.uses_free_pool THEN v_scopes := array_append(v_scopes, 'global:free'); END IF;
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
    WHERE b.period=r.period AND b.scope = ANY(v_scopes);
  UPDATE public.ai_expense_requests SET state='settled',actual_microusd=p_actual,outcome=p_outcome,
    cost_source=p_cost_source,provider_request_id=p_provider_request,
    input_tokens=p_input_tokens,output_tokens=p_output_tokens,reconciled_at=now()
    WHERE request_id=p_request;
  RETURN QUERY SELECT 'settled'::text,p_actual>r.reserved_microusd;
END;
$$;

-- Only the final signatures may execute, and only as the service role.
REVOKE ALL ON FUNCTION public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reconcile_ai_expense(uuid,uuid,bigint,text,text,text,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_ai_expense(uuid,uuid,bigint,text,text,text,bigint,bigint) TO service_role;
