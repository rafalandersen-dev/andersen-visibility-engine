-- 1) Entitlements: authoritative, service-role-write-only plan state.
CREATE TABLE IF NOT EXISTS public.entitlements (
  user_id uuid PRIMARY KEY,
  plan_id text NOT NULL DEFAULT 'freePreview',
  status text NOT NULL DEFAULT 'freePreview',
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'paddle',
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entitlements_provider_subscription_idx
  ON public.entitlements (provider_subscription_id);
CREATE INDEX IF NOT EXISTS entitlements_provider_customer_idx
  ON public.entitlements (provider_customer_id);

-- Read-only for the owning user; writes are service-role only (no INSERT/UPDATE/DELETE grant).
GRANT SELECT ON public.entitlements TO authenticated;
GRANT ALL ON public.entitlements TO service_role;

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own entitlement" ON public.entitlements;
CREATE POLICY "Users view own entitlement"
  ON public.entitlements FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS entitlements_set_updated_at ON public.entitlements;
CREATE TRIGGER entitlements_set_updated_at
  BEFORE UPDATE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) Webhook idempotency ledger (service role only).
CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  event_id text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'paddle',
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.billing_webhook_events TO service_role;
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

-- 3) Backfill from the (previously user-writable) workspace subscription blob.
INSERT INTO public.entitlements (
  user_id, plan_id, status, current_period_end, cancel_at_period_end,
  provider, provider_customer_id, provider_subscription_id
)
SELECT
  m.user_id,
  COALESCE(NULLIF(m.subscription->>'planId', ''), 'freePreview'),
  COALESCE(NULLIF(m.subscription->>'status', ''), 'freePreview'),
  CASE WHEN (m.subscription->>'currentPeriodEnd') ~ '^\d{4}-\d{2}-\d{2}'
       THEN (m.subscription->>'currentPeriodEnd')::timestamptz END,
  COALESCE((m.subscription->>'cancelAtPeriodEnd')::boolean, false),
  'paddle',
  NULLIF(m.subscription->>'paddleCustomerId', ''),
  NULLIF(m.subscription->>'paddleSubscriptionId', '')
FROM public.workspace_meta m
WHERE m.subscription IS NOT NULL
  AND jsonb_typeof(m.subscription) = 'object'
ON CONFLICT (user_id) DO NOTHING;

-- Legacy blob users not yet migrated to workspace_meta.
INSERT INTO public.entitlements (
  user_id, plan_id, status, current_period_end, cancel_at_period_end,
  provider, provider_customer_id, provider_subscription_id
)
SELECT DISTINCT ON (w.user_id)
  w.user_id,
  COALESCE(NULLIF(w.data->'subscription'->>'planId', ''), 'freePreview'),
  COALESCE(NULLIF(w.data->'subscription'->>'status', ''), 'freePreview'),
  CASE WHEN (w.data->'subscription'->>'currentPeriodEnd') ~ '^\d{4}-\d{2}-\d{2}'
       THEN (w.data->'subscription'->>'currentPeriodEnd')::timestamptz END,
  COALESCE((w.data->'subscription'->>'cancelAtPeriodEnd')::boolean, false),
  'paddle',
  NULLIF(w.data->'subscription'->>'paddleCustomerId', ''),
  NULLIF(w.data->'subscription'->>'paddleSubscriptionId', '')
FROM public.workspaces w
WHERE jsonb_typeof(w.data->'subscription') = 'object'
ORDER BY w.user_id, w.updated_at DESC
ON CONFLICT (user_id) DO NOTHING;

-- 4) Single source of truth for "what plan is this user actually on".
--    Fails closed: no row, unknown status or unreadable data => freePreview.
CREATE OR REPLACE FUNCTION public.active_plan_id(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT e.plan_id
       FROM public.entitlements e
      WHERE e.user_id = _user_id
        AND e.status IN ('active', 'manualBeta', 'manualComped')
        AND e.plan_id <> 'freePreview'
        AND (e.current_period_end IS NULL OR e.current_period_end > now())
      LIMIT 1),
    'freePreview');
$$;

REVOKE ALL ON FUNCTION public.active_plan_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.active_plan_id(uuid) TO authenticated, service_role;

-- 5) Project caps now read entitlements, never workspace_meta.
CREATE OR REPLACE FUNCTION public.workspace_entities_project_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  project_count int;
  max_allowed   int := 5;
  plan          text;
BEGIN
  IF NEW.collection <> 'projects' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_entities
    WHERE user_id = NEW.user_id AND collection = 'projects'
      AND entity_id = NEW.entity_id
  ) THEN
    RETURN NEW;
  END IF;
  IF public.has_role(NEW.user_id, 'owner') THEN
    RETURN NEW;
  END IF;

  plan := public.active_plan_id(NEW.user_id);
  IF plan = 'agency' THEN
    max_allowed := 15;
  END IF;

  SELECT count(*) INTO project_count
    FROM public.workspace_entities
    WHERE user_id = NEW.user_id AND collection = 'projects';
  IF project_count >= max_allowed THEN
    RAISE EXCEPTION 'Project limit reached (%). Upgrade your plan to add more projects.', max_allowed
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- 6) Workspace saves from the app can no longer write `subscription`.
CREATE OR REPLACE FUNCTION public.apply_workspace_entity_batch(
  p_user_id uuid,
  p_upserts jsonb DEFAULT '[]'::jsonb,
  p_deletes jsonb DEFAULT '[]'::jsonb,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_expected_rev bigint DEFAULT NULL::bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_rev bigint;
  cur_rev bigint;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Entitlements are authoritative and service-role-only. Ignore any
  -- `subscription` supplied by a workspace save so a stale or forged value
  -- can never re-promote an account.
  p_meta := COALESCE(p_meta, '{}'::jsonb) - 'subscription';

  IF p_expected_rev IS NOT NULL THEN
    SELECT rev INTO cur_rev FROM public.workspace_meta
      WHERE user_id = p_user_id FOR UPDATE;
    IF cur_rev IS NULL THEN
      RAISE EXCEPTION 'workspace_not_migrated' USING ERRCODE = 'P0002';
    END IF;
    IF cur_rev <> p_expected_rev THEN
      RAISE EXCEPTION 'workspace_conflict' USING ERRCODE = '40001';
    END IF;
  END IF;

  UPDATE public.workspace_meta SET
    active_project_id = COALESCE(p_meta->>'activeProjectId', active_project_id),
    billing_profile   = CASE WHEN p_meta ? 'billingProfile' THEN p_meta->'billingProfile' ELSE billing_profile END,
    extras            = CASE WHEN p_meta ? 'extras'
                             THEN jsonb_strip_nulls(COALESCE(extras, '{}'::jsonb) || (p_meta->'extras'))
                             ELSE extras END,
    rev = rev + 1
  WHERE user_id = p_user_id
  RETURNING rev INTO new_rev;

  IF new_rev IS NULL THEN
    RAISE EXCEPTION 'workspace_not_migrated' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.workspace_entities we
  USING jsonb_array_elements(COALESCE(p_deletes, '[]'::jsonb)) AS d
  WHERE we.user_id = p_user_id
    AND we.collection = d->>'collection'
    AND we.entity_id = d->>'entity_id';

  INSERT INTO public.workspace_entities (user_id, collection, entity_id, ord, data)
  SELECT p_user_id,
         u->>'collection',
         u->>'entity_id',
         COALESCE((u->>'ord')::int, 0),
         u->'data'
  FROM jsonb_array_elements(COALESCE(p_upserts, '[]'::jsonb)) AS u
  ON CONFLICT (user_id, collection, entity_id)
  DO UPDATE SET data = EXCLUDED.data, ord = EXCLUDED.ord, updated_at = now();

  RETURN new_rev;
END;
$function$;

-- 7) Legacy blob-table cap trigger: same entitlement-based rule.
CREATE OR REPLACE FUNCTION public.enforce_workspace_project_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  project_count int;
  max_allowed   int := 5;
BEGIN
  IF NEW.data IS NULL OR jsonb_typeof(NEW.data->'projects') IS DISTINCT FROM 'array' THEN
    RETURN NEW;
  END IF;

  project_count := jsonb_array_length(NEW.data->'projects');

  IF public.has_role(NEW.user_id, 'owner') THEN
    RETURN NEW;
  END IF;

  IF public.active_plan_id(NEW.user_id) = 'agency' THEN
    max_allowed := 15;
  END IF;

  IF project_count > max_allowed THEN
    RAISE EXCEPTION 'Project limit reached (%). Upgrade your plan to add more projects.', max_allowed
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;