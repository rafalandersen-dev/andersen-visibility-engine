-- Citation Intelligence — change evidence and independent inspection (28 September 2026). CANDIDATE, UNAPPLIED
-- until its own independent review; it presumes PR156 (`20260927190000_citation_improvement_head_guard.sql`,
-- the v3 improvement save) is released and applied, and never edits any earlier migration (v1/v2/v3 sources are
-- delegated to, not replaced). Additive only: new tables, one provenance table for FUTURE publications, and
-- wrapper/predicate functions. Product decision (spec §7): an explicitly recorded OWNER inspection stays eligible
-- for the two delivered improvements under the existing live gates; a positive INDEPENDENT human inspection is a
-- separately labelled provenance that qualifies under the same gates; ACTIVE negative independent evidence
-- excludes the change from verified readiness; neither is automated verification or causal proof.
--
-- Subject lifecycle for listing/configuration changes: artifact (immutable intended change, non-secret enumerated
-- fields) → approval (owner, or delegate under the existing reviewer/editor policy; its own expected identity is
-- the artifact digest) → performed receipt (an authenticated declaration by the owner or an eligible member) →
-- improvement (v4 explicit change-binding branch, same finding/scope/head/digest guards as the public-URL path) →
-- owner inspection (a new improvement version) → independent inspection (append-only per-inspector chain with an
-- expected head; withdrawal is a NEW head, so nothing older is ever resurrected). Public-URL improvements gain the
-- same independent inspection and, for FUTURE publications, a server-derived actor record; older publications
-- have no performer identity and refuse independent verification (never an invented backfill).

-- 1. Publication actor provenance (future publications only). Written by the server right after
-- begin_publication_evidence with the AUTHENTICATED initiator (an interactive owner session) or the scheduler
-- acting under the owner's authority; the first record for a publication is immutable.
CREATE TABLE public.publication_evidence_actors (
  user_id uuid NOT NULL, project_id text NOT NULL, publication_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  initiator text NOT NULL CHECK(initiator IN ('interactive','scheduler')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,publication_id),
  FOREIGN KEY(user_id,project_id,publication_id) REFERENCES public.publication_evidence(user_id,project_id,id) ON DELETE CASCADE
);
ALTER TABLE public.publication_evidence_actors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publication_evidence_actors FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.record_publication_actor(p_user uuid,p_project text,p_id uuid,p_actor uuid,p_initiator text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_user IS NULL OR p_project IS NULL OR p_id IS NULL OR p_actor IS NULL OR p_initiator NOT IN ('interactive','scheduler') THEN
    RAISE EXCEPTION 'invalid_publication_actor' USING ERRCODE='22023';
  END IF;
  PERFORM public.assert_knowledge_project(p_user,p_project);
  IF NOT EXISTS(SELECT 1 FROM public.publication_evidence WHERE user_id=p_user AND project_id=p_project AND id=p_id) THEN
    RAISE EXCEPTION 'publication_evidence_missing' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.publication_evidence_actors(user_id,project_id,publication_id,actor_id,initiator)
    VALUES(p_user,p_project,p_id,p_actor,p_initiator)
    ON CONFLICT DO NOTHING;
  RETURN true;
END; $$;

-- 2. Intended-change artifacts. `fields` is an object of ENUMERATED non-secret keys per kind, each
-- `{before: text|null, after: text}`; values are bounded plain text (no control characters, no embedded
-- credentials). Unknown keys — including any credential/token/secret setting — are refused: there is no path to
-- store an arbitrary configuration dump or upload. Bounded text is NOT proven secret-free; the allow-list is.
CREATE FUNCTION public.citation_change_fields_valid(p_kind text,p_fields jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE k text; v jsonb; n integer := 0; allowed text[];
BEGIN
  IF p_fields IS NULL OR jsonb_typeof(p_fields)<>'object' THEN RETURN false; END IF;
  allowed := CASE p_kind
    WHEN 'listing' THEN ARRAY['name','address','phone','openingHours','website','description','category','priceRange']
    WHEN 'configuration' THEN ARRAY['siteTitle','siteTagline','defaultPostType','businessName','businessAddress','businessPhone','businessHours','robotsIndexing','canonicalUrl','structuredDataType','websiteUrl']
    ELSE NULL END;
  IF allowed IS NULL THEN RETURN false; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p_fields) LOOP
    n := n + 1;
    IF NOT (k = ANY(allowed)) THEN RETURN false; END IF;
    -- R1/1: the nested shape is EXACT — `after` (required text) and `before` (optional: text or JSON null). Any
    -- other nested key (a structured value, a credential-looking key, anything) fails closed; a missing `before`
    -- is NOT a licence for an unknown second key.
    IF jsonb_typeof(v)<>'object' OR NOT (v ? 'after') OR jsonb_typeof(v->'after')<>'string' THEN RETURN false; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(v) nk WHERE nk NOT IN ('before','after')) THEN RETURN false; END IF;
    IF (v ? 'before') AND jsonb_typeof(v->'before') NOT IN ('string','null') THEN RETURN false; END IF;
    IF btrim(v->>'after')='' OR public.native_artifact_utf16_length(v->>'after')>500 THEN RETURN false; END IF;
    IF (v->>'after') ~ '[\x00-\x08\x0B\x0C\x0E-\x1F]' OR (v->>'after') ~ '^[A-Za-z][A-Za-z0-9+.-]*://[^/?#]*@' THEN RETURN false; END IF;
    IF jsonb_typeof(v->'before')='string' AND (public.native_artifact_utf16_length(v->>'before')>500
       OR (v->>'before') ~ '[\x00-\x08\x0B\x0C\x0E-\x1F]' OR (v->>'before') ~ '^[A-Za-z][A-Za-z0-9+.-]*://[^/?#]*@') THEN RETURN false; END IF;
  END LOOP;
  RETURN n BETWEEN 1 AND 12;
END; $$;
REVOKE ALL ON FUNCTION public.citation_change_fields_valid(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- R1/1: every read path projects stored fields through this function, which rebuilds ONLY the enumerated
-- `{before, after}` pair per allowed key — a read can never surface a nested key the validator would refuse,
-- even if a row were ever written by another path.
CREATE FUNCTION public.citation_change_fields_project(p_kind text,p_fields jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce((SELECT jsonb_object_agg(e.key,jsonb_build_object('before',CASE WHEN jsonb_typeof(e.value->'before')='string' THEN e.value->'before' ELSE 'null'::jsonb END,'after',e.value->'after'))
    FROM jsonb_each(CASE WHEN jsonb_typeof(p_fields)='object' THEN p_fields ELSE '{}'::jsonb END) e
    WHERE jsonb_typeof(e.value)='object' AND jsonb_typeof(e.value->'after')='string'
      AND e.key = ANY(CASE p_kind
        WHEN 'listing' THEN ARRAY['name','address','phone','openingHours','website','description','category','priceRange']
        WHEN 'configuration' THEN ARRAY['siteTitle','siteTagline','defaultPostType','businessName','businessAddress','businessPhone','businessHours','robotsIndexing','canonicalUrl','structuredDataType','websiteUrl']
        ELSE ARRAY[]::text[] END)),'{}'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.citation_change_fields_project(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE public.ai_citation_change_artifacts (
  user_id uuid NOT NULL, project_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  kind text NOT NULL CHECK(kind IN ('listing','configuration')),
  reference text NOT NULL CHECK(octet_length(reference) BETWEEN 1 AND 1500),
  fields jsonb NOT NULL CHECK(jsonb_typeof(fields)='object' AND octet_length(fields::text)<=8000 AND public.citation_change_fields_valid(kind,fields)),
  artifact_sha256 text NOT NULL CHECK(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,id),
  UNIQUE(user_id,project_id,artifact_sha256),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.ai_citation_change_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_change_artifacts FROM PUBLIC,anon,authenticated,service_role;

-- 3. Version-bound approval of an artifact. One current row per artifact; the approver's expected identity is the
-- artifact digest (what was approved), not an improvement row. Owner writes are owner approvals; a team member's
-- write is a DELEGATE approval under the SAME reviewer/editor policy predicate as citation reviews
-- (citation_review_authorized), recorded with the revisions it was granted under. An identical re-approval by the
-- same approver is a no-op that keeps `updated_at` (a frozen lost-response retry never moves the approval instant).
CREATE TABLE public.ai_citation_change_approvals (
  user_id uuid NOT NULL, project_id text NOT NULL, artifact_id uuid NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  artifact_sha256 text NOT NULL CHECK(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK(kind IN ('listing','configuration')),
  approved boolean NOT NULL,
  -- R1/2: the approval subject's OWN head identity. Every effective decision (approve, revoke, re-approve) is a
  -- new revision; a writer names the revision it reviewed and is refused ('citation_change_stale') when the
  -- decision moved — so a frozen "approve" replayed after a later revoke never silently restores approval.
  revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by uuid NOT NULL,
  approver_kind text NOT NULL CHECK(approver_kind IN ('owner','delegate')),
  delegate_membership_revision bigint, delegate_policy_revision bigint,
  artifact_deleted_at timestamptz,
  PRIMARY KEY(user_id,project_id,artifact_id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.ai_citation_change_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_change_approvals FROM PUBLIC,anon,authenticated,service_role;
-- R1/2: append-only decision history keyed by the caller's frozen request identity. A lost-response retry (same
-- request id, same decision) returns ITS historical result — the revision it produced and that revision's
-- instant — without touching the current decision and without a conflict; it is never a new approval.
CREATE TABLE public.ai_citation_change_approval_decisions (
  user_id uuid NOT NULL, project_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL,
  artifact_sha256 text NOT NULL CHECK(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
  approved boolean NOT NULL,
  approved_by uuid NOT NULL,
  approver_kind text NOT NULL CHECK(approver_kind IN ('owner','delegate')),
  decided_at timestamptz NOT NULL,
  request_id uuid NOT NULL,
  digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(user_id,project_id,id),
  UNIQUE(user_id,project_id,digest),
  FOREIGN KEY(user_id,project_id,artifact_id) REFERENCES public.ai_citation_change_approvals(user_id,project_id,artifact_id) ON DELETE CASCADE
);
ALTER TABLE public.ai_citation_change_approval_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_change_approval_decisions FROM PUBLIC,anon,authenticated,service_role;

-- 4. Performed-change declarations. An authenticated owner or currently eligible member declares that the
-- approved change was carried out at a declared instant bounded by the approval and the clock; it is a
-- declaration, never destination proof, and never rises above 'receipt_recorded' on its own.
CREATE TABLE public.ai_citation_change_receipts (
  user_id uuid NOT NULL, project_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  artifact_id uuid NOT NULL,
  artifact_sha256 text NOT NULL CHECK(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK(kind IN ('listing','configuration')),
  reference text NOT NULL CHECK(octet_length(reference) BETWEEN 1 AND 1500),
  performed_by uuid NOT NULL,
  performer_kind text NOT NULL CHECK(performer_kind IN ('owner','delegate')),
  performed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
  artifact_deleted_at timestamptz,
  PRIMARY KEY(user_id,project_id,id),
  UNIQUE(user_id,project_id,digest),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.ai_citation_change_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_change_receipts FROM PUBLIC,anon,authenticated,service_role;

-- 5. Change binding of an improvement ROW (the change-kind counterpart of publication_binding). Written only by
-- the v4 save's explicit branch; deleted with its improvement row.
CREATE TABLE public.ai_citation_improvement_change_bindings (
  user_id uuid NOT NULL, project_id text NOT NULL, improvement_row_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  artifact_sha256 text NOT NULL CHECK(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  receipt_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('listing','configuration')),
  reference text NOT NULL,
  owner_inspection jsonb CHECK(owner_inspection IS NULL OR (jsonb_typeof(owner_inspection)='object' AND octet_length(owner_inspection::text)<=2000)),
  artifact_deleted_at timestamptz,
  PRIMARY KEY(user_id,project_id,improvement_row_id),
  FOREIGN KEY(user_id,project_id,improvement_row_id) REFERENCES public.ai_citation_improvements(user_id,project_id,id) ON DELETE CASCADE
);
ALTER TABLE public.ai_citation_improvement_change_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_improvement_change_bindings FROM PUBLIC,anon,authenticated,service_role;

-- 6. Inspection assignments: owner-granted, per improvement ROW, per inspector (mirror of the finding-review
-- assignments; content-free; cascades with the row).
CREATE TABLE public.ai_citation_inspection_assignments (
  user_id uuid NOT NULL, project_id text NOT NULL, improvement_row_id uuid NOT NULL, inspector_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  -- R1/4: every re-grant is a NEW assignment revision; receipts are bound to the revision they were made under.
  revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  CHECK(user_id<>inspector_id),
  CHECK(active OR revoked_at IS NOT NULL),
  PRIMARY KEY(user_id,project_id,improvement_row_id,inspector_id),
  FOREIGN KEY(user_id,project_id,improvement_row_id) REFERENCES public.ai_citation_improvements(user_id,project_id,id) ON DELETE CASCADE
);
ALTER TABLE public.ai_citation_inspection_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_inspection_assignments FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.citation_inspection_assigned(p_owner uuid,p_project text,p_row uuid,p_inspector uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.ai_citation_inspection_assignments
    WHERE user_id=p_owner AND project_id=p_project AND improvement_row_id=p_row AND inspector_id=p_inspector AND active AND revoked_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.citation_inspection_assigned(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- 7. Independent inspection receipts: an append-only per-(row, inspector) chain. Every write names the chain
-- head it was made against (version + immutable row id; 0/NULL for the first); a withdrawal is a NEW head of
-- kind 'withdrawn'. The effective receipt of an inspector is ALWAYS the chain head, so a withdrawn or replaced
-- head never lets an older receipt count again. Free-text notes are deliberately not stored.
CREATE TABLE public.ai_citation_improvement_inspections (
  user_id uuid NOT NULL, project_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
  improvement_row_id uuid NOT NULL,
  improvement_sha256 text NOT NULL CHECK(improvement_sha256 ~ '^[a-f0-9]{64}$'),
  inspector_id uuid NOT NULL,
  inspector_role text NOT NULL CHECK(inspector_role IN ('reviewer','editor')),
  policy_mode text NOT NULL CHECK(policy_mode IN ('separate_reviewers','editors_can_approve')),
  policy_revision bigint NOT NULL, membership_revision bigint NOT NULL,
  assignment_revision bigint NOT NULL,
  version integer NOT NULL CHECK(version BETWEEN 1 AND 10000),
  supersedes_id uuid,
  -- R1/3: the caller's reviewed chain head (its frozen request identity); part of the digest so a lost-response
  -- retry of a withdrawal or an inspection replays ITS receipt instead of colliding with the head it created.
  expected_version integer NOT NULL CHECK(expected_version BETWEEN 0 AND 10000),
  expected_head uuid,
  check_result text NOT NULL CHECK(check_result IN ('shows_approved_content','does_not_show','inconclusive','withdrawn')),
  observed_at timestamptz,
  observed_reference text,
  digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((check_result='withdrawn') = (observed_at IS NULL)),
  PRIMARY KEY(user_id,project_id,id),
  UNIQUE(user_id,project_id,improvement_row_id,inspector_id,version),
  UNIQUE(user_id,project_id,digest),
  FOREIGN KEY(user_id,project_id,improvement_row_id) REFERENCES public.ai_citation_improvements(user_id,project_id,id) ON DELETE CASCADE
);
ALTER TABLE public.ai_citation_improvement_inspections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_improvement_inspections FROM PUBLIC,anon,authenticated,service_role;

-- 8. Predicates (internal, granted to no role).
-- 8a. Current approval of an artifact (owner approvals are current while approved; delegate approvals must still
-- satisfy the live membership/policy/account predicate, exactly like read_publication_approval).
CREATE FUNCTION public.citation_change_approval_current(p_user uuid,p_project text,p_artifact uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.ai_citation_change_approvals%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.ai_citation_change_approvals WHERE user_id=p_user AND project_id=p_project AND artifact_id=p_artifact;
  IF a.artifact_id IS NULL OR NOT a.approved OR a.artifact_deleted_at IS NOT NULL THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_citation_change_artifacts WHERE user_id=p_user AND project_id=p_project AND id=p_artifact AND artifact_sha256=a.artifact_sha256) THEN RETURN false; END IF;
  IF a.approver_kind='owner' THEN RETURN true; END IF;
  RETURN EXISTS(
    SELECT 1 FROM public.project_team_members m JOIN public.project_team_approval_policy p ON p.owner_id=m.owner_id AND p.project_id=m.project_id
    WHERE m.owner_id=p_user AND m.project_id=p_project AND m.actor_id=a.approved_by AND m.active
      AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) AND m.revision=a.delegate_membership_revision
      AND p.revision=a.delegate_policy_revision
      AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=m.actor_id AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()))
      AND ((p.mode IN ('separate_reviewers','editors_can_approve') AND m.role='reviewer') OR (p.mode='editors_can_approve' AND m.role='editor')));
END; $$;
REVOKE ALL ON FUNCTION public.citation_change_approval_current(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- 8b. The finding gate of the released status function, factored so the change-kind ladder and the independent
-- fold honour EXACTLY the same finding truths: dismissed head / unresolved sources → unavailable; erased material,
-- unresolved accuracy, pending second review, live dissent anywhere in the chain, or uninspectable material → capped.
CREATE FUNCTION public.citation_improvement_finding_gate(p_user uuid,p_project text,p_bound uuid[],OUT available boolean,OUT capped boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE frec jsonb; i integer; f_erased timestamptz; head_dec text; head_row uuid;
BEGIN
  available := true; capped := false;
  IF coalesce(array_length(p_bound,1),0)=0 THEN available := false; RETURN; END IF;
  FOR i IN 1..array_length(p_bound,1) LOOP
    SELECT record,evidence_erased_at INTO frec,f_erased FROM public.ai_citation_findings WHERE user_id=p_user AND project_id=p_project AND id=p_bound[i];
    IF frec IS NULL OR NOT public.citation_finding_sources_available(p_user,p_project,frec) THEN available := false; RETURN; END IF;
    SELECT h.id,h.decision INTO head_row,head_dec
      FROM public.ai_citation_findings a
      JOIN public.ai_citation_findings h ON h.user_id=a.user_id AND h.project_id=a.project_id AND h.finding_id=a.finding_id
       AND h.panel_id=a.panel_id AND h.panel_version=a.panel_version AND h.client_name=a.client_name AND h.client_market=a.client_market
      WHERE a.id=p_bound[i] AND a.user_id=p_user AND a.project_id=p_project
        AND NOT EXISTS(SELECT 1 FROM public.ai_citation_findings s WHERE s.user_id=a.user_id AND s.project_id=a.project_id AND s.supersedes_id=h.id)
      ORDER BY h.version DESC,h.created_at DESC,h.id DESC LIMIT 1;
    IF head_dec='dismissed' THEN available := false; RETURN; END IF;
    IF f_erased IS NOT NULL THEN capped := true; END IF;
    IF public.citation_finding_accuracy_status(p_user,p_project,frec)='unresolved' THEN capped := true; END IF;
    IF public.citation_finding_review_status(p_user,p_project,head_row) IN ('second_review_pending','independent_dissent') THEN capped := true; END IF;
    IF EXISTS(SELECT 1 FROM public.ai_citation_findings a
        JOIN public.ai_citation_findings sib ON sib.user_id=a.user_id AND sib.project_id=a.project_id AND sib.finding_id=a.finding_id
         AND sib.panel_id=a.panel_id AND sib.panel_version=a.panel_version AND sib.client_name=a.client_name AND sib.client_market=a.client_market
        JOIN public.ai_citation_finding_reviews rv ON rv.user_id=sib.user_id AND rv.project_id=sib.project_id AND rv.finding_row_id=sib.id
      WHERE a.id=p_bound[i] AND a.user_id=p_user AND a.project_id=p_project
        AND rv.decision IN ('rejected','needs_changes') AND rv.reviewer_id<>p_user AND NOT rv.withdrawn) THEN capped := true; END IF;
    IF NOT public.citation_finding_inspectable(p_user,p_project,frec) THEN capped := true; END IF;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.citation_improvement_finding_gate(uuid,text,uuid[]) FROM PUBLIC,anon,authenticated,service_role;

-- 8c. Baselines resolve (the record's baselineCaptureIds are non-empty and every id is a live capture of this
-- owner/project) — the independent path has no owner verification block, so the baseline axis is read directly.
CREATE FUNCTION public.citation_improvement_baselines_resolve(p_user uuid,p_project text,p_record jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cid text;
BEGIN
  IF jsonb_typeof(p_record->'baselineCaptureIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_record->'baselineCaptureIds')=0 THEN RETURN false; END IF;
  FOR cid IN SELECT jsonb_array_elements_text(p_record->'baselineCaptureIds') LOOP
    IF cid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RETURN false; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project AND id=cid::uuid) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.citation_improvement_baselines_resolve(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- 8d. Status ladder for a change-bound improvement row: unverified → approval_bound → receipt_recorded →
-- owner_attested (positive owner inspection on/after the performed instant AND the current approval, non-future,
-- with the finding gate open and the baselines recorded). Any deleted artifact/receipt or a non-current approval
-- collapses it live; the stored binding is never rewritten.
CREATE FUNCTION public.citation_change_binding_status(p_user uuid,p_project text,p_row uuid,p_record jsonb,p_bound uuid[])
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cb public.ai_citation_improvement_change_bindings%ROWTYPE; gate record; appr_at timestamptz; perf_at timestamptz; obs timestamptz; status text;
BEGIN
  SELECT * INTO cb FROM public.ai_citation_improvement_change_bindings WHERE user_id=p_user AND project_id=p_project AND improvement_row_id=p_row;
  IF cb.improvement_row_id IS NULL OR cb.artifact_deleted_at IS NOT NULL THEN RETURN 'unverified'; END IF;
  SELECT * INTO gate FROM public.citation_improvement_finding_gate(p_user,p_project,p_bound);
  IF NOT gate.available THEN RETURN 'unverified'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_citation_change_artifacts WHERE user_id=p_user AND project_id=p_project AND id=cb.artifact_id AND artifact_sha256=cb.artifact_sha256) THEN RETURN 'unverified'; END IF;
  IF NOT public.citation_change_approval_current(p_user,p_project,cb.artifact_id) THEN RETURN 'unverified'; END IF;
  SELECT updated_at INTO appr_at FROM public.ai_citation_change_approvals WHERE user_id=p_user AND project_id=p_project AND artifact_id=cb.artifact_id;
  status := 'approval_bound';
  SELECT performed_at INTO perf_at FROM public.ai_citation_change_receipts
    WHERE user_id=p_user AND project_id=p_project AND id=cb.receipt_id AND artifact_id=cb.artifact_id AND artifact_sha256=cb.artifact_sha256 AND artifact_deleted_at IS NULL;
  IF perf_at IS NULL THEN RETURN status; END IF;
  status := 'receipt_recorded';
  IF cb.owner_inspection IS NOT NULL AND (cb.owner_inspection->>'checkResult')='shows_approved_content'
     AND (cb.owner_inspection->>'observedReference')=cb.reference
     AND NOT gate.capped
     AND public.citation_improvement_evidence(p_user,p_project,p_record)='baseline_recorded' THEN
    BEGIN obs := (cb.owner_inspection->>'observedAt')::timestamptz; EXCEPTION WHEN others THEN obs := NULL; END;
    IF obs IS NOT NULL AND isfinite(obs) AND obs >= greatest(perf_at,appr_at) AND obs <= clock_timestamp() + interval '5 minutes' THEN
      status := 'owner_attested';
    END IF;
  END IF;
  RETURN status;
END; $$;
REVOKE ALL ON FUNCTION public.citation_change_binding_status(uuid,text,uuid,jsonb,uuid[]) FROM PUBLIC,anon,authenticated,service_role;

-- 8e. Known performer / approver identities of an improvement row's bound change. Public URL: the approver is the
-- publication approval's owner or delegate (known while that approval row exists); the performer is the
-- publication actor record (known only for publications that carry one). Change kinds: approver = the change
-- approval's approver; performer = the performed receipt's writer. Unknown identities are reported as unknown —
-- never guessed from the owner's connector credentials.
CREATE FUNCTION public.citation_improvement_actors(p_user uuid,p_project text,p_row uuid,
  OUT performer uuid,OUT performer_known boolean,OUT approver uuid,OUT approver_known boolean,OUT reference text,OUT anchor_at timestamptz,OUT approval_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE imp public.ai_citation_improvements%ROWTYPE; cb public.ai_citation_improvement_change_bindings%ROWTYPE;
  pub public.publication_evidence%ROWTYPE; a public.ai_citation_change_approvals%ROWTYPE; pa uuid; delegate uuid; appr_row boolean;
BEGIN
  performer := NULL; performer_known := false; approver := NULL; approver_known := false; reference := NULL; anchor_at := NULL; approval_at := NULL;
  SELECT * INTO imp FROM public.ai_citation_improvements WHERE user_id=p_user AND project_id=p_project AND id=p_row;
  IF imp.id IS NULL THEN RETURN; END IF;
  SELECT * INTO cb FROM public.ai_citation_improvement_change_bindings WHERE user_id=p_user AND project_id=p_project AND improvement_row_id=p_row;
  IF cb.improvement_row_id IS NOT NULL THEN
    SELECT * INTO a FROM public.ai_citation_change_approvals WHERE user_id=p_user AND project_id=p_project AND artifact_id=cb.artifact_id;
    IF a.artifact_id IS NOT NULL AND a.approved THEN approver := a.approved_by; approver_known := true; approval_at := a.updated_at; END IF;
    SELECT performed_by,performed_at INTO performer,anchor_at FROM public.ai_citation_change_receipts
      WHERE user_id=p_user AND project_id=p_project AND id=cb.receipt_id AND artifact_deleted_at IS NULL;
    performer_known := performer IS NOT NULL;
    reference := cb.reference;
    RETURN;
  END IF;
  IF imp.publication_binding IS NULL OR (imp.publication_binding->>'publicationId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RETURN; END IF;
  SELECT * INTO pub FROM public.publication_evidence WHERE user_id=p_user AND project_id=p_project AND id=(imp.publication_binding->>'publicationId')::uuid;
  IF pub.id IS NULL THEN RETURN; END IF;
  reference := CASE WHEN jsonb_typeof(pub.outcome_data)='object' THEN pub.outcome_data->>'liveUrl' END;
  anchor_at := pub.finished_at;
  SELECT delegate_actor_id,updated_at,true INTO delegate,approval_at,appr_row FROM public.publication_approvals
    WHERE user_id=p_user AND project_id=p_project AND asset_id=pub.asset_id AND algorithm='milo-publication-v1' AND version_hash=pub.version_hash AND approved;
  IF appr_row THEN approver := coalesce(delegate,p_user); approver_known := true; END IF;
  SELECT actor_id INTO pa FROM public.publication_evidence_actors WHERE user_id=p_user AND project_id=p_project AND publication_id=pub.id;
  IF pa IS NOT NULL THEN performer := pa; performer_known := true; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.citation_improvement_actors(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- 8f. Whether an inspector CURRENTLY holds an effective assignment (assigned, authorized, current account): the
-- owner-facing "may inspect now" flag. Receipt validity is stricter (8g).
CREATE FUNCTION public.citation_inspector_effective(p_owner uuid,p_project text,p_row uuid,p_inspector uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE auth record;
BEGIN
  IF NOT public.citation_inspection_assigned(p_owner,p_project,p_row,p_inspector) THEN RETURN false; END IF;
  SELECT * INTO auth FROM public.citation_review_authorized(p_inspector,p_owner,p_project);
  RETURN coalesce(auth.allowed,false);
END; $$;
REVOKE ALL ON FUNCTION public.citation_inspector_effective(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- 8g. R1/4: validity of ONE receipt. An affirmative or inconclusive receipt is bound to the authority it was
-- submitted under: the assignment, membership and policy revisions recorded on it must still be the live ones,
-- the inspector must still be assigned/authorized with a current account, and the live performer/approver
-- identities must still exclude the inspector. Renewed authority (re-grant, re-membership, policy change) never
-- revives an older receipt — the inspector records a FRESH one against their current chain head. A negative
-- head ('does_not_show') is sticky in ONE direction: it stays effective while it is the inspector's chain head
-- and the account exists, so owner-controlled gates (assignment revoke, membership edits) cannot erase dissent;
-- only the inspector's own withdrawal/replacement, or a distinct approved+performed change, resolves it.
CREATE FUNCTION public.citation_inspection_receipt_effective(p_owner uuid,p_project text,p_receipt uuid,OUT effective boolean,OUT reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.ai_citation_improvement_inspections%ROWTYPE; a public.ai_citation_inspection_assignments%ROWTYPE; auth record; acts record;
BEGIN
  effective := false; reason := 'unavailable';
  SELECT * INTO r FROM public.ai_citation_improvement_inspections WHERE user_id=p_owner AND project_id=p_project AND id=p_receipt;
  IF r.id IS NULL THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM public.ai_citation_improvement_inspections n WHERE n.user_id=r.user_id AND n.project_id=r.project_id
      AND n.improvement_row_id=r.improvement_row_id AND n.inspector_id=r.inspector_id AND n.version>r.version) THEN reason := 'superseded'; RETURN; END IF;
  IF r.check_result='withdrawn' THEN reason := 'withdrawn'; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=r.inspector_id AND u.deleted_at IS NULL) THEN reason := 'account'; RETURN; END IF;
  IF r.check_result='does_not_show' THEN effective := true; reason := NULL; RETURN; END IF;
  SELECT * INTO a FROM public.ai_citation_inspection_assignments WHERE user_id=p_owner AND project_id=p_project AND improvement_row_id=r.improvement_row_id AND inspector_id=r.inspector_id;
  IF a.inspector_id IS NULL OR NOT a.active OR a.revoked_at IS NOT NULL OR a.revision<>r.assignment_revision THEN reason := 'assignment'; RETURN; END IF;
  SELECT * INTO auth FROM public.citation_review_authorized(r.inspector_id,p_owner,p_project);
  IF NOT coalesce(auth.allowed,false) OR auth.membership_revision IS DISTINCT FROM r.membership_revision OR auth.policy_revision IS DISTINCT FROM r.policy_revision THEN
    reason := 'authority'; RETURN;
  END IF;
  SELECT * INTO acts FROM public.citation_improvement_actors(p_owner,p_project,r.improvement_row_id);
  IF (acts.performer_known AND acts.performer=r.inspector_id) OR (acts.approver_known AND acts.approver=r.inspector_id) THEN reason := 'independence'; RETURN; END IF;
  effective := true; reason := NULL;
END; $$;
REVOKE ALL ON FUNCTION public.citation_inspection_receipt_effective(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- 8g'. The independent fold. R1/5: dissent is scoped by the GENUINE bound identity — every improvement row of
-- this owner/project that binds the same artifact digest + performed receipt (or the same publication attempt +
-- version) is the same delivered change, so an effective negative head recorded on ANY of them disputes this
-- row too; a cosmetic owner correction (a new row, same binding, even with a positive owner observation) never
-- sheds it, and its provenance (receipt, row, inspector, instant) is exposed. Affirmative and inconclusive
-- receipts count only for the row they were recorded on. Per effective inspector the chain HEAD decides;
-- 'withdrawn' heads have no effect; any dissent → 'disputed' (a later positive by someone else never hides it);
-- else a positive on/after the current approval → 'independently_inspected'; else inconclusive → 'inconclusive';
-- else 'none'. Never affirmative from inconclusive; never a resurrection of a superseded or re-authorised receipt.
CREATE FUNCTION public.citation_independent_status(p_user uuid,p_project text,p_row uuid,OUT status text,OUT verified_at timestamptz,OUT dissent jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE imp public.ai_citation_improvements%ROWTYPE; cb public.ai_citation_improvement_change_bindings%ROWTYPE; r record; eff record; acts record;
  any_neg boolean := false; any_pos boolean := false; any_inc boolean := false; pos_at timestamptz; sib uuid[];
BEGIN
  status := 'none'; verified_at := NULL; dissent := '[]'::jsonb;
  SELECT * INTO imp FROM public.ai_citation_improvements WHERE user_id=p_user AND project_id=p_project AND id=p_row;
  IF imp.id IS NULL THEN RETURN; END IF;
  SELECT * INTO cb FROM public.ai_citation_improvement_change_bindings WHERE user_id=p_user AND project_id=p_project AND improvement_row_id=p_row;
  IF cb.improvement_row_id IS NOT NULL THEN
    SELECT coalesce(array_agg(b.improvement_row_id),ARRAY[p_row]) INTO sib FROM public.ai_citation_improvement_change_bindings b
      WHERE b.user_id=p_user AND b.project_id=p_project AND b.artifact_id=cb.artifact_id AND b.artifact_sha256=cb.artifact_sha256 AND b.receipt_id=cb.receipt_id;
  ELSIF imp.publication_binding IS NOT NULL AND (imp.publication_binding->>'publicationId') IS NOT NULL THEN
    SELECT coalesce(array_agg(i.id),ARRAY[p_row]) INTO sib FROM public.ai_citation_improvements i
      WHERE i.user_id=p_user AND i.project_id=p_project AND i.publication_binding IS NOT NULL
        AND (i.publication_binding->>'publicationId')=(imp.publication_binding->>'publicationId')
        AND (i.publication_binding->>'versionHash') IS NOT DISTINCT FROM (imp.publication_binding->>'versionHash');
  ELSE sib := ARRAY[p_row]; END IF;
  SELECT * INTO acts FROM public.citation_improvement_actors(p_user,p_project,p_row);
  FOR r IN
    SELECT DISTINCT ON (i.improvement_row_id,i.inspector_id) i.id,i.improvement_row_id,i.inspector_id,i.check_result,i.observed_at
      FROM public.ai_citation_improvement_inspections i
      WHERE i.user_id=p_user AND i.project_id=p_project AND i.improvement_row_id = ANY(sib)
      ORDER BY i.improvement_row_id,i.inspector_id,i.version DESC
  LOOP
    SELECT * INTO eff FROM public.citation_inspection_receipt_effective(p_user,p_project,r.id);
    IF NOT eff.effective THEN CONTINUE; END IF;
    IF r.check_result='does_not_show' THEN
      any_neg := true;
      dissent := dissent || jsonb_build_object('receiptId',r.id,'improvementRowId',r.improvement_row_id,'inspectorId',r.inspector_id,
        'observedAt',to_char(r.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
    ELSIF r.improvement_row_id <> p_row THEN CONTINUE;
    ELSIF r.check_result='shows_approved_content' THEN
      IF acts.approval_at IS NOT NULL AND r.observed_at >= acts.approval_at THEN
        any_pos := true; pos_at := greatest(coalesce(pos_at,r.observed_at),r.observed_at);
      END IF;
    ELSE any_inc := true; END IF;
  END LOOP;
  IF any_neg THEN status := 'disputed';
  ELSIF any_pos THEN status := 'independently_inspected'; verified_at := pos_at;
  ELSIF any_inc THEN status := 'inconclusive';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.citation_independent_status(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- 8h. The LIVE v2 projection of one improvement row: the base ladder (public-URL rows through the released
-- citation_improvement_status, change rows through citation_change_binding_status), the independent fold, and the
-- single verified-eligibility predicate every counting consumer must use:
--   eligible = independent <> 'disputed'
--              AND ( base = 'owner_attested'
--                    OR ( independent = 'independently_inspected' AND base IN (connector_receipt, receipt_recorded,
--                         owner_attested) AND baselines resolve AND the finding gate is not capped ) ).
-- verifiedAt = the owner's derived verification instant, or the effective positive inspection instant.
CREATE FUNCTION public.citation_improvement_live_v2(p_user uuid,p_project text,p_row uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE imp public.ai_citation_improvements%ROWTYPE; cb public.ai_citation_improvement_change_bindings%ROWTYPE;
  base text; ind record; gate record; eligible boolean := false; vat text; baselines boolean;
BEGIN
  SELECT * INTO imp FROM public.ai_citation_improvements WHERE user_id=p_user AND project_id=p_project AND id=p_row;
  IF imp.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO cb FROM public.ai_citation_improvement_change_bindings WHERE user_id=p_user AND project_id=p_project AND improvement_row_id=p_row;
  IF cb.improvement_row_id IS NOT NULL THEN
    base := public.citation_change_binding_status(p_user,p_project,p_row,imp.record,imp.bound_finding_row_ids);
  ELSE
    base := public.citation_improvement_status(p_user,p_project,imp.record,imp.bound_finding_row_ids,imp.publication_binding);
  END IF;
  SELECT * INTO ind FROM public.citation_independent_status(p_user,p_project,p_row);
  SELECT * INTO gate FROM public.citation_improvement_finding_gate(p_user,p_project,imp.bound_finding_row_ids);
  baselines := public.citation_improvement_baselines_resolve(p_user,p_project,imp.record);
  IF ind.status <> 'disputed' THEN
    IF base='owner_attested' THEN eligible := true; vat := imp.record->'verification'->>'verifiedAt';
    ELSIF ind.status='independently_inspected' AND base IN ('connector_receipt','receipt_recorded','owner_attested') AND baselines AND gate.available AND NOT gate.capped THEN
      eligible := true; vat := to_char(ind.verified_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'verificationStatus',base,
    'independentStatus',ind.status,
    'verifiedEligible',eligible,
    'verifiedAt',CASE WHEN eligible THEN vat END,
    'dissent',ind.dissent,
    'changeBinding',CASE WHEN cb.improvement_row_id IS NULL THEN NULL ELSE jsonb_build_object(
      'kind',cb.kind,'artifactId',cb.artifact_id,'artifactSha256',cb.artifact_sha256,'receiptId',cb.receipt_id,
      'reference',cb.reference,'ownerInspection',cb.owner_inspection,'artifactDeleted',cb.artifact_deleted_at IS NOT NULL) END);
END; $$;
REVOKE ALL ON FUNCTION public.citation_improvement_live_v2(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- 9. Artifact / approval / receipt RPCs (service RPCs: the server middleware supplies the authenticated actor).
CREATE FUNCTION public.save_ai_citation_change_artifact(p_user uuid,p_project text,p_kind text,p_reference text,p_fields jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE digest text; existing uuid; new_id uuid;
BEGIN
  IF p_kind NOT IN ('listing','configuration') OR p_reference IS NULL OR octet_length(p_reference) NOT BETWEEN 1 AND 1500
     OR p_reference ~ '[\x00-\x1F]' OR NOT public.citation_change_fields_valid(p_kind,p_fields) THEN
    RAISE EXCEPTION 'citation_change_unsupported' USING ERRCODE='22023';
  END IF;
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  PERFORM public.citation_lock_account(p_user);
  digest := encode(sha256(convert_to(jsonb_build_array(p_kind,p_reference,p_fields)::text,'UTF8')),'hex');
  SELECT id INTO existing FROM public.ai_citation_change_artifacts WHERE user_id=p_user AND project_id=p_project AND artifact_sha256=digest;
  IF existing IS NOT NULL THEN
    RETURN (SELECT jsonb_build_object('id',id,'kind',kind,'reference',reference,'fields',public.citation_change_fields_project(kind,fields),'artifactSha256',artifact_sha256,'createdBy',created_by,'createdAt',created_at)
      FROM public.ai_citation_change_artifacts WHERE user_id=p_user AND project_id=p_project AND id=existing);
  END IF;
  IF (SELECT count(*) FROM public.ai_citation_change_artifacts WHERE user_id=p_user AND project_id=p_project)>=200 THEN
    RAISE EXCEPTION 'citation_change_capacity' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.ai_citation_change_artifacts(user_id,project_id,kind,reference,fields,artifact_sha256,created_by)
    VALUES(p_user,p_project,p_kind,p_reference,p_fields,digest,p_user) RETURNING id INTO new_id;
  RETURN (SELECT jsonb_build_object('id',id,'kind',kind,'reference',reference,'fields',public.citation_change_fields_project(kind,fields),'artifactSha256',artifact_sha256,'createdBy',created_by,'createdAt',created_at)
    FROM public.ai_citation_change_artifacts WHERE user_id=p_user AND project_id=p_project AND id=new_id);
END; $$;

CREATE FUNCTION public.read_ai_citation_change_artifacts(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  RETURN jsonb_build_object('artifacts',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',a.id,'kind',a.kind,'reference',a.reference,'fields',public.citation_change_fields_project(a.kind,a.fields),'artifactSha256',a.artifact_sha256,'createdBy',a.created_by,'createdAt',a.created_at,
      'approval',(SELECT jsonb_build_object('approved',ap.approved,'current',public.citation_change_approval_current(p_user,p_project,a.id),'revision',ap.revision,
          'approverKind',ap.approver_kind,'approverId',ap.approved_by,'approvedAt',to_char(ap.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
        FROM public.ai_citation_change_approvals ap WHERE ap.user_id=p_user AND ap.project_id=p_project AND ap.artifact_id=a.id),
      'receipts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'performedBy',r.performed_by,'performerKind',r.performer_kind,
          'performedAt',to_char(r.performed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'recordedAt',r.recorded_at) ORDER BY r.performed_at DESC)
        FROM public.ai_citation_change_receipts r WHERE r.user_id=p_user AND r.project_id=p_project AND r.artifact_id=a.id AND r.artifact_deleted_at IS NULL),'[]'::jsonb)
    ) ORDER BY a.created_at DESC)
    FROM public.ai_citation_change_artifacts a WHERE a.user_id=p_user AND a.project_id=p_project),'[]'::jsonb));
END; $$;

-- Deletion: the artifact row (its enumerated field values) is deleted; approvals/receipts/bindings keep ONLY
-- identifiers (artifact id, digest, kind, the reference identifier) and an `artifact_deleted_at` marker — no
-- field content — and lose their live effect.
CREATE FUNCTION public.remove_ai_citation_change_artifact(p_user uuid,p_project text,p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  PERFORM public.citation_lock_account(p_user);
  IF p_id IS NULL THEN RAISE EXCEPTION 'citation_change_unsupported' USING ERRCODE='22023'; END IF;
  UPDATE public.ai_citation_change_approvals SET artifact_deleted_at=coalesce(artifact_deleted_at,clock_timestamp()) WHERE user_id=p_user AND project_id=p_project AND artifact_id=p_id;
  UPDATE public.ai_citation_change_receipts SET artifact_deleted_at=coalesce(artifact_deleted_at,clock_timestamp()) WHERE user_id=p_user AND project_id=p_project AND artifact_id=p_id;
  UPDATE public.ai_citation_improvement_change_bindings SET artifact_deleted_at=coalesce(artifact_deleted_at,clock_timestamp()) WHERE user_id=p_user AND project_id=p_project AND artifact_id=p_id;
  DELETE FROM public.ai_citation_change_artifacts WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  RETURN true;
END; $$;

CREATE FUNCTION public.set_ai_citation_change_approval(p_actor uuid,p_owner uuid,p_project text,p_artifact uuid,p_expected_sha text,p_approved boolean,
  p_expected_revision integer,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
DECLARE art public.ai_citation_change_artifacts%ROWTYPE; auth record; cur public.ai_citation_change_approvals%ROWTYPE; dec public.ai_citation_change_approval_decisions%ROWTYPE;
  kind_ text; mrev bigint; prev bigint; dg text; cur_rev bigint; new_rev bigint; at_ timestamptz;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_project IS NULL OR p_artifact IS NULL OR p_approved IS NULL OR p_request IS NULL
     OR p_expected_sha !~ '^[a-f0-9]{64}$' OR (p_expected_revision IS NOT NULL AND (p_expected_revision<0 OR p_expected_revision>1000000)) THEN
    RAISE EXCEPTION 'citation_change_unsupported' USING ERRCODE='22023';
  END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.citation_lock_account(p_owner);
  SELECT * INTO art FROM public.ai_citation_change_artifacts WHERE user_id=p_owner AND project_id=p_project AND id=p_artifact;
  IF art.id IS NULL THEN RAISE EXCEPTION 'citation_change_unavailable' USING ERRCODE='22023'; END IF;
  IF art.artifact_sha256 <> p_expected_sha THEN RAISE EXCEPTION 'citation_change_stale' USING ERRCODE='40001'; END IF;
  -- R2/1: LIVE authorization comes FIRST — before any history replay. A revoked, expired, removed or banned
  -- delegate is refused exactly like a fresh request; a former member never reads decision metadata.
  IF p_actor = p_owner THEN kind_ := 'owner'; mrev := NULL; prev := NULL;
  ELSE
    PERFORM public.assert_project_team_account(p_owner);
    PERFORM public.assert_project_team_account(p_actor);
    SELECT * INTO auth FROM public.citation_review_authorized(p_actor,p_owner,p_project);
    IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_change_forbidden' USING ERRCODE='22023'; END IF;
    kind_ := 'delegate'; mrev := auth.membership_revision; prev := auth.policy_revision;
  END IF;
  -- R1/2 (a): a frozen request replayed after a lost response by a STILL authorized actor returns its own
  -- historical decision, whatever happened since — it never becomes a new decision and never conflicts.
  dg := encode(sha256(convert_to(jsonb_build_array(p_artifact,p_expected_sha,p_actor,p_approved,p_request)::text,'UTF8')),'hex');
  SELECT * INTO dec FROM public.ai_citation_change_approval_decisions WHERE user_id=p_owner AND project_id=p_project AND digest=dg;
  SELECT * INTO cur FROM public.ai_citation_change_approvals WHERE user_id=p_owner AND project_id=p_project AND artifact_id=p_artifact;
  IF dec.id IS NOT NULL THEN
    RETURN jsonb_build_object('approved',dec.approved,'approverKind',dec.approver_kind,'approverId',dec.approved_by,
      'approvedAt',to_char(dec.decided_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'revision',dec.revision,'currentRevision',coalesce(cur.revision,0),'replayed',true);
  END IF;
  -- R1/2 (b): the approval's own expected head. NULL/0 means "no decision yet"; an older revision (including the
  -- ABA approve→revoke→approve) is stale.
  cur_rev := coalesce(cur.revision,0);
  IF cur.artifact_id IS NOT NULL AND cur.artifact_deleted_at IS NOT NULL THEN cur_rev := cur.revision; END IF;
  IF coalesce(p_expected_revision,0) <> cur_rev THEN RAISE EXCEPTION 'citation_change_stale' USING ERRCODE='40001'; END IF;
  IF cur.artifact_id IS NOT NULL AND cur.approved=p_approved AND cur.approved_by=p_actor AND cur.artifact_sha256=art.artifact_sha256 AND cur.artifact_deleted_at IS NULL
     -- R2/2: an identical delegate decision is a no-op ONLY while its recorded authority is still the live one;
     -- a changed membership/policy revision makes the explicit re-decision a REAL new decision (new revision,
     -- new instant, the currently authorized revisions) — the only way a delegated approval recovers. Renewed
     -- membership alone never revives it.
     AND (kind_='owner' OR (cur.delegate_membership_revision IS NOT DISTINCT FROM mrev AND cur.delegate_policy_revision IS NOT DISTINCT FROM prev)) THEN
    -- Identical decision at the current head: no change, the approval instant is preserved; the request is
    -- recorded so ITS retry replays this same result.
    new_rev := cur.revision; at_ := cur.updated_at;
  ELSE
    new_rev := cur_rev + 1; at_ := clock_timestamp();
    INSERT INTO public.ai_citation_change_approvals(user_id,project_id,artifact_id,artifact_sha256,kind,approved,revision,updated_at,approved_by,approver_kind,delegate_membership_revision,delegate_policy_revision)
      VALUES(p_owner,p_project,p_artifact,art.artifact_sha256,art.kind,p_approved,new_rev,at_,p_actor,kind_,mrev,prev)
      ON CONFLICT(user_id,project_id,artifact_id) DO UPDATE SET artifact_sha256=EXCLUDED.artifact_sha256,approved=EXCLUDED.approved,revision=EXCLUDED.revision,updated_at=EXCLUDED.updated_at,
        approved_by=EXCLUDED.approved_by,approver_kind=EXCLUDED.approver_kind,delegate_membership_revision=EXCLUDED.delegate_membership_revision,
        delegate_policy_revision=EXCLUDED.delegate_policy_revision,artifact_deleted_at=NULL;
  END IF;
  INSERT INTO public.ai_citation_change_approval_decisions(user_id,project_id,artifact_id,artifact_sha256,revision,approved,approved_by,approver_kind,decided_at,request_id,digest)
    VALUES(p_owner,p_project,p_artifact,art.artifact_sha256,new_rev,p_approved,p_actor,kind_,at_,p_request,dg);
  RETURN public.read_ai_citation_change_approval_provenance(p_owner,p_project,p_artifact);
END; $$;

CREATE FUNCTION public.read_ai_citation_change_approval_provenance(p_user uuid,p_project text,p_artifact uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.ai_citation_change_approvals%ROWTYPE; ok boolean;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  ok := public.citation_change_approval_current(p_user,p_project,p_artifact);
  SELECT * INTO a FROM public.ai_citation_change_approvals WHERE user_id=p_user AND project_id=p_project AND artifact_id=p_artifact;
  IF NOT ok OR a.artifact_id IS NULL THEN
    RETURN jsonb_build_object('approved',false,'approverKind',NULL,'approverId',NULL,'approvedAt',NULL,
      'revision',coalesce(a.revision,0),'currentRevision',coalesce(a.revision,0),'replayed',false);
  END IF;
  RETURN jsonb_build_object('approved',true,'approverKind',a.approver_kind,'approverId',a.approved_by,
    'approvedAt',to_char(a.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'revision',a.revision,'currentRevision',a.revision,'replayed',false);
END; $$;

CREATE FUNCTION public.save_ai_citation_change_receipt(p_actor uuid,p_owner uuid,p_project text,p_artifact uuid,p_performed_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
DECLARE art public.ai_citation_change_artifacts%ROWTYPE; auth record; kind_ text; appr_at timestamptz; dg text; existing uuid; new_id uuid;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_project IS NULL OR p_artifact IS NULL OR p_performed_at IS NULL OR NOT isfinite(p_performed_at) THEN
    RAISE EXCEPTION 'citation_change_receipt_invalid' USING ERRCODE='22023';
  END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.citation_lock_account(p_owner);
  SELECT * INTO art FROM public.ai_citation_change_artifacts WHERE user_id=p_owner AND project_id=p_project AND id=p_artifact;
  IF art.id IS NULL THEN RAISE EXCEPTION 'citation_change_unavailable' USING ERRCODE='22023'; END IF;
  IF p_actor = p_owner THEN kind_ := 'owner';
  ELSE
    PERFORM public.assert_project_team_account(p_owner);
    PERFORM public.assert_project_team_account(p_actor);
    SELECT * INTO auth FROM public.citation_review_authorized(p_actor,p_owner,p_project);
    IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_change_forbidden' USING ERRCODE='22023'; END IF;
    kind_ := 'delegate';
  END IF;
  IF NOT public.citation_change_approval_current(p_owner,p_project,p_artifact) THEN RAISE EXCEPTION 'citation_change_unapproved' USING ERRCODE='22023'; END IF;
  SELECT updated_at INTO appr_at FROM public.ai_citation_change_approvals WHERE user_id=p_owner AND project_id=p_project AND artifact_id=p_artifact;
  IF p_performed_at < appr_at OR p_performed_at > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'citation_change_receipt_invalid' USING ERRCODE='22023';
  END IF;
  dg := encode(sha256(convert_to(jsonb_build_array(art.artifact_sha256,p_actor,to_char(p_performed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text,'UTF8')),'hex');
  SELECT id INTO existing FROM public.ai_citation_change_receipts WHERE user_id=p_owner AND project_id=p_project AND digest=dg;
  IF existing IS NULL THEN
    INSERT INTO public.ai_citation_change_receipts(user_id,project_id,artifact_id,artifact_sha256,kind,reference,performed_by,performer_kind,performed_at,digest)
      VALUES(p_owner,p_project,p_artifact,art.artifact_sha256,art.kind,art.reference,p_actor,kind_,p_performed_at,dg) RETURNING id INTO new_id;
    existing := new_id;
  END IF;
  RETURN (SELECT jsonb_build_object('id',id,'artifactId',artifact_id,'artifactSha256',artifact_sha256,'kind',kind,'reference',reference,
      'performedBy',performed_by,'performerKind',performer_kind,'performedAt',to_char(performed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'recordedAt',recorded_at)
    FROM public.ai_citation_change_receipts WHERE user_id=p_owner AND project_id=p_project AND id=existing);
END; $$;

CREATE FUNCTION public.remove_ai_citation_change_receipt(p_user uuid,p_project text,p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  PERFORM public.citation_lock_account(p_user);
  DELETE FROM public.ai_citation_change_receipts WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  RETURN true;
END; $$;

-- 10. Inspection assignment RPCs (owner-only; mirror of the finding-review grant/revoke). A grant to the KNOWN
-- performer or approver of the row is refused at grant time; unknown identities are refused at submission.
CREATE FUNCTION public.grant_ai_citation_inspection_assignment(p_owner uuid,p_project text,p_row uuid,p_inspector uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
DECLARE auth record; acts record;
BEGIN
  IF p_owner IS NULL OR p_project IS NULL OR p_row IS NULL OR p_inspector IS NULL OR p_owner=p_inspector THEN
    RAISE EXCEPTION 'citation_inspection_invalid' USING ERRCODE='22023';
  END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.citation_lock_account(p_owner);
  PERFORM public.assert_project_team_account(p_owner);
  PERFORM public.assert_project_team_account(p_inspector);
  SELECT * INTO auth FROM public.citation_review_authorized(p_inspector,p_owner,p_project);
  IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_inspection_forbidden' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_citation_improvements WHERE user_id=p_owner AND project_id=p_project AND id=p_row) THEN
    RAISE EXCEPTION 'citation_improvement_unavailable' USING ERRCODE='22023';
  END IF;
  SELECT * INTO acts FROM public.citation_improvement_actors(p_owner,p_project,p_row);
  IF (acts.performer_known AND acts.performer=p_inspector) OR (acts.approver_known AND acts.approver=p_inspector) THEN
    RAISE EXCEPTION 'citation_inspection_not_independent' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.ai_citation_inspection_assignments(user_id,project_id,improvement_row_id,inspector_id,active,granted_at,revoked_at)
    VALUES(p_owner,p_project,p_row,p_inspector,true,clock_timestamp(),NULL)
    ON CONFLICT(user_id,project_id,improvement_row_id,inspector_id) DO UPDATE SET active=true, revoked_at=NULL,
      revision=CASE WHEN public.ai_citation_inspection_assignments.active THEN public.ai_citation_inspection_assignments.revision ELSE public.ai_citation_inspection_assignments.revision+1 END;
  RETURN (SELECT jsonb_build_object('ownerId',p_owner,'projectId',p_project,'improvementRowId',p_row,'inspectorId',p_inspector,'active',true,'revision',revision)
    FROM public.ai_citation_inspection_assignments WHERE user_id=p_owner AND project_id=p_project AND improvement_row_id=p_row AND inspector_id=p_inspector);
END; $$;
CREATE FUNCTION public.revoke_ai_citation_inspection_assignment(p_owner uuid,p_project text,p_row uuid,p_inspector uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
BEGIN
  IF p_owner IS NULL OR p_project IS NULL OR p_row IS NULL OR p_inspector IS NULL THEN RAISE EXCEPTION 'citation_inspection_invalid' USING ERRCODE='22023'; END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.citation_lock_account(p_owner);
  PERFORM public.assert_project_team_account(p_owner);
  UPDATE public.ai_citation_inspection_assignments SET active=false, revoked_at=coalesce(revoked_at,clock_timestamp())
    WHERE user_id=p_owner AND project_id=p_project AND improvement_row_id=p_row AND inspector_id=p_inspector AND active;
  RETURN true;
END; $$;

-- 11. Inspector RPCs. The masked read exposes ONLY the assigned row's inspection subset: identity, kind, exact
-- destination reference, approved version identity, approval kind/time, the performed/published instant, the
-- approved content (the stored publication snapshot markdown, or the artifact's enumerated non-secret fields),
-- the bound findings' public summary, and the inspector's OWN chain. No baselines, notes, owner inspection or
-- other improvements.
CREATE FUNCTION public.read_ai_citation_improvement_for_inspection(p_actor uuid,p_owner uuid,p_project text,p_row uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE auth record; imp public.ai_citation_improvements%ROWTYPE; acts record; cb public.ai_citation_improvement_change_bindings%ROWTYPE;
  pub public.publication_evidence%ROWTYPE; approved_content jsonb; approved_version text; kind_ text; my_head record; art public.ai_citation_change_artifacts%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_row IS NULL THEN RAISE EXCEPTION 'citation_inspection_invalid' USING ERRCODE='22023'; END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project);
  PERFORM public.assert_project_team_account(p_owner);
  PERFORM public.assert_project_team_account(p_actor);
  SELECT * INTO auth FROM public.citation_review_authorized(p_actor,p_owner,p_project);
  IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_inspection_forbidden' USING ERRCODE='22023'; END IF;
  IF NOT public.citation_inspection_assigned(p_owner,p_project,p_row,p_actor) THEN RAISE EXCEPTION 'citation_improvement_unavailable' USING ERRCODE='22023'; END IF;
  SELECT * INTO imp FROM public.ai_citation_improvements WHERE user_id=p_owner AND project_id=p_project AND id=p_row;
  IF imp.id IS NULL THEN RAISE EXCEPTION 'citation_improvement_unavailable' USING ERRCODE='22023'; END IF;
  SELECT * INTO acts FROM public.citation_improvement_actors(p_owner,p_project,p_row);
  SELECT * INTO cb FROM public.ai_citation_improvement_change_bindings WHERE user_id=p_owner AND project_id=p_project AND improvement_row_id=p_row;
  IF cb.improvement_row_id IS NOT NULL THEN
    kind_ := cb.kind; approved_version := cb.artifact_sha256;
    SELECT * INTO art FROM public.ai_citation_change_artifacts WHERE user_id=p_owner AND project_id=p_project AND id=cb.artifact_id AND artifact_sha256=cb.artifact_sha256;
    approved_content := CASE WHEN art.id IS NULL THEN NULL ELSE jsonb_build_object('fields',public.citation_change_fields_project(art.kind,art.fields)) END;
  ELSIF imp.publication_binding IS NOT NULL THEN
    kind_ := 'public_url'; approved_version := imp.publication_binding->>'versionHash';
    SELECT * INTO pub FROM public.publication_evidence WHERE user_id=p_owner AND project_id=p_project AND id=(imp.publication_binding->>'publicationId')::uuid;
    approved_content := CASE WHEN pub.id IS NULL THEN NULL ELSE jsonb_build_object('markdown',left(pub.snapshot->>'markdown',200000)) END;
  ELSE
    kind_ := NULL; approved_version := NULL; approved_content := NULL;
  END IF;
  SELECT version,id INTO my_head FROM public.ai_citation_improvement_inspections
    WHERE user_id=p_owner AND project_id=p_project AND improvement_row_id=p_row AND inspector_id=p_actor ORDER BY version DESC LIMIT 1;
  RETURN jsonb_build_object(
    'id',imp.id,'improvementId',imp.improvement_id,'version',imp.version,'expectedSha',imp.record_sha256,
    'kind',kind_,'destinationReference',acts.reference,'approvedVersion',approved_version,
    'approval',jsonb_build_object('known',acts.approver_known,'approvedAt',CASE WHEN acts.approval_at IS NULL THEN NULL ELSE to_char(acts.approval_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END),
    'performer',jsonb_build_object('known',acts.performer_known,'anchorAt',CASE WHEN acts.anchor_at IS NULL THEN NULL ELSE to_char(acts.anchor_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END),
    'independenceAvailable',acts.performer_known AND acts.approver_known AND acts.performer<>p_actor AND acts.approver<>p_actor,
    'approvedContent',approved_content,
    'boundFindings',coalesce((SELECT jsonb_agg(jsonb_build_object('findingId',f.finding_id,'version',f.version,'family',f.family,'decision',f.decision))
      FROM public.ai_citation_findings f WHERE f.user_id=p_owner AND f.project_id=p_project AND f.id = ANY(imp.bound_finding_row_ids)),'[]'::jsonb),
    'myHead',CASE WHEN my_head.id IS NULL THEN NULL ELSE jsonb_build_object('version',my_head.version,'id',my_head.id,
      'effective',(SELECT e.effective FROM public.citation_inspection_receipt_effective(p_owner,p_project,my_head.id) e),
      'ineffectiveReason',(SELECT e.reason FROM public.citation_inspection_receipt_effective(p_owner,p_project,my_head.id) e)) END,
    'myInspections',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'version',i.version,'checkResult',i.check_result,
        'observedAt',CASE WHEN i.observed_at IS NULL THEN NULL ELSE to_char(i.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,'createdAt',i.created_at) ORDER BY i.version DESC)
      FROM public.ai_citation_improvement_inspections i WHERE i.user_id=p_owner AND i.project_id=p_project AND i.improvement_row_id=p_row AND i.inspector_id=p_actor),'[]'::jsonb));
END; $$;

CREATE FUNCTION public.save_ai_citation_improvement_inspection(p_actor uuid,p_owner uuid,p_project text,p_row uuid,p_expected_sha text,
  p_check text,p_observed_at timestamptz,p_expected_version integer,p_expected_head uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
DECLARE auth record; imp public.ai_citation_improvements%ROWTYPE; acts record; current_version integer := 0; current_head uuid; dg text; existing uuid; new_id uuid; arev bigint;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_project IS NULL OR p_row IS NULL OR p_expected_sha !~ '^[a-f0-9]{64}$'
     OR p_check NOT IN ('shows_approved_content','does_not_show','inconclusive','withdrawn')
     OR ((p_check='withdrawn') <> (p_observed_at IS NULL)) OR (p_observed_at IS NOT NULL AND NOT isfinite(p_observed_at))
     OR (p_expected_version IS NOT NULL AND (p_expected_version<0 OR p_expected_version>10000))
     OR ((coalesce(p_expected_version,0)>0) <> (p_expected_head IS NOT NULL)) THEN
    RAISE EXCEPTION 'citation_inspection_invalid' USING ERRCODE='22023';
  END IF;
  IF p_actor = p_owner THEN RAISE EXCEPTION 'citation_inspection_forbidden' USING ERRCODE='22023'; END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.citation_lock_account(p_owner);
  PERFORM public.assert_project_team_account(p_owner);
  PERFORM public.assert_project_team_account(p_actor);
  SELECT * INTO auth FROM public.citation_review_authorized(p_actor,p_owner,p_project);
  IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_inspection_forbidden' USING ERRCODE='22023'; END IF;
  SELECT revision INTO arev FROM public.ai_citation_inspection_assignments
    WHERE user_id=p_owner AND project_id=p_project AND improvement_row_id=p_row AND inspector_id=p_actor AND active AND revoked_at IS NULL;
  IF arev IS NULL THEN RAISE EXCEPTION 'citation_improvement_unavailable' USING ERRCODE='22023'; END IF;
  SELECT * INTO imp FROM public.ai_citation_improvements WHERE user_id=p_owner AND project_id=p_project AND id=p_row;
  IF imp.id IS NULL THEN RAISE EXCEPTION 'citation_improvement_unavailable' USING ERRCODE='22023'; END IF;
  IF imp.record_sha256 <> p_expected_sha THEN RAISE EXCEPTION 'citation_inspection_stale' USING ERRCODE='40001'; END IF;
  SELECT * INTO acts FROM public.citation_improvement_actors(p_owner,p_project,p_row);
  IF p_check <> 'withdrawn' THEN
    -- Independence needs BOTH mandatory identities; an unknown performer (an older publication without an actor
    -- record) or an unresolved approval refuses the receipt rather than assuming independence.
    IF NOT acts.performer_known OR NOT acts.approver_known THEN RAISE EXCEPTION 'citation_inspection_identity_unavailable' USING ERRCODE='22023'; END IF;
    IF acts.performer=p_actor OR acts.approver=p_actor THEN RAISE EXCEPTION 'citation_inspection_not_independent' USING ERRCODE='22023'; END IF;
    IF acts.reference IS NULL OR acts.anchor_at IS NULL OR acts.approval_at IS NULL
       OR p_observed_at < greatest(acts.anchor_at,acts.approval_at) OR p_observed_at > clock_timestamp() + interval '5 minutes' THEN
      RAISE EXCEPTION 'citation_inspection_invalid' USING ERRCODE='22023';
    END IF;
  END IF;
  SELECT version,id INTO current_version,current_head FROM public.ai_citation_improvement_inspections
    WHERE user_id=p_owner AND project_id=p_project AND improvement_row_id=p_row AND inspector_id=p_actor ORDER BY version DESC LIMIT 1;
  IF current_head IS NULL THEN current_version := 0; END IF;
  IF p_check='withdrawn' AND current_version=0 THEN RAISE EXCEPTION 'citation_inspection_invalid' USING ERRCODE='22023'; END IF;
  -- R1/3: the request identity is the caller's FROZEN reviewed head (never the live head), so a lost-response
  -- retry of a withdrawal — whose own write moved the head — replays its receipt instead of conflicting; a fresh
  -- inspection after renewed authority names the current head and therefore gets a NEW digest/receipt.
  dg := encode(sha256(convert_to(jsonb_build_array(p_row,p_actor,p_check,
    CASE WHEN p_observed_at IS NULL THEN NULL ELSE to_char(p_observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
    coalesce(p_expected_version,0),p_expected_head)::text,'UTF8')),'hex');
  SELECT id INTO existing FROM public.ai_citation_improvement_inspections WHERE user_id=p_owner AND project_id=p_project AND digest=dg;
  IF existing IS NOT NULL THEN
    RETURN (SELECT jsonb_build_object('id',id,'improvementRowId',improvement_row_id,'inspectorId',inspector_id,'version',version,'supersedesId',supersedes_id,
        'checkResult',check_result,'observedAt',CASE WHEN observed_at IS NULL THEN NULL ELSE to_char(observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,'createdAt',created_at)
      FROM public.ai_citation_improvement_inspections WHERE user_id=p_owner AND project_id=p_project AND id=existing);
  END IF;
  IF coalesce(p_expected_version,0) <> current_version OR p_expected_head IS DISTINCT FROM current_head THEN
    RAISE EXCEPTION 'citation_inspection_version_conflict' USING ERRCODE='40001';
  END IF;
  INSERT INTO public.ai_citation_improvement_inspections(user_id,project_id,improvement_row_id,improvement_sha256,inspector_id,inspector_role,policy_mode,policy_revision,membership_revision,assignment_revision,
      version,supersedes_id,expected_version,expected_head,check_result,observed_at,observed_reference,digest)
    VALUES(p_owner,p_project,p_row,imp.record_sha256,p_actor,auth.member_role,auth.policy_mode,auth.policy_revision,auth.membership_revision,arev,
      current_version+1,current_head,coalesce(p_expected_version,0),p_expected_head,p_check,p_observed_at,CASE WHEN p_check='withdrawn' THEN NULL ELSE acts.reference END,dg)
    RETURNING id INTO new_id;
  RETURN (SELECT jsonb_build_object('id',id,'improvementRowId',improvement_row_id,'inspectorId',inspector_id,'version',version,'supersedesId',supersedes_id,
      'checkResult',check_result,'observedAt',CASE WHEN observed_at IS NULL THEN NULL ELSE to_char(observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,'createdAt',created_at)
    FROM public.ai_citation_improvement_inspections WHERE user_id=p_owner AND project_id=p_project AND id=new_id);
END; $$;

-- Owner view of all inspectors' chains for a row (identities and results only; effective = chain head, not
-- withdrawn, inspector currently assigned/authorized).
CREATE FUNCTION public.read_ai_citation_improvement_inspections(p_user uuid,p_project text,p_row uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  RETURN jsonb_build_object(
    'assignments',coalesce((SELECT jsonb_agg(jsonb_build_object('inspectorId',a.inspector_id,'active',a.active,'grantedAt',a.granted_at,'revokedAt',a.revoked_at,
        'effective',public.citation_inspector_effective(p_user,p_project,p_row,a.inspector_id)) ORDER BY a.granted_at)
      FROM public.ai_citation_inspection_assignments a WHERE a.user_id=p_user AND a.project_id=p_project AND a.improvement_row_id=p_row),'[]'::jsonb),
    'inspections',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'inspectorId',i.inspector_id,'version',i.version,'supersedesId',i.supersedes_id,
        'checkResult',i.check_result,'observedAt',CASE WHEN i.observed_at IS NULL THEN NULL ELSE to_char(i.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
        'createdAt',i.created_at,
        'isHead',NOT EXISTS(SELECT 1 FROM public.ai_citation_improvement_inspections n WHERE n.user_id=i.user_id AND n.project_id=i.project_id AND n.improvement_row_id=i.improvement_row_id AND n.inspector_id=i.inspector_id AND n.version>i.version),
        'effective',(SELECT e.effective FROM public.citation_inspection_receipt_effective(p_user,p_project,i.id) e),
        'ineffectiveReason',(SELECT e.reason FROM public.citation_inspection_receipt_effective(p_user,p_project,i.id) e))
        ORDER BY i.inspector_id,i.version DESC)
      FROM public.ai_citation_improvement_inspections i WHERE i.user_id=p_user AND i.project_id=p_project AND i.improvement_row_id=p_row),'[]'::jsonb));
END; $$;

-- 12. v4 improvement RPCs. Public-URL saves delegate to the unchanged v3 (head + reviewed-row guards, released P3
-- validation). Change-kind saves take the EXPLICIT branch below with equivalent guards; nothing is delegated into
-- the connector-only validation. Every response carries the live v2 projection.
CREATE FUNCTION public.save_ai_citation_improvement_v4(p_user uuid,p_project text,p_record jsonb,p_scope jsonb,p_binding jsonb,p_change_binding jsonb,
  p_expected_version integer,p_expected_head uuid,p_expected_findings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved jsonb; iid uuid; panel uuid; pver integer; cname text; cmarket text; v jsonb; fid text; row_id uuid; bound uuid[] := '{}';
  art public.ai_citation_change_artifacts%ROWTYPE; rcpt public.ai_citation_change_receipts%ROWTYPE; appr public.ai_citation_change_approvals%ROWTYPE;
  insp jsonb; obs timestamptz; cid text; expected uuid[] := NULL; e text; digest text; existing uuid; head uuid; next_version integer; new_id uuid;
  current_version integer := 0; current_head uuid; kind_ text;
BEGIN
  IF p_change_binding IS NULL THEN
    saved := public.save_ai_citation_improvement_v3(p_user,p_project,p_record,p_scope,p_binding,p_expected_version,p_expected_head,p_expected_findings);
    -- The save returns the SUMMARY projection (live fields only); the binding view and dissent provenance belong
    -- to the detail read.
    RETURN saved || (public.citation_improvement_live_v2(p_user,p_project,(saved->>'id')::uuid) - 'changeBinding' - 'dissent');
  END IF;
  -- ---- explicit change-binding branch ----
  IF p_binding IS NOT NULL OR jsonb_typeof(p_change_binding)<>'object'
     OR p_record IS NULL OR jsonb_typeof(p_record)<>'object' OR octet_length(p_record::text)>20000
     OR p_scope IS NULL OR jsonb_typeof(p_scope)<>'object'
     OR jsonb_typeof(p_record->'improvementId') IS DISTINCT FROM 'string'
     OR (p_record->>'improvementId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR jsonb_typeof(p_record->'findingIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_record->'findingIds')=0
     OR jsonb_typeof(p_record->'taskId') IS DISTINCT FROM 'string' OR (p_record->>'taskId') !~ '^[A-Za-z0-9_-]{1,64}$'
     OR jsonb_typeof(p_record->'change') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_record->'destination') IS DISTINCT FROM 'object'
     OR (p_record->'destination'->>'kind') NOT IN ('listing','configuration')
     OR jsonb_typeof(p_record->'baselineCaptureIds') IS DISTINCT FROM 'array'
     OR (p_change_binding->>'artifactId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR (p_change_binding->>'receiptId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR (p_change_binding->>'artifactSha256') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023';
  END IF;
  IF p_expected_version IS NOT NULL AND (p_expected_version<0 OR p_expected_version>10000) THEN RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023'; END IF;
  IF p_expected_findings IS NOT NULL THEN
    IF jsonb_typeof(p_expected_findings)<>'array' OR jsonb_array_length(p_expected_findings)>20 THEN RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023'; END IF;
    expected := '{}'::uuid[];
    FOR e IN SELECT jsonb_array_elements_text(p_expected_findings) LOOP
      IF e !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023'; END IF;
      expected := array_append(expected,e::uuid);
    END LOOP;
  END IF;
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  PERFORM public.citation_lock_account(p_user);
  IF jsonb_typeof(p_scope->'panelId')<>'string' OR (p_scope->>'panelId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR jsonb_typeof(p_scope->'panelVersion')<>'number' OR jsonb_typeof(p_scope->'client')<>'object'
     OR jsonb_typeof(p_scope->'client'->'name')<>'string' OR jsonb_typeof(p_scope->'client'->'market')<>'string'
     OR public.native_artifact_utf16_length(p_scope->'client'->>'name') NOT BETWEEN 1 AND 200
     OR public.native_artifact_utf16_length(p_scope->'client'->>'market') NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023';
  END IF;
  panel := (p_scope->>'panelId')::uuid; pver := (p_scope->>'panelVersion')::integer; cname := p_scope->'client'->>'name'; cmarket := p_scope->'client'->>'market';
  IF pver < 1 OR pver > 1000 THEN RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023'; END IF;
  iid := (p_record->>'improvementId')::uuid; kind_ := p_record->'destination'->>'kind';
  -- Artifact, receipt and approval: the intended change, the declared execution and the current authority.
  SELECT * INTO art FROM public.ai_citation_change_artifacts WHERE user_id=p_user AND project_id=p_project AND id=(p_change_binding->>'artifactId')::uuid;
  IF art.id IS NULL OR art.artifact_sha256 <> (p_change_binding->>'artifactSha256') OR art.kind <> kind_ OR art.reference <> (p_record->'destination'->>'reference') THEN
    RAISE EXCEPTION 'citation_improvement_binding_unresolved' USING ERRCODE='22023';
  END IF;
  SELECT * INTO rcpt FROM public.ai_citation_change_receipts WHERE user_id=p_user AND project_id=p_project AND id=(p_change_binding->>'receiptId')::uuid AND artifact_deleted_at IS NULL;
  IF rcpt.id IS NULL OR rcpt.artifact_id <> art.id OR rcpt.artifact_sha256 <> art.artifact_sha256 THEN RAISE EXCEPTION 'citation_improvement_binding_unresolved' USING ERRCODE='22023'; END IF;
  IF NOT public.citation_change_approval_current(p_user,p_project,art.id) THEN RAISE EXCEPTION 'citation_improvement_binding_unapproved' USING ERRCODE='22023'; END IF;
  SELECT * INTO appr FROM public.ai_citation_change_approvals WHERE user_id=p_user AND project_id=p_project AND artifact_id=art.id;
  IF (p_record->'change'->>'approvedVersion') IS DISTINCT FROM art.artifact_sha256
     OR lower(p_record->'change'->>'approvedBy') IS DISTINCT FROM lower(appr.approved_by::text) THEN
    RAISE EXCEPTION 'citation_improvement_binding_approval_mismatch' USING ERRCODE='22023';
  END IF;
  -- Optional owner inspection of the listing/configuration as displayed (same validation as the public path).
  insp := p_change_binding->'ownerInspection';
  IF insp IS NOT NULL AND jsonb_typeof(insp)<>'null' THEN
    IF jsonb_typeof(insp)<>'object' OR (insp->>'checkResult') NOT IN ('shows_approved_content','does_not_show','inconclusive')
       OR (insp->>'observedReference') IS DISTINCT FROM art.reference THEN
      RAISE EXCEPTION 'citation_improvement_binding_inspection_invalid' USING ERRCODE='22023';
    END IF;
    BEGIN obs := (insp->>'observedAt')::timestamptz; EXCEPTION WHEN others THEN RAISE EXCEPTION 'citation_improvement_binding_inspection_invalid' USING ERRCODE='22023'; END;
    IF obs IS NULL OR NOT isfinite(obs) OR obs < greatest(rcpt.performed_at,appr.updated_at) OR obs > clock_timestamp() + interval '5 minutes' THEN
      RAISE EXCEPTION 'citation_improvement_binding_inspection_invalid' USING ERRCODE='22023';
    END IF;
    insp := jsonb_build_object('checkResult',insp->>'checkResult','observedReference',art.reference,
      'observedAt',to_char(obs AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  ELSE insp := NULL; END IF;
  -- The verification block is DERIVED (never caller text): only a positive owner inspection backs one.
  v := p_record->'verification';
  IF v IS NOT NULL AND jsonb_typeof(v)='object' THEN
    IF v->'reviewer' IS NULL OR jsonb_typeof(v->'reviewer')<>'string' OR (v->>'reviewer') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' OR (v->>'reviewer')::uuid <> p_user THEN
      RAISE EXCEPTION 'citation_improvement_reviewer_mismatch' USING ERRCODE='22023';
    END IF;
    IF insp IS NULL OR (insp->>'checkResult') <> 'shows_approved_content' THEN RAISE EXCEPTION 'citation_improvement_verification_unbacked' USING ERRCODE='22023'; END IF;
    IF jsonb_array_length(p_record->'baselineCaptureIds')=0 THEN RAISE EXCEPTION 'citation_improvement_baseline_unresolved' USING ERRCODE='22023'; END IF;
    FOR cid IN SELECT jsonb_array_elements_text(p_record->'baselineCaptureIds') LOOP
      IF cid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         OR NOT EXISTS(SELECT 1 FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project AND id=cid::uuid) THEN
        RAISE EXCEPTION 'citation_improvement_baseline_unresolved' USING ERRCODE='22023';
      END IF;
    END LOOP;
    p_record := jsonb_set(jsonb_set(jsonb_set(p_record,'{verification,verifiedAt}',to_jsonb(insp->>'observedAt')),
      '{verification,method}',to_jsonb('owner_inspection'::text)),
      '{verification,receipt}',to_jsonb(left('owner_inspection '||art.reference||' @ '||(insp->>'observedAt'),500)));
  END IF;
  p_record := jsonb_set(p_record,'{change,approvedAt}',to_jsonb(to_char(appr.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
  -- Findings pinned to their current heads under this scope (a dismissed head is refused), exactly like v1.
  FOR fid IN SELECT jsonb_array_elements_text(p_record->'findingIds') LOOP
    IF fid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RAISE EXCEPTION 'citation_improvement_finding_unresolved' USING ERRCODE='22023'; END IF;
    row_id := public.citation_finding_head_id(p_user,p_project,fid::uuid,panel,pver,cname,cmarket);
    IF row_id IS NULL THEN RAISE EXCEPTION 'citation_improvement_finding_unresolved' USING ERRCODE='22023'; END IF;
    IF (SELECT decision FROM public.ai_citation_findings WHERE user_id=p_user AND project_id=p_project AND id=row_id)='dismissed' THEN
      RAISE EXCEPTION 'citation_improvement_finding_unresolved' USING ERRCODE='22023';
    END IF;
    bound := array_append(bound,row_id);
  END LOOP;
  IF expected IS NOT NULL AND NOT (bound <@ expected AND expected <@ bound) THEN RAISE EXCEPTION 'citation_improvement_finding_stale' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM public.ai_citation_improvements WHERE user_id=p_user AND project_id=p_project AND improvement_id=iid
       AND (panel_id<>panel OR panel_version<>pver OR client_name<>cname OR client_market<>cmarket)) THEN
    RAISE EXCEPTION 'citation_improvement_scope_drift' USING ERRCODE='22023';
  END IF;
  digest := encode(sha256(convert_to(jsonb_build_array(panel,pver,cname,cmarket,p_record,
    jsonb_build_object('kind',art.kind,'artifactId',art.id,'artifactSha256',art.artifact_sha256,'receiptId',rcpt.id,'ownerInspection',insp),to_jsonb(bound))::text,'UTF8')),'hex');
  SELECT id INTO existing FROM public.ai_citation_improvements WHERE user_id=p_user AND project_id=p_project AND record_sha256=digest;
  IF existing IS NOT NULL THEN
    RETURN public.read_ai_citation_improvement_v4_summary(p_user,p_project,existing);
  END IF;
  IF (SELECT count(*) FROM public.ai_citation_improvements WHERE user_id=p_user AND project_id=p_project)>=100 THEN RAISE EXCEPTION 'citation_improvement_capacity' USING ERRCODE='22023'; END IF;
  SELECT id,version INTO current_head,current_version FROM public.ai_citation_improvements WHERE user_id=p_user AND project_id=p_project AND improvement_id=iid ORDER BY version DESC,created_at DESC,id DESC LIMIT 1;
  IF current_head IS NULL THEN current_version := 0; END IF;
  IF coalesce(p_expected_version,0) <> current_version OR p_expected_head IS DISTINCT FROM current_head THEN RAISE EXCEPTION 'citation_improvement_version_conflict' USING ERRCODE='40001'; END IF;
  SELECT a.id INTO head FROM public.ai_citation_improvements a WHERE a.user_id=p_user AND a.project_id=p_project AND a.improvement_id=iid
    AND NOT EXISTS(SELECT 1 FROM public.ai_citation_improvements b WHERE b.user_id=p_user AND b.project_id=p_project AND b.supersedes_id=a.id)
    ORDER BY a.version DESC,a.created_at DESC,a.id DESC LIMIT 1;
  SELECT coalesce(max(version),0)+1 INTO next_version FROM public.ai_citation_improvements WHERE user_id=p_user AND project_id=p_project AND improvement_id=iid;
  INSERT INTO public.ai_citation_improvements(user_id,project_id,improvement_id,version,record,record_sha256,panel_id,panel_version,client_name,client_market,actor_id,bound_finding_row_ids,publication_binding,supersedes_id)
    VALUES(p_user,p_project,iid,next_version,p_record,digest,panel,pver,cname,cmarket,p_user,bound,NULL,head) RETURNING id INTO new_id;
  INSERT INTO public.ai_citation_improvement_change_bindings(user_id,project_id,improvement_row_id,artifact_id,artifact_sha256,receipt_id,kind,reference,owner_inspection)
    VALUES(p_user,p_project,new_id,art.id,art.artifact_sha256,rcpt.id,art.kind,art.reference,insp);
  RETURN public.read_ai_citation_improvement_v4_summary(p_user,p_project,new_id);
END; $$;

-- One row's v4 summary (the v2 read projection of that single row + the live v2 fields).
CREATE FUNCTION public.read_ai_citation_improvement_v4_summary(p_user uuid,p_project text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb;
BEGIN
  SELECT jsonb_build_object('id',id,'improvementId',improvement_id,'version',version,'panelId',panel_id,'panelVersion',panel_version,
      'client',jsonb_build_object('name',client_name,'market',client_market),'actorId',actor_id,'supersedesId',supersedes_id,'predecessorDeleted',predecessor_deleted,
      'createdAt',created_at,'evidenceStatus',public.citation_improvement_evidence(p_user,p_project,record),'scopeEnforcedAt',scope_enforced_at)
    INTO base FROM public.ai_citation_improvements WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  IF base IS NULL THEN RAISE EXCEPTION 'citation_improvement_unavailable' USING ERRCODE='22023'; END IF;
  RETURN base || (public.citation_improvement_live_v2(p_user,p_project,p_id) - 'changeBinding' - 'dissent');
END; $$;
REVOKE ALL ON FUNCTION public.read_ai_citation_improvement_v4_summary(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_ai_citation_improvements_v4(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb;
BEGIN
  base := public.read_ai_citation_improvements_v2(p_user,p_project);
  RETURN jsonb_build_object('improvements',coalesce((
    SELECT jsonb_agg(f.value || (public.citation_improvement_live_v2(p_user,p_project,(f.value->>'id')::uuid) - 'changeBinding' - 'dissent') ORDER BY f.ordinality)
    FROM jsonb_array_elements(base->'improvements') WITH ORDINALITY AS f),'[]'::jsonb));
END; $$;
CREATE FUNCTION public.read_ai_citation_improvement_v4(p_user uuid,p_project text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb;
BEGIN
  base := public.read_ai_citation_improvement_v2(p_user,p_project,p_id);
  RETURN base || public.citation_improvement_live_v2(p_user,p_project,p_id) || public.read_ai_citation_improvement_inspections(p_user,p_project,p_id);
END; $$;

-- 13. Privileges: service RPCs only (the server middleware supplies the authenticated actor/owner); internal
-- predicates are granted to no role.
REVOKE ALL ON FUNCTION
  public.record_publication_actor(uuid,text,uuid,uuid,text),
  public.save_ai_citation_change_artifact(uuid,text,text,text,jsonb),
  public.read_ai_citation_change_artifacts(uuid,text),
  public.remove_ai_citation_change_artifact(uuid,text,uuid),
  public.set_ai_citation_change_approval(uuid,uuid,text,uuid,text,boolean,integer,uuid),
  public.read_ai_citation_change_approval_provenance(uuid,text,uuid),
  public.save_ai_citation_change_receipt(uuid,uuid,text,uuid,timestamptz),
  public.remove_ai_citation_change_receipt(uuid,text,uuid),
  public.grant_ai_citation_inspection_assignment(uuid,text,uuid,uuid),
  public.revoke_ai_citation_inspection_assignment(uuid,text,uuid,uuid),
  public.read_ai_citation_improvement_for_inspection(uuid,uuid,text,uuid),
  public.save_ai_citation_improvement_inspection(uuid,uuid,text,uuid,text,text,timestamptz,integer,uuid),
  public.read_ai_citation_improvement_inspections(uuid,text,uuid),
  public.save_ai_citation_improvement_v4(uuid,text,jsonb,jsonb,jsonb,jsonb,integer,uuid,jsonb),
  public.read_ai_citation_improvements_v4(uuid,text),
  public.read_ai_citation_improvement_v4(uuid,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.record_publication_actor(uuid,text,uuid,uuid,text),
  public.save_ai_citation_change_artifact(uuid,text,text,text,jsonb),
  public.read_ai_citation_change_artifacts(uuid,text),
  public.remove_ai_citation_change_artifact(uuid,text,uuid),
  public.set_ai_citation_change_approval(uuid,uuid,text,uuid,text,boolean,integer,uuid),
  public.read_ai_citation_change_approval_provenance(uuid,text,uuid),
  public.save_ai_citation_change_receipt(uuid,uuid,text,uuid,timestamptz),
  public.remove_ai_citation_change_receipt(uuid,text,uuid),
  public.grant_ai_citation_inspection_assignment(uuid,text,uuid,uuid),
  public.revoke_ai_citation_inspection_assignment(uuid,text,uuid,uuid),
  public.read_ai_citation_improvement_for_inspection(uuid,uuid,text,uuid),
  public.save_ai_citation_improvement_inspection(uuid,uuid,text,uuid,text,text,timestamptz,integer,uuid),
  public.read_ai_citation_improvement_inspections(uuid,text,uuid),
  public.save_ai_citation_improvement_v4(uuid,text,jsonb,jsonb,jsonb,jsonb,integer,uuid,jsonb),
  public.read_ai_citation_improvements_v4(uuid,text),
  public.read_ai_citation_improvement_v4(uuid,text,uuid)
  TO service_role;
