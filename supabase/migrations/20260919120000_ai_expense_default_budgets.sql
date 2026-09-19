-- Default (auto) provisioning for the internal AI expense ledger.
-- Requires 20260908210000_restricted_ai_expense_permits.sql.
--
-- Owner instruction (2026-09-17, corrected 2026-09-19): native AI must work for
-- every account and every new month without hand-provisioned budget rows, while
-- operator-managed rows stay authoritative. The server supplies a plan-derived
-- account cap and the configured platform (global) cap with each reservation.
-- Within the SAME locked transaction as the money gate, reserve_ai_expense now:
--   * creates a missing monthly row for a supplied cap, marked provenance='auto';
--   * lets an existing AUTO row's cap FOLLOW the supplied cap when a plan is
--     upgraded or downgraded within the month — the cap ONLY, never
--     reserved_microusd/spent_microusd/paused/requires_permit;
--   * NEVER creates, changes, pauses or unpauses a MANUAL (operator) row, and
--     never touches any row when its matching cap is NULL — legacy seven-argument
--     callers keep the exact previous fail-closed behaviour.
-- No money is funded here: caps are ceilings on internal supplier reservations,
-- which are retained until reconciled. Existing September rows (global + owner,
-- both USD50, not paused, owner manualComped Agency) default to
-- provenance='manual' and are therefore never altered by a default.

ALTER TABLE public.ai_expense_budgets
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'manual'
  CHECK (provenance IN ('manual','auto'));

-- Replace the seven-argument reserve with a nine-argument overload whose two new
-- caps default to NULL. Dropping first keeps exactly one function (older callers
-- bind to the defaults), so there is a single privileged surface to audit.
DROP FUNCTION IF EXISTS public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint);
CREATE OR REPLACE FUNCTION public.reserve_ai_expense(
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
  -- Provisioning/following happens under the row lock; a missing row is created
  -- as 'auto', an existing 'auto' row's cap follows the plan, a 'manual' row is
  -- left completely untouched.
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
  IF g.paused OR a.paused THEN RETURN QUERY SELECT false,'budget_paused',v_period; RETURN; END IF;

  SELECT * INTO permit FROM public.ai_expense_permits p
    WHERE p.request_id=p_request FOR UPDATE;
  IF NOT FOUND THEN
    IF g.requires_permit OR a.requires_permit THEN
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
REVOKE ALL ON FUNCTION public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint) TO service_role;
