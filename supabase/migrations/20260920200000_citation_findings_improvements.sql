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
  -- Explicit content-free erasure state: set when a source/record forget (or a save that cites a forgotten
  -- source) redacted this row's copied support passages. It makes the retained record_sha256 transparently a
  -- PRE-erasure digest (not a hash of the current redacted payload), is surfaced by the owner detail and the
  -- reviewer read, and blocks any NEW review from attesting the finding once its evidence was erased.
  evidence_erased_at timestamptz,
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

-- CONTENT-FREE source-level erasure provenance (P1 retention). A record forget (forget_project_knowledge
-- 'record') DELETEs the record but KEEPS its source, and the released record tombstone carries no source
-- mapping — so a later resave / fresh finding citing the surviving source could otherwise re-store the
-- forgotten passage. This table records, per (owner, project, source), that copied evidence for that source
-- was forgotten. It holds ONLY ids + a timestamp (no source text — nothing to leak), so the save guard and
-- the current-status functions can recognise a source with a forget WITHOUT the deleted record's mapping.
-- CARDINALITY (accurate): one row per DISTINCT source id EVER forgotten in the project — monotonic, and NOT
-- bounded by the concurrent live-source cap, because sources can be created/forgotten repeatedly and each
-- distinct forgotten source id adds a row. This deliberately mirrors the released project_knowledge_tombstones
-- (also one row per distinct forgotten source/record, with no cap): forget provenance MUST persist to prevent
-- resurrection, so a bounded cap that evicted markers would either fail the user's erasure or re-open the
-- resurrection hole. The only lifecycle bound is project deletion: the workspace_entities FK ON DELETE CASCADE
-- clears every marker for a project when it is deleted (at which point findings/improvements are gone too, so
-- there is nothing left to resurrect). Never a client surface; touched only by SECURITY DEFINER functions.
CREATE TABLE public.ai_citation_source_erasures (
  user_id uuid NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  project_id text NOT NULL,
  source_id uuid NOT NULL,
  erased_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,source_id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.ai_citation_source_erasures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_source_erasures FROM PUBLIC,anon,authenticated,service_role;

-- Forget cascade (P1 retention). BOTH forget kinds are ERASURES: forget_project_knowledge('source') DELETEs
-- the source row (cascading its records/documents) and forget_project_knowledge('record') DELETEs a record and
-- its history. A dependent citation finding kept its OWN copy of inspected source text in
-- record.support[].sourcePassage, and the owner detail and for-review reads return record verbatim — so
-- honoring the forget only in the live source read would still leak the copy. This shared redactor ERASES the
-- copied passage text (replacing it with a visible marker, never the original) in EVERY version of EVERY
-- finding of the SAME owner+project that cites the given source, across the whole version chain, and stamps
-- evidence_erased_at so the erasure is explicit on the reads.
--   * Source match is by SEMANTIC uuid, not raw text: the evidence id is stored as a case-insensitive uuid
--     string (input allows uppercase, and sources_available casts it), so we compare lower(e->>'id') — a raw
--     e->>'id'=OLD.id::text miss would leave an uppercase-source finding un-erased. A non-uuid id (native /
--     answer evidence) simply never matches, so the cast is never forced on junk.
--   * A RECORD forget cannot be attributed to a single support passage — support carries NO record-id pin — so
--     the record trigger conservatively erases every copied passage of findings citing that record's SOURCE
--     (OLD.source_id). It errs toward erasure rather than leaving possibly-forgotten text, and never touches an
--     unrelated source or project. Multi-source findings are likewise erased wholesale for the cited source,
--     because no reliable per-passage attribution exists — we do NOT pretend one.
--   * SCOPE BOUNDARY (documented, not silently assumed): only the STRUCTURED copied-source field
--     support[].sourcePassage is auto-erased. observation / hypothesis / support[].reason are free-text
--     reviewer analysis in the accepted contract, with no structured source-copy semantics; auto-wiping all
--     reviewer prose on any forget would destroy legitimate independent analysis and cannot be attributed to a
--     forgotten source. If reviewer prose must also be scrubbed that is a separate deliberate step; this is a
--     stated retention boundary, not an assumption that prose can never contain pasted source text.
-- record_sha256 is LEFT UNCHANGED (a one-way digest reveals nothing); with evidence_erased_at surfaced it is
-- transparently a PRE-erasure digest, the content-free receipts keep their exact reviewed-content anchor for
-- audit (never rewritten), and an identical re-save maps by that digest back to the redacted row. A REVOCATION
-- (row kept, status flipped) is NOT a delete, fires no trigger, and downgrades CURRENT validity via
-- sources_available / citation_finding_inspectable instead. Trigger-only; granted to no role.
CREATE FUNCTION public.citation_forget_redact_source(p_user uuid,p_project text,p_source uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  -- Whole-project (or account) removal deletes the workspace_entities project row FIRST, then the released
  -- purge_deleted_project_knowledge AFTER DELETE trigger deletes its sources/records — firing this trigger with
  -- the parent project already gone. Skip entirely in that case: the findings/improvements/erasure rows are
  -- being cascade-deleted anyway (nothing to redact), and inserting provenance would orphan the workspace_entities
  -- FK (SQLSTATE 23503) and fail the user's delete. A source/record forget while the project SURVIVES still runs
  -- (the project row exists), so erasure + no-resurrection are preserved. Account deletion is the same path:
  -- workspace_entities cascades from auth.users before the source rows are purged, so the project is already gone.
  IF NOT EXISTS(SELECT 1 FROM public.workspace_entities
       WHERE user_id=p_user AND collection='projects' AND entity_id=p_project) THEN
    RETURN;
  END IF;
  -- Record the content-free source-level erasure FIRST (even if no current finding cites the source yet), so a
  -- later resave or fresh finding citing this source is caught by the save guard — the deleted record tombstone
  -- has no source mapping, this does.
  INSERT INTO public.ai_citation_source_erasures(user_id,project_id,source_id)
    VALUES(p_user,p_project,p_source) ON CONFLICT(user_id,project_id,source_id) DO NOTHING;
  UPDATE public.ai_citation_findings f
    SET record = jsonb_set(f.record,'{support}',(
      SELECT coalesce(jsonb_agg(
        CASE WHEN s->>'sourcePassage' IS NOT NULL
          THEN jsonb_set(s,'{sourcePassage}',to_jsonb('[redacted: source forgotten]'::text))
          ELSE s END ORDER BY ord),'[]'::jsonb)
      FROM jsonb_array_elements(f.record->'support') WITH ORDINALITY AS a(s,ord))),
      evidence_erased_at = coalesce(f.evidence_erased_at, clock_timestamp())
    WHERE f.user_id=p_user AND f.project_id=p_project
      AND jsonb_typeof(f.record->'support')='array'
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(f.record->'evidence')='array' THEN f.record->'evidence' ELSE '[]'::jsonb END) e
          WHERE e->>'kind'='source' AND lower(e->>'id')=p_source::text)
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(f.record->'support') s WHERE s->>'sourcePassage' IS NOT NULL);
END; $$;
REVOKE ALL ON FUNCTION public.citation_forget_redact_source(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.citation_forget_source_passages() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.citation_forget_redact_source(OLD.user_id,OLD.project_id,OLD.id); RETURN OLD; END; $$;
REVOKE ALL ON FUNCTION public.citation_forget_source_passages() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.citation_forget_record_passages() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.citation_forget_redact_source(OLD.user_id,OLD.project_id,OLD.source_id); RETURN OLD; END; $$;
REVOKE ALL ON FUNCTION public.citation_forget_record_passages() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER citation_forget_source_passages_trg
  AFTER DELETE ON public.project_knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION public.citation_forget_source_passages();
CREATE TRIGGER citation_forget_record_passages_trg
  AFTER DELETE ON public.project_knowledge_records
  FOR EACH ROW EXECUTE FUNCTION public.citation_forget_record_passages();

-- INDEPENDENT (two-person) review receipts (spec §4.5: "a second studio reviewer checks ambiguous or
-- high-impact claims"). This is a SEPARATE, additive table — NOT a finding-record field — because the
-- finding record refuses every embedded reviewer identity that is not the owner (see save_ai_citation_finding),
-- so a genuine second reviewer's decision cannot live inside the owner-authored record without becoming a
-- forged provenance claim. Each receipt is the authenticated independent reviewer's own decision, bound to
-- the EXACT immutable finding row + version + content hash it was made against. It grants no data access by
-- itself and does NOT touch the owner-only raw artifact / business-fact / export surface.
CREATE TABLE public.ai_citation_finding_reviews (
  user_id uuid NOT NULL,             -- the project OWNER (the data scope these receipts belong to)
  project_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
  finding_row_id uuid NOT NULL,      -- the EXACT immutable ai_citation_findings.id (a version is one row)
  finding_id uuid NOT NULL,          -- logical finding id (denormalised for grouping on read)
  finding_version integer NOT NULL CHECK(finding_version BETWEEN 1 AND 10000),
  record_sha256 text NOT NULL CHECK(record_sha256 ~ '^[a-f0-9]{64}$'), -- the reviewed content, pinned
  -- The independent reviewer is the authenticated caller and is NEVER the owner (the owner's own review is
  -- the primary one embedded in the record). Stored role/policy/membership revisions make the receipt
  -- self-describing for audit — the authority it was written under — exactly as the asset approval history
  -- records its version/membership/policy. They are a historical snapshot, not a live re-check.
  reviewer_id uuid NOT NULL,
  reviewer_role text NOT NULL CHECK(reviewer_role IN ('reviewer','editor')),
  policy_mode text NOT NULL CHECK(policy_mode IN ('separate_reviewers','editors_can_approve')),
  policy_revision bigint NOT NULL, membership_revision bigint NOT NULL,
  decision text NOT NULL CHECK(decision IN ('approved','rejected','needs_changes')),
  -- 6000 octets comfortably fits the client's 2000-code-unit note (<=3 UTF-8 bytes per BMP unit) so a
  -- client-valid multilingual note never trips this cap with a generic INSERT error.
  note text CHECK(note IS NULL OR octet_length(note) BETWEEN 1 AND 6000),
  -- Whether the finding's cited answer/source evidence AND assessed-fact pins were fully resolvable when the
  -- receipt was written. An 'approved' receipt on a finding that could NOT be inspected (a deleted cited
  -- answer, or a native-only unparsed artifact) is recorded as an OPINION: it never counts as completed
  -- independent verification and never promotes a dependent improvement.
  inspection_complete boolean NOT NULL DEFAULT false,
  -- A soft, content-free tombstone: only the receipt's OWN reviewer may withdraw (the owner cannot delete
  -- another reviewer's decision and silently sanitise a dissent). Withdrawal erases the note but keeps the
  -- decision/reviewer/timestamps for audit. A withdrawn receipt no longer counts toward reviewStatus.
  withdrawn boolean NOT NULL DEFAULT false, withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(user_id<>reviewer_id),
  CHECK(withdrawn OR withdrawn_at IS NULL),
  PRIMARY KEY(user_id,project_id,id),
  -- One receipt per independent reviewer per EXACT finding row: a reviewer cannot stack duplicate approvals,
  -- and a new finding version (a new row) requires a fresh independent review rather than inheriting the old.
  UNIQUE(user_id,project_id,finding_row_id,reviewer_id),
  FOREIGN KEY(user_id,project_id,finding_row_id) REFERENCES public.ai_citation_findings(user_id,project_id,id) ON DELETE CASCADE
);
ALTER TABLE public.ai_citation_finding_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_finding_reviews FROM PUBLIC,anon,authenticated,service_role;

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

-- Independent-review authority, computed LIVE from the ACTUAL project team contracts (never a bespoke or
-- blanket grant): the actor must be a CURRENT, active, non-expired member whose role/policy grants review
-- authority for this owner's project — the same predicate the asset review authority uses
-- (read_project_team_review_authority), reused rather than reinvented, MINUS the owner (the owner is the
-- primary reviewer, not an independent one). No policy row, a disabled policy, a viewer, a revoked/expired
-- membership or a foreign project all fail closed (allowed=false). Reusing asset-review authority as the
-- eligibility test does NOT grant the reviewer the owner-only findings list / facts / artifacts / exports;
-- it only gates the narrow receipt + single-finding review read below. Internal-only.
CREATE FUNCTION public.citation_review_authorized(p_actor uuid,p_owner uuid,p_project text,
  OUT allowed boolean, OUT member_role text, OUT policy_mode text, OUT policy_revision bigint, OUT membership_revision bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  allowed := false; member_role := NULL; policy_mode := NULL; policy_revision := 0; membership_revision := 0;
  IF p_actor IS NULL OR p_owner IS NULL OR p_actor = p_owner THEN RETURN; END IF;
  -- Both accounts must be current (not deleted, not banned) — a previously issued authenticated session must
  -- not reach review data under a suspended owner or actor. These are the SAME optimistic, lock-free checks
  -- read_project_team_snapshot runs first; the calling RPC repeats the authoritative FOR SHARE version under
  -- the owner lock via assert_project_team_account.
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_owner AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
     OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp())) THEN
    RETURN;
  END IF;
  SELECT role,revision INTO member_role,membership_revision FROM public.project_team_members
    WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_actor
      AND active AND (expires_at IS NULL OR expires_at>clock_timestamp());
  SELECT mode,revision INTO policy_mode,policy_revision FROM public.project_team_approval_policy
    WHERE owner_id=p_owner AND project_id=p_project;
  allowed := coalesce((policy_mode IN ('separate_reviewers','editors_can_approve') AND member_role='reviewer')
                   OR (policy_mode='editors_can_approve' AND member_role='editor'), false);
  IF NOT allowed THEN member_role := NULL; policy_mode := NULL; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.citation_review_authorized(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

-- Whether a finding's cited evidence is sufficient for a COMPLETED independent inspection. EVERY cited
-- evidence item must be genuinely readable for THIS finding (not merely present):
--   answer -> the answer row resolves AND its full rawAnswer content is within the 50000-char contract
--             (so the whole answer is accessible in the reviewer read, never a silently-truncated snippet);
--   source -> the source row resolves, is `status='active'`, and carries substantive provenance (a non-empty
--             `label`) AND actual substantive MATERIAL — at least one released `project_knowledge_records`
--             row bound to THIS source (`source_id`) at the source's CURRENT `revision` with a non-empty
--             `value`. Label/url/fingerprint are attribution/provenance, NOT support (§4.2): a source with
--             no bound material, or only stale-revision material, is NOT inspectable;
--   native -> NEVER inspectable (opaque staged bytes; the parser is P5), so ANY native evidence — including
--             a mixed native+answer finding — makes the inspection incomplete.
-- Plus every assessed-accuracy fact pin must still resolve to its exact fact row. When this is false, an
-- 'approved' receipt is only an opinion (never a completed verification and never promotes an improvement).
-- Internal-only.
CREATE FUNCTION public.citation_finding_inspectable(p_user uuid,p_project text,p_record jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE e jsonb; ref uuid; ra text; st text; srev integer; mcnt integer;
BEGIN
  IF jsonb_typeof(p_record->'evidence')<>'array' OR jsonb_array_length(p_record->'evidence')=0 THEN RETURN false; END IF;
  FOR e IN SELECT jsonb_array_elements(p_record->'evidence') LOOP
    IF (e->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RETURN false; END IF;
    ref := (e->>'id')::uuid;
    IF e->>'kind'='answer' THEN
      SELECT document->'input'->>'rawAnswer' INTO ra FROM public.ai_answer_evidence
        WHERE user_id=p_user AND project_id=p_project AND id=ref;
      IF ra IS NULL OR char_length(ra) > 50000 THEN RETURN false; END IF;
    ELSIF e->>'kind'='source' THEN
      SELECT payload->>'status',revision INTO st,srev FROM public.project_knowledge_sources
        WHERE user_id=p_user AND project_id=p_project AND id=ref;
      -- Count the substantive bound material at the CURRENT source revision. Inspectable requires the source
      -- active AND at least one bound record AND no overflow beyond the exposed cap of 300 (the project record
      -- cap, which the reviewer read returns in full) — a source whose last records would be unreachable in
      -- the read is NOT counted complete. This 300 MUST match the reviewer read's material page/cap.
      SELECT count(*) INTO mcnt FROM public.project_knowledge_records r
        WHERE r.user_id=p_user AND r.project_id=p_project AND r.source_id=ref
          AND (r.payload->>'sourceRevision')=srev::text AND coalesce(r.payload->>'value','')<>'';
      IF st IS DISTINCT FROM 'active' OR mcnt NOT BETWEEN 1 AND 300 THEN RETURN false; END IF;
    ELSE
      RETURN false; -- native (opaque) or unknown kind: never a completed independent inspection
    END IF;
  END LOOP;
  -- An independent inspection is only COMPLETE when every ASSESSED accuracy entry actually binds. Reuse the
  -- single canonical resolver (the same one the finding reads and the improvement gate use) — never a second
  -- partial existence check: an assessed entry that is unpinned / capture_unresolved / fact_missing /
  -- wrong_kind / out_of_period / ambiguous / superseded_correction (this includes a MISSING or MALFORMED pin,
  -- which the resolver reports as 'unpinned') is not resolved, so the inspection cannot be marked complete.
  -- Legitimately unassessed entries (not_checked / unclear, which the resolver reports as 'not_assessed') are
  -- exempt, consistent with the finding schema.
  IF jsonb_typeof(p_record->'accuracy')='array' THEN
    FOR e IN SELECT jsonb_array_elements(p_record->'accuracy') LOOP
      IF (public.citation_accuracy_resolve(p_user,p_project,p_record,e))->>'resolution'
         NOT IN ('resolved','not_assessed') THEN RETURN false; END IF;
    END LOOP;
  END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.citation_finding_inspectable(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Aggregate INDEPENDENT-review status of one finding ROW, for the canonical reads and the improvement gate.
-- Computed over ALL that row's receipts (never a display page — a dissent is never truncated away):
--   'owner_only'             no active independent receipt, and the finding did not ask for a second review.
--   'second_review_pending'  the finding's decision is 'needs_second_review' but no COMPLETED independent
--                            approval exists yet — the honest "required but insufficient" state. An
--                            approve-without-inspectable-evidence opinion does NOT complete it.
--   'independent_reviewed'   at least one active, INSPECTION-COMPLETE 'approved' receipt and no dissent.
--   'independent_opinion'    an active 'approved' receipt exists but only as an opinion (the finding could
--                            not be independently inspected), on a finding that did not require a second
--                            review — exposed honestly, and it never lifts the improvement gate.
--   'independent_dissent'    at least one active 'rejected'/'needs_changes' receipt (reported even if an
--                            approval also exists — a dissent is never silently overridden).
-- Withdrawn receipts (a reviewer's own content-free retraction) do not count. Only receipts from a reviewer
-- OTHER than the owner count (defence in depth; the save already forbids the owner). Internal-only.
CREATE FUNCTION public.citation_finding_review_status(p_user uuid,p_project text,p_row uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE dec text; erased timestamptz; approved_complete integer; approved_opinion integer; dissent integer;
BEGIN
  SELECT decision,evidence_erased_at INTO dec,erased FROM public.ai_citation_findings WHERE user_id=p_user AND project_id=p_project AND id=p_row;
  IF dec IS NULL THEN RETURN 'owner_only'; END IF;
  SELECT count(*) FILTER (WHERE decision='approved' AND inspection_complete),
         count(*) FILTER (WHERE decision='approved' AND NOT inspection_complete),
         count(*) FILTER (WHERE decision IN ('rejected','needs_changes'))
    INTO approved_complete,approved_opinion,dissent FROM public.ai_citation_finding_reviews
    WHERE user_id=p_user AND project_id=p_project AND finding_row_id=p_row AND reviewer_id<>p_user AND NOT withdrawn;
  -- A dissent is NEVER silently sanitised — it stays surfaced even after erasure. But once the finding's
  -- evidence has been FORGOTTEN (evidence_erased_at set), the historical approvals no longer attest the
  -- current (redacted) payload: they stay in the receipts list as historic, and the current status collapses
  -- to owner_only rather than pretending an independent_reviewed/opinion of erased content. No new receipt can
  -- lift it (save_ai_citation_finding_review refuses an erased finding), so there is no silent resurrection.
  IF dissent>0 THEN RETURN 'independent_dissent'; END IF;
  IF erased IS NOT NULL THEN RETURN 'owner_only'; END IF;
  IF approved_complete>0 THEN RETURN 'independent_reviewed'; END IF;
  IF dec='needs_second_review' THEN RETURN 'second_review_pending'; END IF;
  IF approved_opinion>0 THEN RETURN 'independent_opinion'; END IF;
  RETURN 'owner_only';
END; $$;
REVOKE ALL ON FUNCTION public.citation_finding_review_status(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Are every source a finding cites still present as a TRUSTED in-scope record? evidence[] of kind:
--   'source' -> public.project_knowledge_sources, required still ACTIVE (NOT inline — the record carries
--               only an id; a missing OR revoked source is unavailable, never "always available");
--   'answer' -> public.ai_answer_evidence   (owner-supplied, unverified — presence only, not proof);
--   'native' -> public.ai_native_report_artifacts (opaque staged bytes; presence only, NEVER measurement).
-- A missing referenced record — or a source whose released-side revoke flipped it out of 'active' (its row
-- survives with payload.status='revoked' and its bytes cleared) — means the finding's inspectable claim can
-- no longer be substantiated, so it is reported unavailable. A revoke or deletion (which P3 cannot itself
-- trigger on a released table) renders the dependent claim unverified. An unknown/malformed reference fails
-- closed. This is the CURRENT-validity signal only; a stored historical review receipt is never rewritten
-- by it. Internal-only.
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
      -- A source row SURVIVES a released-side revoke (payload.status flips to 'revoked' and its bytes are
      -- cleared), so mere existence is NOT current availability. Require the source still ACTIVE — mirroring
      -- the inspectable gate — so a revoked source correctly renders the dependent claim unavailable while its
      -- reason ('revoked') stays visible in the per-item review detail.
      IF NOT EXISTS(SELECT 1 FROM public.project_knowledge_sources
        WHERE user_id=p_user AND project_id=p_project AND id=ref AND payload->>'status'='active') THEN RETURN false; END IF;
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
  IF v IS NULL OR jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RETURN 'baseline_absent'; END IF;
  -- Explicit IS DISTINCT FROM + a separately guarded non-empty check: a MISSING baselineCaptureIds key
  -- (jsonb_typeof NULL) must earn 'baseline_missing', never fall through three-valued to 'baseline_recorded'.
  IF jsonb_typeof(p_record->'baselineCaptureIds') IS DISTINCT FROM 'array' THEN
    RETURN 'baseline_missing';
  END IF;
  IF jsonb_array_length(p_record->'baselineCaptureIds')=0 THEN
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
--                       non-future time (5-minute clock-skew policy), a still-resolving scoped baseline
--                       (evidenceStatus='baseline_recorded'), AND every bound finding still CURRENTLY
--                       inspectable (its cited evidence readable NOW — see the loop). An authenticated OWNER
--                       before/after attestation, still NOT a system/independent verification.
-- Deleting the publication, the approval (asset/version change or withdrawal), the asset, a pinned finding
-- or a baseline — a re-approval that post-dates the inspection — or FORGETTING a bound finding's records /
-- advancing its source revision so no current material matches — collapses this back down; a stored binding
-- never keeps a stale current status, and an old inspection_complete receipt never revives it.
CREATE FUNCTION public.citation_improvement_status(p_user uuid,p_project text,p_record jsonb,p_bound uuid[],p_binding jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE frec jsonb; i integer; pub public.publication_evidence%ROWTYPE;
  b_asset text; b_vhash text; live_url text; insp jsonb; status text; appr_at timestamptz; obs timestamptz;
  acc_unresolved boolean := false; review_incomplete boolean := false; material_uninspectable boolean := false; f_erased timestamptz;
BEGIN
  IF p_binding IS NULL OR jsonb_typeof(p_binding)<>'object' THEN RETURN 'unverified'; END IF;
  -- Every PINNED finding version row must still exist with resolvable in-scope sources. A bound finding
  -- whose assessed business-fact accuracy no longer binds (deleted/superseded/ambiguous/out-of-period fact)
  -- keeps the finding available but forfeits the owner_attested before/after claim below.
  IF coalesce(array_length(p_bound,1),0)=0 THEN RETURN 'unverified'; END IF;
  FOR i IN 1..array_length(p_bound,1) LOOP
    SELECT record,evidence_erased_at INTO frec,f_erased FROM public.ai_citation_findings
      WHERE user_id=p_user AND project_id=p_project AND id=p_bound[i];
    IF frec IS NULL OR NOT public.citation_finding_sources_available(p_user,p_project,frec) THEN
      RETURN 'unverified';
    END IF;
    -- A bound finding whose cited evidence was FORGOTTEN (evidence_erased_at set) forfeits the owner_attested
    -- before/after claim even if another record of the source still makes it inspectable NOW: the SPECIFIC
    -- reviewed content was erased, so a stale receipt must not be treated as current attestation. The finding
    -- stays available (connector_receipt delivery is unaffected); the historical receipt stays historic.
    IF f_erased IS NOT NULL THEN material_uninspectable := true; END IF;
    IF public.citation_finding_accuracy_status(p_user,p_project,frec)='unresolved' THEN
      acc_unresolved := true;
    END IF;
    -- A bound finding that ASKED for a second review but lacks an independent approval, or that an
    -- independent reviewer flagged, forfeits the owner_attested before/after claim below (reported honestly,
    -- never fabricated into a fully-attested improvement). It still keeps the finding available.
    IF public.citation_finding_review_status(p_user,p_project,p_bound[i]) IN ('second_review_pending','independent_dissent') THEN
      review_incomplete := true;
    END IF;
    -- CURRENT substantive-material dependency (fix): sources_available above only proves the source ROW still
    -- exists and is active — NOT that the finding's cited evidence is still readable NOW. Reuse the canonical
    -- citation_finding_inspectable, which requires each cited answer within its cap and each cited source
    -- active WITH substantive material at the CURRENT revision (and never treats an opaque native artifact as
    -- parsed proof). So a record-only forget, or a source-revision advance that leaves no matching material —
    -- even though the active source row survives — forfeits the owner_attested before/after claim below rather
    -- than letting an old inspection_complete receipt prop it up. The finding still stays available.
    IF NOT public.citation_finding_inspectable(p_user,p_project,frec) THEN
      material_uninspectable := true;
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
       AND NOT acc_unresolved
       AND NOT review_incomplete
       AND NOT material_uninspectable
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
  fid uuid; fam text; dec text; reviewer uuid; erased boolean := false;
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
      'sourceAvailable',public.citation_finding_sources_available(p_user,p_project,record),'accuracyStatus',public.citation_finding_accuracy_status(p_user,p_project,record),'reviewStatus',public.citation_finding_review_status(p_user,p_project,id))
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
  -- Anti-resurrection (P1 retention): a NEW version — identical OR altered — that still cites a source whose
  -- copied evidence was FORGOTTEN must never re-store the passage. The digest above is over the SUBMITTED
  -- record, so an identical re-save already mapped back to the (redacted) existing row; an ALTERED re-save (or a
  -- fresh finding) reaches here, so if any cited source carries a source-level erasure marker redact the
  -- support passages before the INSERT and mark the row evidence-erased. The marker (not a source tombstone) is
  -- used because a RECORD forget keeps the source alive and leaves no source-mapped tombstone; the marker
  -- covers both forget kinds by semantic uuid. record_sha256 stays the submitted-content digest (the pre-erasure
  -- anchor). This redacts the copied passage but does NOT block the finding — unrelated input is unaffected.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_record->'evidence')='array' THEN p_record->'evidence' ELSE '[]'::jsonb END) e
      JOIN public.ai_citation_source_erasures x
        ON x.user_id=p_user AND x.project_id=p_project AND x.source_id::text=lower(e->>'id')
      WHERE e->>'kind'='source') THEN
    IF jsonb_typeof(p_record->'support')='array' THEN
      p_record := jsonb_set(p_record,'{support}',(
        SELECT coalesce(jsonb_agg(
          CASE WHEN s->>'sourcePassage' IS NOT NULL
            THEN jsonb_set(s,'{sourcePassage}',to_jsonb('[redacted: source forgotten]'::text))
            ELSE s END ORDER BY ord),'[]'::jsonb)
        FROM jsonb_array_elements(p_record->'support') WITH ORDINALITY AS a(s,ord)));
    END IF;
    erased := true;
  END IF;
  INSERT INTO public.ai_citation_findings
    (user_id,project_id,finding_id,version,family,decision,record,record_sha256,
     panel_id,panel_version,client_name,client_market,actor_id,reviewer_id,supersedes_id,evidence_erased_at)
    VALUES(p_user,p_project,fid,next_version,fam,dec,p_record,digest,
     panel,pver,cname,cmarket,p_user,p_user,head,CASE WHEN erased THEN clock_timestamp() ELSE NULL END)
    RETURNING id INTO new_id;
  RETURN (SELECT jsonb_build_object('id',id,'findingId',finding_id,'version',version,'family',family,
    'decision',decision,'panelId',panel_id,'panelVersion',panel_version,
    'client',jsonb_build_object('name',client_name,'market',client_market),
    'actorId',actor_id,'reviewerId',reviewer_id,'supersedesId',supersedes_id,
    'predecessorDeleted',predecessor_deleted,'createdAt',created_at,
    'sourceAvailable',public.citation_finding_sources_available(p_user,p_project,record),'accuracyStatus',public.citation_finding_accuracy_status(p_user,p_project,record),'reviewStatus',public.citation_finding_review_status(p_user,p_project,id))
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
    'sourceAvailable',public.citation_finding_sources_available(p_user,p_project,record),'accuracyStatus',public.citation_finding_accuracy_status(p_user,p_project,record),'reviewStatus',public.citation_finding_review_status(p_user,p_project,id))
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
    'evidenceErased',(evidence_erased_at IS NOT NULL),
    'sourceAvailable',public.citation_finding_sources_available(p_user,p_project,record),
    'accuracyStatus',public.citation_finding_accuracy_status(p_user,p_project,record),
    'reviewStatus',public.citation_finding_review_status(p_user,p_project,id),
    'accuracy',public.citation_finding_accuracy(p_user,p_project,record)) INTO result
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
  -- A non-null binding must be a JSON object. A JSON array/scalar/`null` is refused HERE, consistently at
  -- the RPC boundary, rather than being silently ignored until the table CHECK — SQL NULL alone means
  -- "no binding".
  IF p_binding IS NOT NULL AND jsonb_typeof(p_binding) IS DISTINCT FROM 'object' THEN
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

-- Dated owner-confirmed business facts (spec §4.5, §8). PRIVATE per owner/project — never a shared
-- cross-client corpus. Confirmation identity/time are SERVER-derived from the authenticated action
-- (confirmed_by is the owner; confirmed_at is the server clock at save); the DECLARED validity interval
-- [valid_from, valid_until) is owner-supplied but must be finite and ordered, and is kept DISTINCT from
-- the confirmation time. Versions are immutable and dated: a later price change is a NEW version, and it
-- never retroactively rewrites the meaning of an older version (spec §4.2 / CI11-T28).
CREATE TABLE public.ai_citation_business_facts (
  user_id uuid NOT NULL, project_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  fact_id uuid NOT NULL,
  version integer NOT NULL CHECK(version BETWEEN 1 AND 10000),
  kind text NOT NULL CHECK(kind IN ('entity','location','service','duration','price','offer','hours','booking','cancellation','credential')),
  value text NOT NULL CHECK(octet_length(value) BETWEEN 1 AND 3000),
  record jsonb NOT NULL CHECK(jsonb_typeof(record)='object' AND octet_length(record::text)<=8000),
  record_sha256 text NOT NULL CHECK(record_sha256 ~ '^[a-f0-9]{64}$'),
  -- Server-derived: the confirming owner and the authenticated confirmation instant.
  confirmed_by uuid NOT NULL, confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- Declared business validity interval; finite and ordered (validity is not the confirmation time).
  valid_from timestamptz NOT NULL CHECK(isfinite(valid_from)),
  valid_until timestamptz CHECK(valid_until IS NULL OR (isfinite(valid_until) AND valid_until>valid_from)),
  supersedes_id uuid,
  predecessor_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,id),
  UNIQUE(user_id,project_id,fact_id,version),
  UNIQUE(user_id,project_id,record_sha256),
  UNIQUE(user_id,project_id,supersedes_id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,project_id,supersedes_id) REFERENCES public.ai_citation_business_facts(user_id,project_id,id)
);
ALTER TABLE public.ai_citation_business_facts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_business_facts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.save_ai_citation_business_fact(p_user uuid,p_project text,p_record jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE digest text; existing uuid; head uuid; new_id uuid; next_version integer;
  fid uuid; fkind text; fval text; vfrom timestamptz; vuntil timestamptz;
  v_confirmed timestamptz := clock_timestamp(); v_iso text; v_from_iso text; v_until_iso text; stored jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  PERFORM public.citation_lock_account(p_user);
  IF p_record IS NULL OR jsonb_typeof(p_record)<>'object' OR octet_length(p_record::text)>8000 THEN
    RAISE EXCEPTION 'invalid_citation_business_fact' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_record->'factId') IS DISTINCT FROM 'string' OR (p_record->>'factId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR jsonb_typeof(p_record->'kind') IS DISTINCT FROM 'string'
     OR (p_record->>'kind') NOT IN ('entity','location','service','duration','price','offer','hours','booking','cancellation','credential')
     OR jsonb_typeof(p_record->'value') IS DISTINCT FROM 'string'
     OR public.native_artifact_utf16_length(p_record->>'value') NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid_citation_business_fact' USING ERRCODE='22023';
  END IF;
  -- Confirmation identity is server-derived: the caller may only claim itself (the authenticated owner) as
  -- the confirmer; a foreign confirmedBy is a forged provenance claim and is refused. confirmedAt is not
  -- trusted from the client at all — it is stamped from the authenticated action below.
  IF jsonb_typeof(p_record->'confirmedBy') IS DISTINCT FROM 'string' OR (p_record->>'confirmedBy') IS DISTINCT FROM p_user::text THEN
    RAISE EXCEPTION 'citation_business_fact_confirmer_mismatch' USING ERRCODE='22023';
  END IF;
  -- Declared validity interval: finite and ordered, and separate from the confirmation instant. Precision
  -- beyond the database's microsecond resolution (>6 fractional digits) is REFUSED rather than silently
  -- truncated, so accepted input, the stored columns, the export and the digest all agree at one precision.
  IF jsonb_typeof(p_record->'validFrom') IS DISTINCT FROM 'string' OR (p_record->>'validFrom') ~ '\.[0-9]{7,}' THEN
    RAISE EXCEPTION 'invalid_citation_business_fact' USING ERRCODE='22023';
  END IF;
  BEGIN vfrom := (p_record->>'validFrom')::timestamptz;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_citation_business_fact' USING ERRCODE='22023'; END;
  IF NOT isfinite(vfrom) THEN RAISE EXCEPTION 'invalid_citation_business_fact' USING ERRCODE='22023'; END IF;
  IF p_record->'validUntil' IS NULL OR jsonb_typeof(p_record->'validUntil')='null' THEN
    vuntil := NULL;
  ELSIF jsonb_typeof(p_record->'validUntil')='string' THEN
    IF (p_record->>'validUntil') ~ '\.[0-9]{7,}' THEN RAISE EXCEPTION 'invalid_citation_business_fact' USING ERRCODE='22023'; END IF;
    BEGIN vuntil := (p_record->>'validUntil')::timestamptz;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_citation_business_fact' USING ERRCODE='22023'; END;
    IF NOT isfinite(vuntil) OR vuntil<=vfrom THEN RAISE EXCEPTION 'invalid_citation_business_fact' USING ERRCODE='22023'; END IF;
  ELSE
    RAISE EXCEPTION 'invalid_citation_business_fact' USING ERRCODE='22023';
  END IF;
  fid := (p_record->>'factId')::uuid; fkind := p_record->>'kind'; fval := p_record->>'value';
  -- Canonical, MILLISECOND-precision UTC representations of the DECLARED validity, computed from the parsed
  -- instants so equivalent inputs normalize identically (a 'Z' vs '+00:00', or differing sub-second text,
  -- must not diverge) while a real sub-second boundary is preserved (…100Z vs …900Z stay distinct).
  v_from_iso := to_char(vfrom AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  v_until_iso := CASE WHEN vuntil IS NULL THEN NULL ELSE to_char(vuntil AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END;
  -- Idempotency binds the NORMALIZED declared meaning (factId, kind, value, canonical validity) — NOT the
  -- raw date text — so an equivalent timezone/precision restage does not mint a fake correction version;
  -- the server-derived confirmedBy/confirmedAt are excluded so re-confirming identical content is idempotent.
  digest := encode(sha256(convert_to(jsonb_build_array(fid,fkind,fval,v_from_iso,coalesce(to_jsonb(v_until_iso),'null'::jsonb))::text,'UTF8')),'hex');
  -- Store a CANONICAL record: exactly the strict businessFact keys, server-authoritative confirmation
  -- identity/time, and validity normalized to canonical millisecond ISO-8601 UTC. This guarantees the
  -- stored record round-trips the strict client schema even for a direct-SQL caller whose input carried
  -- extra keys or a non-canonical (but castable) validFrom — the client `.strict()` is not a DB guarantee.
  v_iso := to_char(v_confirmed AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  stored := jsonb_build_object(
    'factId',fid::text,'kind',fkind,'value',fval,
    'confirmedBy',p_user::text,'confirmedAt',v_iso,
    'validFrom',v_from_iso,
    'validUntil',coalesce(to_jsonb(v_until_iso),'null'::jsonb));
  SELECT id INTO existing FROM public.ai_citation_business_facts
    WHERE user_id=p_user AND project_id=p_project AND record_sha256=digest;
  IF existing IS NOT NULL THEN
    RETURN (SELECT jsonb_build_object('id',id,'version',version,'supersedesId',supersedes_id,
      'predecessorDeleted',predecessor_deleted,'createdAt',created_at,'record',record)
      FROM public.ai_citation_business_facts WHERE user_id=p_user AND project_id=p_project AND id=existing);
  END IF;
  IF (SELECT count(*) FROM public.ai_citation_business_facts WHERE user_id=p_user AND project_id=p_project)>=300 THEN
    RAISE EXCEPTION 'citation_business_fact_capacity' USING ERRCODE='22023';
  END IF;
  SELECT a.id INTO head FROM public.ai_citation_business_facts a
    WHERE a.user_id=p_user AND a.project_id=p_project AND a.fact_id=fid
      AND NOT EXISTS(SELECT 1 FROM public.ai_citation_business_facts b
        WHERE b.user_id=p_user AND b.project_id=p_project AND b.supersedes_id=a.id)
    ORDER BY a.version DESC,a.created_at DESC,a.id DESC LIMIT 1;
  SELECT coalesce(max(version),0)+1 INTO next_version FROM public.ai_citation_business_facts
    WHERE user_id=p_user AND project_id=p_project AND fact_id=fid;
  INSERT INTO public.ai_citation_business_facts
    (user_id,project_id,fact_id,version,kind,value,record,record_sha256,confirmed_by,confirmed_at,valid_from,valid_until,supersedes_id)
    VALUES(p_user,p_project,fid,next_version,fkind,fval,stored,digest,p_user,v_confirmed,vfrom,vuntil,head)
    RETURNING id INTO new_id;
  RETURN (SELECT jsonb_build_object('id',id,'version',version,'supersedesId',supersedes_id,
    'predecessorDeleted',predecessor_deleted,'createdAt',created_at,'record',record)
    FROM public.ai_citation_business_facts WHERE user_id=p_user AND project_id=p_project AND id=new_id);
END; $$;

CREATE FUNCTION public.read_ai_citation_business_facts(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  RETURN jsonb_build_object('facts',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',id,'version',version,'supersedesId',supersedes_id,'predecessorDeleted',predecessor_deleted,
    'createdAt',created_at,'record',record) ORDER BY created_at DESC,id DESC)
    FROM public.ai_citation_business_facts WHERE user_id=p_user AND project_id=p_project),'[]'::jsonb));
END; $$;

CREATE FUNCTION public.read_ai_citation_business_fact(p_user uuid,p_project text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  IF p_id IS NULL THEN RAISE EXCEPTION 'invalid_citation_business_fact' USING ERRCODE='22023'; END IF;
  SELECT jsonb_build_object('id',id,'version',version,'supersedesId',supersedes_id,
    'predecessorDeleted',predecessor_deleted,'createdAt',created_at,'record',record) INTO result
    FROM public.ai_citation_business_facts WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  IF result IS NULL THEN RAISE EXCEPTION 'citation_business_fact_unavailable' USING ERRCODE='22023'; END IF;
  RETURN result;
END; $$;

CREATE FUNCTION public.remove_ai_citation_business_fact(p_user uuid,p_project text,p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  PERFORM public.citation_lock_account(p_user);
  IF p_id IS NULL THEN RAISE EXCEPTION 'invalid_citation_business_fact' USING ERRCODE='22023'; END IF;
  -- Deleting a fact version breaks the pinned dependency of any accuracy assessment that named it: that
  -- assessment resolves to 'fact_missing' on read rather than silently rebinding to another version.
  UPDATE public.ai_citation_business_facts SET supersedes_id=NULL, predecessor_deleted=true
    WHERE user_id=p_user AND project_id=p_project AND supersedes_id=p_id;
  DELETE FROM public.ai_citation_business_facts WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  RETURN true;
END; $$;

-- Resolve ONE assessed accuracy entry, LIVE, against the dated facts — the single source of truth reused by
-- the standalone read, the canonical finding reads and the improvement eligibility gate. It pins the
-- immutable fact ROW UUID (verifying its logical id / version / kind agree) and anchors the comparison to
-- the SAVED capture time of one of the finding's OWN answer-evidence references (never owner free-text). A
-- fact existing is NOT proof the claim is true (the human `status` carries that judgement); this reports
-- only the integrity of the binding, returning {resolution, capturedAt}:
--   'not_assessed'          human status is not_checked/unclear.
--   'unpinned'              missing/malformed factRowId / factId / factVersion (1..10000) / factKind /
--                           captureEvidenceId.
--   'capture_unresolved'    the captureEvidenceId is not one of this finding's bound answer references, or
--                           that answer evidence is missing/deleted/foreign, or its saved capturedAt is
--                           absent/non-finite (a native-only finding has no answer-at-capture anchor).
--   'fact_missing'          the pinned ROW is absent, or its fact_id/version disagree with the entry (a
--                           deleted-then-recreated fact reuses the numeric version but NOT the row UUID).
--   'wrong_kind'            the pinned row's kind is not the entry's factKind.
--   'out_of_period'         the pinned row's [validFrom,validUntil) does not cover the capture instant.
--   'ambiguous'             another DISTINCT logical fact of the same kind has ANY version covering the
--                           instant (a historical conflict is not hidden by a later non-overlapping version)
--                           — needs review, never a first arbitrary match.
--   'superseded_correction' a NEWER version of the SAME fact also covers the instant (an overlapping
--                           correction) — the pinned version is stale for that instant; surfaced, not
--                           silently 'resolved'. A newer NON-overlapping version (temporal change) does not
--                           trigger this, preserving the old observation's dated meaning.
--   'resolved'              the pinned row exists and agrees, covers the instant, and is the sole logical
--                           fact of its kind covering it with no newer overlapping correction.
CREATE FUNCTION public.citation_accuracy_resolve(p_user uuid,p_project text,p_record jsonb,a jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE hstatus text; cap_text text; cap timestamptz; fr public.ai_citation_business_facts%ROWTYPE;
BEGIN
  hstatus := a->>'status';
  IF hstatus IS NULL OR hstatus IN ('not_checked','unclear') THEN
    RETURN jsonb_build_object('resolution','not_assessed','capturedAt',NULL::text);
  END IF;
  -- STAGE 1 — shape only, NO casts, so a malformed value can never reach a cast (PostgreSQL does not
  -- guarantee OR short-circuit, so regex-guard and cast must be in separate stages).
  IF jsonb_typeof(a->'factRowId') IS DISTINCT FROM 'string' OR (a->>'factRowId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR jsonb_typeof(a->'factId') IS DISTINCT FROM 'string' OR (a->>'factId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR jsonb_typeof(a->'factVersion') IS DISTINCT FROM 'number' OR (a->>'factVersion') !~ '^[0-9]{1,5}$'
     OR jsonb_typeof(a->'factKind') IS DISTINCT FROM 'string'
     OR jsonb_typeof(a->'captureEvidenceId') IS DISTINCT FROM 'string' OR (a->>'captureEvidenceId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN jsonb_build_object('resolution','unpinned','capturedAt',NULL::text);
  END IF;
  -- STAGE 2 — the factVersion cast is now safe (1..5 digits guaranteed by stage 1).
  IF (a->>'factVersion')::integer NOT BETWEEN 1 AND 10000 THEN
    RETURN jsonb_build_object('resolution','unpinned','capturedAt',NULL::text);
  END IF;
  -- The capture evidence must be one of THIS finding's own answer references.
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_record->'evidence')='array' THEN p_record->'evidence' ELSE '[]'::jsonb END) e
      WHERE e->>'kind'='answer' AND e->>'id'=(a->>'captureEvidenceId')) THEN
    RETURN jsonb_build_object('resolution','capture_unresolved','capturedAt',NULL::text);
  END IF;
  -- Resolve the capture instant from the ACTUAL saved answer contract: the owner-supplied answer document
  -- stores the capture time at document.input.capturedAt (see importAnswerEvidence / answerEvidenceSchema).
  -- A fake top-level `capturedAt` on the document does NOT resolve.
  SELECT document->'input'->>'capturedAt' INTO cap_text FROM public.ai_answer_evidence
    WHERE user_id=p_user AND project_id=p_project AND id=(a->>'captureEvidenceId')::uuid;
  IF cap_text IS NULL THEN RETURN jsonb_build_object('resolution','capture_unresolved','capturedAt',NULL::text); END IF;
  BEGIN cap := cap_text::timestamptz; EXCEPTION WHEN others THEN cap := NULL; END;
  IF cap IS NULL OR NOT isfinite(cap) THEN RETURN jsonb_build_object('resolution','capture_unresolved','capturedAt',NULL::text); END IF;
  -- Resolve the pinned immutable ROW and verify its identity agrees with the declared cross-checks.
  SELECT * INTO fr FROM public.ai_citation_business_facts
    WHERE user_id=p_user AND project_id=p_project AND id=(a->>'factRowId')::uuid;
  IF fr.id IS NULL OR fr.fact_id IS DISTINCT FROM (a->>'factId')::uuid OR fr.version IS DISTINCT FROM (a->>'factVersion')::integer THEN
    RETURN jsonb_build_object('resolution','fact_missing','capturedAt',cap_text);
  END IF;
  IF fr.kind IS DISTINCT FROM (a->>'factKind') THEN
    RETURN jsonb_build_object('resolution','wrong_kind','capturedAt',cap_text);
  END IF;
  IF NOT (fr.valid_from<=cap AND (fr.valid_until IS NULL OR fr.valid_until>cap)) THEN
    RETURN jsonb_build_object('resolution','out_of_period','capturedAt',cap_text);
  END IF;
  IF EXISTS(SELECT 1 FROM public.ai_citation_business_facts g
      WHERE g.user_id=p_user AND g.project_id=p_project AND g.kind=(a->>'factKind')
        AND g.fact_id<>fr.fact_id
        AND g.valid_from<=cap AND (g.valid_until IS NULL OR g.valid_until>cap)) THEN
    RETURN jsonb_build_object('resolution','ambiguous','capturedAt',cap_text);
  END IF;
  IF EXISTS(SELECT 1 FROM public.ai_citation_business_facts c
      WHERE c.user_id=p_user AND c.project_id=p_project AND c.fact_id=fr.fact_id AND c.id<>fr.id
        AND c.version>fr.version
        AND c.valid_from<=cap AND (c.valid_until IS NULL OR c.valid_until>cap)) THEN
    RETURN jsonb_build_object('resolution','superseded_correction','capturedAt',cap_text);
  END IF;
  RETURN jsonb_build_object('resolution','resolved','capturedAt',cap_text);
END; $$;
REVOKE ALL ON FUNCTION public.citation_accuracy_resolve(uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- The audit view: every accuracy entry with its echoed pins, the resolved capture date/identity and its
-- live resolution. Malformed pins are echoed defensively so a bad stored record stays inspectable.
CREATE FUNCTION public.citation_finding_accuracy(p_user uuid,p_project text,p_record jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb; r jsonb; entries jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_record->'accuracy')<>'array' THEN RETURN '[]'::jsonb; END IF;
  FOR a IN SELECT jsonb_array_elements(p_record->'accuracy') LOOP
    r := public.citation_accuracy_resolve(p_user,p_project,p_record,a);
    -- Audit pins are NORMALIZED to null unless well-formed, so a malformed/legacy stored entry yields an
    -- explicit `unpinned` resolution WITHOUT failing the strict response schema (uuid|null, int|null); the
    -- raw entry is still available verbatim in the detail read's `record`.
    entries := entries || jsonb_build_object(
      'claimSpan',coalesce(a->>'claimSpan',''),'factKind',coalesce(a->>'factKind',''),
      'factId',CASE WHEN jsonb_typeof(a->'factId')='string' AND (a->>'factId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN a->'factId' ELSE 'null'::jsonb END,
      'factVersion',CASE WHEN jsonb_typeof(a->'factVersion')='number' AND (a->>'factVersion') ~ '^[0-9]{1,5}$' THEN a->'factVersion' ELSE 'null'::jsonb END,
      'factRowId',CASE WHEN jsonb_typeof(a->'factRowId')='string' AND (a->>'factRowId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN a->'factRowId' ELSE 'null'::jsonb END,
      'captureEvidenceId',CASE WHEN jsonb_typeof(a->'captureEvidenceId')='string' AND (a->>'captureEvidenceId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN a->'captureEvidenceId' ELSE 'null'::jsonb END,
      'capturedAt',coalesce(r->'capturedAt','null'::jsonb),
      'humanStatus',coalesce(a->>'status',''),'resolution',r->>'resolution');
  END LOOP;
  RETURN entries;
END; $$;
REVOKE ALL ON FUNCTION public.citation_finding_accuracy(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Aggregate binding status for a finding: 'none' (no assessed accuracy), 'resolved' (all bound) or
-- 'unresolved' (at least one assessed entry no longer binds). Used by the canonical finding reads and the
-- improvement eligibility gate so a deleted/superseded fact downgrades those consumers, not only the
-- standalone endpoint.
CREATE FUNCTION public.citation_finding_accuracy_status(p_user uuid,p_project text,p_record jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb; res text; any_assessed boolean := false; any_unresolved boolean := false;
BEGIN
  IF jsonb_typeof(p_record->'accuracy')<>'array' THEN RETURN 'none'; END IF;
  FOR a IN SELECT jsonb_array_elements(p_record->'accuracy') LOOP
    res := (public.citation_accuracy_resolve(p_user,p_project,p_record,a))->>'resolution';
    IF res<>'not_assessed' THEN
      any_assessed := true;
      IF res<>'resolved' THEN any_unresolved := true; END IF;
    END IF;
  END LOOP;
  IF NOT any_assessed THEN RETURN 'none'; END IF;
  IF any_unresolved THEN RETURN 'unresolved'; END IF;
  RETURN 'resolved';
END; $$;
REVOKE ALL ON FUNCTION public.citation_finding_accuracy_status(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_ai_citation_finding_accuracy(p_user uuid,p_project text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE frec jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  IF p_id IS NULL THEN RAISE EXCEPTION 'invalid_citation_finding' USING ERRCODE='22023'; END IF;
  SELECT record INTO frec FROM public.ai_citation_findings WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  IF frec IS NULL THEN RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('entries',public.citation_finding_accuracy(p_user,p_project,frec));
END; $$;
REVOKE ALL ON FUNCTION
  public.save_ai_citation_business_fact(uuid,text,jsonb),
  public.read_ai_citation_business_facts(uuid,text),
  public.read_ai_citation_business_fact(uuid,text,uuid),
  public.remove_ai_citation_business_fact(uuid,text,uuid),
  public.read_ai_citation_finding_accuracy(uuid,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.save_ai_citation_business_fact(uuid,text,jsonb),
  public.read_ai_citation_business_facts(uuid,text),
  public.read_ai_citation_business_fact(uuid,text,uuid),
  public.remove_ai_citation_business_fact(uuid,text,uuid),
  public.read_ai_citation_finding_accuracy(uuid,text,uuid)
  TO service_role;

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

-- ===========================================================================================
-- Independent (two-person) finding review. The actor is the authenticated CALLER; the owner, project and
-- finding row are supplied by the review surface. Authority is decided by the live project team contracts
-- (citation_review_authorized), NOT by ownership — so a non-owner reviewer can act, and an owner cannot
-- impersonate a reviewer (the receipt reviewer is always the caller, and the owner is refused as an
-- independent reviewer). Publication/spend permissions are entirely separate and untouched.
CREATE FUNCTION public.save_ai_citation_finding_review(p_actor uuid,p_owner uuid,p_project text,p_finding uuid,p_expected_sha text,p_decision text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE auth record; f_sha text; f_id uuid; f_ver integer; f_reviewer uuid; frec jsonb; insp boolean; new_id uuid; f_erased timestamptz;
  existing public.ai_citation_finding_reviews%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_actor=p_owner OR p_finding IS NULL
     OR p_decision IS NULL OR p_decision NOT IN ('approved','rejected','needs_changes')
     OR p_expected_sha IS NULL OR p_expected_sha !~ '^[a-f0-9]{64}$'
     OR (p_note IS NOT NULL AND octet_length(p_note) NOT BETWEEN 1 AND 6000) THEN
    RAISE EXCEPTION 'citation_review_invalid' USING ERRCODE='22023';
  END IF;
  -- OPTIMISTIC admission BEFORE any lock: current (not deleted/banned) owner AND actor accounts plus an
  -- active review-permitting membership. A stale/suspended/non-reviewer session is refused here, so it never
  -- queues on an arbitrary victim owner's workspace lock (same pattern read_project_team_snapshot uses).
  SELECT * INTO auth FROM public.citation_review_authorized(p_actor,p_owner,p_project);
  IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  -- Serialize under the owner workspace + account locks (a concurrent version bump or membership change is
  -- seen consistently).
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.citation_lock_account(p_owner);
  -- AUTHORITATIVE live re-check under the lock: the released FOR SHARE account admission for BOTH owner and
  -- actor (a suspension landing after the optimistic check is caught), then the membership/policy re-read
  -- (membership writes serialize on this same owner lock). This reuses the real team admission contract
  -- rather than trusting the policy/role predicate alone.
  PERFORM public.assert_project_team_account(p_owner);
  PERFORM public.assert_project_team_account(p_actor);
  SELECT * INTO auth FROM public.citation_review_authorized(p_actor,p_owner,p_project);
  IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  SELECT record_sha256,finding_id,version,reviewer_id,record,evidence_erased_at INTO f_sha,f_id,f_ver,f_reviewer,frec,f_erased
    FROM public.ai_citation_findings WHERE user_id=p_owner AND project_id=p_project AND id=p_finding;
  IF f_sha IS NULL THEN RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023'; END IF;
  -- A finding whose cited evidence has been FORGOTTEN (its copied passages erased) can no longer be
  -- independently attested: a new receipt would otherwise pin the retained PRE-erasure record_sha256 to a
  -- redacted payload. Refuse — the finding's evidence is unavailable. Existing historical receipts are kept.
  IF f_erased IS NOT NULL THEN RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023'; END IF;
  -- No self second-review: the finding's primary reviewer (the owner) cannot also be the independent one.
  IF f_reviewer = p_actor THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  -- Bind to the EXACT reviewed content: attesting to content that is no longer this row (e.g. a version
  -- moved on after the reviewer read it) is refused, so an old attestation can never replay onto changed
  -- evidence. Because a receipt is keyed to the immutable row, a new version simply has no receipt yet.
  IF f_sha <> p_expected_sha THEN RAISE EXCEPTION 'citation_review_stale' USING ERRCODE='22023'; END IF;
  -- Whether the finding's cited evidence was fully inspectable at review time. An 'approved' receipt on a
  -- non-inspectable finding is only an OPINION and never completes independent verification (see reviewStatus).
  insp := public.citation_finding_inspectable(p_owner,p_project,frec);
  -- Decide idempotency/conflict BEFORE charging capacity, so an identical retry still returns at the 2000 cap.
  SELECT * INTO existing FROM public.ai_citation_finding_reviews
    WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_finding AND reviewer_id=p_actor;
  IF existing.id IS NOT NULL THEN
    IF existing.withdrawn THEN
      -- The reviewer previously withdrew; a fresh submission REACTIVATES their receipt with the new decision.
      UPDATE public.ai_citation_finding_reviews SET decision=p_decision,note=p_note,inspection_complete=insp,
        record_sha256=f_sha,finding_version=f_ver,reviewer_role=auth.member_role,policy_mode=auth.policy_mode,
        policy_revision=auth.policy_revision,membership_revision=auth.membership_revision,
        withdrawn=false,withdrawn_at=NULL,created_at=clock_timestamp()
        WHERE user_id=p_owner AND project_id=p_project AND id=existing.id;
      new_id := existing.id;
    ELSIF existing.record_sha256=p_expected_sha AND existing.decision=p_decision AND existing.note IS NOT DISTINCT FROM p_note THEN
      -- Identical decision AND note on identical content: idempotent.
      new_id := existing.id;
    ELSE
      -- A changed decision OR a changed note is an explicit conflict — a recorded human decision (and its
      -- note) is preserved as history, never silently overwritten or a new note reported as saved.
      RAISE EXCEPTION 'citation_review_conflict' USING ERRCODE='22023';
    END IF;
  ELSE
    IF (SELECT count(*) FROM public.ai_citation_finding_reviews WHERE user_id=p_owner AND project_id=p_project)>=2000 THEN
      RAISE EXCEPTION 'citation_review_capacity' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.ai_citation_finding_reviews
      (user_id,project_id,finding_row_id,finding_id,finding_version,record_sha256,reviewer_id,reviewer_role,policy_mode,policy_revision,membership_revision,decision,note,inspection_complete)
      VALUES(p_owner,p_project,p_finding,f_id,f_ver,f_sha,p_actor,auth.member_role,auth.policy_mode,auth.policy_revision,auth.membership_revision,p_decision,p_note,insp)
      RETURNING id INTO new_id;
  END IF;
  RETURN (SELECT jsonb_build_object('id',id,'findingRowId',finding_row_id,'findingId',finding_id,
    'findingVersion',finding_version,'recordSha256',record_sha256,'reviewerId',reviewer_id,
    'reviewerRole',reviewer_role,'decision',decision,'note',note,'inspectionComplete',inspection_complete,
    'withdrawn',withdrawn,'createdAt',created_at)
    FROM public.ai_citation_finding_reviews WHERE user_id=p_owner AND project_id=p_project AND id=new_id);
END; $$;

-- Withdrawal is a soft, content-free tombstone (spec-driven, gap 4): ONLY the receipt's own reviewer may
-- withdraw — the owner cannot delete another reviewer's decision and silently sanitise an unresolved dissent
-- (an owner-removed dissent + a standing approval would otherwise read as independent_reviewed). The note is
-- erased; the decision/reviewer/timestamps stay for audit; a withdrawn receipt no longer counts toward
-- reviewStatus. The acting ACCOUNT must be current (assert_project_team_account) — a suspended session cannot
-- mutate review state — but current MEMBERSHIP is NOT required: a reviewer whose membership was later revoked
-- may still retract their own historical attestation (current permission vs historical review are distinct).
CREATE FUNCTION public.remove_ai_citation_finding_review(p_actor uuid,p_owner uuid,p_project text,p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
DECLARE updated uuid; already boolean;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_id IS NULL THEN RAISE EXCEPTION 'citation_review_invalid' USING ERRCODE='22023'; END IF;
  -- OPTIMISTIC ownership BEFORE any victim-scoped blocking lock: only the receipt's OWN reviewer may withdraw
  -- it, so a random, foreign or non-existent id (and the owner trying to erase another reviewer's decision)
  -- is refused by this lock-free read. This is the fix for the queue-a-write vector: an authenticated outsider
  -- who merely knows owner+project can no longer reach the owner's workspace lock with a guessed receipt id.
  SELECT withdrawn INTO already FROM public.ai_citation_finding_reviews
    WHERE user_id=p_owner AND project_id=p_project AND id=p_id AND reviewer_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  -- Current-account admission for the acting session AND the owner via the released assert_project_team_account
  -- (a FOR SHARE NOWAIT probe of auth.users — fail-fast, NEVER a wait, and NOT the victim workspace lock): a
  -- suspended/deleted/banned session cannot mutate review state. Current MEMBERSHIP is deliberately NOT
  -- required — a reviewer whose membership was later revoked may still retract their OWN historical receipt.
  PERFORM public.assert_project_team_account(p_owner);
  PERFORM public.assert_project_team_account(p_actor);
  -- Idempotent: an already-withdrawn own receipt is a content-free no-op — return WITHOUT ever taking the
  -- victim workspace blocking lock at all (proven by the missing-workspace tripwire regression).
  IF already THEN RETURN true; END IF;
  -- Only a genuinely-pending own withdrawal serializes under the OWNER account + workspace locks. The released
  -- assert_knowledge_project(...,true) and citation_lock_account each take a BLOCKING FOR UPDATE with no NOWAIT
  -- and no timeout of their own; this RPC bounds every such wait with its own SET lock_timeout='1500ms' (the
  -- released checkpoint-migration convention, mirrored here — the released helpers are NOT edited). lock_timeout
  -- is PER LOCK ACQUISITION, not a whole-RPC deadline; an exceeded wait raises 55P03 BEFORE any mutation, so a
  -- contended withdrawal fails cleanly and the receipt is preserved (never a partial tombstone). The
  -- account-first lock ORDER matches the other write RPCs, so the added blocking waits add no new deadlock
  -- cycle. Under the lock, RE-CHECK the account admission and RE-SCOPE the write to the actor's own receipt.
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.citation_lock_account(p_owner);
  PERFORM public.assert_project_team_account(p_owner);
  PERFORM public.assert_project_team_account(p_actor);
  UPDATE public.ai_citation_finding_reviews
    SET withdrawn=true, withdrawn_at=coalesce(withdrawn_at,clock_timestamp()), note=NULL
    WHERE user_id=p_owner AND project_id=p_project AND id=p_id AND reviewer_id=p_actor
    RETURNING id INTO updated;
  -- The receipt was the actor's own at the optimistic read and is re-scoped identically here; a NULL means it
  -- vanished under the lock (e.g. its finding was concurrently deleted), which is an honest forbidden.
  IF updated IS NULL THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  RETURN true;
END; $$;

-- The receipts for a finding row, callable by the owner OR a current authorized reviewer. The `reviews`
-- array is a bounded page (<=100) with an explicit `reviewTotal`/`reviewsTruncated`, but `reviewStatus` and
-- the active dissent/approval aggregates are computed over ALL receipts — so a dissent is never erased by
-- pagination. Withdrawn receipts are shown (note erased, withdrawn:true) for audit but do not count.
CREATE FUNCTION public.read_ai_citation_finding_reviews(p_actor uuid,p_owner uuid,p_project text,p_finding uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE auth record; reviews jsonb; total integer; active_dissent integer; active_approved integer;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_finding IS NULL THEN RAISE EXCEPTION 'citation_review_invalid' USING ERRCODE='22023'; END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project);
  -- Current account admission for BOTH the owner (whose review data this is) and the acting session: a
  -- suspended owner or actor cannot read review data, even with an otherwise-valid authenticated session.
  PERFORM public.assert_project_team_account(p_owner);
  IF p_actor<>p_owner THEN
    PERFORM public.assert_project_team_account(p_actor);
    SELECT * INTO auth FROM public.citation_review_authorized(p_actor,p_owner,p_project);
    IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_citation_findings WHERE user_id=p_owner AND project_id=p_project AND id=p_finding) THEN
    RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
  END IF;
  SELECT count(*),
    count(*) FILTER (WHERE NOT withdrawn AND decision IN ('rejected','needs_changes') AND reviewer_id<>p_owner),
    count(*) FILTER (WHERE NOT withdrawn AND decision='approved' AND reviewer_id<>p_owner)
    INTO total,active_dissent,active_approved
    FROM public.ai_citation_finding_reviews WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_finding;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'reviewerId',reviewer_id,'mine',reviewer_id=p_actor,
    'owner',reviewer_id=p_owner,'reviewerRole',reviewer_role,'decision',decision,'note',note,
    'inspectionComplete',inspection_complete,'withdrawn',withdrawn,'withdrawnAt',withdrawn_at,
    'findingVersion',finding_version,'recordSha256',record_sha256,'createdAt',created_at)
    ORDER BY created_at DESC,id DESC),'[]'::jsonb)
    INTO reviews FROM (SELECT * FROM public.ai_citation_finding_reviews
      WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_finding ORDER BY created_at DESC,id DESC LIMIT 100) recent;
  RETURN jsonb_build_object('ownerId',p_owner,'projectId',p_project,'findingRowId',p_finding,'reviews',reviews,
    'reviewTotal',total,'reviewsTruncated',total>100,'activeDissent',active_dissent,'activeApproved',active_approved,
    'reviewStatus',public.citation_finding_review_status(p_owner,p_project,p_finding));
END; $$;

-- The NARROW reviewer read: a current authorized independent reviewer (never the owner here — the owner
-- uses read_ai_citation_finding) sees ONLY the single finding they were asked to review AND the extant
-- evidence it cites, sufficient to actually perform the review (spec §4.5): the captured answer text +
-- capture time, the cited source's presence/status, and the dated fact behind each assessed-accuracy claim.
-- Each item reports authentic availability (a deleted reference reads available:false), a native staged
-- artifact stays explicitly non-inspectable, and `inspectionComplete` says whether a COMPLETED independent
-- review is even possible. Every OTHER finding, the full artifact bytes/export and business-fact management
-- stay owner-only; this is the least access the second-review activity needs, not a corpus/export grant.
CREATE FUNCTION public.read_ai_citation_finding_for_review(p_actor uuid,p_owner uuid,p_project text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE auth record; frow public.ai_citation_findings%ROWTYPE; frec jsonb; e jsonb; ref uuid;
  ev_json jsonb := '[]'::jsonb; facts_json jsonb := '[]'::jsonb; reviews jsonb; total integer;
  ans jsonb; src jsonb; srev integer; mat jsonb; mcount integer; nat boolean;
  fk text; fv text; ffrom timestamptz; funtil timestamptz; ffound boolean;
  frec_response jsonb; passages_withheld boolean := false;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_id IS NULL THEN RAISE EXCEPTION 'citation_review_invalid' USING ERRCODE='22023'; END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project);
  -- Current account admission for both owner and actor, then the live review authority.
  PERFORM public.assert_project_team_account(p_owner);
  PERFORM public.assert_project_team_account(p_actor);
  SELECT * INTO auth FROM public.citation_review_authorized(p_actor,p_owner,p_project);
  IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  SELECT * INTO frow FROM public.ai_citation_findings WHERE user_id=p_owner AND project_id=p_project AND id=p_id;
  IF frow.id IS NULL THEN RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023'; END IF;
  frec := frow.record;
  -- Resolve each cited evidence item to its extant content (or an explicit missing state).
  IF jsonb_typeof(frec->'evidence')='array' THEN
    FOR e IN SELECT jsonb_array_elements(frec->'evidence') LOOP
      IF (e->>'id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN ref := (e->>'id')::uuid; ELSE ref := NULL; END IF;
      IF e->>'kind'='answer' THEN
        SELECT document INTO ans FROM public.ai_answer_evidence WHERE user_id=p_owner AND project_id=p_project AND id=ref;
        -- The FULL answer content (rawAnswer is contract-capped at 50000 chars, exposed in full), the actual
        -- supplied citation URLs, and capture provenance — not a 4000-char snippet. contentTruncated makes
        -- any (contract-violating) over-cap answer explicit rather than silently "complete".
        ev_json := ev_json || jsonb_build_object('kind','answer','id',e->>'id','available',ans IS NOT NULL,
          'inspectable',ans IS NOT NULL AND char_length(coalesce(ans->'input'->>'rawAnswer',''))<=50000,
          'capturedAt',ans->'input'->>'capturedAt','surface',ans->'input'->>'surface','mode',ans->'input'->>'mode',
          'method',ans->'input'->>'method','status',ans->'input'->>'status',
          'promptId',ans->'input'->>'promptId','promptRevision',(ans->'input'->>'promptRevision')::integer,
          'citationsComplete',(ans->'input'->>'citationsComplete')::boolean,
          'citations',coalesce(ans->'input'->'citations','[]'::jsonb),
          'content',left(ans->'input'->>'rawAnswer',50000),
          'contentLength',coalesce(char_length(ans->'input'->>'rawAnswer'),0),
          'contentTruncated',coalesce(char_length(ans->'input'->>'rawAnswer'),0)>50000);
      ELSIF e->>'kind'='source' THEN
        SELECT payload,revision INTO src,srev FROM public.project_knowledge_sources WHERE user_id=p_owner AND project_id=p_project AND id=ref;
        -- Any cited source that is revoked or missing taints the reviewer's copied-passage view (see below):
        -- support[] carries no per-passage source pin, so once one cited source is deactivated we cannot prove
        -- which owner-copied passage came from a still-live source, and conservatively withhold ALL of them.
        IF src IS NULL OR (src->>'status')<>'active' THEN passages_withheld := true; END IF;
        -- Substantive source MATERIAL, GATED on the source being ACTIVE. A REVOKED source (or a missing one)
        -- is deactivated, so its live records are WITHHELD from the reviewer here — inspectable was already
        -- false for it, and now materialCount/material do not serialize the deactivated source's record
        -- value/excerpt/locator either (previously they were queried and returned regardless of status). This
        -- is ACCESS-TIME withholding of LIVE source material, distinct from ERASURE: the owner's OWN copied
        -- support[].sourcePassage in the finding record is NOT touched by revocation (revocation is not a
        -- forget; only a forget erases the stored copy). Scoped to the cited source at its CURRENT revision;
        -- never the whole corpus, never the raw document bytes (service-only). label/url/fingerprint stay as
        -- attribution (not support, §4.2) so the reviewer still sees WHY it is non-inspectable ('revoked').
        IF src IS NOT NULL AND (src->>'status')='active' THEN
          SELECT count(*) INTO mcount FROM public.project_knowledge_records r
            WHERE r.user_id=p_owner AND r.project_id=p_project AND r.source_id=ref
              AND (r.payload->>'sourceRevision')=srev::text AND coalesce(r.payload->>'value','')<>'';
          -- Material IN FULL up to 300 (the project record cap), deterministically ordered by record id, with
          -- each record's identity/revision for provenance. The inner subquery MUST expose `id` for ORDER BY.
          SELECT coalesce(jsonb_agg(jsonb_build_object('recordId',id,'value',payload->>'value','excerpt',payload->>'excerpt',
            'locator',payload->>'locator','category',payload->>'category','status',payload->>'status',
            'recordRevision',revision) ORDER BY id),'[]'::jsonb) INTO mat
            FROM (SELECT id,payload,revision FROM public.project_knowledge_records
              WHERE user_id=p_owner AND project_id=p_project AND source_id=ref
                AND (payload->>'sourceRevision')=srev::text AND coalesce(payload->>'value','')<>'' ORDER BY id LIMIT 300) m;
        ELSE
          mcount := 0; mat := '[]'::jsonb;
        END IF;
        ev_json := ev_json || jsonb_build_object('kind','source','id',e->>'id','available',src IS NOT NULL,
          'inspectable',src IS NOT NULL AND (src->>'status')='active' AND coalesce(mcount,0) BETWEEN 1 AND 300,
          'sourceKind',src->>'kind','status',src->>'status','label',src->>'label',
          'url',src->>'url','fingerprint',src->>'fingerprint','observedAt',src->>'observedAt','sourceRevision',srev,
          'material',mat,'materialCount',coalesce(mcount,0),'materialTruncated',coalesce(mcount,0)>300);
      ELSIF e->>'kind'='native' THEN
        SELECT EXISTS(SELECT 1 FROM public.ai_native_report_artifacts WHERE user_id=p_owner AND project_id=p_project AND id=ref) INTO nat;
        -- A native staged artifact is opaque unparsed bytes: present-or-not, but NEVER independently inspectable.
        ev_json := ev_json || jsonb_build_object('kind','native','id',e->>'id','available',nat,'inspectable',false);
      END IF;
    END LOOP;
  END IF;
  -- RESPONSE-ONLY withholding of the owner's COPIED support passages when a cited source is revoked/missing.
  -- The reviewer response previously returned frec verbatim, including support[].sourcePassage — the owner's
  -- copy of a now-revoked source's text, delivered to the reviewer even though that source's LIVE material is
  -- withheld above. Here we build a redacted RESPONSE COPY (never the stored row) that blanks every non-null
  -- support passage to a marker. This is distinct from ERASURE: the owner's stored ai_citation_findings.record
  -- is untouched (revocation is not a forget), so the owner's own detail read still returns the real passage;
  -- only THIS reviewer response withholds it, and `sourcePassagesWithheld` surfaces that so the returned record
  -- is never mistaken for the recordSha256 preimage (that digest still pins the UNREDACTED stored record — a
  -- reviewer cannot attest bytes they were not shown as fully inspected, and a revoked source already forces
  -- inspectionComplete=false). An already-erased finding keeps its stored '[redacted: source forgotten]' copy
  -- verbatim (no live passage to leak); response-only withholding applies only while NOT erased.
  IF frow.evidence_erased_at IS NULL AND passages_withheld AND jsonb_typeof(frec->'support')='array' THEN
    frec_response := jsonb_set(frec,'{support}',(
      SELECT coalesce(jsonb_agg(CASE WHEN s->>'sourcePassage' IS NOT NULL
          THEN jsonb_set(s,'{sourcePassage}',to_jsonb('[withheld: source revoked]'::text)) ELSE s END ORDER BY ord),'[]'::jsonb)
      FROM jsonb_array_elements(frec->'support') WITH ORDINALITY AS a(s,ord)));
  ELSE
    frec_response := frec;
  END IF;
  -- The dated fact behind each assessed-accuracy claim (only entries that pin a fact row).
  IF jsonb_typeof(frec->'accuracy')='array' THEN
    FOR e IN SELECT jsonb_array_elements(frec->'accuracy') LOOP
      IF jsonb_typeof(e->'factRowId')='string' AND (e->>'factRowId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        SELECT kind,value,valid_from,valid_until INTO fk,fv,ffrom,funtil FROM public.ai_citation_business_facts
          WHERE user_id=p_owner AND project_id=p_project AND id=(e->>'factRowId')::uuid;
        ffound := FOUND;
        facts_json := facts_json || jsonb_build_object('factRowId',e->>'factRowId','available',ffound,
          'kind',fk,'value',fv,
          'validFrom',CASE WHEN ffound THEN to_char(ffrom AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ELSE NULL END,
          'validUntil',CASE WHEN ffound AND funtil IS NOT NULL THEN to_char(funtil AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ELSE NULL END);
      END IF;
    END LOOP;
  END IF;
  SELECT count(*) INTO total FROM public.ai_citation_finding_reviews WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'reviewerId',reviewer_id,'mine',reviewer_id=p_actor,
    'owner',reviewer_id=p_owner,'reviewerRole',reviewer_role,'decision',decision,'note',note,
    'inspectionComplete',inspection_complete,'withdrawn',withdrawn,'withdrawnAt',withdrawn_at,
    'findingVersion',finding_version,'recordSha256',record_sha256,'createdAt',created_at)
    ORDER BY created_at DESC,id DESC),'[]'::jsonb)
    INTO reviews FROM (SELECT * FROM public.ai_citation_finding_reviews
      WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_id ORDER BY created_at DESC,id DESC LIMIT 100) recent;
  RETURN jsonb_build_object('id',frow.id,'findingId',frow.finding_id,'version',frow.version,'family',frow.family,
    'decision',frow.decision,'panelId',frow.panel_id,'panelVersion',frow.panel_version,
    'client',jsonb_build_object('name',frow.client_name,'market',frow.client_market),
    'recordSha256',frow.record_sha256,'record',frec_response,'createdAt',frow.created_at,
    'evidenceErased',(frow.evidence_erased_at IS NOT NULL),
    'sourcePassagesWithheld',(frow.evidence_erased_at IS NULL AND passages_withheld),
    'sourceAvailable',public.citation_finding_sources_available(p_owner,p_project,frec),
    'accuracyStatus',public.citation_finding_accuracy_status(p_owner,p_project,frec),
    'reviewStatus',public.citation_finding_review_status(p_owner,p_project,frow.id),
    'inspectionComplete',public.citation_finding_inspectable(p_owner,p_project,frec),
    'evidence',ev_json,'facts',facts_json,'reviews',reviews,'reviewTotal',total,'reviewsTruncated',total>100);
END; $$;

REVOKE ALL ON FUNCTION
  public.save_ai_citation_finding_review(uuid,uuid,text,uuid,text,text,text),
  public.remove_ai_citation_finding_review(uuid,uuid,text,uuid),
  public.read_ai_citation_finding_reviews(uuid,uuid,text,uuid),
  public.read_ai_citation_finding_for_review(uuid,uuid,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.save_ai_citation_finding_review(uuid,uuid,text,uuid,text,text,text),
  public.remove_ai_citation_finding_review(uuid,uuid,text,uuid),
  public.read_ai_citation_finding_reviews(uuid,uuid,text,uuid),
  public.read_ai_citation_finding_for_review(uuid,uuid,text,uuid)
  TO service_role;
