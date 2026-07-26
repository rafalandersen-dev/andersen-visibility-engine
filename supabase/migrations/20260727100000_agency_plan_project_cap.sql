-- Agency plan (owner decisions 2026-07-26/27): plan-aware project cap +
-- extras-merge semantics in the batch RPC.
--
-- HONESTY NOTE (review MEDIUM-2): workspace_meta.subscription is written
-- verbatim from the client (no webhook sync yet), so this gate is
-- honest-path only — it prevents ACCIDENTAL leakage (cancelled/pending users
-- never see agency features), not determined abuse. Server-authoritative
-- subscription (webhook-written, refused in the batch RPC) is a PRE-LAUNCH
-- item before selling Agency; the AI-credit ceiling is the real exposure.
CREATE OR REPLACE FUNCTION public.workspace_entities_project_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_count int;
  max_allowed   int := 5;
  sub jsonb;
BEGIN
  IF NEW.collection <> 'projects' THEN
    RETURN NEW;
  END IF;
  -- Existing PK = edit-via-upsert or idempotent backfill replay, never a new
  -- project (BEFORE INSERT fires for ON CONFLICT rows too) — cap must not fire.
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

  SELECT subscription INTO sub FROM public.workspace_meta WHERE user_id = NEW.user_id;
  IF sub IS NOT NULL
     AND sub->>'planId' = 'agency'
     AND sub->>'status' IN ('active', 'manualBeta', 'manualComped') THEN
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
$$;

-- Batch RPC v2 (review MEDIUM-3 + LOW-4):
--  - meta is applied FIRST, so a single batch carrying both a plan upgrade
--    and a new project sees the fresh subscription in the cap trigger;
--  - extras MERGES instead of replaces: a stale pre-agency bundle whose
--    snapshot carries no agencyBranding key can no longer wipe it — deletes
--    are explicit JSON null sentinels, stripped after the merge.
CREATE OR REPLACE FUNCTION public.apply_workspace_entity_batch(
  p_user_id uuid,
  p_upserts jsonb DEFAULT '[]'::jsonb,
  p_deletes jsonb DEFAULT '[]'::jsonb,
  p_meta    jsonb DEFAULT '{}'::jsonb,
  p_expected_rev bigint DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_rev bigint;
  cur_rev bigint;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

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
    subscription      = CASE WHEN p_meta ? 'subscription'   THEN p_meta->'subscription'   ELSE subscription END,
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
$$;
