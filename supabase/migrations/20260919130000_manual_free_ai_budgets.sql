-- Manual-budget requirement for free/uncertain accounts on the internal AI
-- expense ledger. Requires 20260919120000_ai_expense_default_budgets.sql.
--
-- Owner decision (2026-09-19): "AI na darmowych kontach dopiero po ręcznym
-- przyznaniu budżetu" — a free (or role/plan-uncertain) account may use native
-- AI ONLY after an operator has manually granted it a budget row. This
-- supersedes the earlier shared USD5 free-pool proposal entirely: there is NO
-- pool scope, no pool cost and no request classification column. Reconciliation
-- keeps its exact eight-argument signature and semantics, untouched.
--
-- The automatic provisioning from 20260919120000 is preserved UNCHANGED for a
-- verified owner or a KNOWN non-free plan: a missing monthly row is created
-- 'auto', an existing 'auto' row's cap follows the supplied plan cap, and a
-- 'manual' operator row is never altered. The server derives a single new flag,
-- p_require_manual_budget, from bounded trusted reads only — it is true unless
-- the caller is a verified owner or a KNOWN paid plan. When true, the reserve
-- refuses with 'manual_budget_required' BEFORE any account row is created or any
-- cap changed, UNLESS a MANUAL account row already exists (that operator row is
-- authoritative and is used as-is). An existing AUTO row — e.g. a since-
-- downgraded free account — does NOT satisfy the requirement and cannot bypass
-- the manual grant. Legacy seven- and nine-argument callers bind to the DEFAULT
-- true (conservative); an explicit NULL flag is rejected so a caller can never
-- silently drop the requirement. The manual September rows (global + owner, both
-- USD50, provenance='manual') are never touched. No money is funded here.

-- Replace the seven- and nine-argument reserves with a single ten-argument
-- overload. Dropping both first leaves exactly one privileged surface to audit;
-- older callers bind to the NULL caps and the conservative manual-budget default.
DROP FUNCTION IF EXISTS public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint);
DROP FUNCTION IF EXISTS public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint);
CREATE OR REPLACE FUNCTION public.reserve_ai_expense(
  p_request uuid, p_user uuid, p_job uuid, p_provider text, p_model text,
  p_operation text, p_ceiling bigint,
  p_account_cap bigint DEFAULT NULL, p_global_cap bigint DEFAULT NULL,
  p_require_manual_budget boolean DEFAULT true
) RETURNS TABLE (allowed boolean, reason text, period text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_period text := to_char(now() AT TIME ZONE 'UTC','YYYY-MM');
  v_account text := 'user:' || p_user::text;
  g public.ai_expense_budgets%ROWTYPE;
  a public.ai_expense_budgets%ROWTYPE;
  permit public.ai_expense_permits%ROWTYPE;
BEGIN
  -- p_require_manual_budget must be an explicit boolean. An explicit NULL is
  -- rejected so a caller can never silently drop the manual-budget requirement.
  IF p_request IS NULL OR p_user IS NULL OR p_job IS NULL
     OR p_provider IS NULL OR length(btrim(p_provider)) NOT BETWEEN 1 AND 80
     OR p_model IS NULL OR length(btrim(p_model)) NOT BETWEEN 1 AND 160
     OR p_operation IS NULL OR length(btrim(p_operation)) NOT BETWEEN 1 AND 80
     OR p_ceiling IS NULL OR p_ceiling NOT BETWEEN 1 AND 1000000000000
     OR p_require_manual_budget IS NULL
     OR (p_account_cap IS NOT NULL AND p_account_cap NOT BETWEEN 1 AND 9007199254740991)
     OR (p_global_cap IS NOT NULL AND p_global_cap NOT BETWEEN 1 AND 9007199254740991) THEN
    RAISE EXCEPTION 'invalid_expense_reservation' USING ERRCODE='22023';
  END IF;

  -- Same lock order as reconciliation: global, account, then attempt/permit.
  -- Global provisioning/following happens under the row lock exactly as in
  -- 20260919120000: a missing row is created 'auto', an existing 'auto' row's
  -- cap follows the plan, a 'manual' row is left completely untouched.
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

  -- Read the account row under its lock BEFORE any creation or cap change.
  SELECT * INTO a FROM public.ai_expense_budgets b
    WHERE b.scope=v_account AND b.period=v_period FOR UPDATE;

  -- Manual-budget requirement (owner decision 2026-09-19): a free or role/plan-
  -- uncertain account (server sends p_require_manual_budget=true) may proceed
  -- ONLY when an operator has already granted it a MANUAL row. Refuse here,
  -- before any provisioning, so a refusal never creates an account row, changes
  -- a cap/pause/permit/balance, or reaches a provider. A verified owner / KNOWN
  -- non-free plan sends false and keeps the auto behaviour below. An existing
  -- AUTO row (e.g. a since-downgraded account) does NOT satisfy the requirement.
  IF p_require_manual_budget AND (a.scope IS NULL OR a.provenance <> 'manual') THEN
    RETURN QUERY SELECT false,'manual_budget_required',v_period; RETURN;
  END IF;

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

-- Only the final ten-argument reserve may execute, and only as the service role.
-- The superseded seven-/nine-argument overloads were dropped above; reconcile
-- keeps its existing eight-argument signature and grants (20260907140000).
REVOKE ALL ON FUNCTION public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean) TO service_role;
