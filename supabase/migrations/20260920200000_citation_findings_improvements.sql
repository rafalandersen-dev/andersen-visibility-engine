-- Citation Intelligence v1, P3 — human-reviewed findings and improvements storage + server boundary,
-- with atomic invalidation of dependent claims. Additive and UNAPPLIED. It stores owner-authored
-- finding/improvement records (validated in full by the Zod findingSchema/improvementSchema at the
-- server boundary) under server-derived authenticated provenance.
--
-- HONEST SCOPE (see evidence/citation-findings-improvements-2026-09-20.md): this packet is the STORAGE +
-- server boundary + a STRUCTURED publication/approval binding. It does NOT system-verify an improvement.
-- Two SEPARATE server-derived axes are returned, never a client boolean and never a causal/system claim:
--   `verificationStatus` (approval + delivery ladder, strongest resolved):
--     'unverified'        no binding, an unresolved pinned finding/source, the publication is gone, or the
--                         pinned version is not the CURRENTLY approved version for the asset.
--     'approval_bound'    the pinned version_hash is currently approved for the asset in this project.
--     'connector_receipt' plus a 'published' attempt carrying a connector response whose liveUrl equals the
--                         destination and whose Plan action equals the task — an AUTHENTIC CONNECTOR
--                         RESPONSE, NOT proof the destination actually shows the approved content.
--     'owner_attested'    plus a structured OWNER inspection of that exact liveUrl reading
--                         shows_approved_content at a finite, on/after-publication, non-future time, AND a
--                         still-resolving scoped baseline (evidenceStatus='baseline_recorded'). An
--                         authenticated owner before/after attestation, still NOT a system verification.
--   `evidenceStatus` (before/after baseline axis, reported separately so it is never silently dropped):
--     'baseline_absent' | 'baseline_missing' | 'baseline_recorded' (see citation_improvement_evidence).
-- The record's DECLARED approval facts (change.approvedVersion/approvedBy) are reconciled to the actually
-- bound approval; a forged approver/version alongside a real binding is refused. A caller receipt string or
-- a `pending_parser` native artifact are NEVER elevated into proof. No provider calls, no auto-approval, no
-- publication, no parser. Panel/client scope is OWNER-DECLARED (not authenticated against a P2 panel
-- record); it keeps P3 independent of P2 while binding an improvement to findings of the same scope.

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
  -- The P3-specific STRUCTURED publication/approval binding (or NULL) — never free receipt text. Its
  -- pinned publicationId/assetId/versionHash (+ optional structured owner inspection) are resolved LIVE at
  -- read; the binding is folded into record_sha256 (see save), so a resave with a different binding is a
  -- new version and a binding can never be silently rebound.
  publication_binding jsonb CHECK(publication_binding IS NULL OR (jsonb_typeof(publication_binding)='object' AND octet_length(publication_binding::text)<=4000)),
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

-- The BEFORE/AFTER baseline axis, reported SEPARATELY from the delivery ladder so baseline eligibility is
-- never silently dropped. An owner-recorded verification is a before/after claim; it must name baseline
-- captures that STILL resolve to live in-scope answer evidence:
--   'baseline_absent'   no verification block (a delivery record with no before/after claim recorded).
--   'baseline_missing'  a verification block whose baselines no longer all resolve in this project
--                       (deleted, malformed, or never in-scope) — the before/after evidence is gone.
--   'baseline_recorded' a verification block whose every baseline still resolves live in this project.
CREATE FUNCTION public.citation_improvement_evidence(p_user uuid,p_project text,p_record jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb; cid text;
BEGIN
  v := p_record->'verification';
  IF v IS NULL OR jsonb_typeof(v)<>'object' THEN RETURN 'baseline_absent'; END IF;
  IF jsonb_typeof(p_record->'baselineCaptureIds')<>'array' OR jsonb_array_length(p_record->'baselineCaptureIds')=0 THEN
    RETURN 'baseline_missing';
  END IF;
  FOR cid IN SELECT jsonb_array_elements_text(p_record->'baselineCaptureIds') LOOP
    IF cid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RETURN 'baseline_missing';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project AND id=cid::uuid) THEN
      RETURN 'baseline_missing';
    END IF;
  END LOOP;
  RETURN 'baseline_recorded';
END; $$;
REVOKE ALL ON FUNCTION public.citation_improvement_evidence(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Server-derived verification STATUS from the STRUCTURED publication/approval binding + LIVE dependency
-- state. Never a client boolean, never an independent/system content check (none exists here), and no
-- causal claim. The distinct ladder (strongest resolved):
--   'unverified'        no binding; an unresolved pinned finding/source; the bound publication is gone; or
--                       the pinned version is not the CURRENTLY approved version for the asset.
--   'approval_bound'    the pinned version_hash is currently approved for the asset in this project.
--   'connector_receipt' plus a 'published' attempt carrying a connector response (outcome_data) whose
--                       liveUrl equals the improvement's destination and whose snapshot Plan action equals
--                       the improvement's task. This is an AUTHENTIC CONNECTOR RESPONSE, NOT proof the
--                       destination actually shows the approved content.
--   'owner_attested'    plus a STRUCTURED owner inspection of that exact liveUrl reading
--                       shows_approved_content at a finite, on/after-(publication AND current approval),
--                       non-future time (5-minute clock-skew policy), AND a still-resolving scoped baseline
--                       (evidenceStatus='baseline_recorded'). An authenticated OWNER before/after
--                       attestation, still NOT a system/independent verification.
-- Deleting the publication, the approval (asset/version change or withdrawal), the asset, a pinned finding
-- or a baseline — or a re-approval that post-dates the inspection — collapses this back down; a stored
-- binding never keeps a stale current status.
CREATE FUNCTION public.citation_improvement_status(p_user uuid,p_project text,p_record jsonb,p_bound uuid[],p_binding jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE frec jsonb; i integer; pub public.publication_evidence%ROWTYPE;
  b_asset text; b_vhash text; live_url text; insp jsonb; status text; appr_at timestamptz; obs timestamptz;
BEGIN
  IF p_binding IS NULL OR jsonb_typeof(p_binding)<>'object' THEN RETURN 'unverified'; END IF;
  -- Every PINNED finding version row must still exist with resolvable in-scope sources.
  IF coalesce(array_length(p_bound,1),0)=0 THEN RETURN 'unverified'; END IF;
  FOR i IN 1..array_length(p_bound,1) LOOP
    SELECT record INTO frec FROM public.ai_citation_findings
      WHERE user_id=p_user AND project_id=p_project AND id=p_bound[i];
    IF frec IS NULL OR NOT public.citation_finding_sources_available(p_user,p_project,frec) THEN
      RETURN 'unverified';
    END IF;
  END LOOP;
  b_asset := p_binding->>'assetId'; b_vhash := p_binding->>'versionHash';
  IF (p_binding->>'publicationId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN RETURN 'unverified'; END IF;
  SELECT * INTO pub FROM public.publication_evidence
    WHERE user_id=p_user AND project_id=p_project AND id=(p_binding->>'publicationId')::uuid;
  IF pub.id IS NULL OR pub.asset_id IS DISTINCT FROM b_asset OR pub.version_hash IS DISTINCT FROM b_vhash THEN
    RETURN 'unverified';
  END IF;
  -- The CURRENT approval for the asset (and its time) — a re-approval bumps updated_at and can post-date an
  -- earlier inspection, which then no longer attests the current approved state.
  SELECT updated_at INTO appr_at FROM public.publication_approvals
    WHERE user_id=p_user AND project_id=p_project AND asset_id=b_asset
      AND algorithm='milo-publication-v1' AND version_hash=b_vhash AND approved;
  IF appr_at IS NULL THEN RETURN 'unverified'; END IF;
  status := 'approval_bound';
  live_url := CASE WHEN jsonb_typeof(pub.outcome_data)='object' THEN pub.outcome_data->>'liveUrl' END;
  IF pub.outcome='published' AND live_url IS NOT NULL
     AND (p_record->'destination'->>'reference') = live_url
     AND (pub.snapshot->>'actionId') = (p_record->>'taskId') THEN
    status := 'connector_receipt';
    insp := p_binding->'ownerInspection';
    -- owner_attested (before/after content attestation) requires a resolving scoped baseline AND a
    -- structured inspection of THIS liveUrl at a finite, on/after-(publication AND approval), non-future
    -- time. A deleted baseline, or a re-approval that post-dates the inspection, drops it to connector_receipt.
    IF insp IS NOT NULL AND jsonb_typeof(insp)='object'
       AND (insp->>'checkResult') = 'shows_approved_content'
       AND (insp->>'observedUrl') = live_url
       AND pub.finished_at IS NOT NULL
       AND public.citation_improvement_evidence(p_user,p_project,p_record)='baseline_recorded' THEN
      BEGIN obs := (insp->>'observedAt')::timestamptz; EXCEPTION WHEN others THEN obs := NULL; END;
      IF obs IS NOT NULL AND isfinite(obs)
         AND obs >= greatest(pub.finished_at,appr_at)
         AND obs <= clock_timestamp() + interval '5 minutes' THEN
        status := 'owner_attested';
      END IF;
    END IF;
  END IF;
  RETURN status;
END; $$;
REVOKE ALL ON FUNCTION public.citation_improvement_status(uuid,text,jsonb,uuid[],jsonb) FROM PUBLIC,anon,authenticated,service_role;

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

CREATE FUNCTION public.save_ai_citation_improvement(p_user uuid,p_project text,p_record jsonb,p_scope jsonb,p_binding jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE digest text; existing uuid; head uuid; new_id uuid; next_version integer;
  iid uuid; v jsonb; fid text; cid text; row_id uuid; bound uuid[] := '{}';
  panel uuid; pver integer; cname text; cmarket text;
  pub public.publication_evidence%ROWTYPE; b_asset text; b_vhash text; b_live text; insp jsonb;
  appr_at timestamptz; obs timestamptz;
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
  -- Structured publication/approval binding (optional). It is NOT free receipt text: each field is
  -- resolved against the released publication_evidence / publication_approvals contracts and a mismatch
  -- fails closed. This rejects a wrong publication/project/asset/version, an unrelated or non-current
  -- approval, a wrong Plan action, a wrong destination url, and a manufactured owner inspection.
  IF p_binding IS NOT NULL AND jsonb_typeof(p_binding)='object' THEN
    IF octet_length(p_binding::text)>4000
       OR jsonb_typeof(p_binding->'publicationId') IS DISTINCT FROM 'string'
       OR (p_binding->>'publicationId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR jsonb_typeof(p_binding->'assetId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_binding->'versionHash') IS DISTINCT FROM 'string'
       OR (p_binding->>'versionHash') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023';
    END IF;
    b_asset := p_binding->>'assetId'; b_vhash := p_binding->>'versionHash';
    SELECT * INTO pub FROM public.publication_evidence
      WHERE user_id=p_user AND project_id=p_project AND id=(p_binding->>'publicationId')::uuid;
    IF pub.id IS NULL OR pub.asset_id<>b_asset OR pub.version_hash<>b_vhash THEN
      RAISE EXCEPTION 'citation_improvement_binding_unresolved' USING ERRCODE='22023';
    END IF;
    SELECT updated_at INTO appr_at FROM public.publication_approvals
      WHERE user_id=p_user AND project_id=p_project AND asset_id=b_asset
        AND algorithm='milo-publication-v1' AND version_hash=b_vhash AND approved;
    IF appr_at IS NULL THEN
      RAISE EXCEPTION 'citation_improvement_binding_unapproved' USING ERRCODE='22023';
    END IF;
    -- The record's DECLARED approval facts may not contradict the actually-bound approval: the declared
    -- approvedVersion must be the bound version_hash, and the declared approvedBy must be the authenticated
    -- owner who holds the approval (publication_approvals is owner-keyed). That table records no separate
    -- approver identity or human approvedAt, so those declared fields are reconciled to the owner and the
    -- bound version and NOT otherwise endorsed here; a forged approver/version alongside a real binding is
    -- refused rather than co-existing with an authenticated approval_bound.
    IF (p_record->'change'->>'approvedVersion') IS DISTINCT FROM b_vhash
       OR (p_record->'change'->>'approvedBy') IS DISTINCT FROM p_user::text THEN
      RAISE EXCEPTION 'citation_improvement_binding_approval_mismatch' USING ERRCODE='22023';
    END IF;
    IF (pub.snapshot->>'actionId') IS DISTINCT FROM (p_record->>'taskId') THEN
      RAISE EXCEPTION 'citation_improvement_binding_task_mismatch' USING ERRCODE='22023';
    END IF;
    b_live := CASE WHEN jsonb_typeof(pub.outcome_data)='object' THEN pub.outcome_data->>'liveUrl' END;
    IF pub.outcome='published' AND b_live IS NOT NULL
       AND (p_record->'destination'->>'reference') IS DISTINCT FROM b_live THEN
      RAISE EXCEPTION 'citation_improvement_binding_destination_mismatch' USING ERRCODE='22023';
    END IF;
    -- A structured owner inspection may only attest a PUBLISHED liveUrl it actually names, recorded by the
    -- authenticated owner (this save runs as that owner) at a FINITE observedAt on/after both the recorded
    -- publication (finished_at) and the current approval, and not in the future beyond a 5-minute
    -- clock-skew allowance. It is an owner attestation only, never a system/independent content check.
    insp := p_binding->'ownerInspection';
    IF insp IS NOT NULL AND jsonb_typeof(insp)<>'null' THEN
      IF jsonb_typeof(insp)<>'object'
         OR jsonb_typeof(insp->'checkResult') IS DISTINCT FROM 'string'
         OR (insp->>'checkResult') NOT IN ('shows_approved_content','does_not_show','inconclusive')
         OR jsonb_typeof(insp->'observedUrl') IS DISTINCT FROM 'string'
         OR jsonb_typeof(insp->'observedAt') IS DISTINCT FROM 'string'
         OR pub.outcome<>'published' OR b_live IS NULL OR pub.finished_at IS NULL
         OR (insp->>'observedUrl') IS DISTINCT FROM b_live THEN
        RAISE EXCEPTION 'citation_improvement_binding_inspection_invalid' USING ERRCODE='22023';
      END IF;
      BEGIN obs := (insp->>'observedAt')::timestamptz;
      EXCEPTION WHEN others THEN RAISE EXCEPTION 'citation_improvement_binding_inspection_invalid' USING ERRCODE='22023'; END;
      IF NOT isfinite(obs) OR obs < greatest(pub.finished_at,appr_at)
         OR obs > clock_timestamp() + interval '5 minutes' THEN
        RAISE EXCEPTION 'citation_improvement_binding_inspection_invalid' USING ERRCODE='22023';
      END IF;
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.ai_citation_improvements
     WHERE user_id=p_user AND project_id=p_project AND improvement_id=iid
       AND (panel_id<>panel OR panel_version<>pver OR client_name<>cname OR client_market<>cmarket)) THEN
    RAISE EXCEPTION 'citation_improvement_scope_drift' USING ERRCODE='22023';
  END IF;
  -- The RESOLVED pinned finding row ids AND the binding are folded into the idempotency digest, so a resave
  -- is idempotent only under the SAME dependency state: a different binding, or the same payload after a
  -- referenced finding has been superseded (a new head row id), yields a new digest and a NEW version
  -- pinning the current rows — never a silent rebind of the prior record to stale dependencies.
  digest := encode(sha256(convert_to(jsonb_build_array(panel,pver,cname,cmarket,p_record,coalesce(p_binding,'null'::jsonb),to_jsonb(bound))::text,'UTF8')),'hex');
  SELECT id INTO existing FROM public.ai_citation_improvements
    WHERE user_id=p_user AND project_id=p_project AND record_sha256=digest;
  IF existing IS NOT NULL THEN
    RETURN (SELECT jsonb_build_object('id',id,'improvementId',improvement_id,'version',version,
      'panelId',panel_id,'panelVersion',panel_version,
      'client',jsonb_build_object('name',client_name,'market',client_market),
      'actorId',actor_id,'supersedesId',supersedes_id,'predecessorDeleted',predecessor_deleted,
      'createdAt',created_at,
      'verificationStatus',public.citation_improvement_status(p_user,p_project,record,bound_finding_row_ids,publication_binding),
      'evidenceStatus',public.citation_improvement_evidence(p_user,p_project,record))
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
     panel_id,panel_version,client_name,client_market,actor_id,bound_finding_row_ids,publication_binding,supersedes_id)
    VALUES(p_user,p_project,iid,next_version,p_record,digest,panel,pver,cname,cmarket,p_user,bound,p_binding,head)
    RETURNING id INTO new_id;
  RETURN (SELECT jsonb_build_object('id',id,'improvementId',improvement_id,'version',version,
    'panelId',panel_id,'panelVersion',panel_version,
    'client',jsonb_build_object('name',client_name,'market',client_market),
    'actorId',actor_id,'supersedesId',supersedes_id,'predecessorDeleted',predecessor_deleted,
    'createdAt',created_at,
    'verificationStatus',public.citation_improvement_status(p_user,p_project,record,bound_finding_row_ids,publication_binding),
    'evidenceStatus',public.citation_improvement_evidence(p_user,p_project,record))
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
    'verificationStatus',public.citation_improvement_status(p_user,p_project,record,bound_finding_row_ids,publication_binding),
    'evidenceStatus',public.citation_improvement_evidence(p_user,p_project,record))
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
    -- The exact pinned dependency identity is returned on the DETAIL read so the owner can audit/export
    -- what an improvement is bound to (the resolved finding version rows and the structured binding, which
    -- carries no secret/provider material). The list stays metadata-only.
    'boundFindingRowIds',to_jsonb(bound_finding_row_ids),
    'publicationBinding',publication_binding,
    'verificationStatus',public.citation_improvement_status(p_user,p_project,record,bound_finding_row_ids,publication_binding),
    'evidenceStatus',public.citation_improvement_evidence(p_user,p_project,record)) INTO result
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
  public.save_ai_citation_improvement(uuid,text,jsonb,jsonb,jsonb),
  public.read_ai_citation_improvements(uuid,text),
  public.read_ai_citation_improvement(uuid,text,uuid),
  public.remove_ai_citation_improvement(uuid,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.save_ai_citation_finding(uuid,text,jsonb,jsonb),
  public.read_ai_citation_findings(uuid,text),
  public.read_ai_citation_finding(uuid,text,uuid),
  public.remove_ai_citation_finding(uuid,text,uuid),
  public.save_ai_citation_improvement(uuid,text,jsonb,jsonb,jsonb),
  public.read_ai_citation_improvements(uuid,text),
  public.read_ai_citation_improvement(uuid,text,uuid),
  public.remove_ai_citation_improvement(uuid,text,uuid)
  TO service_role;
