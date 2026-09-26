-- Citation Intelligence v1 — owner authoring stage (26 September 2026). ADDITIVE candidate, UNAPPLIED until its
-- independent migration/security review. It never edits or replays the applied P2 (20260920190000) / P3
-- (20260920200000) migrations; it only adds columns, helper/trigger/wrapper functions and grants on top of them.
--
-- What it fixes (product direction, "Decisions after refined design"):
--  1. Server-authenticated panel binding. P3 stores the finding/improvement scope (panel id + version + client)
--     OWNER-DECLARED and never checks it against the released P2 `citation_panels`. From this migration on, EVERY
--     inserted finding/improvement row — through the P3 v1 RPCs, the v2 wrappers below, or any future path — must
--     reference a stored, LOCKED, owner-approved panel version whose client name/market equal the declared scope.
--     Enforcement lives in a BEFORE INSERT trigger, so no callable entry point (the P3 RPCs stay GRANTed to
--     service_role for deployment compatibility) can bypass it. The trigger stamps `scope_enforced_at`, the
--     persisted server-derived provenance marker; legacy rows keep NULL and are NEVER back-filled: an identical
--     idempotent re-save of a legacy row returns that legacy row (v1 returns before any INSERT), so a successful
--     retry does not turn history into an enforced write. Reads project the marker so owner AND reviewer surfaces
--     can distinguish "enforced at write" from "legacy, owner-declared" without inferring it from a panel list.
--  2. Atomic expected-head conflict guards for finding edits and dated-fact corrections. The v2 save wrappers
--     take the same account lock as the P3 writes, read the current head ROW (its immutable row id AND version),
--     delegate to the unchanged v1 save, and refuse (rolling the whole statement back) when a NEW version was
--     minted while the caller's inspected head differs from the pre-save head. The token is (version, head row
--     id) — NOT the numeric version alone: P3's remove RPCs physically delete a head row and a later save reuses
--     max(version)+1, so "version 2" can name two different rows over time (ABA). The immutable row uuid cannot
--     be reused, so a caller who inspected row X cannot silently write on top of a later row Y that happens to
--     carry the same number. An identical retry is still idempotent (v1 returned an existing row, no new
--     version), so a repeated successful submit never conflicts; a stale DIFFERENT edit conflicts and keeps the
--     caller's draft. A non-zero expected version without its head row id is fail-closed (conflict).
--  3. Scope changes create a NEW finding identity: the existing `citation_finding_scope_drift` guard is unchanged.
-- Erasure cascades, tenant isolation (assert_knowledge_project), review receipts and version-bound approvals are
-- untouched. Improvement authoring has no UI in this stage; its inserts are enforced by the same trigger.

-- 1. Persisted enforcement marker (NULL = legacy owner-declared scope, never rewritten).
ALTER TABLE public.ai_citation_findings ADD COLUMN scope_enforced_at timestamptz;
ALTER TABLE public.ai_citation_improvements ADD COLUMN scope_enforced_at timestamptz;

-- 2. The authoritative scope predicate: a stored, LOCKED panel version of this owner/project whose frozen client
-- name/market equal the declared scope byte-for-byte. Draft versions, another owner's panel, a never-locked
-- version number or a renamed client all fail. Internal helper: reachable only from definer functions.
CREATE FUNCTION public.citation_panel_scope_authenticated(p_user uuid,p_project text,p_panel uuid,p_version integer,p_name text,p_market text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_user IS NULL OR p_project IS NULL OR p_panel IS NULL OR p_version IS NULL THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM public.citation_panels p
    WHERE p.user_id=p_user AND p.project_id=p_project AND p.panel_id=p_panel AND p.version=p_version
      AND p.document->>'status'='locked'
      AND p.document->'client'->>'name' IS NOT DISTINCT FROM p_name
      AND p.document->'client'->>'market' IS NOT DISTINCT FROM p_market);
END; $$;
REVOKE ALL ON FUNCTION public.citation_panel_scope_authenticated(uuid,text,uuid,integer,text,text) FROM PUBLIC,anon,authenticated,service_role;

-- 3. BEFORE INSERT enforcement on BOTH record tables. Fires for every insert path; an existing row returned by the
-- P3 idempotency digest is never inserted again, so legacy rows are never re-stamped.
CREATE FUNCTION public.citation_scope_binding_enforce()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.citation_panel_scope_authenticated(NEW.user_id,NEW.project_id,NEW.panel_id,NEW.panel_version,NEW.client_name,NEW.client_market) THEN
    RAISE EXCEPTION 'citation_panel_scope_unauthenticated' USING ERRCODE='22023';
  END IF;
  NEW.scope_enforced_at := clock_timestamp();
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.citation_scope_binding_enforce() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER citation_findings_scope_binding BEFORE INSERT ON public.ai_citation_findings
  FOR EACH ROW EXECUTE FUNCTION public.citation_scope_binding_enforce();
CREATE TRIGGER citation_improvements_scope_binding BEFORE INSERT ON public.ai_citation_improvements
  FOR EACH ROW EXECUTE FUNCTION public.citation_scope_binding_enforce();

-- 4. Expected-head finding save. `p_expected_version` + `p_expected_head` name the head ROW the caller inspected
-- (0/NULL + NULL for a brand-new finding id). Under the account lock: read the current head row (highest
-- version; its immutable id), delegate to the unchanged v1 save, then refuse a NEWLY minted version whose
-- pre-save head differed from the inspected (version, row id) — the RAISE aborts the statement, so the new row is
-- rolled back atomically and nothing is written. An idempotent v1 return (version <= pre-save head) is never a
-- conflict. The row id makes the check ABA-proof across P3 delete/recreate of a head that reuses the number.
CREATE FUNCTION public.save_ai_citation_finding_v2(p_user uuid,p_project text,p_record jsonb,p_scope jsonb,p_expected_version integer,p_expected_head uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE fid uuid; current_version integer := 0; current_head uuid; saved jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  PERFORM public.citation_lock_account(p_user);
  IF p_record IS NULL OR jsonb_typeof(p_record)<>'object'
     OR jsonb_typeof(p_record->'findingId') IS DISTINCT FROM 'string'
     OR (p_record->>'findingId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'invalid_citation_finding' USING ERRCODE='22023';
  END IF;
  IF p_expected_version IS NOT NULL AND (p_expected_version<0 OR p_expected_version>10000) THEN
    RAISE EXCEPTION 'invalid_citation_finding' USING ERRCODE='22023';
  END IF;
  fid := (p_record->>'findingId')::uuid;
  SELECT id,version INTO current_head,current_version FROM public.ai_citation_findings
    WHERE user_id=p_user AND project_id=p_project AND finding_id=fid
    ORDER BY version DESC,created_at DESC,id DESC LIMIT 1;
  IF current_head IS NULL THEN current_version := 0; END IF;
  saved := public.save_ai_citation_finding(p_user,p_project,p_record,p_scope);
  IF (saved->>'version')::integer > current_version
     AND (coalesce(p_expected_version,0) <> current_version OR p_expected_head IS DISTINCT FROM current_head) THEN
    RAISE EXCEPTION 'citation_finding_version_conflict' USING ERRCODE='40001';
  END IF;
  RETURN saved || jsonb_build_object('scopeEnforcedAt',(SELECT scope_enforced_at FROM public.ai_citation_findings
    WHERE user_id=p_user AND project_id=p_project AND id=(saved->>'id')::uuid));
END; $$;

-- 5. Expected-head dated-fact save (correction = a new version of the same logical fact id). Same pattern, same
-- ABA reasoning: remove_ai_citation_business_fact deletes a head row and the next correction reuses its number.
CREATE FUNCTION public.save_ai_citation_business_fact_v2(p_user uuid,p_project text,p_record jsonb,p_expected_version integer,p_expected_head uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE fid uuid; current_version integer := 0; current_head uuid; saved jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  PERFORM public.citation_lock_account(p_user);
  IF p_record IS NULL OR jsonb_typeof(p_record)<>'object'
     OR jsonb_typeof(p_record->'factId') IS DISTINCT FROM 'string'
     OR (p_record->>'factId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'invalid_citation_business_fact' USING ERRCODE='22023';
  END IF;
  IF p_expected_version IS NOT NULL AND (p_expected_version<0 OR p_expected_version>10000) THEN
    RAISE EXCEPTION 'invalid_citation_business_fact' USING ERRCODE='22023';
  END IF;
  fid := (p_record->>'factId')::uuid;
  SELECT id,version INTO current_head,current_version FROM public.ai_citation_business_facts
    WHERE user_id=p_user AND project_id=p_project AND fact_id=fid
    ORDER BY version DESC,created_at DESC,id DESC LIMIT 1;
  IF current_head IS NULL THEN current_version := 0; END IF;
  saved := public.save_ai_citation_business_fact(p_user,p_project,p_record);
  IF (saved->>'version')::integer > current_version
     AND (coalesce(p_expected_version,0) <> current_version OR p_expected_head IS DISTINCT FROM current_head) THEN
    RAISE EXCEPTION 'citation_business_fact_version_conflict' USING ERRCODE='40001';
  END IF;
  RETURN saved;
END; $$;

-- 5b. Improvement save returning the provenance stamp (no expected-version guard: improvement authoring has no
-- UI in this stage; the trigger enforces its scope like any other insert). Same P3 semantics otherwise.
CREATE FUNCTION public.save_ai_citation_improvement_v2(p_user uuid,p_project text,p_record jsonb,p_scope jsonb,p_binding jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved jsonb;
BEGIN
  saved := public.save_ai_citation_improvement(p_user,p_project,p_record,p_scope,p_binding);
  RETURN saved || jsonb_build_object('scopeEnforcedAt',(SELECT scope_enforced_at FROM public.ai_citation_improvements
    WHERE user_id=p_user AND project_id=p_project AND id=(saved->>'id')::uuid));
END; $$;

-- 6. Read projections carrying the persisted provenance marker (`scopeEnforcedAt`, NULL for legacy rows). Each
-- wrapper delegates to the unchanged v1 read (same authorization, masking and status derivation) and only adds
-- the marker looked up by row id under the same owner/project scope; the reviewer wrapper adds it after the v1
-- reviewer read has already enforced team eligibility and the finding-scoped assignment.
CREATE FUNCTION public.read_ai_citation_findings_v2(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb;
BEGIN
  base := public.read_ai_citation_findings(p_user,p_project);
  RETURN jsonb_build_object('findings',coalesce((
    SELECT jsonb_agg(f.value || jsonb_build_object('scopeEnforcedAt',x.scope_enforced_at) ORDER BY f.ordinality)
    FROM jsonb_array_elements(base->'findings') WITH ORDINALITY AS f
    LEFT JOIN public.ai_citation_findings x
      ON x.user_id=p_user AND x.project_id=p_project AND x.id=(f.value->>'id')::uuid),'[]'::jsonb));
END; $$;
CREATE FUNCTION public.read_ai_citation_finding_v2(p_user uuid,p_project text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb;
BEGIN
  base := public.read_ai_citation_finding(p_user,p_project,p_id);
  RETURN base || jsonb_build_object('scopeEnforcedAt',(SELECT scope_enforced_at FROM public.ai_citation_findings
    WHERE user_id=p_user AND project_id=p_project AND id=p_id));
END; $$;
CREATE FUNCTION public.read_ai_citation_improvements_v2(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb;
BEGIN
  base := public.read_ai_citation_improvements(p_user,p_project);
  RETURN jsonb_build_object('improvements',coalesce((
    SELECT jsonb_agg(f.value || jsonb_build_object('scopeEnforcedAt',x.scope_enforced_at) ORDER BY f.ordinality)
    FROM jsonb_array_elements(base->'improvements') WITH ORDINALITY AS f
    LEFT JOIN public.ai_citation_improvements x
      ON x.user_id=p_user AND x.project_id=p_project AND x.id=(f.value->>'id')::uuid),'[]'::jsonb));
END; $$;
CREATE FUNCTION public.read_ai_citation_improvement_v2(p_user uuid,p_project text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb;
BEGIN
  base := public.read_ai_citation_improvement(p_user,p_project,p_id);
  RETURN base || jsonb_build_object('scopeEnforcedAt',(SELECT scope_enforced_at FROM public.ai_citation_improvements
    WHERE user_id=p_user AND project_id=p_project AND id=p_id));
END; $$;
CREATE FUNCTION public.read_ai_citation_finding_for_review_v2(p_actor uuid,p_owner uuid,p_project text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb;
BEGIN
  base := public.read_ai_citation_finding_for_review(p_actor,p_owner,p_project,p_id);
  RETURN base || jsonb_build_object('scopeEnforcedAt',(SELECT scope_enforced_at FROM public.ai_citation_findings
    WHERE user_id=p_owner AND project_id=p_project AND id=p_id));
END; $$;

-- 7. Privileges: the wrappers are service RPCs (the server middleware supplies the authenticated actor/owner),
-- exactly like their v1 counterparts. The v1 RPCs keep their grants so an already-deployed server keeps working
-- during rollout — every write is enforced by the trigger regardless of which RPC minted it.
REVOKE ALL ON FUNCTION
  public.save_ai_citation_finding_v2(uuid,text,jsonb,jsonb,integer,uuid),
  public.save_ai_citation_improvement_v2(uuid,text,jsonb,jsonb,jsonb),
  public.save_ai_citation_business_fact_v2(uuid,text,jsonb,integer,uuid),
  public.read_ai_citation_findings_v2(uuid,text),
  public.read_ai_citation_finding_v2(uuid,text,uuid),
  public.read_ai_citation_improvements_v2(uuid,text),
  public.read_ai_citation_improvement_v2(uuid,text,uuid),
  public.read_ai_citation_finding_for_review_v2(uuid,uuid,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.save_ai_citation_finding_v2(uuid,text,jsonb,jsonb,integer,uuid),
  public.save_ai_citation_improvement_v2(uuid,text,jsonb,jsonb,jsonb),
  public.save_ai_citation_business_fact_v2(uuid,text,jsonb,integer,uuid),
  public.read_ai_citation_findings_v2(uuid,text),
  public.read_ai_citation_finding_v2(uuid,text,uuid),
  public.read_ai_citation_improvements_v2(uuid,text),
  public.read_ai_citation_improvement_v2(uuid,text,uuid),
  public.read_ai_citation_finding_for_review_v2(uuid,uuid,text,uuid)
  TO service_role;
