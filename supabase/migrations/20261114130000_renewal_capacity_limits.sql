-- UNRELEASED candidate. Renewal-time allowance at the database boundary (RN-02/RN-03).
--
-- 1. project_plan_allowance: the accepted per-plan bundles (PLAN_SEATS working/viewer and
--    PLAN_LIMITS.maxProjects in src/lib/billing.ts), one SQL map instead of the fixed
--    "5, or 15 for Agency" project caps. An unknown plan is Free, never a wider bundle.
-- 2. project_team_seat_allowance: the owner's CURRENT allowance, re-read from the
--    authoritative entitlement and the verified live Stripe projection, under a share
--    lock on exactly the rows stripe_apply_subscription_projection rewrites and in its
--    order (subscription row, then entitlement row). A team mutation parked with an older,
--    larger allowance therefore waits for an in-flight renewal and then reads the reduced
--    one; a renewal arriving second waits for the mutation, which was valid when it ran.
--    Periods are checked against clock_timestamp() taken after those locks, never against the
--    transaction-start now(), so a request that spans a period end gets the lapsed allowance.
-- 3. assert_project_team_seat (same signature, both callers unchanged) clamps the supplied
--    limits to that allowance, so a stale or omitted limit can only narrow. The NULL-limit
--    legacy signature is no longer a bypass. Removal, neutral working-role changes and the
--    acceptance of a reserved invitation still need no seat and stay allowed over the limit.
-- 4. Both project-cap triggers use the plan map. Existing projects stay readable/editable
--    above a reduced cap; only a NEW project is refused. The legacy blob trigger accepts an
--    over-cap save that adds no project, and the one-time lazy backfill (no workspace_meta
--    row yet) may carry over the legacy blob's own project ids, never new ones in their place.
-- Nothing here removes a member, revokes an invitation, deletes a project or bills anyone.
-- Stripe tables are optional: without the dormant foundation no extra seats are granted.

CREATE FUNCTION public.project_plan_allowance(p_plan text)
RETURNS TABLE(plan_id text, working integer, viewer integer, projects integer)
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT v.plan_id, v.working, v.viewer, v.projects FROM (VALUES
    ('freePreview',1,1,1),('starter',2,2,1),('growth',3,5,3),('pro',5,10,5),('agency',10,50,15)
  ) v(plan_id,working,viewer,projects)
  WHERE v.plan_id = CASE WHEN p_plan IN ('starter','growth','pro','agency') THEN p_plan ELSE 'freePreview' END;
$$;

CREATE FUNCTION public.project_team_seat_allowance(p_owner uuid)
RETURNS TABLE(plan_id text, purchased integer, working integer, viewer integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE bundle record; extra integer := 0; v_plan text; v_now timestamptz;
BEGIN
  IF p_owner IS NULL THEN RAISE EXCEPTION 'team_seat_unavailable'; END IF;
  IF to_regclass('public.stripe_subscriptions') IS NOT NULL THEN
    PERFORM 1 FROM public.stripe_subscriptions s WHERE s.user_id=p_owner FOR SHARE;
  END IF;
  PERFORM 1 FROM public.entitlements e WHERE e.user_id=p_owner FOR SHARE;
  -- The predicates of active_plan_id and stripe_purchased_working_seats, evaluated against the
  -- wall clock AFTER the lock wait: their now() is the transaction start, so a request that began
  -- before a period end would otherwise keep the expired allowance.
  v_now := clock_timestamp();
  SELECT e.plan_id INTO v_plan FROM public.entitlements e
    WHERE e.user_id=p_owner AND e.status IN ('active','manualBeta','manualComped')
      AND e.plan_id<>'freePreview' AND (e.current_period_end IS NULL OR e.current_period_end>v_now);
  SELECT * INTO bundle FROM public.project_plan_allowance(v_plan);
  IF bundle.plan_id<>'freePreview' AND to_regclass('public.stripe_subscriptions') IS NOT NULL THEN
    SELECT s.seat_quantity INTO extra FROM public.stripe_subscriptions s
      JOIN public.entitlements e ON e.user_id=s.user_id
     WHERE s.user_id=p_owner AND s.mode='live' AND s.status IN ('active','trialing')
       AND s.latest_invoice_paid AND s.current_period_end IS NOT NULL
       AND isfinite(s.current_period_end) AND s.current_period_end>v_now
       AND e.provider='stripe' AND e.status='active' AND e.plan_id=s.plan_id
       AND e.provider_subscription_id=s.subscription_id AND e.current_period_end IS NOT NULL
       AND isfinite(e.current_period_end) AND e.current_period_end>v_now
     LIMIT 1;
  END IF;
  IF extra IS NULL OR extra<0 OR extra>1000 THEN extra := 0; END IF;
  RETURN QUERY SELECT bundle.plan_id, extra, bundle.working+extra, bundle.viewer;
END; $$;

-- Body of 20260914150000 with the allowance re-read here instead of trusted from the caller.
CREATE OR REPLACE FUNCTION public.assert_project_team_seat(p_owner uuid,p_project text,p_email text,p_role text,p_working_seats integer,p_viewer_seats integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE works boolean; has_current boolean; current_works boolean;
  retains_working boolean; retains_viewing boolean; prior_present boolean; prior_working boolean;
  will_work boolean; used record; cap record;
BEGIN
  IF p_email IS NULL OR p_role IS NULL OR p_role NOT IN ('viewer','editor','reviewer')
    OR (p_working_seats IS NOT NULL AND p_working_seats<1) OR (p_viewer_seats IS NOT NULL AND p_viewer_seats<0)
    THEN RAISE EXCEPTION 'team_seat_unavailable'; END IF;
  SELECT least(a.working,coalesce(p_working_seats,a.working)) AS working,
         least(a.viewer,coalesce(p_viewer_seats,a.viewer)) AS viewer
    INTO cap FROM public.project_team_seat_allowance(p_owner) a;
  works:=p_role IN ('editor','reviewer');
  SELECT coalesce(bool_or(true),false),coalesce(bool_or(m.role IN ('editor','reviewer')),false)
    INTO has_current,current_works FROM public.project_team_members m JOIN auth.users u ON u.id=m.actor_id
      WHERE m.owner_id=p_owner AND m.project_id=p_project AND m.active
        AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) AND lower(btrim(u.email))=p_email;
  SELECT coalesce(bool_or(role IN ('editor','reviewer')),false),coalesce(bool_or(role='viewer'),false)
    INTO retains_working,retains_viewing FROM (
      SELECT m.role FROM public.project_team_members m JOIN auth.users u ON u.id=m.actor_id
        WHERE m.owner_id=p_owner AND m.active AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
          AND m.project_id<>p_project AND lower(btrim(u.email))=p_email
      UNION ALL
      SELECT role FROM public.project_team_invitations
        WHERE owner_id=p_owner AND state='pending' AND expires_at>clock_timestamp() AND recipient_email=p_email) held;
  will_work:=works OR retains_working;
  prior_working:=(has_current AND current_works) OR retains_working;
  prior_present:=has_current OR retains_working OR retains_viewing;
  IF will_work THEN
    IF NOT prior_working THEN
      SELECT * INTO used FROM public.count_project_team_seats(p_owner,p_email);
      IF used.working>=cap.working THEN RAISE EXCEPTION 'team_seat_limit'; END IF;
    END IF;
  ELSIF NOT (prior_present AND NOT prior_working) THEN
    SELECT * INTO used FROM public.count_project_team_seats(p_owner,p_email);
    IF used.viewer>=cap.viewer THEN RAISE EXCEPTION 'team_seat_limit'; END IF;
  END IF;
END; $$;

-- Body of 20260730205423 with the plan map and the identity-bound lazy-backfill carry-over.
CREATE OR REPLACE FUNCTION public.workspace_entities_project_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE project_count int; max_allowed int;
BEGIN
  IF NEW.collection <> 'projects' THEN RETURN NEW; END IF;
  -- An existing id is an edit or an idempotent replay, never a new project.
  IF EXISTS (SELECT 1 FROM public.workspace_entities WHERE user_id=NEW.user_id
      AND collection='projects' AND entity_id=NEW.entity_id) THEN RETURN NEW; END IF;
  IF public.has_role(NEW.user_id,'owner') THEN RETURN NEW; END IF;
  SELECT a.projects INTO max_allowed FROM public.project_plan_allowance(public.active_plan_id(NEW.user_id)) a;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_meta WHERE user_id=NEW.user_id) THEN
    -- Not migrated yet: backfill_workspace_entities may carry over the legacy blob's OWN project
    -- ids. Those ids also count as in use, so they never leave a spare slot for a new id.
    IF NEW.entity_id IN (SELECT p->>'id' FROM public.workspaces w, jsonb_array_elements(
        CASE WHEN jsonb_typeof(w.data->'projects')='array' THEN w.data->'projects' ELSE '[]'::jsonb END) p
        WHERE w.user_id=NEW.user_id) THEN RETURN NEW; END IF;
    SELECT count(*) INTO project_count FROM (
      SELECT entity_id FROM public.workspace_entities WHERE user_id=NEW.user_id AND collection='projects'
      UNION
      SELECT p->>'id' FROM public.workspaces w, jsonb_array_elements(
        CASE WHEN jsonb_typeof(w.data->'projects')='array' THEN w.data->'projects' ELSE '[]'::jsonb END) p
        WHERE w.user_id=NEW.user_id) ids;
  ELSE
    SELECT count(*) INTO project_count FROM public.workspace_entities
      WHERE user_id=NEW.user_id AND collection='projects';
  END IF;
  IF project_count >= max_allowed THEN
    RAISE EXCEPTION 'Project limit reached (%). Upgrade your plan to add more projects.', max_allowed
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $function$;

-- Legacy blob: an over-cap save that adds no project (no more entries, every id already
-- present) keeps saving, so a reduced plan never freezes edits or deletions.
CREATE OR REPLACE FUNCTION public.enforce_workspace_project_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE project_count int; max_allowed int;
BEGIN
  IF NEW.data IS NULL OR jsonb_typeof(NEW.data->'projects') IS DISTINCT FROM 'array' THEN RETURN NEW; END IF;
  project_count := jsonb_array_length(NEW.data->'projects');
  IF public.has_role(NEW.user_id,'owner') THEN RETURN NEW; END IF;
  SELECT a.projects INTO max_allowed FROM public.project_plan_allowance(public.active_plan_id(NEW.user_id)) a;
  IF project_count <= max_allowed THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND jsonb_typeof(OLD.data->'projects')='array'
    AND project_count <= jsonb_array_length(OLD.data->'projects')
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.data->'projects') n
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(OLD.data->'projects') o
        WHERE o->'id' IS NOT DISTINCT FROM n->'id'))
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Project limit reached (%). Upgrade your plan to add more projects.', max_allowed
    USING ERRCODE = 'check_violation';
END; $function$;

REVOKE ALL ON FUNCTION public.project_plan_allowance(text),
  public.assert_project_team_seat(uuid,text,text,text,integer,integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.project_team_seat_allowance(uuid),
  public.workspace_entities_project_cap(), public.enforce_workspace_project_cap()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_team_seat_allowance(uuid),
  public.workspace_entities_project_cap() TO service_role;
