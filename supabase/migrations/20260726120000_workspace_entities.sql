-- Workspace blob → per-entity storage (scale condition, owner GO 2026-07-26).
--
-- The whole-workspace JSONB (public.workspaces.data, avg 169 kB / max 801 kB,
-- ~120 ms per full upsert) is replaced by per-entity rows so a save writes
-- ~2 kB. The 2026-07-25 outage (800 kB upsert storm → PGRST002) was this
-- mechanism failing in practice. public.workspaces STAYS as the lazy-backfill
-- source and as a harmless sink for stale old-bundle clients during the
-- stale-bundle-guard window; nothing reads it once workspace_meta exists.

-- ---- Tables ----------------------------------------------------------------

CREATE TABLE public.workspace_entities (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection text NOT NULL,
  entity_id  text NOT NULL,
  -- Array position from the source doc; assembly orders by it so lists keep
  -- their blob-era order (most lists are append-only, so ord churn is rare).
  ord        integer NOT NULL DEFAULT 0,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, collection, entity_id)
);

CREATE INDEX workspace_entities_user_collection_idx
  ON public.workspace_entities (user_id, collection, ord);

-- Scalar/meta fields of the workspace doc. The row's EXISTENCE is the
-- "this user is migrated" marker — readers go entities-first iff it exists.
CREATE TABLE public.workspace_meta (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_project_id text NOT NULL DEFAULT '',
  subscription      jsonb,
  billing_profile   jsonb,
  -- Unknown top-level scalar fields from the doc (forward compat — mirrors
  -- workspace-merge's "unknown server fields preserved" rule).
  extras            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Write-batch counter (successor of workspaces.rev): bumped once per
  -- applied batch; read by clients purely as a change signal.
  rev               bigint NOT NULL DEFAULT 0,
  migrated_at       timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ---- RLS -------------------------------------------------------------------

ALTER TABLE public.workspace_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_meta     ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_entities_own ON public.workspace_entities
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY workspace_meta_own ON public.workspace_meta
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---- Guards (semantics carried over from the blob) --------------------------

-- Newer-wins per entity (workspace-merge H2 at the DB level): an UPDATE whose
-- payload carries a strictly OLDER updatedAt than the stored payload is
-- silently skipped, so a stale tab can never clobber a cron's publish outcome.
-- Missing/equal/unparsable stamps allow the write (unsaved edits often carry
-- no stamp).
CREATE OR REPLACE FUNCTION public.workspace_entities_newer_wins()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_ts timestamptz;
  new_ts timestamptz;
BEGIN
  BEGIN
    old_ts := (OLD.data->>'updatedAt')::timestamptz;
    new_ts := (NEW.data->>'updatedAt')::timestamptz;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;
  IF old_ts IS NOT NULL AND new_ts IS NOT NULL AND new_ts < old_ts THEN
    RETURN NULL; -- skip: stored copy is newer
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_entities_newer_wins
  BEFORE UPDATE ON public.workspace_entities
  FOR EACH ROW EXECUTE FUNCTION public.workspace_entities_newer_wins();

-- Project cap (successor of enforce_workspace_project_cap on the blob):
-- non-owners hold at most 5 project rows. Counts existing rows, so backfilling
-- a full 5-project workspace passes.
CREATE OR REPLACE FUNCTION public.workspace_entities_project_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_count int;
  max_allowed   int := 5;
BEGIN
  IF NEW.collection <> 'projects' THEN
    RETURN NEW;
  END IF;
  -- BEFORE INSERT fires for EVERY proposed row of INSERT..ON CONFLICT,
  -- including ones that resolve to DO UPDATE / DO NOTHING (review HIGH-1):
  -- a row whose PK already exists is an edit or an idempotent backfill
  -- replay, never a new project — the cap must not fire, or a non-owner at
  -- 5 projects could never save ANY batch containing a project edit again.
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

CREATE TRIGGER workspace_entities_project_cap
  BEFORE INSERT ON public.workspace_entities
  FOR EACH ROW EXECUTE FUNCTION public.workspace_entities_project_cap();

CREATE OR REPLACE FUNCTION public.tg_workspace_meta_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_workspace_meta_updated_at
  BEFORE UPDATE ON public.workspace_meta
  FOR EACH ROW EXECUTE FUNCTION public.tg_workspace_meta_updated_at();

-- ---- Atomic batch write ------------------------------------------------------
--
-- ONE RPC per save: upserts + deletes + meta patch + rev bump in a single
-- transaction. Callers: the client store (authenticated; may only touch their
-- own rows) and server writers (service role; pass any user_id).
--
-- p_upserts: [{collection, entity_id, ord, data}, ...]
-- p_deletes: [{collection, entity_id}, ...]
-- p_meta:    {} or subset of {activeProjectId, subscription, billingProfile, extras}
--            (subscription/billingProfile/extras replace whole values; a key
--            ABSENT from p_meta leaves the stored value untouched)
-- p_expected_rev: optional optimistic-concurrency precondition. Server
-- read-modify-write mutations pass the rev they read (mutateWorkspace keeps
-- its serialize-and-retry contract); the client store passes NULL — its saves
-- are per-entity last-write-wins arbitrated by the newer-wins trigger.
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

  -- Deletes FIRST so a delete-one-create-one swap stays within the project
  -- cap (review HIGH-1 scenario 3).
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

  UPDATE public.workspace_meta SET
    active_project_id = COALESCE(p_meta->>'activeProjectId', active_project_id),
    subscription      = CASE WHEN p_meta ? 'subscription'   THEN p_meta->'subscription'   ELSE subscription END,
    billing_profile   = CASE WHEN p_meta ? 'billingProfile' THEN p_meta->'billingProfile' ELSE billing_profile END,
    extras            = CASE WHEN p_meta ? 'extras'         THEN p_meta->'extras'         ELSE extras END,
    rev = rev + 1
  WHERE user_id = p_user_id
  RETURNING rev INTO new_rev;

  IF new_rev IS NULL THEN
    RAISE EXCEPTION 'workspace_not_migrated' USING ERRCODE = 'P0002';
  END IF;

  RETURN new_rev;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_workspace_entity_batch(uuid, jsonb, jsonb, jsonb, bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_workspace_entity_batch(uuid, jsonb, jsonb, jsonb, bigint) TO authenticated, service_role;

-- ---- One-call read -----------------------------------------------------------
-- Hydration = one RPC returning {meta, entities}; null when the user has no
-- meta row yet (caller falls back to the blob + lazy backfill).
CREATE OR REPLACE FUNCTION public.read_workspace_bundle(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_row jsonb;
  ents jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(m) INTO meta_row FROM (
    SELECT active_project_id, subscription, billing_profile, extras, rev
    FROM public.workspace_meta WHERE user_id = p_user_id
  ) m;
  IF meta_row IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'collection', collection, 'entity_id', entity_id, 'ord', ord, 'data', data)
           ORDER BY collection, ord, entity_id), '[]'::jsonb)
    INTO ents
    FROM public.workspace_entities WHERE user_id = p_user_id;

  RETURN jsonb_build_object('meta', meta_row, 'entities', ents);
END;
$$;

REVOKE ALL ON FUNCTION public.read_workspace_bundle(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.read_workspace_bundle(uuid) TO authenticated, service_role;

-- ---- One-time backfill --------------------------------------------------------
-- App code does the split (single source of truth = workspace-entities.ts)
-- and calls this once per unmigrated user. Everything is ON CONFLICT DO
-- NOTHING and meta lands LAST inside one transaction, so a concurrent
-- double-backfill is idempotent and the meta row (the "migrated" marker)
-- only appears together with a full entity set. Returns true if THIS call
-- created the meta row.
CREATE OR REPLACE FUNCTION public.backfill_workspace_entities(
  p_user_id  uuid,
  p_entities jsonb,
  p_meta     jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.workspace_entities (user_id, collection, entity_id, ord, data)
  SELECT p_user_id,
         u->>'collection',
         u->>'entity_id',
         COALESCE((u->>'ord')::int, 0),
         u->'data'
  FROM jsonb_array_elements(COALESCE(p_entities, '[]'::jsonb)) AS u
  ON CONFLICT (user_id, collection, entity_id) DO NOTHING;

  INSERT INTO public.workspace_meta (user_id, active_project_id, subscription, billing_profile, extras)
  VALUES (
    p_user_id,
    COALESCE(p_meta->>'activeProjectId', ''),
    p_meta->'subscription',
    p_meta->'billingProfile',
    COALESCE(p_meta->'extras', '{}'::jsonb)
  )
  ON CONFLICT (user_id) DO NOTHING
  RETURNING true INTO created;

  RETURN COALESCE(created, false);
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_workspace_entities(uuid, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.backfill_workspace_entities(uuid, jsonb, jsonb) TO authenticated, service_role;
