-- Bounded weekly observation policy (audit packet, 28 October 2026).
--
-- Adds an OPT-IN, service-only, durable policy that bounds ONE synthetic
-- project's weekly runner to an immutable two-slot window with a lifetime
-- six-attempt / 2,200,000-microUSD allowance. Nothing is funded, granted,
-- scheduled or activated here: this migration creates no window, no permit, no
-- budget row, no cron job and no paid work. A project without a window row
-- keeps its CURRENT behaviour in every path touched below.
--
-- Why new storage rather than configuration: the existing permit schema
-- (20260908210000) binds request/user/job/month/provider/model/operation/ceiling
-- but has no project, window, slot or lifetime field; monthly budgets reset at
-- the UTC month boundary and are released by reconciliation; weekly stages mint
-- their own random request ID at admission time. None of those can express "at
-- most six attempts, ever, inside 168 hours, on exactly two dates".
--
-- LOCK ORDER (strict total order; every path below takes a prefix in order):
--   1 workspace_meta (public.assert_knowledge_project(...,true) — a HIDDEN lock
--     that existing weekly/backlink paths already take FIRST)
--   2 ai_expense_budgets scope='global'
--   3 ai_expense_budgets scope='user:<id>'
--   4 weekly_test_windows (policy row)
--   5 ai_expense_permits
--   6 weekly_test_window_allowances
-- public.dispatch_backlink_monitoring already runs 1 -> 2 -> 3 -> 5, so
-- public.reserve_ai_expense must NEVER acquire 1 or 4: it reads the policy row
-- WITHOUT a lock (READ COMMITTED sees a committed revoke on the next statement,
-- and the final pre-dispatch guard rechecks a fresh server clock anyway).
-- The minting path (begin_weekly_preparation_stage) runs 1 -> 4 -> 5 -> 6 and
-- never touches 2/3. Revocation takes 4 only.

-- A renamed/wrapper/overloaded reserve would be a direct bypass of the policy
-- enforcement added below. The superseded seven- and nine-argument overloads
-- were dropped in 20260919130000; fail the installation closed if any other
-- overload exists, instead of silently protecting only one of them.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
    WHERE s.nspname='public' AND p.proname='reserve_ai_expense';
  IF n<>1 THEN RAISE EXCEPTION 'reserve_ai_expense_overload_present'; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
    WHERE s.nspname='public' AND p.proname IN ('begin_weekly_preparation_stage','claim_auto_scheduler_lease','next_weekly_preparation_targets');
  IF n<>3 THEN RAISE EXCEPTION 'weekly_admission_overload_present'; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Policy storage
-- ---------------------------------------------------------------------------

-- DELIBERATELY NO foreign key to workspace_entities/auth.users: deleting and
-- recreating the project must NOT silently reset this project's trial
-- allowance. The unique (user_id,project_id) index makes the window a
-- once-per-lifetime identity for that owner/project pair, and an expired or
-- revoked row stays and stays restrictive.
CREATE TABLE public.weekly_test_windows (
  window_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id text NOT NULL CHECK(project_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  -- Exact scheduler identity this policy was authorized against. Any drift
  -- fails closed rather than silently observing a different configuration.
  expected_revision integer NOT NULL CHECK(expected_revision>0),
  expected_configuration jsonb NOT NULL
    CHECK(jsonb_typeof(expected_configuration)='object' AND octet_length(expected_configuration::text)<2000),
  -- Lifetime sum of ORIGINAL authorized ceilings. Never replenished by a month
  -- rollover, a settlement, a failure, an unknown outcome or a second grant.
  lifetime_ceiling_microusd bigint NOT NULL CHECK(lifetime_ceiling_microusd BETWEEN 1 AND 2200000),
  revoked boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(isfinite(starts_at) AND isfinite(ends_at)),
  CHECK(ends_at>starts_at AND ends_at<=starts_at+interval '168 hours'),
  CHECK(revoked=(revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX weekly_test_windows_project ON public.weekly_test_windows(user_id,project_id);

-- Exactly two immutable publication instants. A row is never updated.
CREATE TABLE public.weekly_test_window_slots (
  window_id uuid NOT NULL REFERENCES public.weekly_test_windows(window_id) ON DELETE RESTRICT,
  publish_at timestamptz NOT NULL CHECK(isfinite(publish_at)),
  PRIMARY KEY(window_id,publish_at)
);

-- The three allowed stage contracts. The per-stage ceiling is pinned to the
-- audited 2026-09-08 native reserve envelope (text 500,000 / image 100,000
-- microUSD). A repricing or model change therefore CANNOT be registered or
-- admitted without a new audited policy: price/model drift fails closed.
CREATE TABLE public.weekly_test_window_contracts (
  window_id uuid NOT NULL REFERENCES public.weekly_test_windows(window_id) ON DELETE RESTRICT,
  stage text NOT NULL CHECK(stage IN ('research','content','image')),
  provider text NOT NULL CHECK(length(btrim(provider)) BETWEEN 1 AND 80),
  model text NOT NULL CHECK(length(btrim(model)) BETWEEN 1 AND 160),
  operation text NOT NULL CHECK(length(btrim(operation)) BETWEEN 1 AND 80),
  ceiling_microusd bigint NOT NULL,
  PRIMARY KEY(window_id,stage),
  CHECK((stage IN ('research','content') AND ceiling_microusd=500000)
     OR (stage='image' AND ceiling_microusd=100000))
);

-- One immutable allowance per (window, slot, stage): at most six, ever. Bound
-- to the stage's ACTUAL generated request ID and its lease token; never
-- preinvented, never replaced, never renewed. No foreign key to the project for
-- the same retention reason as the window itself.
CREATE TABLE public.weekly_test_window_allowances (
  window_id uuid NOT NULL REFERENCES public.weekly_test_windows(window_id) ON DELETE RESTRICT,
  publish_at timestamptz NOT NULL,
  stage text NOT NULL CHECK(stage IN ('research','content','image')),
  user_id uuid NOT NULL,
  project_id text NOT NULL,
  request_id uuid NOT NULL UNIQUE,
  job_id uuid NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  operation text NOT NULL,
  ceiling_microusd bigint NOT NULL CHECK(ceiling_microusd IN (500000,100000)),
  period text NOT NULL CHECK(period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(window_id,publish_at,stage)
);
CREATE INDEX weekly_test_window_allowances_job ON public.weekly_test_window_allowances(job_id);

ALTER TABLE public.weekly_test_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_test_window_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_test_window_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_test_window_allowances ENABLE ROW LEVEL SECURITY;
-- Service-only, and only through the SECURITY DEFINER functions below: no
-- browser, anon, authenticated or service_role table access at all.
REVOKE ALL ON public.weekly_test_windows,public.weekly_test_window_slots,
  public.weekly_test_window_contracts,public.weekly_test_window_allowances
  FROM PUBLIC,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Shared, read-only policy evaluation
-- ---------------------------------------------------------------------------

-- One place computes the effective state from a FRESH server clock. It never
-- writes, never renews and never extends: an expired or revoked policy stays
-- restrictive forever.
-- VOLATILE on purpose: these read clock_timestamp() and must never be folded,
-- cached or evaluated once per statement from a stale snapshot.
CREATE FUNCTION public.weekly_test_window_state(p_window public.weekly_test_windows)
RETURNS text LANGUAGE sql VOLATILE SET search_path='' AS $$
  SELECT CASE
    WHEN p_window.window_id IS NULL THEN 'absent'
    WHEN p_window.revoked THEN 'revoked'
    WHEN clock_timestamp()<p_window.starts_at THEN 'pending'
    WHEN clock_timestamp()>=p_window.ends_at THEN 'expired'
    ELSE 'active' END;
$$;

-- Is the registered scheduler identity still exactly the authorized one? A
-- stale control revision or ANY change to the project's autoScheduler
-- configuration refuses new admission.
CREATE FUNCTION public.weekly_test_window_fresh(p_window public.weekly_test_windows)
RETURNS boolean LANGUAGE sql VOLATILE SET search_path='' AS $$
  SELECT p_window.expected_revision
      IS NOT DISTINCT FROM (SELECT c.revision FROM public.project_scheduler_control c
        WHERE c.user_id=p_window.user_id AND c.project_id=p_window.project_id)
    AND p_window.expected_configuration
      IS NOT DISTINCT FROM (SELECT e.data->'autoScheduler' FROM public.workspace_entities e
        WHERE e.user_id=p_window.user_id AND e.collection='projects' AND e.entity_id=p_window.project_id);
$$;

-- True when the window currently admits NEW paid work for this exact slot and
-- stage. Retention, finishing, recovery and reconciliation never consult this.
CREATE FUNCTION public.weekly_test_window_admits(
  p_window public.weekly_test_windows,p_publish timestamptz,p_stage text)
RETURNS boolean LANGUAGE sql VOLATILE SET search_path='' AS $$
  SELECT public.weekly_test_window_state(p_window)='active'
    AND public.weekly_test_window_fresh(p_window)
    AND EXISTS(SELECT 1 FROM public.weekly_test_window_slots s
      WHERE s.window_id=p_window.window_id AND s.publish_at=p_publish)
    AND EXISTS(SELECT 1 FROM public.weekly_test_window_contracts c
      WHERE c.window_id=p_window.window_id AND c.stage=p_stage);
$$;
REVOKE ALL ON FUNCTION public.weekly_test_window_state(public.weekly_test_windows),
  public.weekly_test_window_fresh(public.weekly_test_windows),
  public.weekly_test_window_admits(public.weekly_test_windows,timestamptz,text)
  FROM PUBLIC,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Registration, read and stop (privileged, service-only, no provisioning)
-- ---------------------------------------------------------------------------

-- Registration is explicit and one-shot. It funds nothing, mints no permit and
-- creates no allowance: it only records WHICH two instants and three contracts
-- may later be bound. A second registration for the same owner/project is
-- refused, so deletion/recreation of the project cannot reset the allowance.
CREATE FUNCTION public.register_weekly_test_window(
  p_user uuid,p_project text,p_starts timestamptz,p_ends timestamptz,
  p_revision integer,p_configuration jsonb,p_slots timestamptz[],
  p_contracts jsonb,p_lifetime bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE win public.weekly_test_windows%ROWTYPE; slot timestamptz; stage text; total bigint:=0;
  entry jsonb; ceiling bigint;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_starts IS NULL OR p_ends IS NULL OR NOT isfinite(p_starts) OR NOT isfinite(p_ends)
    OR p_ends<=p_starts OR p_ends>p_starts+interval '168 hours' OR p_ends-p_starts<interval '1 hour'
    OR p_revision IS NULL OR p_revision<=0
    OR p_configuration IS NULL OR jsonb_typeof(p_configuration)<>'object'
    OR octet_length(p_configuration::text)>=2000
    -- Exactly ONE dimension with the ordinary 1..2 bounds. A multidimensional
    -- or rebased array would be flattened by the FOREACH below into more than
    -- two slot rows, so the whitelist must reject the SHAPE before it reads
    -- entries. Out-of-shape subscripts yield NULL rather than an error, so the
    -- two entries are also checked for NULL explicitly: `a=b` on a NULL entry
    -- is NULL, which would otherwise skip the distinctness test entirely.
    OR p_slots IS NULL
    OR array_ndims(p_slots) IS DISTINCT FROM 1
    OR array_lower(p_slots,1) IS DISTINCT FROM 1
    OR array_upper(p_slots,1) IS DISTINCT FROM 2
    OR cardinality(p_slots) IS DISTINCT FROM 2
    OR p_slots[1] IS NULL OR p_slots[2] IS NULL
    OR p_slots[1]=p_slots[2]
    OR p_contracts IS NULL OR jsonb_typeof(p_contracts)<>'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_contracts))<>3
    OR p_lifetime IS NULL OR p_lifetime NOT BETWEEN 1 AND 2200000 THEN
    RAISE EXCEPTION 'invalid_weekly_test_window' USING ERRCODE='22023';
  END IF;
  -- The authorized identity must be the CURRENT one, and the observation must
  -- be opt-in for a project that cannot publish or mail by itself.
  IF p_revision IS DISTINCT FROM (SELECT c.revision FROM public.project_scheduler_control c
      WHERE c.user_id=p_user AND c.project_id=p_project AND c.engine='weekly')
    OR p_configuration IS DISTINCT FROM (SELECT e.data->'autoScheduler' FROM public.workspace_entities e
      WHERE e.user_id=p_user AND e.collection='projects' AND e.entity_id=p_project)
    OR coalesce(p_configuration->>'mode','')<>'approve_first'
    OR p_configuration ? 'summaryEmail' THEN
    RAISE EXCEPTION 'weekly_test_window_configuration' USING ERRCODE='22023';
  END IF;
  -- A project with existing weekly stages could already hold an off-list slot,
  -- which would make the whitelist non-authoritative. Register only a clean one.
  IF EXISTS(SELECT 1 FROM public.weekly_preparation_stages s
      WHERE s.user_id=p_user AND s.project_id=p_project) THEN
    RAISE EXCEPTION 'weekly_test_window_project_used' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.weekly_test_windows t
      WHERE t.user_id=p_user AND t.project_id=p_project) THEN
    -- Never replaced or renewed, in any state, for the project's lifetime.
    RAISE EXCEPTION 'weekly_test_window_exists' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.weekly_test_windows(user_id,project_id,starts_at,ends_at,
      expected_revision,expected_configuration,lifetime_ceiling_microusd)
    VALUES(p_user,p_project,p_starts,p_ends,p_revision,p_configuration,p_lifetime)
    RETURNING * INTO win;
  FOREACH slot IN ARRAY p_slots LOOP
    IF NOT isfinite(slot) OR slot<=p_starts OR slot>=p_ends+interval '14 days' THEN
      RAISE EXCEPTION 'invalid_weekly_test_window' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.weekly_test_window_slots(window_id,publish_at) VALUES(win.window_id,slot);
  END LOOP;
  FOREACH stage IN ARRAY ARRAY['research','content','image'] LOOP
    entry:=p_contracts->stage;
    IF entry IS NULL OR jsonb_typeof(entry)<>'object'
      OR jsonb_typeof(entry->'ceilingMicrousd')<>'number'
      OR entry->>'provider' IS NULL OR entry->>'model' IS NULL OR entry->>'operation' IS NULL THEN
      RAISE EXCEPTION 'invalid_weekly_test_window' USING ERRCODE='22023';
    END IF;
    ceiling:=(entry->>'ceilingMicrousd')::bigint;
    INSERT INTO public.weekly_test_window_contracts(window_id,stage,provider,model,operation,ceiling_microusd)
      VALUES(win.window_id,stage,entry->>'provider',entry->>'model',entry->>'operation',ceiling);
    total:=total+ceiling*2;
  END LOOP;
  -- Two slots times research+content+image at the pinned reserves is exactly
  -- 2,200,000 microUSD and exactly six allowances. The caller's declared
  -- lifetime must agree, so a mismatch is a refusal rather than a silent cap.
  IF total<>p_lifetime THEN RAISE EXCEPTION 'weekly_test_window_lifetime' USING ERRCODE='22023'; END IF;
  RETURN public.read_weekly_test_window(p_user,p_project);
END; $$;

-- Operator evidence only. Reports the EFFECTIVE expired/revoked status from a
-- fresh server clock and never renews, extends or reactivates the policy.
CREATE FUNCTION public.read_weekly_test_window(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE win public.weekly_test_windows%ROWTYPE;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  SELECT * INTO win FROM public.weekly_test_windows t
    WHERE t.user_id=p_user AND t.project_id=p_project;
  IF win.window_id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'windowId',win.window_id,'ownerId',win.user_id,'projectId',win.project_id,
    'startsAt',win.starts_at,'endsAt',win.ends_at,
    'expectedRevision',win.expected_revision,'expectedConfiguration',win.expected_configuration,
    'lifetimeCeilingMicrousd',win.lifetime_ceiling_microusd,
    'revoked',win.revoked,'revokedAt',win.revoked_at,
    'state',public.weekly_test_window_state(win),
    'fresh',public.weekly_test_window_fresh(win),
    'serverNow',clock_timestamp(),
    'remainingMs',greatest(0,floor(extract(epoch FROM win.ends_at-clock_timestamp())*1000))::bigint,
    'slots',coalesce((SELECT jsonb_agg(s.publish_at ORDER BY s.publish_at)
      FROM public.weekly_test_window_slots s WHERE s.window_id=win.window_id),'[]'::jsonb),
    'contracts',coalesce((SELECT jsonb_object_agg(c.stage,jsonb_build_object(
        'provider',c.provider,'model',c.model,'operation',c.operation,
        'ceilingMicrousd',c.ceiling_microusd))
      FROM public.weekly_test_window_contracts c WHERE c.window_id=win.window_id),'{}'::jsonb),
    'authorizedMicrousd',coalesce((SELECT sum(a.ceiling_microusd)
      FROM public.weekly_test_window_allowances a WHERE a.window_id=win.window_id),0),
    'allowances',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'publishAt',a.publish_at,'stage',a.stage,'requestId',a.request_id,'jobId',a.job_id,
        'provider',a.provider,'model',a.model,'operation',a.operation,
        'ceilingMicrousd',a.ceiling_microusd,'period',a.period,'expiresAt',a.expires_at)
      ORDER BY a.publish_at,a.stage)
      FROM public.weekly_test_window_allowances a WHERE a.window_id=win.window_id),'[]'::jsonb));
END; $$;

-- Privileged stop. Takes effect for FRESH admission immediately, even with a
-- running/unknown stage or an active lease, and without any local monitor. It
-- never cancels a stage, never erases uncertainty and never touches money that
-- is already reserved: already-produced output stays retainable and
-- reconcilable. Unconsumed permits are revoked so the pre-existing permit gate
-- refuses them too.
CREATE FUNCTION public.revoke_weekly_test_window(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE win public.weekly_test_windows%ROWTYPE;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  SELECT * INTO win FROM public.weekly_test_windows t
    WHERE t.user_id=p_user AND t.project_id=p_project FOR UPDATE;
  IF win.window_id IS NULL THEN RAISE EXCEPTION 'weekly_test_window_absent' USING ERRCODE='22023'; END IF;
  IF NOT win.revoked THEN
    UPDATE public.weekly_test_windows SET revoked=true,revoked_at=clock_timestamp()
      WHERE window_id=win.window_id;
    UPDATE public.ai_expense_permits p SET revoked=true
      WHERE p.revoked=false AND p.request_id IN (
        SELECT a.request_id FROM public.weekly_test_window_allowances a WHERE a.window_id=win.window_id)
        AND NOT EXISTS(SELECT 1 FROM public.ai_expense_requests r WHERE r.request_id=p.request_id);
  END IF;
  RETURN public.read_weekly_test_window(p_user,p_project);
END; $$;

REVOKE ALL ON FUNCTION public.register_weekly_test_window(uuid,text,timestamptz,timestamptz,integer,jsonb,timestamptz[],jsonb,bigint),
  public.read_weekly_test_window(uuid,text),public.revoke_weekly_test_window(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_weekly_test_window(uuid,text,timestamptz,timestamptz,integer,jsonb,timestamptz[],jsonb,bigint),
  public.read_weekly_test_window(uuid,text),public.revoke_weekly_test_window(uuid,text) TO service_role;

-- ---------------------------------------------------------------------------
-- Final pre-dispatch guard (fresh server clock, exact request/job identity)
-- ---------------------------------------------------------------------------

-- Called immediately before the ACTUAL provider call, after monetary admission.
-- Returns the server's own clock and the remaining milliseconds so the caller
-- can refuse again AFTER this acknowledgement arrives: a guard that passed
-- before T1 must not authorize a dispatch whose authorization landed after T1.
CREATE FUNCTION public.assert_weekly_test_window_dispatch(
  p_user uuid,p_project text,p_request uuid,p_job uuid,p_publish timestamptz,
  p_stage text,p_provider text,p_model text,p_operation text,p_ceiling bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE win public.weekly_test_windows%ROWTYPE; a public.weekly_test_window_allowances%ROWTYPE;
  stage_row public.weekly_preparation_stages%ROWTYPE;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  SELECT * INTO win FROM public.weekly_test_windows t
    WHERE t.user_id=p_user AND t.project_id=p_project;
  IF win.window_id IS NULL THEN RAISE EXCEPTION 'weekly_test_window_absent' USING ERRCODE='22023'; END IF;
  SELECT * INTO a FROM public.weekly_test_window_allowances x WHERE x.request_id=p_request;
  SELECT * INTO stage_row FROM public.weekly_preparation_stages s
    WHERE s.user_id=p_user AND s.project_id=p_project AND s.request_id=p_request;
  IF a.request_id IS NULL OR a.window_id IS DISTINCT FROM win.window_id
    OR a.user_id IS DISTINCT FROM p_user OR a.project_id IS DISTINCT FROM p_project
    OR a.publish_at IS DISTINCT FROM p_publish OR a.stage IS DISTINCT FROM p_stage
    OR a.job_id IS DISTINCT FROM p_job
    OR a.provider IS DISTINCT FROM p_provider OR a.model IS DISTINCT FROM p_model
    OR a.operation IS DISTINCT FROM p_operation OR a.ceiling_microusd IS DISTINCT FROM p_ceiling
    OR a.period IS DISTINCT FROM to_char(now() AT TIME ZONE 'UTC','YYYY-MM')
    OR stage_row.request_id IS NULL OR stage_row.stage IS DISTINCT FROM p_stage
    OR stage_row.publish_at IS DISTINCT FROM p_publish
    OR stage_row.lease_token IS DISTINCT FROM p_job OR stage_row.state<>'running'
    OR NOT public.weekly_test_window_admits(win,p_publish,p_stage)
    OR NOT EXISTS(SELECT 1 FROM public.ai_expense_permits pp
      WHERE pp.request_id=p_request AND NOT pp.revoked AND pp.expires_at>clock_timestamp()
        AND pp.user_id=p_user AND pp.job_id=p_job AND pp.provider=p_provider
        AND pp.model=p_model AND pp.operation=p_operation AND pp.ceiling_microusd=p_ceiling)
    OR NOT EXISTS(SELECT 1 FROM public.auto_scheduler_leases l
      WHERE l.user_id=p_user AND l.project_id=p_project AND l.token=p_job
        AND l.status='active' AND l.lease_until>clock_timestamp()) THEN
    RAISE EXCEPTION 'weekly_test_window_closed' USING ERRCODE='40001';
  END IF;
  RETURN jsonb_build_object('ok',true,'windowId',win.window_id,'serverNow',clock_timestamp(),
    'endsAt',win.ends_at,
    'remainingMs',greatest(0,floor(extract(epoch FROM win.ends_at-clock_timestamp())*1000))::bigint);
END; $$;
REVOKE ALL ON FUNCTION public.assert_weekly_test_window_dispatch(uuid,text,uuid,uuid,timestamptz,text,text,text,text,bigint)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_weekly_test_window_dispatch(uuid,text,uuid,uuid,timestamptz,text,text,text,text,bigint) TO service_role;

-- ---------------------------------------------------------------------------
-- Scheduler target selection
-- ---------------------------------------------------------------------------

-- Unregistered projects keep the EXACT previous selection behaviour. A
-- registered project is skipped while pending, expired, revoked or drifted, so
-- the shared five-minute cron needs no change and the operator's computer may
-- be offline. Reconciliation/retention RPCs are unaffected by this filter.
CREATE OR REPLACE FUNCTION public.next_weekly_preparation_targets()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE targets jsonb;
BEGIN
  WITH selected AS (
    SELECT c.user_id,c.project_id FROM public.project_scheduler_control c
      JOIN public.workspace_entities p ON p.user_id=c.user_id AND p.collection='projects' AND p.entity_id=c.project_id
      WHERE c.engine='weekly' AND p.data->'autoScheduler'->'enabled'='true'::jsonb
        AND NOT EXISTS(SELECT 1 FROM public.auto_scheduler_leases l WHERE l.user_id=c.user_id AND l.project_id=c.project_id AND l.status='active' AND l.lease_until>clock_timestamp())
        AND NOT EXISTS(SELECT 1 FROM public.weekly_test_windows t
          WHERE t.user_id=c.user_id AND t.project_id=c.project_id
            AND (public.weekly_test_window_state(t)<>'active' OR NOT public.weekly_test_window_fresh(t)))
      ORDER BY c.last_dispatch_at NULLS FIRST,c.user_id,c.project_id LIMIT 20 FOR UPDATE OF c SKIP LOCKED
  ), dispatched AS (
    UPDATE public.project_scheduler_control c SET last_dispatch_at=clock_timestamp()
      FROM selected s WHERE c.user_id=s.user_id AND c.project_id=s.project_id
      RETURNING c.user_id,c.project_id
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('ownerId',user_id,'projectId',project_id)),'[]'::jsonb) INTO targets FROM dispatched;
  RETURN targets;
END; $$;
REVOKE ALL ON FUNCTION public.next_weekly_preparation_targets() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.next_weekly_preparation_targets() TO service_role;

-- ---------------------------------------------------------------------------
-- Authoritative lease admission
-- ---------------------------------------------------------------------------

-- Body preserved verbatim from 20260910150000 plus the policy gate, which is
-- evaluated twice: once cheaply before the lease row is touched, and again
-- after the blocking lock is held and before a token can be issued.
-- Releasing, checking and recovering a lease are untouched, so reconciliation
-- after the cutoff keeps working while new claims are refused.
CREATE OR REPLACE FUNCTION public.claim_auto_scheduler_lease(p_user uuid,p_project text,p_period text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.auto_scheduler_leases%ROWTYPE; v_token uuid:=gen_random_uuid(); engine text; week_date date;
  win public.weekly_test_windows%ROWTYPE;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_period IS NULL OR p_period !~ '^([0-9]{4}-(0[1-9]|1[0-2])|week:[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2})$' THEN RAISE EXCEPTION 'invalid_scheduler_lease'; END IF;
  SELECT c.engine INTO engine FROM public.project_scheduler_control c WHERE user_id=p_user AND project_id=p_project;
  engine:=coalesce(engine,'monthly');
  IF engine='paused' OR (engine='monthly' AND p_period LIKE 'week:%') OR (engine='weekly' AND p_period NOT LIKE 'week:%') THEN
    RAISE EXCEPTION 'scheduler_engine_changed' USING ERRCODE='40001';
  END IF;
  IF p_period LIKE 'week:%' THEN
    week_date:=substring(p_period FROM 6)::date;
    IF extract(isodow FROM week_date)<>1 OR to_char(week_date,'YYYY-MM-DD')<>substring(p_period FROM 6) THEN RAISE EXCEPTION 'invalid_scheduler_lease'; END IF;
  END IF;
  -- Bounded observation gate: pre-T0, T1-exact, post-T1, revoked or drifted
  -- refuses a NEW claim. An absent window changes nothing.
  SELECT * INTO win FROM public.weekly_test_windows t WHERE t.user_id=p_user AND t.project_id=p_project;
  IF win.window_id IS NOT NULL
    AND (public.weekly_test_window_state(win)<>'active' OR NOT public.weekly_test_window_fresh(win)) THEN
    RAISE EXCEPTION 'weekly_test_window_closed' USING ERRCODE='40001';
  END IF;
  INSERT INTO public.auto_scheduler_leases(user_id,project_id,planned_period,token,status) VALUES(p_user,p_project,p_period,v_token,'active') ON CONFLICT(user_id,project_id) DO NOTHING;
  SELECT * INTO v FROM public.auto_scheduler_leases WHERE user_id=p_user AND project_id=p_project FOR UPDATE;
  -- The gate above was evaluated BEFORE this lease row was contended for. A
  -- concurrent holder (including the release path, which locks this row without
  -- holding workspace_meta) can make the wait outlast T1 or a committed stop,
  -- so the authoritative policy and a fresh server clock are read AGAIN now that
  -- the lease lock is held and immediately before any new token is created or
  -- returned. READ COMMITTED gives this second statement a new snapshot, so a
  -- revoke committed during the wait is visible; no policy row lock is taken,
  -- so the documented lock order gains no cycle. The refusal raises, which rolls
  -- back the speculative insert above and leaves a pre-existing lease row
  -- exactly as it was.
  SELECT * INTO win FROM public.weekly_test_windows t WHERE t.user_id=p_user AND t.project_id=p_project;
  IF win.window_id IS NOT NULL
    AND (public.weekly_test_window_state(win)<>'active' OR NOT public.weekly_test_window_fresh(win)) THEN
    RAISE EXCEPTION 'weekly_test_window_closed' USING ERRCODE='40001';
  END IF;
  IF v.token=v_token THEN RETURN v_token; END IF;
  IF v.status='released' THEN
    IF EXISTS(SELECT 1 FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project AND state IN ('running','unknown')) THEN RETURN NULL; END IF;
    UPDATE public.auto_scheduler_leases SET token=v_token,planned_period=p_period,status='active',acquired_at=now(),lease_until=now()+interval '15 minutes',finished_at=NULL WHERE user_id=p_user AND project_id=p_project;
    RETURN v_token;
  END IF;
  IF v.status='active' AND v.lease_until<=now() THEN UPDATE public.auto_scheduler_leases SET status='unknown' WHERE user_id=p_user AND project_id=p_project; END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.claim_auto_scheduler_lease(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auto_scheduler_lease(uuid,text,text) TO service_role;

-- ---------------------------------------------------------------------------
-- Authoritative stage admission and transactional allowance binding
-- ---------------------------------------------------------------------------

-- Body preserved verbatim from 20260910150000 plus the policy gate and the
-- atomic allowance/permit mint. The duplicate/no-takeover early return is
-- deliberately BEFORE the gate so an already-created stage stays readable,
-- finishable and recoverable after the cutoff; only CREATION of new paid work
-- is gated. Registration refuses a project that already has stages, so every
-- stage row of a registered project is on the authorized slot whitelist.
CREATE OR REPLACE FUNCTION public.begin_weekly_preparation_stage(p_user uuid,p_project text,p_lease uuid,p_revision integer,p_publish timestamptz,p_stage text,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE control public.project_scheduler_control%ROWTYPE; lease public.auto_scheduler_leases%ROWTYPE;
  current public.weekly_preparation_stages%ROWTYPE; zone text;
  win public.weekly_test_windows%ROWTYPE; contract public.weekly_test_window_contracts%ROWTYPE;
  authorized bigint; allowances integer; v_period text;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  SELECT * INTO control FROM public.project_scheduler_control WHERE user_id=p_user AND project_id=p_project;
  SELECT * INTO lease FROM public.auto_scheduler_leases WHERE user_id=p_user AND project_id=p_project;
  IF control.engine IS DISTINCT FROM 'weekly' OR p_revision IS NULL OR control.revision IS DISTINCT FROM p_revision
    OR p_lease IS NULL OR lease.token IS DISTINCT FROM p_lease OR lease.status IS DISTINCT FROM 'active' OR lease.lease_until<=clock_timestamp()
    OR lease.planned_period NOT LIKE 'week:%' THEN RAISE EXCEPTION 'scheduler_engine_changed' USING ERRCODE='40001'; END IF;
  IF p_publish IS NULL OR NOT isfinite(p_publish) OR p_publish<=clock_timestamp() OR p_stage IS NULL OR p_stage NOT IN ('research','content','image')
    OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_weekly_stage' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project AND data->'autoScheduler'->'enabled'='true'::jsonb) THEN RAISE EXCEPTION 'scheduler_disabled'; END IF;
  SELECT coalesce(nullif(btrim(data->'autoScheduler'->>'timeZone'),''),'Europe/Stockholm') INTO zone FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project;
  IF to_char(date_trunc('week',p_publish AT TIME ZONE zone),'YYYY-MM-DD')<>substring(lease.planned_period FROM 6) THEN RAISE EXCEPTION 'invalid_weekly_stage'; END IF;
  SELECT * INTO current FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project AND publish_at=p_publish AND stage=p_stage;
  IF current.request_id IS NOT NULL THEN
    -- No takeover, even if a setting, input hash, period or lease changed. An
    -- existing binding is never replaced or renewed by a duplicate call.
    RETURN jsonb_build_object('acquired',false,'requestId',current.request_id,'outputId',current.output_id,'state',CASE WHEN current.state='running' THEN 'unknown' ELSE current.state END,'inputHash',current.input_hash,'result',current.result);
  END IF;
  IF EXISTS(SELECT 1 FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project AND publish_at=p_publish AND state='cancelled') THEN RAISE EXCEPTION 'weekly_slot_cancelled'; END IF;
  IF (SELECT count(*) FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project)>=3000 THEN RAISE EXCEPTION 'weekly_stage_capacity'; END IF;
  -- Policy row at lock level 4, taken after workspace_meta (level 1) and never
  -- together with a budget row, so the total lock order above is respected.
  SELECT * INTO win FROM public.weekly_test_windows t
    WHERE t.user_id=p_user AND t.project_id=p_project FOR UPDATE;
  IF win.window_id IS NOT NULL AND NOT public.weekly_test_window_admits(win,p_publish,p_stage) THEN
    -- Off-list date, off-list stage, stale revision/configuration, pre-T0,
    -- T1-exact, post-T1 or revoked: no new paid stage is created at all.
    RAISE EXCEPTION 'weekly_test_window_closed' USING ERRCODE='40001';
  END IF;
  INSERT INTO public.weekly_preparation_stages(user_id,project_id,publish_at,stage,period,control_revision,lease_token,input_hash,state)
    VALUES(p_user,p_project,p_publish,p_stage,lease.planned_period,p_revision,p_lease,p_hash,'running') RETURNING * INTO current;
  IF win.window_id IS NOT NULL THEN
    SELECT * INTO contract FROM public.weekly_test_window_contracts c
      WHERE c.window_id=win.window_id AND c.stage=p_stage;
    SELECT count(*),coalesce(sum(x.ceiling_microusd),0) INTO allowances,authorized
      FROM public.weekly_test_window_allowances x WHERE x.window_id=win.window_id;
    -- Lifetime capacity is the sum of ORIGINAL authorized ceilings and a count,
    -- never the current monthly reserved balance or any settled cost.
    IF contract.stage IS NULL OR allowances>=6
      OR authorized+contract.ceiling_microusd>win.lifetime_ceiling_microusd THEN
      RAISE EXCEPTION 'weekly_test_window_exhausted' USING ERRCODE='40001';
    END IF;
    v_period:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM');
    -- The exact existing permit schema, minted in THIS transaction from the
    -- stage's ACTUAL generated request ID and its real lease token, expiring at
    -- T1 and scoped to the current UTC expense period.
    INSERT INTO public.ai_expense_permits(request_id,user_id,job_id,period,provider,model,operation,ceiling_microusd,expires_at)
      VALUES(current.request_id,p_user,p_lease,v_period,contract.provider,contract.model,
             contract.operation,contract.ceiling_microusd,win.ends_at);
    INSERT INTO public.weekly_test_window_allowances(window_id,publish_at,stage,user_id,project_id,
        request_id,job_id,provider,model,operation,ceiling_microusd,period,expires_at)
      VALUES(win.window_id,p_publish,p_stage,p_user,p_project,current.request_id,p_lease,
             contract.provider,contract.model,contract.operation,contract.ceiling_microusd,
             v_period,win.ends_at);
  END IF;
  RETURN jsonb_build_object('acquired',true,'requestId',current.request_id,'outputId',current.output_id,'state',current.state,'inputHash',current.input_hash,'result',NULL);
END; $$;
REVOKE ALL ON FUNCTION public.begin_weekly_preparation_stage(uuid,text,uuid,integer,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_weekly_preparation_stage(uuid,text,uuid,integer,timestamptz,text,text) TO service_role;

-- ---------------------------------------------------------------------------
-- Monetary admission
-- ---------------------------------------------------------------------------

-- Body preserved verbatim from 20260919130000 plus ONE added policy block.
-- Every existing refusal, provisioning rule, lock order, manual-budget rule and
-- permit rule is unchanged, and an unregistered project is completely
-- unaffected. The new block is placed AFTER the permit validation and BEFORE the
-- balance check, and reuses the already-handled refusal reasons
-- 'permit_required' (no binding) and 'permit_invalid' (binding mismatch) so no
-- caller contract changes.
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
  allowance public.weekly_test_window_allowances%ROWTYPE;
  win public.weekly_test_windows%ROWTYPE;
BEGIN
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

  IF p_require_manual_budget AND p_provider <> 'dataforseo'
     AND (a.scope IS NULL OR a.provenance <> 'manual') THEN
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
    IF permit.revoked OR permit.expires_at <= clock_timestamp()
       OR permit.period <> v_period OR permit.user_id <> p_user
       OR permit.job_id <> p_job OR permit.provider <> p_provider
       OR permit.model <> p_model OR permit.operation <> p_operation
       OR permit.ceiling_microusd <> p_ceiling THEN
      RETURN QUERY SELECT false,'permit_invalid',v_period; RETURN;
    END IF;
  END IF;

  -- Bounded observation policy. The association is derived from the trusted
  -- durable allowance/stage rows, NEVER from a caller parameter. The policy row
  -- is read WITHOUT a lock to keep the documented total lock order (this path
  -- already holds the global/account budget rows).
  SELECT * INTO allowance FROM public.weekly_test_window_allowances x
    WHERE x.request_id=p_request FOR UPDATE;
  IF allowance.request_id IS NOT NULL THEN
    SELECT * INTO win FROM public.weekly_test_windows t WHERE t.window_id=allowance.window_id;
    IF win.window_id IS NULL
       OR public.weekly_test_window_state(win)<>'active'
       OR NOT public.weekly_test_window_fresh(win)
       OR allowance.user_id<>p_user OR allowance.job_id<>p_job
       OR allowance.provider<>p_provider OR allowance.model<>p_model
       OR allowance.operation<>p_operation OR allowance.ceiling_microusd<>p_ceiling
       OR allowance.period<>v_period
       OR permit.request_id IS NULL
       OR NOT EXISTS(SELECT 1 FROM public.weekly_test_window_slots s
         WHERE s.window_id=allowance.window_id AND s.publish_at=allowance.publish_at)
       OR NOT EXISTS(SELECT 1 FROM public.weekly_test_window_contracts c
         WHERE c.window_id=allowance.window_id AND c.stage=allowance.stage
           AND c.provider=p_provider AND c.model=p_model
           AND c.operation=p_operation AND c.ceiling_microusd=p_ceiling)
       OR NOT EXISTS(SELECT 1 FROM public.weekly_preparation_stages s
         WHERE s.user_id=allowance.user_id AND s.project_id=allowance.project_id
           AND s.request_id=p_request AND s.publish_at=allowance.publish_at
           AND s.stage=allowance.stage AND s.lease_token=p_job)
       OR (SELECT count(*) FROM public.weekly_test_window_allowances x2
            WHERE x2.window_id=allowance.window_id)>6
       OR (SELECT coalesce(sum(x3.ceiling_microusd),0) FROM public.weekly_test_window_allowances x3
            WHERE x3.window_id=allowance.window_id)>win.lifetime_ceiling_microusd THEN
      RETURN QUERY SELECT false,'permit_invalid',v_period; RETURN;
    END IF;
  ELSIF EXISTS (
      SELECT 1 FROM public.weekly_preparation_stages s
        JOIN public.weekly_test_windows t ON t.user_id=s.user_id AND t.project_id=s.project_id
        WHERE s.user_id=p_user AND s.request_id=p_request)
    OR EXISTS (
      SELECT 1 FROM public.weekly_test_window_allowances x4 WHERE x4.job_id=p_job) THEN
    -- A stage of a registered project, or a fresh request identity reusing a
    -- bound lease token, without its exact durable binding: refuse even when
    -- both budgets are entirely unrestricted (requires_permit=false).
    RETURN QUERY SELECT false,'permit_required',v_period; RETURN;
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
REVOKE ALL ON FUNCTION public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean) TO service_role;

-- Re-assert that replacing the four functions above introduced no second
-- overload, so there is exactly one privileged surface of each to audit.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
    WHERE s.nspname='public' AND p.proname IN ('reserve_ai_expense','begin_weekly_preparation_stage',
      'claim_auto_scheduler_lease','next_weekly_preparation_targets');
  IF n<>4 THEN RAISE EXCEPTION 'weekly_test_window_overload_present'; END IF;
END $$;
