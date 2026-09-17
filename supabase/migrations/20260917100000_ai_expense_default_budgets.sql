-- Candidate. Requires 20260908210000_restricted_ai_expense_permits.sql.
-- Owner instruction (2026-09-17): native AI must work for every account and every new
-- user without hand-provisioned budget rows. The server now supplies a plan-derived
-- account cap and the configured platform (global) cap with each reservation; a
-- missing budget row for the current month is created from those caps inside the same
-- locked transaction. NULL caps keep the previous fail-closed behaviour, so older
-- seven-argument callers (benchmark runs, backlink requests) are unchanged. Existing
-- rows, pauses, restricted budgets and permits are never altered by a default, and no
-- money is funded here: caps are ceilings on internal supplier reservations.
DROP FUNCTION public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint);
CREATE FUNCTION public.reserve_ai_expense(
  p_request uuid, p_user uuid, p_job uuid, p_provider text, p_model text,
  p_operation text, p_ceiling bigint,
  p_account_cap bigint DEFAULT NULL, p_global_cap bigint DEFAULT NULL
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
     OR p_ceiling IS NULL OR p_ceiling NOT BETWEEN 1 AND 1000000000000
     OR (p_account_cap IS NOT NULL AND p_account_cap NOT BETWEEN 1 AND 9007199254740991)
     OR (p_global_cap IS NOT NULL AND p_global_cap NOT BETWEEN 1 AND 9007199254740991) THEN
    RAISE EXCEPTION 'invalid_expense_reservation' USING ERRCODE='22023';
  END IF;
  -- Same lock order as reconciliation: global, account, then attempt/permit.
  -- A default only creates a missing row for this month; it never changes an existing cap.
  SELECT * INTO g FROM public.ai_expense_budgets b
    WHERE b.scope='global' AND b.period=v_period FOR UPDATE;
  IF g.scope IS NULL AND p_global_cap IS NOT NULL THEN
    INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd) VALUES('global',v_period,p_global_cap)
      ON CONFLICT ON CONSTRAINT ai_expense_budgets_pkey DO NOTHING;
    SELECT * INTO g FROM public.ai_expense_budgets b
      WHERE b.scope='global' AND b.period=v_period FOR UPDATE;
  END IF;
  IF g.scope IS NULL THEN RETURN QUERY SELECT false,'budget_unconfigured',v_period; RETURN; END IF;
  SELECT * INTO a FROM public.ai_expense_budgets b
    WHERE b.scope=v_account AND b.period=v_period FOR UPDATE;
  IF a.scope IS NULL AND p_account_cap IS NOT NULL THEN
    INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd) VALUES(v_account,v_period,p_account_cap)
      ON CONFLICT ON CONSTRAINT ai_expense_budgets_pkey DO NOTHING;
    SELECT * INTO a FROM public.ai_expense_budgets b
      WHERE b.scope=v_account AND b.period=v_period FOR UPDATE;
  END IF;
  IF a.scope IS NULL THEN RETURN QUERY SELECT false,'budget_unconfigured',v_period; RETURN; END IF;
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
REVOKE ALL ON FUNCTION public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint) TO service_role;
