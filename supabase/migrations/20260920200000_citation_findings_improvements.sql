-- Citation Intelligence v1, P3 — human-reviewed findings and improvements storage + server boundary,
-- with atomic invalidation of dependent claims. Additive and UNAPPLIED. It stores owner-authored
-- finding/improvement records (validated in full by the Zod findingSchema/improvementSchema at the
-- server boundary) under server-derived authenticated provenance.
--
-- HONEST SCOPE (see evidence/citation-findings-improvements-2026-09-20.md): this packet is the STORAGE +
-- server boundary. It does NOT system-verify an improvement. `verificationStatus` is one of:
--   * 'owner_attested'  — the authenticated PROJECT OWNER recorded an owner_inspection over evidence that
--                         still resolves. This is an authenticated owner attestation, NOT a causal/system
--                         proof and NOT a claim the destination was probed.
--   * 'unresolved'      — a publication_receipt / index_inspection method whose receipt CANNOT be bound to
--                         a trusted publication_evidence / google_index_inspections record here (no such
--                         binding contract exists yet); it is explicitly NOT authenticated. Remaining
--                         wiring is documented in the evidence file.
--   * 'unverified'      — no receipt, a forged/missing reviewer or timestamp, or an unresolved dependency.
-- A caller receipt string, a forged approver (approvedBy/approvedVersion/taskId are declared, UNRESOLVED
-- references here), or a `pending_parser` native artifact are NEVER elevated into authenticated proof.
-- No provider calls, no auto-approval, no publication, no parser. Panel/client scope is OWNER-DECLARED
-- (not authenticated against a P2 panel record); it keeps P3 independent of P2 while binding an
-- improvement to findings of the same declared scope.

CREATE TABLE public.ai_citation_findings (
  user_id uuid NOT NULL, project_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  finding_id uuid NOT NULL,
  version integer NOT NULL CHECK(version BETWEEN 1 AND 10000),
  family text NOT NULL CHECK(family IN ('citation_source','recommendation_accuracy')),
  decision text NOT NULL CHECK(decision IN ('accepted','dismissed','needs_second_review')),
  record jsonb NOT NULL CHECK(jsonb_typeof(record)='object' AND octet_length(record::text)<=100000),
  record_sha256 text NOT NULL CHECK(record_sha256 ~ '^[a-f0-9]{64}$'),
  -- Owner-declared scope. The byte caps accommodate the client's UTF-16 length bounds (200/120 units):
  -- a BMP character is up to 3 UTF-8 bytes, so 200/120 units are at most 600/360 bytes; the caps match so
  -- a client-valid multilingual name/market is never rejected at INSERT with a generic error.
  panel_id uuid NOT NULL, panel_version integer NOT NULL CHECK(panel_version BETWEEN 1 AND 1000),
  client_name text NOT NULL CHECK(octet_length(client_name) BETWEEN 1 AND 600),
  client_market text NOT NULL CHECK(octet_length(client_market) BETWEEN 1 AND 360),
  -- Server-derived authenticated provenance: both are the authenticated caller (the project owner). A
  -- finding is refused unless EVERY embedded reviewer identity (top, second, recommendation, support,
  -- accuracy) is that same authenticated actor — a foreign/forged reviewer identity is never stored.
  actor_id uuid NOT NULL, reviewer_id uuid NOT NULL,
  supersedes_id uuid,
  predecessor_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,id),
  UNIQUE(user_id,project_id,finding_id,version),
  -- Idempotency key includes the declared scope (see save), so the identical record submitted under a
  -- different panel/client is a distinct row, never a silent collapse to the earlier scope's row.
  UNIQUE(user_id,project_id,record_sha256),
  UNIQUE(user_id,project_id,supersedes_id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,project_id,supersedes_id) REFERENCES public.ai_citation_findings(user_id,project_id,id)
);
CREATE TABLE public.ai_citation_improvements (
  user_id uuid NOT NULL, project_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  improvement_id uuid NOT NULL,
  version integer NOT NULL CHECK(version BETWEEN 1 AND 10000),
  record jsonb NOT NULL CHECK(jsonb_typeof(record)='object' AND octet_length(record::text)<=20000),
  record_sha256 text NOT NULL CHECK(record_sha256 ~ '^[a-f0-9]{64}$'),
  panel_id uuid NOT NULL, panel_version integer NOT NULL CHECK(panel_version BETWEEN 1 AND 1000),
  client_name text NOT NULL CHECK(octet_length(client_name) BETWEEN 1 AND 600),
  client_market text NOT NULL CHECK(octet_length(client_market) BETWEEN 1 AND 360),
  actor_id uuid NOT NULL,
  -- Server-derived PINNED finding version rows this improvement was recorded against (the exact
  -- ai_citation_findings.id values resolved at save). Verification requires these EXACT rows to still
  -- exist, so deleting the referenced correction invalidates the dependent claim rather than silently
  -- rebinding to an older superseded version.
  bound_finding_row_ids uuid[] NOT NULL DEFAULT '{}',
  supersedes_id uuid,
  predecessor_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,id),
  UNIQUE(user_id,project_id,improvement_id,version),
  UNIQUE(user_id,project_id,record_sha256),
  UNIQUE(user_id,project_id,supersedes_id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,project_id,supersedes_id) REFERENCES public.ai_citation_improvements(user_id,project_id,id)
);
ALTER TABLE public.ai_citation_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_citation_improvements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_findings,public.ai_citation_improvements FROM PUBLIC,anon,authenticated,service_role;

-- Explicit account-first lock that FAILS CLOSED. `assert_knowledge_project(...,true)` takes the account
-- FOR UPDATE lock but does not fail when the workspace_meta row is missing, so a P3 write RPC takes this
-- lock itself and refuses before any capacity/idempotency/version mutation when the account row is absent.
CREATE FUNCTION public.citation_lock_account(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.workspace_meta WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'citation_record_unavailable' USING ERRCODE='22023'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.citation_lock_account(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Are every source a finding cites still present as a TRUSTED in-scope record? evidence[] of kind:
--   'source' -> public.project_knowledge_sources (the trusted in-scope source; NOT inline, the record
--               carries only an id, so a missing source is unavailable — never "always available");
--   'answer' -> public.ai_answer_evidence   (owner-supplied, unverified — presence only, not proof);
--   'native' -> public.ai_native_report_artifacts (opaque staged bytes; presence only, NEVER measurement).
-- A missing referenced record means the finding's inspectable claim can no longer be substantiated, so it
-- is reported unavailable — this is how a source deletion (which P3 cannot trigger on a released table)
-- renders the dependent claim unverified. An unknown/malformed reference fails closed. Internal-only.
CREATE FUNCTION public.citation_finding_sources_available(p_user uuid,p_project text,p_record jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE e jsonb; kind text; ref uuid;
BEGIN
  IF jsonb_typeof(p_record->'evidence')<>'array' THEN RETURN false; END IF;
  FOR e IN SELECT jsonb_array_elements(p_record->'evidence') LOOP
    kind := e->>'kind';
    -- Guard the uuid shape as a standalone check, then cast (PostgreSQL does not guarantee AND/OR
    -- short-circuit, so the cast must never run on a non-uuid reference).
    IF (e->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RETURN false;
    END IF;
    ref := (e->>'id')::uuid;
    IF kind='answer' THEN
      IF NOT EXISTS(SELECT 1 FROM public.ai_answer_evidence
        WHERE user_id=p_user AND project_id=p_project AND id=ref) THEN RETURN false; END IF;
    ELSIF kind='native' THEN
      IF NOT EXISTS(SELECT 1 FROM public.ai_native_report_artifacts
        WHERE user_id=p_user AND project_id=p_project AND id=ref) THEN RETURN false; END IF;
    ELSIF kind='source' THEN
      IF NOT EXISTS(SELECT 1 FROM public.project_knowledge_sources
        WHERE user_id=p_user AND project_id=p_project AND id=ref) THEN RETURN false; END IF;
    ELSE
      RETURN false; -- unknown evidence kind fails closed
    END IF;
  END LOOP;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.citation_finding_sources_available(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- The row id of the current (unsuperseded) head of a logical finding in a declared scope, or NULL. Used
-- at improvement save to PIN the exact finding version rows the improvement is recorded against.
CREATE FUNCTION public.citation_finding_head_id(p_user uuid,p_project text,p_finding uuid,
  p_panel uuid,p_panel_version integer,p_client_name text,p_client_market text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT a.id FROM public.ai_citation_findings a
    WHERE a.user_id=p_user AND a.project_id=p_project AND a.finding_id=p_finding
      AND a.panel_id=p_panel AND a.panel_version=p_panel_version
      AND a.client_name=p_client_name AND a.client_market=p_client_market
      AND NOT EXISTS(SELECT 1 FROM public.ai_citation_findings b
        WHERE b.user_id=p_user AND b.project_id=p_project AND b.supersedes_id=a.id)
    ORDER BY a.version DESC,a.created_at DESC,a.id DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.citation_finding_head_id(uuid,text,uuid,uuid,integer,text,text) FROM PUBLIC,anon,authenticated,service_role;

-- Server-derived verification STATUS from LIVE dependency state; never a client boolean and never a
-- system/causal proof. Returns 'unverified' unless there is a verification receipt, verifiedAt is on/after
-- the approval, there is >=1 baseline capture and every one still resolves to a live ai_answer_evidence
-- row, and every PINNED finding version row (p_bound) still exists with its own cited sources still
-- available. When those gates hold: 'owner_attested' for method='owner_inspection' (an authenticated owner
-- attestation — the recorder is the project owner, enforced at save), else 'unresolved' for a
-- publication_receipt/index_inspection whose receipt is not bound to a trusted record here. A deleted
-- finding row, source or baseline collapses this to 'unverified'.
CREATE FUNCTION public.citation_improvement_status(p_user uuid,p_project text,p_record jsonb,p_bound uuid[])
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb; cid text; frec jsonb; approved timestamptz; verified_at timestamptz; method text; i integer;
BEGIN
  v := p_record->'verification';
  IF v IS NULL OR jsonb_typeof(v)<>'object' THEN RETURN 'unverified'; END IF;
  -- Fail closed on a missing (SQL NULL from an absent key) or non-string reviewer, and require the
  -- attesting reviewer to be the authenticated project owner (p_user) — so even a direct insert cannot
  -- yield an authenticated status with a forged identity.
  IF v->'reviewer' IS NULL OR jsonb_typeof(v->'reviewer')<>'string'
     OR (v->>'reviewer') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN RETURN 'unverified'; END IF;
  IF (v->>'reviewer')::uuid <> p_user THEN RETURN 'unverified'; END IF;
  IF jsonb_typeof(p_record->'baselineCaptureIds') IS DISTINCT FROM 'array' THEN RETURN 'unverified'; END IF;
  IF jsonb_array_length(p_record->'baselineCaptureIds')=0 THEN RETURN 'unverified'; END IF;
  BEGIN
    approved := (p_record->'change'->>'approvedAt')::timestamptz;
    verified_at := (v->>'verifiedAt')::timestamptz;
  EXCEPTION WHEN others THEN RETURN 'unverified'; END;
  IF approved IS NULL OR verified_at IS NULL OR verified_at < approved THEN RETURN 'unverified'; END IF;
  -- Every PINNED finding version row must still exist with resolvable in-scope sources.
  IF coalesce(array_length(p_bound,1),0)=0 THEN RETURN 'unverified'; END IF;
  FOR i IN 1..array_length(p_bound,1) LOOP
    SELECT record INTO frec FROM public.ai_citation_findings
      WHERE user_id=p_user AND project_id=p_project AND id=p_bound[i];
    IF frec IS NULL OR NOT public.citation_finding_sources_available(p_user,p_project,frec) THEN
      RETURN 'unverified';
    END IF;
  END LOOP;
  -- Every baseline capture must still resolve to a live answer-evidence row (guard, then cast).
  FOR cid IN SELECT jsonb_array_elements_text(p_record->'baselineCaptureIds') LOOP
    IF cid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RETURN 'unverified';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project AND id=cid::uuid) THEN
      RETURN 'unverified';
    END IF;
  END LOOP;
  method := v->>'method';
  IF method='owner_inspection' THEN RETURN 'owner_attested'; END IF;
  IF method IN ('publication_receipt','index_inspection') THEN RETURN 'unresolved'; END IF;
  RETURN 'unverified';
END; $$;
REVOKE ALL ON FUNCTION public.citation_improvement_status(uuid,text,jsonb,uuid[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.save_ai_citation_finding(p_user uuid,p_project text,p_record jsonb,p_scope jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE digest text; existing uuid; head uuid; new_id uuid; next_version integer;
  fid uuid; fam text; dec text; reviewer uuid;
  panel uuid; pver integer; cname text; cmarket text;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  PERFORM public.citation_lock_account(p_user);
  IF p_record IS NULL OR jsonb_typeof(p_record)<>'object' OR octet_length(p_record::text)>100000
     OR p_scope IS NULL OR jsonb_typeof(p_scope)<>'object' THEN
    RAISE EXCEPTION 'invalid_citation_finding' USING ERRCODE='22023';
  END IF;
  fam := p_record->>'family'; dec := p_record->>'decision';
  -- IS DISTINCT FROM so a missing key (jsonb_typeof NULL) fails closed rather than passing three-valued.
  IF jsonb_typeof(p_record->'findingId') IS DISTINCT FROM 'string' OR (p_record->>'findingId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR jsonb_typeof(p_record->'family') IS DISTINCT FROM 'string' OR fam NOT IN ('citation_source','recommendation_accuracy')
     OR jsonb_typeof(p_record->'decision') IS DISTINCT FROM 'string' OR dec NOT IN ('accepted','dismissed','needs_second_review')
     OR jsonb_typeof(p_record->'review') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_record->'review'->'reviewer') IS DISTINCT FROM 'string'
     OR (p_record->'review'->>'reviewer') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'invalid_citation_finding' USING ERRCODE='22023';
  END IF;
  fid := (p_record->>'findingId')::uuid; reviewer := (p_record->'review'->>'reviewer')::uuid;
  -- Server-derived reviewer: the primary reviewer must be the authenticated caller...
  IF reviewer <> p_user THEN
    RAISE EXCEPTION 'citation_finding_reviewer_mismatch' USING ERRCODE='22023';
  END IF;
  -- ...and NO embedded reviewer identity anywhere (secondReview, recommendation, support[], accuracy[])
  -- may be a different, unauthenticated identity. A foreign reviewer is a forged provenance claim and is
  -- refused; two-person review needs a trusted reviewer-resolution boundary that P3 does not yet have.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(jsonb_path_query_array(p_record,'$.**.reviewer')) r
            WHERE r IS DISTINCT FROM p_user::text) THEN
    RAISE EXCEPTION 'citation_finding_reviewer_mismatch' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_scope->'panelId')<>'string' OR (p_scope->>'panelId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR jsonb_typeof(p_scope->'panelVersion')<>'number'
     OR jsonb_typeof(p_scope->'client')<>'object'
     OR jsonb_typeof(p_scope->'client'->'name')<>'string' OR jsonb_typeof(p_scope->'client'->'market')<>'string'
     OR public.native_artifact_utf16_length(p_scope->'client'->>'name') NOT BETWEEN 1 AND 200
     OR public.native_artifact_utf16_length(p_scope->'client'->>'market') NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid_citation_finding' USING ERRCODE='22023';
  END IF;
  panel := (p_scope->>'panelId')::uuid; pver := (p_scope->>'panelVersion')::integer;
  cname := p_scope->'client'->>'name'; cmarket := p_scope->'client'->>'market';
  IF pver < 1 OR pver > 1000 THEN RAISE EXCEPTION 'invalid_citation_finding' USING ERRCODE='22023'; END IF;
  -- One logical finding id stays in ONE declared scope; a reused id under a different panel/client is a
  -- scope drift that could resurrect a cross-panel claim through the version chain, and is refused.
  IF EXISTS(SELECT 1 FROM public.ai_citation_findings
     WHERE user_id=p_user AND project_id=p_project AND finding_id=fid
       AND (panel_id<>panel OR panel_version<>pver OR client_name<>cname OR client_market<>cmarket)) THEN
    RAISE EXCEPTION 'citation_finding_scope_drift' USING ERRCODE='22023';
  END IF;
  -- Idempotency digest binds the declared scope, so the same record under a different scope never collapses.
  digest := encode(sha256(convert_to(jsonb_build_array(panel,pver,cname,cmarket,p_record)::text,'UTF8')),'hex');
  SELECT id INTO existing FROM public.ai_citation_findings
    WHERE user_id=p_user AND project_id=p_project AND record_sha256=digest;
  IF existing IS NOT NULL THEN
    RETURN (SELECT jsonb_build_object('id',id,'findingId',finding_id,'version',version,'family',family,
      'decision',decision,'panelId',panel_id,'panelVersion',panel_version,
      'client',jsonb_build_object('name',client_name,'market',client_market),
      'actorId',actor_id,'reviewerId',reviewer_id,'supersedesId',supersedes_id,
      'predecessorDeleted',predecessor_deleted,'createdAt',created_at,
      'sourceAvailable',public.citation_finding_sources_available(p_user,p_project,record))
      FROM public.ai_citation_findings WHERE user_id=p_user AND project_id=p_project AND id=existing);
  END IF;
  IF (SELECT count(*) FROM public.ai_citation_findings WHERE user_id=p_user AND project_id=p_project)>=200 THEN
    RAISE EXCEPTION 'citation_finding_capacity' USING ERRCODE='22023';
  END IF;
  SELECT a.id INTO head FROM public.ai_citation_findings a
    WHERE a.user_id=p_user AND a.project_id=p_project AND a.finding_id=fid
      AND NOT EXISTS(SELECT 1 FROM public.ai_citation_findings b
        WHERE b.user_id=p_user AND b.project_id=p_project AND b.supersedes_id=a.id)
    ORDER BY a.version DESC,a.created_at DESC,a.id DESC LIMIT 1;
  SELECT coalesce(max(version),0)+1 INTO next_version FROM public.ai_citation_findings
    WHERE user_id=p_user AND project_id=p_project AND finding_id=fid;
  INSERT INTO public.ai_citation_findings
    (user_id,project_id,finding_id,version,family,decision,record,record_sha256,
     panel_id,panel_version,client_name,client_market,actor_id,reviewer_id,supersedes_id)
    VALUES(p_user,p_project,fid,next_version,fam,dec,p_record,digest,
     panel,pver,cname,cmarket,p_user,p_user,head)
    RETURNING id INTO new_id;
  RETURN (SELECT jsonb_build_object('id',id,'findingId',finding_id,'version',version,'family',family,
    'decision',decision,'panelId',panel_id,'panelVersion',panel_version,
    'client',jsonb_build_object('name',client_name,'market',client_market),
    'actorId',actor_id,'reviewerId',reviewer_id,'supersedesId',supersedes_id,
    'predecessorDeleted',predecessor_deleted,'createdAt',created_at,
    'sourceAvailable',public.citation_finding_sources_available(p_user,p_project,record))
    FROM public.ai_citation_findings WHERE user_id=p_user AND project_id=p_project AND id=new_id);
END; $$;

CREATE FUNCTION public.read_ai_citation_findings(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  RETURN jsonb_build_object('findings',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',id,'findingId',finding_id,'version',version,'family',family,'decision',decision,
    'panelId',panel_id,'panelVersion',panel_version,
    'client',jsonb_build_object('name',client_name,'market',client_market),
    'actorId',actor_id,'reviewerId',reviewer_id,'supersedesId',supersedes_id,
    'predecessorDeleted',predecessor_deleted,'createdAt',created_at,
    'sourceAvailable',public.citation_finding_sources_available(p_user,p_project,record))
    ORDER BY created_at DESC,id DESC)
    FROM public.ai_citation_findings WHERE user_id=p_user AND project_id=p_project),'[]'::jsonb));
END; $$;

CREATE FUNCTION public.read_ai_citation_finding(p_user uuid,p_project text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  IF p_id IS NULL THEN RAISE EXCEPTION 'invalid_citation_finding' USING ERRCODE='22023'; END IF;
  SELECT jsonb_build_object('id',id,'findingId',finding_id,'version',version,'family',family,
    'decision',decision,'panelId',panel_id,'panelVersion',panel_version,
    'client',jsonb_build_object('name',client_name,'market',client_market),
    'actorId',actor_id,'reviewerId',reviewer_id,'supersedesId',supersedes_id,
    'predecessorDeleted',predecessor_deleted,'createdAt',created_at,'record',record,
    'sourceAvailable',public.citation_finding_sources_available(p_user,p_project,record)) INTO result
    FROM public.ai_citation_findings WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  IF result IS NULL THEN RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023'; END IF;
  RETURN result;
END; $$;

CREATE FUNCTION public.remove_ai_citation_finding(p_user uuid,p_project text,p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  PERFORM public.citation_lock_account(p_user);
  IF p_id IS NULL THEN RAISE EXCEPTION 'invalid_citation_finding' USING ERRCODE='22023'; END IF;
  -- Preserve a distinct later correction: unlink the direct successor and mark the history gap. A
  -- dependent improvement PINS the exact version rows it was recorded against, so removing THIS row makes
  -- that improvement's status collapse to 'unverified' on read — the claim is never silently rebound to an
  -- older superseded version, and no deleted content is retained.
  UPDATE public.ai_citation_findings SET supersedes_id=NULL, predecessor_deleted=true
    WHERE user_id=p_user AND project_id=p_project AND supersedes_id=p_id;
  DELETE FROM public.ai_citation_findings WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  RETURN true;
END; $$;

CREATE FUNCTION public.save_ai_citation_improvement(p_user uuid,p_project text,p_record jsonb,p_scope jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE digest text; existing uuid; head uuid; new_id uuid; next_version integer;
  iid uuid; v jsonb; fid text; cid text; row_id uuid; bound uuid[] := '{}';
  panel uuid; pver integer; cname text; cmarket text;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  PERFORM public.citation_lock_account(p_user);
  IF p_record IS NULL OR jsonb_typeof(p_record)<>'object' OR octet_length(p_record::text)>20000
     OR p_scope IS NULL OR jsonb_typeof(p_scope)<>'object' THEN
    RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_record->'improvementId') IS DISTINCT FROM 'string' OR (p_record->>'improvementId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR jsonb_typeof(p_record->'findingIds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023';
  END IF;
  -- Only after confirming it is an array (jsonb_array_length errors on a non-array).
  IF jsonb_array_length(p_record->'findingIds')=0 THEN
    RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023';
  END IF;
  iid := (p_record->>'improvementId')::uuid;
  IF jsonb_typeof(p_scope->'panelId')<>'string' OR (p_scope->>'panelId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR jsonb_typeof(p_scope->'panelVersion')<>'number'
     OR jsonb_typeof(p_scope->'client')<>'object'
     OR jsonb_typeof(p_scope->'client'->'name')<>'string' OR jsonb_typeof(p_scope->'client'->'market')<>'string'
     OR public.native_artifact_utf16_length(p_scope->'client'->>'name') NOT BETWEEN 1 AND 200
     OR public.native_artifact_utf16_length(p_scope->'client'->>'market') NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023';
  END IF;
  panel := (p_scope->>'panelId')::uuid; pver := (p_scope->>'panelVersion')::integer;
  cname := p_scope->'client'->>'name'; cmarket := p_scope->'client'->>'market';
  IF pver < 1 OR pver > 1000 THEN RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023'; END IF;
  -- A recorded verification may only name the authenticated caller (the owner) as its reviewer; a forged
  -- reviewer identity is refused (fails closed on a missing/wrong-typed reviewer).
  v := p_record->'verification';
  IF v IS NOT NULL AND jsonb_typeof(v)='object' THEN
    IF v->'reviewer' IS NULL OR jsonb_typeof(v->'reviewer')<>'string'
       OR (v->>'reviewer') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR (v->>'reviewer')::uuid <> p_user THEN
      RAISE EXCEPTION 'citation_improvement_reviewer_mismatch' USING ERRCODE='22023';
    END IF;
  END IF;
  -- Improvement requires SCOPED findings, PINNED to the exact current version rows. Every referenced
  -- finding must resolve to a head row sharing this improvement's declared scope; a foreign, missing or
  -- out-of-scope reference is refused. The resolved row ids are stored so a later deletion of that exact
  -- version invalidates the claim rather than rebinding to an older one.
  FOR fid IN SELECT jsonb_array_elements_text(p_record->'findingIds') LOOP
    IF fid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION 'citation_improvement_finding_unresolved' USING ERRCODE='22023';
    END IF;
    row_id := public.citation_finding_head_id(p_user,p_project,fid::uuid,panel,pver,cname,cmarket);
    IF row_id IS NULL THEN
      RAISE EXCEPTION 'citation_improvement_finding_unresolved' USING ERRCODE='22023';
    END IF;
    bound := array_append(bound,row_id);
  END LOOP;
  -- When a verification receipt is present, its baseline captures must resolve to live answer evidence.
  IF v IS NOT NULL AND jsonb_typeof(v)='object' THEN
    IF jsonb_typeof(p_record->'baselineCaptureIds') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'citation_improvement_baseline_unresolved' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(p_record->'baselineCaptureIds')=0 THEN
      RAISE EXCEPTION 'citation_improvement_baseline_unresolved' USING ERRCODE='22023';
    END IF;
    FOR cid IN SELECT jsonb_array_elements_text(p_record->'baselineCaptureIds') LOOP
      IF cid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        RAISE EXCEPTION 'citation_improvement_baseline_unresolved' USING ERRCODE='22023';
      END IF;
      IF NOT EXISTS(SELECT 1 FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project AND id=cid::uuid) THEN
        RAISE EXCEPTION 'citation_improvement_baseline_unresolved' USING ERRCODE='22023';
      END IF;
    END LOOP;
  END IF;
  IF EXISTS(SELECT 1 FROM public.ai_citation_improvements
     WHERE user_id=p_user AND project_id=p_project AND improvement_id=iid
       AND (panel_id<>panel OR panel_version<>pver OR client_name<>cname OR client_market<>cmarket)) THEN
    RAISE EXCEPTION 'citation_improvement_scope_drift' USING ERRCODE='22023';
  END IF;
  digest := encode(sha256(convert_to(jsonb_build_array(panel,pver,cname,cmarket,p_record)::text,'UTF8')),'hex');
  SELECT id INTO existing FROM public.ai_citation_improvements
    WHERE user_id=p_user AND project_id=p_project AND record_sha256=digest;
  IF existing IS NOT NULL THEN
    RETURN (SELECT jsonb_build_object('id',id,'improvementId',improvement_id,'version',version,
      'panelId',panel_id,'panelVersion',panel_version,
      'client',jsonb_build_object('name',client_name,'market',client_market),
      'actorId',actor_id,'supersedesId',supersedes_id,'predecessorDeleted',predecessor_deleted,
      'createdAt',created_at,
      'verificationStatus',public.citation_improvement_status(p_user,p_project,record,bound_finding_row_ids))
      FROM public.ai_citation_improvements WHERE user_id=p_user AND project_id=p_project AND id=existing);
  END IF;
  IF (SELECT count(*) FROM public.ai_citation_improvements WHERE user_id=p_user AND project_id=p_project)>=100 THEN
    RAISE EXCEPTION 'citation_improvement_capacity' USING ERRCODE='22023';
  END IF;
  SELECT a.id INTO head FROM public.ai_citation_improvements a
    WHERE a.user_id=p_user AND a.project_id=p_project AND a.improvement_id=iid
      AND NOT EXISTS(SELECT 1 FROM public.ai_citation_improvements b
        WHERE b.user_id=p_user AND b.project_id=p_project AND b.supersedes_id=a.id)
    ORDER BY a.version DESC,a.created_at DESC,a.id DESC LIMIT 1;
  SELECT coalesce(max(version),0)+1 INTO next_version FROM public.ai_citation_improvements
    WHERE user_id=p_user AND project_id=p_project AND improvement_id=iid;
  INSERT INTO public.ai_citation_improvements
    (user_id,project_id,improvement_id,version,record,record_sha256,
     panel_id,panel_version,client_name,client_market,actor_id,bound_finding_row_ids,supersedes_id)
    VALUES(p_user,p_project,iid,next_version,p_record,digest,panel,pver,cname,cmarket,p_user,bound,head)
    RETURNING id INTO new_id;
  RETURN (SELECT jsonb_build_object('id',id,'improvementId',improvement_id,'version',version,
    'panelId',panel_id,'panelVersion',panel_version,
    'client',jsonb_build_object('name',client_name,'market',client_market),
    'actorId',actor_id,'supersedesId',supersedes_id,'predecessorDeleted',predecessor_deleted,
    'createdAt',created_at,
    'verificationStatus',public.citation_improvement_status(p_user,p_project,record,bound_finding_row_ids))
    FROM public.ai_citation_improvements WHERE user_id=p_user AND project_id=p_project AND id=new_id);
END; $$;

CREATE FUNCTION public.read_ai_citation_improvements(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  RETURN jsonb_build_object('improvements',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',id,'improvementId',improvement_id,'version',version,
    'panelId',panel_id,'panelVersion',panel_version,
    'client',jsonb_build_object('name',client_name,'market',client_market),
    'actorId',actor_id,'supersedesId',supersedes_id,'predecessorDeleted',predecessor_deleted,
    'createdAt',created_at,
    'verificationStatus',public.citation_improvement_status(p_user,p_project,record,bound_finding_row_ids))
    ORDER BY created_at DESC,id DESC)
    FROM public.ai_citation_improvements WHERE user_id=p_user AND project_id=p_project),'[]'::jsonb));
END; $$;

CREATE FUNCTION public.read_ai_citation_improvement(p_user uuid,p_project text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  IF p_id IS NULL THEN RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023'; END IF;
  SELECT jsonb_build_object('id',id,'improvementId',improvement_id,'version',version,
    'panelId',panel_id,'panelVersion',panel_version,
    'client',jsonb_build_object('name',client_name,'market',client_market),
    'actorId',actor_id,'supersedesId',supersedes_id,'predecessorDeleted',predecessor_deleted,
    'createdAt',created_at,'record',record,
    'verificationStatus',public.citation_improvement_status(p_user,p_project,record,bound_finding_row_ids)) INTO result
    FROM public.ai_citation_improvements WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  IF result IS NULL THEN RAISE EXCEPTION 'citation_improvement_unavailable' USING ERRCODE='22023'; END IF;
  RETURN result;
END; $$;

CREATE FUNCTION public.remove_ai_citation_improvement(p_user uuid,p_project text,p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  PERFORM public.citation_lock_account(p_user);
  IF p_id IS NULL THEN RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023'; END IF;
  UPDATE public.ai_citation_improvements SET supersedes_id=NULL, predecessor_deleted=true
    WHERE user_id=p_user AND project_id=p_project AND supersedes_id=p_id;
  DELETE FROM public.ai_citation_improvements WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION
  public.save_ai_citation_finding(uuid,text,jsonb,jsonb),
  public.read_ai_citation_findings(uuid,text),
  public.read_ai_citation_finding(uuid,text,uuid),
  public.remove_ai_citation_finding(uuid,text,uuid),
  public.save_ai_citation_improvement(uuid,text,jsonb,jsonb),
  public.read_ai_citation_improvements(uuid,text),
  public.read_ai_citation_improvement(uuid,text,uuid),
  public.remove_ai_citation_improvement(uuid,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.save_ai_citation_finding(uuid,text,jsonb,jsonb),
  public.read_ai_citation_findings(uuid,text),
  public.read_ai_citation_finding(uuid,text,uuid),
  public.remove_ai_citation_finding(uuid,text,uuid),
  public.save_ai_citation_improvement(uuid,text,jsonb,jsonb),
  public.read_ai_citation_improvements(uuid,text),
  public.read_ai_citation_improvement(uuid,text,uuid),
  public.remove_ai_citation_improvement(uuid,text,uuid)
  TO service_role;
