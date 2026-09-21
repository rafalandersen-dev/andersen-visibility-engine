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

-- CONTENT-FREE answer-level erasure provenance (P2 retention, finding 4058893312 — mirrors the source table).
-- Deleting an ANSWER (remove_ai_answer_evidence 'answer', a prompt FK cascade, a supersedes-chain FK cascade, or
-- a project delete) removes the released ai_answer_evidence row, but a dependent citation finding kept its OWN
-- copies of answer-derived text (recommendation.passage, support[].claimSpan, accuracy[].claimSpan), which the
-- released source/record triggers never touch. This table records, per (owner, project, answer), that an
-- answer's evidence was forgotten, so a later resave / fresh finding citing that answer id is caught at save
-- (the released ai_answer_evidence row is gone and carries no such provenance). ids + a timestamp only (no
-- answer text — nothing to leak). Same monotonic cardinality and project-delete-only lifecycle bound as the
-- source table (workspace_entities FK ON DELETE CASCADE). Never a client surface; touched only by definers.
CREATE TABLE public.ai_citation_answer_erasures (
  user_id uuid NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  project_id text NOT NULL,
  answer_id uuid NOT NULL,
  erased_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,answer_id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.ai_citation_answer_erasures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_answer_erasures FROM PUBLIC,anon,authenticated,service_role;
-- Native-artifact forget provenance (finding 4061786099). The released remove_ai_native_report_artifact
-- (20260919165000) merely DELETEs the opaque staged artifact row, with NO erasure propagation — so a finding
-- citing that native kept its prose/notes visible and its digest unmasked. This records, per (owner, project,
-- native), that a native artifact was forgotten, so a later resave / fresh finding citing that native id is caught
-- at save. ids + a timestamp ONLY — never the artifact bytes, sha256 or metadata (nothing to leak; native stays
-- opaque and uninspectable, no parsing invented). Same monotonic cardinality and project-delete-only lifecycle
-- bound as the source/answer tables (workspace_entities FK ON DELETE CASCADE). Never a client surface.
CREATE TABLE public.ai_citation_native_erasures (
  user_id uuid NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  project_id text NOT NULL,
  native_id uuid NOT NULL,
  erased_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,native_id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.ai_citation_native_erasures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_native_erasures FROM PUBLIC,anon,authenticated,service_role;

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
  -- Stamp EVERY version citing this source erased (finding 4059905627). A record-forget can leave the finding with
  -- only free prose (observation / hypothesis / support[].reason) quoting the deleted record and NO copied
  -- sourcePassage; yet reviewer prose-withholding, reviewer-digest masking and the new-review refusal ALL key on
  -- evidence_erased_at, so the stamp MUST NOT be conditioned on a passage being present (the old passage gate left
  -- such findings un-erased and leaking). The structured-copy redaction of support[].sourcePassage is the ONLY
  -- record mutation and stays conditional: it runs only when support is a valid array carrying at least one non-null
  -- sourcePassage, so a legitimately empty/absent support — or malformed historical support (a non-object element
  -- yields NULL from ->>' ' and is left as-is) — is preserved byte-for-byte and never crashes. Free prose is NOT
  -- touched in storage (honest owner retention; the reviewer withholding is response-only). Matched by SEMANTIC uuid
  -- within the exact tenant+project.
  UPDATE public.ai_citation_findings f
    SET record = CASE
        WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(f.record->'support')='array' THEN f.record->'support' ELSE '[]'::jsonb END) s
            WHERE s->>'sourcePassage' IS NOT NULL)
        THEN jsonb_set(f.record,'{support}',(
          SELECT coalesce(jsonb_agg(
            CASE WHEN s->>'sourcePassage' IS NOT NULL
              THEN jsonb_set(s,'{sourcePassage}',to_jsonb('[redacted: source forgotten]'::text))
              ELSE s END ORDER BY ord),'[]'::jsonb)
          FROM jsonb_array_elements(f.record->'support') WITH ORDINALITY AS a(s,ord)))
        ELSE f.record END,
      evidence_erased_at = coalesce(f.evidence_erased_at, clock_timestamp())
    WHERE f.user_id=p_user AND f.project_id=p_project
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(f.record->'evidence')='array' THEN f.record->'evidence' ELSE '[]'::jsonb END) e
          WHERE e->>'kind'='source' AND lower(e->>'id')=p_source::text);
  -- Receipt NOTES are free reviewer text that may QUOTE the forgotten source verbatim; the record redaction
  -- above does not touch them (finding 4059365606). Erase the note (content-free marker) on every NON-withdrawn
  -- receipt of a finding that cites the forgotten source — decision/reviewer/timestamps stay for audit (the same
  -- shape as a withdrawal tombstone), and a withdrawn receipt's note was already erased. New reviews on an erased
  -- finding are already blocked, so this is not resurrectable.
  UPDATE public.ai_citation_finding_reviews r
    SET note='[redacted: finding evidence forgotten]'
    WHERE r.user_id=p_user AND r.project_id=p_project AND NOT r.withdrawn AND r.note IS NOT NULL
      AND EXISTS(SELECT 1 FROM public.ai_citation_findings f
        WHERE f.id=r.finding_row_id AND f.user_id=p_user AND f.project_id=p_project
          AND jsonb_typeof(f.record->'evidence')='array'
          AND EXISTS(SELECT 1 FROM jsonb_array_elements(f.record->'evidence') e
            WHERE e->>'kind'='source' AND lower(e->>'id')=p_source::text));
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

-- Answer-forget FIELD redactor (P2 retention; finding 4058893312). Shared by the answer-delete trigger and the
-- save-time anti-resurrection guard: redacts ONLY the STRUCTURED answer-derived copies a finding keeps — the
-- exact ANSWER text it pasted into recommendation.passage, support[].claimSpan and accuracy[].claimSpan — to a
-- visible marker (never the original). support[].citedUrl and answerCapturedAt are attribution/provenance, kept
-- (mirroring the source redactor keeping label/url); observation / hypothesis / support[].reason are free-text
-- reviewer analysis, kept — the SAME documented scope boundary as the source redactor (prose is not auto-wiped
-- without a deliberate mechanism, so we do NOT claim all pasted-in prose is gone). A pure jsonb transform.
CREATE FUNCTION public.citation_redact_answer_fields(p_record jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb := p_record;
BEGIN
  IF jsonb_typeof(r->'support')='array' THEN
    r := jsonb_set(r,'{support}',(SELECT coalesce(jsonb_agg(
      CASE WHEN s->>'claimSpan' IS NOT NULL THEN jsonb_set(s,'{claimSpan}',to_jsonb('[redacted: answer forgotten]'::text)) ELSE s END ORDER BY ord),'[]'::jsonb)
      FROM jsonb_array_elements(r->'support') WITH ORDINALITY q(s,ord)));
  END IF;
  IF jsonb_typeof(r->'accuracy')='array' THEN
    r := jsonb_set(r,'{accuracy}',(SELECT coalesce(jsonb_agg(
      CASE WHEN a->>'claimSpan' IS NOT NULL THEN jsonb_set(a,'{claimSpan}',to_jsonb('[redacted: answer forgotten]'::text)) ELSE a END ORDER BY ord),'[]'::jsonb)
      FROM jsonb_array_elements(r->'accuracy') WITH ORDINALITY q(a,ord)));
  END IF;
  IF jsonb_typeof(r->'recommendation')='object' AND (r->'recommendation'->>'passage') IS NOT NULL THEN
    r := jsonb_set(r,'{recommendation,passage}',to_jsonb('[redacted: answer forgotten]'::text));
  END IF;
  RETURN r;
END; $$;
REVOKE ALL ON FUNCTION public.citation_redact_answer_fields(jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Answer-DELETE erasure propagation (the finding). ANY delete of an ai_answer_evidence row — the released
-- remove_ai_answer_evidence('answer' OR 'prompt'), the prompt FK cascade, the supersedes-chain FK cascade, or a
-- project delete — is caught by the AFTER DELETE trigger below and reaches here. It erases the copied
-- answer-derived fields (via citation_redact_answer_fields) in EVERY version of EVERY finding of the SAME
-- owner+project that cites the answer, and stamps evidence_erased_at so every current-status / digest-masking /
-- new-review-block / attestation-downgrade path already keyed on erasure honors it (marking dependent finding
-- versions erased). The answer is matched by SEMANTIC uuid (lower(e->>'id')=answer::text, so an uppercase-cited
-- answer still matches and a source/native id never coerces). A content-free marker records the erasure for the
-- save-time anti-resurrection guard. record_sha256 is left unchanged (a pre-erasure digest, masked from
-- reviewers). Project-delete safe: skip when the workspace_entities project row is already gone (the released
-- prompt/answer purge fires this trigger AFTER the project row is deleted), exactly like the source redactor —
-- the findings/erasure rows are cascade-deleted anyway, and inserting provenance would orphan the FK (23503).
CREATE FUNCTION public.citation_forget_redact_answer(p_user uuid,p_project text,p_answer uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.workspace_entities
       WHERE user_id=p_user AND collection='projects' AND entity_id=p_project) THEN
    RETURN;
  END IF;
  INSERT INTO public.ai_citation_answer_erasures(user_id,project_id,answer_id)
    VALUES(p_user,p_project,p_answer) ON CONFLICT(user_id,project_id,answer_id) DO NOTHING;
  UPDATE public.ai_citation_findings f
    SET record = public.citation_redact_answer_fields(f.record),
        evidence_erased_at = coalesce(f.evidence_erased_at, clock_timestamp())
    WHERE f.user_id=p_user AND f.project_id=p_project
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(f.record->'evidence')='array' THEN f.record->'evidence' ELSE '[]'::jsonb END) e
          WHERE e->>'kind'='answer' AND lower(e->>'id')=p_answer::text);
  -- Receipt NOTES may QUOTE the forgotten answer verbatim; erase the note (content-free marker) on every
  -- NON-withdrawn receipt of a finding citing the answer — same rationale/audit shape as the source redactor
  -- (finding 4059365606).
  UPDATE public.ai_citation_finding_reviews r
    SET note='[redacted: finding evidence forgotten]'
    WHERE r.user_id=p_user AND r.project_id=p_project AND NOT r.withdrawn AND r.note IS NOT NULL
      AND EXISTS(SELECT 1 FROM public.ai_citation_findings f
        WHERE f.id=r.finding_row_id AND f.user_id=p_user AND f.project_id=p_project
          AND jsonb_typeof(f.record->'evidence')='array'
          AND EXISTS(SELECT 1 FROM jsonb_array_elements(f.record->'evidence') e
            WHERE e->>'kind'='answer' AND lower(e->>'id')=p_answer::text));
END; $$;
REVOKE ALL ON FUNCTION public.citation_forget_redact_answer(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.citation_forget_answer_passages() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.citation_forget_redact_answer(OLD.user_id,OLD.project_id,OLD.id); RETURN OLD; END; $$;
REVOKE ALL ON FUNCTION public.citation_forget_answer_passages() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER citation_forget_answer_passages_trg
  AFTER DELETE ON public.ai_answer_evidence
  FOR EACH ROW EXECUTE FUNCTION public.citation_forget_answer_passages();
-- Native-artifact forget cascade (finding 4061786099). A native artifact is OPAQUE staged bytes referenced by id
-- only — the finding copies NOTHING from it (no passage/claim; parsing is P5), so there is NO structured field to
-- scrub (like the fact redactor, unlike the answer redactor). But the finding's free prose (observation /
-- hypothesis / support[].reason) and its receipt NOTES may DESCRIBE that report, so a native delete marks every
-- version of every finding of the SAME owner+project citing the DELETED native id (SEMANTIC uuid, so an uppercase
-- cite still matches and a source/answer id never coerces) evidence-erased — activating the same machinery:
-- reviewer digest + receipt + free prose masked/withheld, new reviews blocked, review/improvement status
-- downgraded. Receipt notes are erased in storage to the content-free marker. record_sha256 is left as the
-- pre-erasure digest (masked from reviewers). Owner prose is retained in storage (honest owner retention). A
-- content-free marker records the erasure for the save-time anti-resurrection guard. Project-delete safe: skip
-- when the workspace_entities project row is already gone (the FK cascade purges artifacts AFTER the project row;
-- inserting provenance would orphan the FK 23503), exactly like the source/answer/fact redactors.
CREATE FUNCTION public.citation_forget_redact_native(p_user uuid,p_project text,p_native uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.workspace_entities
       WHERE user_id=p_user AND collection='projects' AND entity_id=p_project) THEN
    RETURN;
  END IF;
  INSERT INTO public.ai_citation_native_erasures(user_id,project_id,native_id)
    VALUES(p_user,p_project,p_native) ON CONFLICT(user_id,project_id,native_id) DO NOTHING;
  UPDATE public.ai_citation_findings f
    SET evidence_erased_at = coalesce(f.evidence_erased_at, clock_timestamp())
    WHERE f.user_id=p_user AND f.project_id=p_project
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(f.record->'evidence')='array' THEN f.record->'evidence' ELSE '[]'::jsonb END) e
          WHERE e->>'kind'='native' AND lower(e->>'id')=p_native::text);
  UPDATE public.ai_citation_finding_reviews r
    SET note='[redacted: finding evidence forgotten]'
    WHERE r.user_id=p_user AND r.project_id=p_project AND NOT r.withdrawn AND r.note IS NOT NULL
      AND EXISTS(SELECT 1 FROM public.ai_citation_findings f
        WHERE f.id=r.finding_row_id AND f.user_id=p_user AND f.project_id=p_project
          AND jsonb_typeof(f.record->'evidence')='array'
          AND EXISTS(SELECT 1 FROM jsonb_array_elements(f.record->'evidence') e
            WHERE e->>'kind'='native' AND lower(e->>'id')=p_native::text));
END; $$;
REVOKE ALL ON FUNCTION public.citation_forget_redact_native(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.citation_forget_native_records() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.citation_forget_redact_native(OLD.user_id,OLD.project_id,OLD.id); RETURN OLD; END; $$;
REVOKE ALL ON FUNCTION public.citation_forget_native_records() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER citation_forget_native_records_trg
  AFTER DELETE ON public.ai_native_report_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.citation_forget_native_records();

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

-- FINDING-SCOPED EVIDENCE-REVIEW ASSIGNMENT (finding 4062796988). citation_review_authorized (team role/policy)
-- alone is INSUFFICIENT to expose a finding's PRIVATE cited answer/knowledge/fact evidence to a non-owner:
-- publication-team membership is a broad grant, and the spec's second-review evidence contract requires the
-- OWNER to explicitly nominate WHICH reviewer may inspect WHICH finding row. This content-free table records
-- exactly that owner-approved, finding-row-pinned grant. It is bound to the EXACT immutable finding row
-- (finding_row_id = ai_citation_findings.id, one row per version), so a new finding version has NO assignment
-- and fails closed until the owner re-grants, and the ON DELETE CASCADE finding FK removes the assignment when
-- the finding row (or, transitively, the project) is deleted — never a dangling grant. It stores NO evidence,
-- hash or note; only the owner/project/row/reviewer identities + an active/revoked flag. RLS-closed and REVOKEd
-- from every client role, so only the SECURITY DEFINER grant/revoke/check functions below touch it. There is no
-- backfill from historical publication roles: every grant is an explicit owner action recorded here.
CREATE TABLE public.ai_citation_review_assignments (
  user_id uuid NOT NULL,               -- the project OWNER who granted the assignment (the data scope)
  project_id text NOT NULL,
  finding_row_id uuid NOT NULL,        -- the EXACT immutable ai_citation_findings.id (a version is one row)
  reviewer_id uuid NOT NULL,           -- the intended independent reviewer granted evidence access to this row
  active boolean NOT NULL DEFAULT true,
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  CHECK(user_id<>reviewer_id),         -- the owner is never an "assigned reviewer" (owner uses the owner reads)
  CHECK(active OR revoked_at IS NOT NULL),
  PRIMARY KEY(user_id,project_id,finding_row_id,reviewer_id),
  FOREIGN KEY(user_id,project_id,finding_row_id) REFERENCES public.ai_citation_findings(user_id,project_id,id) ON DELETE CASCADE
);
ALTER TABLE public.ai_citation_review_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_review_assignments FROM PUBLIC,anon,authenticated,service_role;

-- LIVE finding-scoped assignment check, gating the sensitive reviewer reads/submission BELOW in ADDITION to
-- citation_review_authorized (team eligibility stays necessary; this is a second, narrower gate, never a
-- replacement). True only when an ACTIVE, non-revoked assignment binds this exact owner+project+finding ROW to
-- this exact reviewer. Revocation (active=false / revoked_at set) and a finding version bump (a different row id
-- with no assignment) both make this false, so evidence/hash/notes fail closed the instant either happens.
-- Membership EXPIRY / removal / account ban are enforced separately and live by citation_review_authorized +
-- assert_project_team_account at each call site, so an expired/removed/banned reviewer is refused there even
-- while a stale assignment row lingers. Internal-only.
CREATE FUNCTION public.citation_review_assigned(p_owner uuid,p_project text,p_finding uuid,p_reviewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.ai_citation_review_assignments
    WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_finding
      AND reviewer_id=p_reviewer AND active AND revoked_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.citation_review_assigned(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- OWNER-ONLY grant of a finding-scoped evidence-review assignment. The AUTHENTICATED caller IS p_owner (the
-- server passes the session id; a foreign p_owner is never client-supplied, and the table is RLS-closed so no
-- direct client write exists) — this is the same owner-authority model as every other owner write RPC. The
-- owner workspace + account locks (assert_knowledge_project(...,true) + citation_lock_account) serialize the
-- grant with concurrent revokes and the reviewer RPCs' authoritative re-checks; lock_timeout bounds each wait.
-- The intended reviewer must be a CURRENTLY-eligible independent reviewer of this exact project (active,
-- non-expired membership + a review-granting policy, via citation_review_authorized) and a live account — an
-- owner can never fabricate an assignment for a stranger, a viewer, a removed member or the owner themselves.
-- Eligibility is ALSO re-checked live at every read/submission, so this create-time gate never becomes the sole
-- authority. Idempotent: re-granting an existing/prior assignment reactivates it and returns the same shape.
CREATE FUNCTION public.grant_ai_citation_review_assignment(p_owner uuid,p_project text,p_finding uuid,p_reviewer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
DECLARE auth record;
BEGIN
  IF p_owner IS NULL OR p_project IS NULL OR p_finding IS NULL OR p_reviewer IS NULL OR p_owner=p_reviewer THEN
    RAISE EXCEPTION 'citation_review_invalid' USING ERRCODE='22023';
  END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.citation_lock_account(p_owner);
  PERFORM public.assert_project_team_account(p_owner);
  PERFORM public.assert_project_team_account(p_reviewer);
  -- Currently-eligible independent reviewer of THIS project, or fail closed — no pre-assigning a non-member.
  SELECT * INTO auth FROM public.citation_review_authorized(p_reviewer,p_owner,p_project);
  IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  -- The finding row must exist under this owner/project (the FK enforces it too; the explicit check returns the
  -- finding's own unavailable error rather than a raw FK violation).
  IF NOT EXISTS(SELECT 1 FROM public.ai_citation_findings WHERE user_id=p_owner AND project_id=p_project AND id=p_finding) THEN
    RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.ai_citation_review_assignments(user_id,project_id,finding_row_id,reviewer_id,active,granted_at,revoked_at)
    VALUES(p_owner,p_project,p_finding,p_reviewer,true,clock_timestamp(),NULL)
    ON CONFLICT(user_id,project_id,finding_row_id,reviewer_id)
    DO UPDATE SET active=true, revoked_at=NULL;
  RETURN jsonb_build_object('ownerId',p_owner,'projectId',p_project,'findingRowId',p_finding,'reviewerId',p_reviewer,'active',true);
END; $$;
REVOKE ALL ON FUNCTION public.grant_ai_citation_review_assignment(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- OWNER-ONLY revoke of a finding-scoped assignment. Owner-authority model and locks as for grant. Idempotent: a
-- missing or already-revoked assignment is a no-op success (the goal state — no live assignment — already
-- holds). The owner account must be current; the REVIEWER's account/membership is deliberately NOT required, so
-- an owner can always revoke evidence access to a reviewer who has already left or been suspended. A revoke
-- makes citation_review_assigned false immediately, so the next reviewer read/submission fails closed.
CREATE FUNCTION public.revoke_ai_citation_review_assignment(p_owner uuid,p_project text,p_finding uuid,p_reviewer uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
BEGIN
  IF p_owner IS NULL OR p_project IS NULL OR p_finding IS NULL OR p_reviewer IS NULL THEN
    RAISE EXCEPTION 'citation_review_invalid' USING ERRCODE='22023';
  END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.citation_lock_account(p_owner);
  PERFORM public.assert_project_team_account(p_owner);
  UPDATE public.ai_citation_review_assignments
    SET active=false, revoked_at=coalesce(revoked_at,clock_timestamp())
    WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_finding AND reviewer_id=p_reviewer AND active;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.revoke_ai_citation_review_assignment(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- The owner-only grant/revoke endpoints are client-initiated (the middleware supplies the authenticated owner as
-- p_owner), so — like the other citation service RPCs — they are GRANTed to service_role only. citation_review_assigned
-- above stays fully revoked: it is reached only from the reviewer RPCs, never client-callable.
GRANT EXECUTE ON FUNCTION
  public.grant_ai_citation_review_assignment(uuid,text,uuid,uuid),
  public.revoke_ai_citation_review_assignment(uuid,text,uuid,uuid)
  TO service_role;

-- Whether a SELECTED knowledge record is currently VALID EVIDENCE for citation review (finding 4060770032). This is
-- the EVIDENCE-inspection subset of the released canonical knowledge selector (project-knowledge.ts selectProjectKnowledge):
-- the source is active and observed no later than now, and the record is status='accepted' with a non-empty value,
-- updated no later than now, REVIEWED (a real review of THIS version: reviewedAt present, no later than now, and NOT
-- before updatedAt), and not expired (validUntil absent or still in the future). It deliberately OMITS the
-- OUTPUT-applicability policy (appliesTo / validCoverageRecord / coverage-conflicts) — that governs which records feed
-- text/visual GENERATION output, not whether a record is valid evidence a reviewer may inspect. Timestamps are TEXT
-- in the payload, so each is FAIL-CLOSED: cast ONLY when it matches a strict ISO-8601-with-offset pattern (otherwise
-- the record is not valid), never a bare cast that could raise on malformed historical data. A proposed/disputed/
-- expired/rejected, future-dated, or unreviewed record is not selectable. Pure on its inputs; granted to no role.
CREATE FUNCTION public.citation_knowledge_selectable(p_src jsonb,p_rec jsonb,p_now timestamptz) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE ts constant text := '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$';
  s_obs text; r_upd text; r_rev text; r_val text;
  t_obs timestamptz; t_upd timestamptz; t_rev timestamptz; t_val timestamptz;
BEGIN
  -- p_now is the comparison clock. If an internal caller ever passes NULL or a non-finite (±infinity) instant,
  -- every "future"/"expired" test would silently pass vacuously, so guard it FIRST and fail closed.
  IF p_now IS NULL OR NOT isfinite(p_now) THEN RETURN false; END IF;
  IF p_src IS NULL OR (p_src->>'status') IS DISTINCT FROM 'active' THEN RETURN false; END IF;
  IF p_rec IS NULL OR (p_rec->>'status') IS DISTINCT FROM 'accepted' OR coalesce(p_rec->>'value','')='' THEN RETURN false; END IF;
  s_obs := p_src->>'observedAt'; r_upd := p_rec->>'updatedAt'; r_rev := p_rec->>'reviewedAt'; r_val := p_rec->>'validUntil';
  -- SHAPE gate first: a NULL or non-matching string never reaches a cast (control flow, not OR short-circuit,
  -- which Postgres does not guarantee). But the regex fixes only the syntactic FRAME — a syntactically-ISO yet
  -- IMPOSSIBLE instant (a 2026-99-99 calendar overflow, a +99:99 zone displacement) still matches and then RAISES
  -- at ::timestamptz. So the actual casts run inside a CONTROLLED sub-block that catches ONLY the datetime cast
  -- errors and fails closed, letting a poisoned historical record leave `material` empty instead of aborting the
  -- reviewer read (finding 4060770032). Unrelated errors are NOT swallowed — they propagate.
  IF s_obs IS NULL OR s_obs !~ ts THEN RETURN false; END IF;
  IF r_upd IS NULL OR r_upd !~ ts THEN RETURN false; END IF;
  IF r_rev IS NULL OR r_rev !~ ts THEN RETURN false; END IF;
  IF r_val IS NOT NULL AND r_val !~ ts THEN RETURN false; END IF;
  BEGIN
    t_obs := s_obs::timestamptz; t_upd := r_upd::timestamptz; t_rev := r_rev::timestamptz;
    IF r_val IS NOT NULL THEN t_val := r_val::timestamptz; END IF;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_time_zone_displacement_value THEN
    RETURN false;
  END;
  -- All comparisons are now on already-parsed, finite timestamptz values (no further casts).
  IF t_obs > p_now THEN RETURN false; END IF;
  IF t_upd > p_now THEN RETURN false; END IF;
  IF t_rev > p_now OR t_rev < t_upd THEN RETURN false; END IF;
  IF t_val IS NOT NULL AND t_val <= p_now THEN RETURN false; END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.citation_knowledge_selectable(jsonb,jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

-- Whether a finding's cited evidence is sufficient for a COMPLETED independent inspection. EVERY cited
-- evidence item must be genuinely readable for THIS finding (not merely present):
--   answer -> the answer row resolves AND its rawAnswer is a SUBSTANTIVE string (non-empty after trimming)
--             within the 50000-char contract (so the whole answer is accessible in the reviewer read, never a
--             silently-truncated snippet, and a FAILED/empty capture — '', whitespace, missing, null, or a
--             non-string historical value — carries nothing to inspect and is NOT counted complete);
--   source -> the source row resolves, is `status='active'`, AND the finding recorded an ASSESSED support entry
--             whose `selectedRecord` pin RESOLVES to a live record of THIS exact source at its CURRENT revision
--             (finding 4059944844): pin.sourceId = the cited source, pin.recordId is a live project_knowledge_record
--             of that source with a non-empty value, and both pin.sourceRevision and that record's sourceRevision
--             equal the source's current revision. The reviewer independently inspects that ONE selected record's
--             live material; the owner's recorded `support[].sourcePassage` is provenance ONLY. An unpinned passage,
--             a stale/missing/foreign pin, or a source whose selected record was changed/removed/revision-advanced
--             past is NOT independent evidence and fails CLOSED — a source-only finding with no resolving pin is
--             uninspectable, and the source's other (unselected) records are never authorised to the reviewer;
--   native -> NEVER inspectable (opaque staged bytes; the parser is P5), so ANY native evidence — including
--             a mixed native+answer finding — makes the inspection incomplete.
-- Plus every assessed-accuracy fact pin must still resolve to its exact fact row. When this is false, an
-- 'approved' receipt is only an opinion (never a completed verification and never promotes an improvement).
-- Internal-only.
CREATE FUNCTION public.citation_finding_inspectable(p_user uuid,p_project text,p_record jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE e jsonb; ref uuid; ra text; ratype text; ssrc jsonb; srev integer;
BEGIN
  IF jsonb_typeof(p_record->'evidence')<>'array' OR jsonb_array_length(p_record->'evidence')=0 THEN RETURN false; END IF;
  FOR e IN SELECT jsonb_array_elements(p_record->'evidence') LOOP
    IF (e->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RETURN false; END IF;
    ref := (e->>'id')::uuid;
    IF e->>'kind'='answer' THEN
      SELECT document->'input'->>'rawAnswer', jsonb_typeof(document->'input'->'rawAnswer') INTO ra,ratype
        FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project AND id=ref;
      -- SUBSTANTIVE answer content is REQUIRED for a completed inspection. A FAILED/empty capture (rawAnswer ''
      -- or whitespace-only), a MISSING key, an explicit JSON null, or a NON-STRING historical value carries
      -- nothing to independently inspect — so it is NOT counted complete (previously ra IS NULL only caught the
      -- missing/null case, and '' passed the <=50000 test, letting an empty failed capture read as fully
      -- inspected). The finding stays available with a truthful non-inspectable status; nothing is fabricated or
      -- dropped. A substantive but partial capture is still inspectable. The upper 50000 bound (the reviewer
      -- read's full-content contract) is unchanged and kept ALIGNED with the per-item reviewer gate.
      IF ratype IS DISTINCT FROM 'string' OR ra IS NULL OR btrim(ra, E' \t\n\r\f\v')='' OR char_length(ra) > 50000 THEN RETURN false; END IF;
    ELSIF e->>'kind'='source' THEN
      SELECT payload,revision INTO ssrc,srev FROM public.project_knowledge_sources
        WHERE user_id=p_user AND project_id=p_project AND id=ref;
      IF ssrc IS NULL OR (ssrc->>'status') IS DISTINCT FROM 'active' THEN RETURN false; END IF;
      -- SELECTED-EVIDENCE binding (finding 4059944844): the cited source is inspectable only if the finding recorded
      -- an ASSESSED support entry whose selectedRecord pin RESOLVES to a live record of THIS exact source at its
      -- CURRENT source revision AND the record's EXACT version (project_knowledge_records.revision — the released
      -- save_project_knowledge mutates a record in place under the same sourceRevision and bumps r.revision, so the
      -- record-version pin is required or an old finding silently resolves to changed content) AND the record is
      -- currently VALID evidence — status='accepted', reviewed, unexpired, not future-dated (citation_knowledge_selectable,
      -- finding 4060770032), so proposed/disputed/expired/rejected or future/unreviewed material never completes review.
      -- The owner's recorded sourcePassage is provenance only — arbitrary text, an unpinned entry, or a
      -- stale/missing/foreign/partial pin is NOT independent evidence and fails CLOSED. Semantic uuid comparison
      -- (lower(text)=uuid::text, never casting client text); tenant/project/source scoped. The jsonb_array_elements
      -- argument is CASE-normalised so a scalar/object/null support never raises.
      IF NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(p_record->'support')='array' THEN p_record->'support' ELSE '[]'::jsonb END) s
          JOIN public.project_knowledge_records r
            ON r.user_id=p_user AND r.project_id=p_project AND r.source_id=ref
           AND lower(s->'selectedRecord'->>'sourceId')=ref::text
           AND lower(s->'selectedRecord'->>'recordId')=r.id::text
           AND (s->'selectedRecord'->>'sourceRevision')=srev::text
           AND (r.payload->>'sourceRevision')=srev::text
           AND (s->'selectedRecord'->>'recordRevision')=r.revision::text
           AND public.citation_knowledge_selectable(ssrc,r.payload,now())
        WHERE s->>'status' <> 'not_checked') THEN
        RETURN false;
      END IF;
    ELSE
      RETURN false; -- native (opaque) or unknown kind: never a completed independent inspection
    END IF;
  END LOOP;
  -- COMPLETENESS across EVERY assessed support entry (finding 4059944844): the per-source check above only proves a
  -- source has AT LEAST ONE resolving pin. A completed inspection additionally requires that NO assessed support
  -- entry is left unresolved — a sibling entry that is unpinned, partial (no recordRevision), stale (wrong source or
  -- record revision), points at a removed record, or is foreign/cross-project must NOT be certified just because it
  -- shares a source with a resolving entry. Recorded-only owner prose stays visible on the read but never certifies
  -- completeness here. Each assessed entry must resolve to an ACTIVE source's live record at the exact
  -- source+record revision with a non-empty value (semantic uuid; tenant/project/source scoped) AND that source must
  -- actually be CITED as kind='source' evidence on THIS finding — the reviewer read only serves cited-evidence
  -- material, so a pin to an uncited source (even a live one, e.g. on an answer-only finding) would certify a claim
  -- whose material the reviewer never sees; it fails CLOSED and never widens the reviewer surface to extra sources.
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_record->'support')='array' THEN p_record->'support' ELSE '[]'::jsonb END) s
    WHERE s->>'status' <> 'not_checked'
      AND NOT EXISTS(
        SELECT 1 FROM public.project_knowledge_sources src
          JOIN public.project_knowledge_records r
            ON r.user_id=src.user_id AND r.project_id=src.project_id AND r.source_id=src.id
          WHERE src.user_id=p_user AND src.project_id=p_project
            AND lower(s->'selectedRecord'->>'sourceId')=src.id::text
            AND EXISTS(SELECT 1 FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(p_record->'evidence')='array' THEN p_record->'evidence' ELSE '[]'::jsonb END) ev
                WHERE ev->>'kind'='source' AND lower(ev->>'id')=src.id::text)
            AND lower(s->'selectedRecord'->>'recordId')=r.id::text
            AND (s->'selectedRecord'->>'sourceRevision')=src.revision::text
            AND (r.payload->>'sourceRevision')=src.revision::text
            AND (s->'selectedRecord'->>'recordRevision')=r.revision::text
            AND public.citation_knowledge_selectable(src.payload,r.payload,now()))
  ) THEN RETURN false; END IF;
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

-- Content-free LOGICAL-finding dissent tombstone (finding 4059365611). Records that a finding VERSION carrying
-- a standing independent dissent was DELETED, so deleting a dissented head can never let an older accepted
-- version resurface as the head and silently regain owner_attested — the owner cannot erase another reviewer's
-- dissent through a version/head delete. Keyed by the LOGICAL finding_id (ids + a timestamp only — no prose, no
-- decision text). RLS-on, REVOKEd from every role, workspace_entities FK ON DELETE CASCADE so it is cleaned up
-- on project/account deletion (never orphaning the FK). Tenant- and project-scoped; monotonic per distinct
-- dissented-then-deleted finding, bounded only by project lifecycle (mirrors the erasure markers).
CREATE TABLE public.ai_citation_finding_dissent_tombstones (
  user_id uuid NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  project_id text NOT NULL,
  finding_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,finding_id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.ai_citation_finding_dissent_tombstones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_finding_dissent_tombstones FROM PUBLIC,anon,authenticated,service_role;

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
DECLARE dec text; erased timestamptz; fid uuid; approved_complete integer; approved_opinion integer; dissent integer;
BEGIN
  SELECT decision,evidence_erased_at,finding_id INTO dec,erased,fid FROM public.ai_citation_findings WHERE user_id=p_user AND project_id=p_project AND id=p_row;
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
  -- A standing dissent whose receipt was destroyed by a version/head DELETE survives as a content-free
  -- LOGICAL-finding tombstone (finding 4059365611): the owner cannot erase an independent dissent by deleting
  -- the dissented version and letting an older accepted head resurface. It is treated as a CURRENT dissent, so
  -- every dependent (the improvement gate reads this status on the current head) stays capped below
  -- owner_attested and a recreated head cannot silently resurrect authority.
  IF dissent>0 OR EXISTS(SELECT 1 FROM public.ai_citation_finding_dissent_tombstones
       WHERE user_id=p_user AND project_id=p_project AND finding_id=fid) THEN RETURN 'independent_dissent'; END IF;
  IF erased IS NOT NULL THEN RETURN 'owner_only'; END IF;
  IF approved_complete>0 THEN RETURN 'independent_reviewed'; END IF;
  IF dec='needs_second_review' THEN RETURN 'second_review_pending'; END IF;
  IF approved_opinion>0 THEN RETURN 'independent_opinion'; END IF;
  RETURN 'owner_only';
END; $$;
REVOKE ALL ON FUNCTION public.citation_finding_review_status(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Whether a finding's REVIEWED material is currently hidden from an independent reviewer — its copied passages
-- were ERASED by a forget (evidence_erased_at set), OR a cited source is REVOKED/MISSING (so those passages are
-- withheld at the reviewer response). When true, the finding's record_sha256 is a digest of content the reviewer
-- can NO LONGER see; with the rest of the record visible to them, a SHORT forgotten/withheld value (a price,
-- opening hours) is offline brute-forceable against that digest. So every REVIEWER-facing surface (the for-review
-- detail and the reviewer's receipt list, standalone AND embedded) masks the digest to NULL, while the real
-- digest is RETAINED server-side (ai_citation_findings.record_sha256 + each receipt row) for audit and is never
-- destroyed. OWNER surfaces are unaffected (owner retention vs reviewer access). This mirrors
-- read_ai_citation_finding_for_review's own erased/withheld decision (same rule: erased, or any cited source not
-- 'active' — INCLUDING a malformed/missing/null source id that resolves to no active row, finding 4061393769) so
-- the detail read, the receipt list AND the review-save digest gate all agree. Internal-only.
CREATE FUNCTION public.citation_finding_review_digest_masked(p_user uuid,p_project text,p_row uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE frec jsonb; er timestamptz; e jsonb; st text;
BEGIN
  SELECT record,evidence_erased_at INTO frec,er FROM public.ai_citation_findings
    WHERE user_id=p_user AND project_id=p_project AND id=p_row;
  IF frec IS NULL THEN RETURN false; END IF;
  IF er IS NOT NULL THEN RETURN true; END IF;
  IF jsonb_typeof(frec->'evidence')='array' THEN
    FOR e IN SELECT jsonb_array_elements(frec->'evidence') LOOP
      IF e->>'kind'='source' THEN
        -- A MALFORMED / missing / null source id (the public evidence schema allows any non-empty text id) resolves
        -- to NO active row — EXACTLY as read_ai_citation_finding_for_review treats it (ref:=NULL -> src NULL ->
        -- passages withheld) — so it MASKS here too (finding 4061393769). Previously the uuid guard was ANDed into
        -- the same IF, so a non-uuid source was SILENTLY SKIPPED and left the finding un-masked: the reviewer read
        -- withheld its prose/hash while the review-save's digest gate said "not masked", so a WRONG expected hash
        -- returned `citation_review_stale` and the CORRECT (withheld) hash succeeded — an offline guessing oracle
        -- for the hidden digest. Guard the uuid shape as a SEPARATE statement, then cast (no reliance on OR
        -- short-circuit; a non-uuid never reaches the cast), so a historical bad/empty/null id fails CLOSED to
        -- masked without a cast crash.
        IF (e->>'id') IS NULL OR (e->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
          RETURN true;
        END IF;
        SELECT payload->>'status' INTO st FROM public.project_knowledge_sources
          WHERE user_id=p_user AND project_id=p_project AND id=(e->>'id')::uuid;
        IF st IS DISTINCT FROM 'active' THEN RETURN true; END IF;
      END IF;
      IF e->>'kind'='native' THEN
        -- A cited native artifact that is MISSING (deleted — the released remove_ai_native_report_artifact just
        -- DELETEs the opaque row) or has a malformed/null id resolves to no artifact, so the finding's prose /
        -- receipt notes describing that report can no longer be verified and MUST mask, EXACTLY as
        -- read_ai_citation_finding_for_review treats it (native_missing) — finding 4061786099. (A present native is
        -- available but never inspectable; it does NOT mask.) Guard the uuid shape SEPARATELY, then check
        -- existence (a non-uuid/null id never reaches the cast; fails CLOSED to masked without a cast crash).
        IF (e->>'id') IS NULL OR (e->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
          RETURN true;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM public.ai_native_report_artifacts
             WHERE user_id=p_user AND project_id=p_project AND id=(e->>'id')::uuid) THEN RETURN true; END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END; $$;
REVOKE ALL ON FUNCTION public.citation_finding_review_digest_masked(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

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
-- at improvement save to PIN the exact finding version rows the improvement is recorded against. It returns
-- the NEWEST head regardless of decision (it is also the chain-head resolver for current-truth reads); the
-- improvement save additionally REFUSES a 'dismissed' current head and never falls back to an older accepted
-- version, so an owner-dismissed finding cannot be bound (a provisional needs_second_review head stays bindable
-- but is capped at connector_receipt by the review-incomplete gate until independently approved).
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
--   'unverified'        no binding; an unresolved pinned finding/source; a bound finding whose chain's CURRENT
--                       head is owner-DISMISSED (now, or a historic row wrongly bound to a dismissed head);
--                       the bound publication is gone; or the pinned version is not the CURRENTLY approved
--                       version for the asset. (A provisional needs_second_review head is NOT unverified here;
--                       it is capped at connector_receipt by the review-incomplete gate until approved.)
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
  head_dec text; head_row uuid;
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
    -- CURRENT DECISION truth of the bound finding's chain. The improvement PINS this exact version row
    -- (immutable, auditable — never rewritten here), but its CURRENT verification status must honor the owner's
    -- CURRENT decision on the finding. Resolve the chain's current (unsuperseded) head — mirroring
    -- citation_finding_head_id's ordering — and return 'unverified' if the owner has DISMISSED it, INCLUDING via
    -- a NEW dismissed head that supersedes this pinned accepted row (the owner's rejection is not bypassed
    -- through the old accepted pinned row), and likewise for a historic row that was wrongly bound to a
    -- dismissed head before the save-time guard. A 'needs_second_review' head is NOT downgraded here — it is a
    -- provisional (not rejected) finding, capped at connector_receipt by the review-incomplete gate below until
    -- an independent approval, matching the shipped deliver-then-attest flow. Immutable-historic pin vs
    -- current-truth status are thus explicit and distinct: the stored binding stays inspectable, only the LIVE
    -- status collapses on a dismissed basis.
    SELECT h.id,h.decision INTO head_row,head_dec
      FROM public.ai_citation_findings a
      JOIN public.ai_citation_findings h
        ON h.user_id=a.user_id AND h.project_id=a.project_id AND h.finding_id=a.finding_id
       AND h.panel_id=a.panel_id AND h.panel_version=a.panel_version
       AND h.client_name=a.client_name AND h.client_market=a.client_market
      WHERE a.id=p_bound[i] AND a.user_id=p_user AND a.project_id=p_project
        AND NOT EXISTS(SELECT 1 FROM public.ai_citation_findings s
          WHERE s.user_id=a.user_id AND s.project_id=a.project_id AND s.supersedes_id=h.id)
      ORDER BY h.version DESC,h.created_at DESC,h.id DESC LIMIT 1;
    IF head_dec = 'dismissed' THEN RETURN 'unverified'; END IF;
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
    -- never fabricated into a fully-attested improvement). It still keeps the finding available. This is
    -- evaluated on the CURRENT HEAD row (head_row), NOT the pinned old row: if the owner turns an accepted,
    -- independently-reviewed f1 into a needs_second_review f2, the new head carries NO receipts (they are keyed
    -- to f1's finding_row_id), so the head reads 'second_review_pending' and the improvement drops from
    -- owner_attested — the stale f1 approval can never approve the new head. SpecCI-3 (accepted AND reviewed):
    -- the dismissed gate above already enforces the accepted half on the head; this enforces the reviewed half.
    IF public.citation_finding_review_status(p_user,p_project,head_row) IN ('second_review_pending','independent_dissent') THEN
      review_incomplete := true;
    END IF;
    -- ...AND an independent DISSENT is STICKY to the whole logical finding, not just whichever version is the
    -- current head (finding 4060794798). The head check above only reads receipts ON the head row: it catches
    -- the owner turning an accepted, reviewed f1 into a needs_second_review f2 (the receipt-less new head reads
    -- second_review_pending), and — via the review-status tombstone — a DELETED dissented head. It does NOT catch
    -- a standing rejection on a version the owner SUPERSEDES with an ORDINARY accepted successor WITHOUT deleting
    -- it: the successor carries no receipts and no second-review decision, so the head reads owner_only and the
    -- improvement (whether still pinned to the dissented row, or freshly rebound to the successor) would silently
    -- regain owner_attested while the reviewer's live rejection still stands — the delete tombstone never fires
    -- because nothing was deleted, and the dissented row survives. So look for an active (non-owner, un-withdrawn)
    -- rejected/needs_changes receipt on ANY surviving version of this bound finding's logical chain and cap at
    -- connector_receipt. This mirrors the delete-tombstone philosophy exactly — the owner cannot erase another
    -- reviewer's dissent indirectly, here through supersession instead of deletion. It releases the moment the
    -- ACTUAL reviewer WITHDRAWS (a withdrawn receipt no longer counts, so legitimate correction/withdrawal is
    -- never permanently blocked). Unlike a needs_second_review DECISION (the owner's own request, which stays
    -- head-governed above so the owner may legitimately re-decide it), a dissent is an independent objection and
    -- only its author can clear it. A genuinely independently-reviewed proper current basis (no live dissent
    -- anywhere) is unaffected and progresses per spec.
    IF EXISTS(
      SELECT 1 FROM public.ai_citation_findings a
        JOIN public.ai_citation_findings sib
          ON sib.user_id=a.user_id AND sib.project_id=a.project_id AND sib.finding_id=a.finding_id
         AND sib.panel_id=a.panel_id AND sib.panel_version=a.panel_version
         AND sib.client_name=a.client_name AND sib.client_market=a.client_market
        JOIN public.ai_citation_finding_reviews rv
          ON rv.user_id=sib.user_id AND rv.project_id=sib.project_id AND rv.finding_row_id=sib.id
      WHERE a.id=p_bound[i] AND a.user_id=p_user AND a.project_id=p_project
        AND rv.decision IN ('rejected','needs_changes') AND rv.reviewer_id<>p_user AND NOT rv.withdrawn) THEN
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
  -- earlier inspection, which then no longer attests the current approved state. A raw approved=true row is NOT
  -- current authority on its own: a DELEGATE (team) approval stays approved after the reviewer's live membership
  -- expired, their account was banned/deleted, or the membership/role-policy revision changed, and there is no
  -- invalidation trigger for read-time expiry/ban. So reuse the CANONICAL read_publication_approval
  -- (delegate-aware) as the current predicate. The appr_at NULL guard runs FIRST (separate statement, not an OR)
  -- so read_publication_approval — which raises if the asset no longer exists — is only reached once an approved
  -- row, hence the asset, is known to exist; a downgraded delegate approval then collapses the LIVE status to
  -- unverified while the immutable pinned binding above stays untouched. updated_at is still read for the
  -- re-approval-post-dates-inspection check below.
  SELECT updated_at INTO appr_at FROM public.publication_approvals
    WHERE user_id=p_user AND project_id=p_project AND asset_id=b_asset
      AND algorithm='milo-publication-v1' AND version_hash=b_vhash AND approved;
  IF appr_at IS NULL THEN RETURN 'unverified'; END IF;
  IF NOT public.read_publication_approval(p_user,p_project,b_asset,b_vhash) THEN RETURN 'unverified'; END IF;
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
  -- refused; two-person review needs a trusted reviewer-resolution boundary that P3 does not yet have. The
  -- reviewer id is a UUID string the client accepts in EITHER case, so compare SEMANTICALLY via a case-fold on
  -- text (NO uuid cast on the arbitrary scanned value — a malformed/non-uuid embedded reviewer is simply not the
  -- owner and stays refused, fail-closed).
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(jsonb_path_query_array(p_record,'$.**.reviewer')) r
            WHERE lower(r) IS DISTINCT FROM lower(p_user::text)) THEN
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
  -- anchor). This redacts the copied passage but does NOT block the finding — unrelated input is unaffected. The
  -- erased stamp (below) applies to the marker match itself, so a fresh/altered version citing the source with only
  -- free prose and NO copied passage is still marked erased (finding 4059905627); the passage transform above is
  -- merely skipped when support is empty/absent, never a precondition for the stamp.
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
  -- Anti-resurrection (P2 retention; finding 4058893312): a new/altered version citing an ANSWER whose evidence
  -- was FORGOTTEN must not re-store the copied answer-derived fields. If any cited answer carries an answer-level
  -- erasure marker, redact recommendation.passage / support[].claimSpan / accuracy[].claimSpan (via the shared
  -- redactor) before the INSERT and mark the row erased. Independent of the source guard above — a finding may
  -- cite both a forgotten source and a forgotten answer, and both redactions apply. record_sha256 stays the
  -- submitted-content pre-erasure digest; the finding is NOT blocked (unrelated input is unaffected).
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_record->'evidence')='array' THEN p_record->'evidence' ELSE '[]'::jsonb END) e
      JOIN public.ai_citation_answer_erasures x
        ON x.user_id=p_user AND x.project_id=p_project AND x.answer_id::text=lower(e->>'id')
      WHERE e->>'kind'='answer') THEN
    p_record := public.citation_redact_answer_fields(p_record);
    erased := true;
  END IF;
  -- Native anti-resurrection (finding 4061786099): a new/altered version citing a DELETED native artifact must not
  -- become a fresh un-erased attestation whose prose / receipt notes describing that report could re-surface. There
  -- is NO copied field in the record to scrub (native is opaque), so just mark the row evidence-erased. Matched by
  -- SEMANTIC uuid against the content-free native-erasure marker (a delete-then-recreate gets a new row id and is
  -- unaffected). Independent of the source/answer/fact guards.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_record->'evidence')='array' THEN p_record->'evidence' ELSE '[]'::jsonb END) e
      JOIN public.ai_citation_native_erasures x
        ON x.user_id=p_user AND x.project_id=p_project AND x.native_id::text=lower(e->>'id')
      WHERE e->>'kind'='native') THEN
    erased := true;
  END IF;
  -- Anti-resurrection (findings 4059689464 + 4061340380): a new/altered version whose accuracy[] REFERENCES a
  -- DELETED fact — by exact row-pin OR (for a schema-allowed rowless assessment) by the fact's LOGICAL id +
  -- version — must not become a fresh un-erased attestation whose free prose / receipt notes could re-expose the
  -- deleted fact value. There is NO fact-value copy in the record to scrub (accuracy[].claimSpan is answer-derived
  -- and must not be touched by a fact delete), so mark the row evidence-erased: its free prose is then withheld
  -- from reviewers and new reviews are blocked. Matching reuses citation_fact_ref_matches against the content-free
  -- erasure markers (which retain the deleted fact's logical id + version), so a delete-then-recreate (a NEW row
  -- id AND a new logical id) or a finding referencing a SURVIVING version is unaffected. Independent of the
  -- source/answer guards above.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_record->'accuracy')='array' THEN p_record->'accuracy' ELSE '[]'::jsonb END) a
      JOIN public.ai_citation_fact_erasures x
        ON x.user_id=p_user AND x.project_id=p_project
       AND public.citation_fact_ref_matches(a,x.fact_row_id,x.fact_id,x.version)) THEN
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
  -- Content-free DISSENT tombstone (finding 4059365611): if the row being deleted carries a NON-withdrawn
  -- independent dissent, record the LOGICAL finding_id so deleting this version (and cascading its receipts via
  -- FK) cannot let an older accepted version resurface as head and silently regain owner_attested — the owner
  -- cannot erase another reviewer's standing dissent through a version/head delete (citation_finding_review_status
  -- reads this tombstone on the surviving head). A legitimately WITHDRAWN dissent (withdrawn=true) leaves nothing
  -- to tombstone, and deleting a NON-dissented row records nothing, so regular correction/withdrawal stay sound.
  -- Runs BEFORE the delete (row + receipts still present); the project row exists (locked above), so the FK holds.
  INSERT INTO public.ai_citation_finding_dissent_tombstones(user_id,project_id,finding_id)
    SELECT f.user_id,f.project_id,f.finding_id FROM public.ai_citation_findings f
    WHERE f.user_id=p_user AND f.project_id=p_project AND f.id=p_id
      AND EXISTS(SELECT 1 FROM public.ai_citation_finding_reviews r
        WHERE r.user_id=p_user AND r.project_id=p_project AND r.finding_row_id=p_id
          AND r.reviewer_id<>p_user AND NOT r.withdrawn AND r.decision IN ('rejected','needs_changes'))
    ON CONFLICT(user_id,project_id,finding_id) DO NOTHING;
  DELETE FROM public.ai_citation_findings WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  RETURN true;
END; $$;

CREATE FUNCTION public.save_ai_citation_improvement(p_user uuid,p_project text,p_record jsonb,p_scope jsonb,p_binding jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE digest text; existing uuid; head uuid; new_id uuid; next_version integer;
  iid uuid; v jsonb; fid text; cid text; row_id uuid; bound uuid[] := '{}';
  panel uuid; pver integer; cname text; cmarket text;
  pub public.publication_evidence%ROWTYPE; b_asset text; b_vhash text; b_live text; insp jsonb;
  appr_at timestamptz; appr_delegate uuid; obs timestamptz;
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
    -- The CURRENT head must NOT be owner-DISMISSED to be bound. citation_finding_head_id returns the NEWEST
    -- unsuperseded head; if the owner's current decision on it is 'dismissed' (the finding was REJECTED, not a
    -- real gap) the reference is refused rather than bound — and we deliberately do NOT fall back to an older
    -- accepted version of the same chain (binding a superseded accepted row would ignore the owner's current
    -- dismissal, letting a dismissed finding become a verified improvement). A genuine ACCEPTED correction
    -- resave (a NEW accepted head) still resolves here to that exact new head, so idempotent rebinding to the
    -- current correction is preserved. A 'needs_second_review' head is a PROVISIONAL (not rejected) finding and
    -- stays bindable: the existing review-incomplete gate in citation_improvement_status caps such a binding at
    -- connector_receipt — never owner_attested — until an independent approval lifts it, so the owner's
    -- not-yet-confirmed state is honored without refusing an honest delivery record.
    IF (SELECT decision FROM public.ai_citation_findings
          WHERE user_id=p_user AND project_id=p_project AND id=row_id) = 'dismissed' THEN
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
    -- The bound approval AND its real approver. A raw approved=true row is NOT current authority on its own: a
    -- DELEGATE (team) approval keeps approved=true after the reviewer's live membership expired, their account
    -- was banned/deleted, or the membership/role-policy revision changed, with no invalidation trigger for
    -- read-time expiry/ban. delegate_actor_id is the ACTUAL approver when the approval was delegated (NULL for a
    -- direct owner approval), captured here for the approvedBy reconciliation below.
    SELECT updated_at,delegate_actor_id INTO appr_at,appr_delegate FROM public.publication_approvals
      WHERE user_id=p_user AND project_id=p_project AND asset_id=b_asset
        AND algorithm='milo-publication-v1' AND version_hash=b_vhash AND approved;
    IF appr_at IS NULL THEN
      RAISE EXCEPTION 'citation_improvement_binding_unapproved' USING ERRCODE='22023';
    END IF;
    -- Reuse the CANONICAL read_publication_approval (delegate-aware) as the current predicate so a delegate
    -- approval whose reviewer lost live/unexpired membership, was banned/deleted, or whose membership/role-policy
    -- revision changed is refused HERE rather than binding a stale approval. Separate statement (not an OR after
    -- the NULL guard) so its asset-exists precondition is only reached once an approved row — hence the asset —
    -- is known to exist.
    IF NOT public.read_publication_approval(p_user,p_project,b_asset,b_vhash) THEN
      RAISE EXCEPTION 'citation_improvement_binding_unapproved' USING ERRCODE='22023';
    END IF;
    -- The record's DECLARED approval facts may not contradict the actually-bound approval: the declared
    -- approvedVersion must be the bound version_hash, and the declared approvedBy must be the ACTUAL current
    -- approver — the delegate reviewer (delegate_actor_id) when the approval is delegated, else the owner. The
    -- table DOES record a delegate approver, so approvedBy is reconciled to coalesce(delegate_actor_id, owner):
    -- a genuine delegate approval keeps its real reviewer as approvedBy (no fabricated owner attribution) and a
    -- forged approver/version alongside a real binding is refused rather than co-existing with approval_bound.
    -- approvedBy is a UUID string the client accepts in either case, so compare it SEMANTICALLY via a
    -- case-fold on text (`lower(...)` both sides) — never a uuid CAST on the arbitrary declared value, so a
    -- malformed/non-uuid approvedBy cannot raise and simply fails closed to a mismatch. version_hash is a
    -- lowercase-hex contract, compared as-is.
    IF (p_record->'change'->>'approvedVersion') IS DISTINCT FROM b_vhash
       OR lower(p_record->'change'->>'approvedBy') IS DISTINCT FROM lower(coalesce(appr_delegate,p_user)::text) THEN
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
  -- INTERVENTION/RETEST DATE INTEGRITY (P1): the stored record's change.approvedAt and verification.verifiedAt
  -- must be TRUSTED server events, not owner free-text that could BACKDATE the intervention/retest order the
  -- downstream before/after comparison (isVerifiedImprovement / comparablePairs) reads. A before/after
  -- VERIFICATION is only trustworthy when anchored to server-validated events: the bound approval
  -- (approval.updated_at = appr_at) and a structured owner inspection of the published liveUrl
  -- (ownerInspection.observedAt = obs, already validated finite + on/after publication AND approval + non-future
  -- above), AND that inspection must be POSITIVE — checkResult='shows_approved_content'. A verification with NO
  -- trusted inspection, or one anchored to a does_not_show / inconclusive inspection that CONTRADICTS the
  -- before/after claim (the destination does NOT show the approved content), is REFUSED here (fail-closed; no
  -- inspection is fabricated) — so a contradictory/negative verification never reaches storage and can never be
  -- counted by the downstream isVerifiedImprovement / comparablePairs, which read the record's verification, not
  -- the inspection result (closing that alternate path). When admitted (positive), the two instants are DERIVED
  -- into the record — and thus into the idempotency digest and every downstream comparison — at the database's
  -- supported MICROSECOND precision as canonical UTC ISO-8601 (not raw ISO-string equality). The owner's raw
  -- claimed dates are discarded, so a backdated claim collapses to the same trusted record (idempotent) and
  -- cannot reorder intervention vs retest. This does NOT turn owner_attested into independent proof: obs is still
  -- an owner observation of the destination, unchanged in meaning.
  --
  -- PROVENANCE-LABEL INTEGRITY (finding 4062782883): the ONLY trusted backing this branch admits is the owner's
  -- POSITIVE inspection of the destination (shows_approved_content, validated above). So verification.method and
  -- verification.receipt are DERIVED from that binding and the caller's raw claims are DISCARDED — the same
  -- derive-and-discard discipline as the two instants — instead of preserved. Previously method/receipt were left
  -- as owner free-text, so a caller could stamp method='index_inspection' or 'publication_receipt' (implying an
  -- INDEPENDENT search-index check or a connector/publication delivery receipt), or a receipt string that reads
  -- like independent destination proof, on top of a mere owner declaration. method is canonicalized to the actual
  -- binding type 'owner_inspection'; receipt is rebuilt as a self-labelled owner-inspection descriptor of the
  -- exact validated observedUrl (= the published liveUrl) at the derived observation instant, capped to the
  -- schema's 500 chars. An owner declaration can thus NEVER be labelled index_inspection or independent
  -- destination proof, and the stored provenance matches what was actually validated. isVerifiedImprovement /
  -- comparablePairs read verification presence + baselineCaptureIds + verifiedAt>=approvedAt (never method/
  -- receipt), so this only corrects the stored provenance meaning that owner detail/export surfaces display; the
  -- before/after count is unchanged, and a forged label collapses to the same trusted record (still idempotent).
  IF v IS NOT NULL AND jsonb_typeof(v)='object' THEN
    IF obs IS NULL OR appr_at IS NULL OR (insp->>'checkResult') IS DISTINCT FROM 'shows_approved_content' THEN
      RAISE EXCEPTION 'citation_improvement_verification_unbacked' USING ERRCODE='22023';
    END IF;
    p_record := jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(p_record,'{change,approvedAt}',
            to_jsonb(to_char(appr_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))),
          '{verification,verifiedAt}',
            to_jsonb(to_char(obs AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))),
        '{verification,method}', to_jsonb('owner_inspection'::text)),
      '{verification,receipt}',
        to_jsonb(left('owner_inspection '||(insp->>'observedUrl')||' @ '
          ||to_char(obs AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),500)));
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

-- Fact-DELETE erasure propagation (finding 4059689464). remove_ai_citation_business_fact (and a project-delete
-- cascade) DELETEs a fact ROW; an accuracy assessment that PINNED that row already resolves 'fact_missing', but
-- the finding's free-text prose (observation/hypothesis/support[].reason) and its receipt NOTES may quote or
-- paraphrase the deleted fact value and were neither withheld nor erased, and a note could persist/resurrect.
-- This content-free marker + AFTER DELETE trigger extend the coherent evidence-erasure behavior to fact deletion.
CREATE TABLE public.ai_citation_fact_erasures (
  user_id uuid NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  project_id text NOT NULL,
  fact_row_id uuid NOT NULL,
  -- Content-free LOGICAL identity of the deleted fact (its reusable fact_id + numeric version), retained so a
  -- later fresh/altered resave that references the fact by logical id + version WITHOUT a row-pin is still caught
  -- by the save-time anti-resurrection guard (finding 4061340380). These are IDENTIFIERS only — never the fact
  -- VALUE or any prose — mirroring the logical-id-only dissent tombstone.
  fact_id uuid NOT NULL,
  version integer NOT NULL,
  erased_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,fact_row_id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.ai_citation_fact_erasures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_citation_fact_erasures FROM PUBLIC,anon,authenticated,service_role;
-- Does an accuracy entry `a` REFERENCE the fact identified by (p_fact_row row-id, p_fact_id logical-id,
-- p_version)? A VALID row-pin is AUTHORITATIVE — it matches ONLY that exact deleted row and NEVER logical-falls-
-- back, so an inconsistent logical id can never erase a finding whose pin resolves to a different SURVIVING row.
-- A rowless entry is SCHEMA-ALLOWED (an assessed state requires only factId + reviewer; factRowId/factVersion may
-- be absent) and resolves 'unpinned' at read (not rebindable, not falsely resolved), but its free prose / receipt
-- notes may still quote the fact — so on a fact DELETE it must be erasable by LOGICAL id: match p_fact_id, at the
-- SAME version when a clean factVersion is present (other versions stay unaffected) and by factId ALONE when
-- factVersion is absent/malformed (CONSERVATIVE — an unversioned reference to a now-deleted fact must not leave
-- its quoted content accessible, per finding 4061340380). Pure over its inputs; every cast is control-flow-guarded
-- (a malformed pin fails closed, never raising). Internal-only.
CREATE FUNCTION public.citation_fact_ref_matches(a jsonb,p_fact_row uuid,p_fact_id uuid,p_version integer)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE u constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF a IS NULL OR jsonb_typeof(a) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF jsonb_typeof(a->'factRowId')='string' AND (a->>'factRowId') ~ u THEN
    RETURN lower(a->>'factRowId') = p_fact_row::text;
  END IF;
  IF jsonb_typeof(a->'factId') IS DISTINCT FROM 'string' OR (a->>'factId') !~ u THEN RETURN false; END IF;
  IF lower(a->>'factId') IS DISTINCT FROM p_fact_id::text THEN RETURN false; END IF;
  IF jsonb_typeof(a->'factVersion')='number' AND (a->>'factVersion') ~ '^[0-9]{1,5}$' THEN
    RETURN (a->>'factVersion')::integer = p_version;
  END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.citation_fact_ref_matches(jsonb,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
-- Marks every version of every finding of the SAME owner+project whose accuracy[] REFERENCES the DELETED fact —
-- by exact row-pin OR (for a schema-allowed rowless assessment) by the fact's LOGICAL id + version — evidence-
-- erased (finding 4061340380 extends finding 4059689464 beyond row-pins), activating the same erased machinery as
-- an answer/source forget: reviewer digest + receipt + free prose masked/withheld, new reviews blocked,
-- review/improvement current status downgraded. Receipt NOTES are erased in storage (content-free marker). NO
-- structured field is scrubbed: the fact VALUE is never copied into the record (resolved live), and
-- accuracy[].claimSpan is ANSWER-derived, so a fact delete must not touch it — the free prose that may quote the
-- fact is RESPONSE-withheld to the reviewer (honest owner retention), consistent with the current prose policy.
-- record_sha256 is left as the pre-erasure digest (masked from reviewers). The content-free marker retains the
-- deleted fact's LOGICAL id + version too, so a later rowless resurrection is caught. Project-delete safe: skip
-- when the workspace_entities project row is already gone (the FK cascade purges facts AFTER the project row;
-- inserting provenance would orphan the FK 23503). The resolution status is untouched — a rowless entry stays
-- 'unpinned' (unresolved); this only erases the evidence-derived prose/notes, never rebinds or marks it resolved.
CREATE FUNCTION public.citation_forget_redact_fact(p_user uuid,p_project text,p_fact uuid,p_fact_id uuid,p_version integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.workspace_entities
       WHERE user_id=p_user AND collection='projects' AND entity_id=p_project) THEN
    RETURN;
  END IF;
  INSERT INTO public.ai_citation_fact_erasures(user_id,project_id,fact_row_id,fact_id,version)
    VALUES(p_user,p_project,p_fact,p_fact_id,p_version) ON CONFLICT(user_id,project_id,fact_row_id) DO NOTHING;
  UPDATE public.ai_citation_findings f
    SET evidence_erased_at = coalesce(f.evidence_erased_at, clock_timestamp())
    WHERE f.user_id=p_user AND f.project_id=p_project
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(f.record->'accuracy')='array' THEN f.record->'accuracy' ELSE '[]'::jsonb END) a
          WHERE public.citation_fact_ref_matches(a,p_fact,p_fact_id,p_version));
  UPDATE public.ai_citation_finding_reviews r
    SET note='[redacted: finding evidence forgotten]'
    WHERE r.user_id=p_user AND r.project_id=p_project AND NOT r.withdrawn AND r.note IS NOT NULL
      AND EXISTS(SELECT 1 FROM public.ai_citation_findings f
        WHERE f.id=r.finding_row_id AND f.user_id=p_user AND f.project_id=p_project
          AND jsonb_typeof(f.record->'accuracy')='array'
          AND EXISTS(SELECT 1 FROM jsonb_array_elements(f.record->'accuracy') a
            WHERE public.citation_fact_ref_matches(a,p_fact,p_fact_id,p_version)));
END; $$;
REVOKE ALL ON FUNCTION public.citation_forget_redact_fact(uuid,text,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.citation_forget_fact_records() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.citation_forget_redact_fact(OLD.user_id,OLD.project_id,OLD.id,OLD.fact_id,OLD.version); RETURN OLD; END; $$;
REVOKE ALL ON FUNCTION public.citation_forget_fact_records() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER citation_forget_fact_records_trg
  AFTER DELETE ON public.ai_citation_business_facts
  FOR EACH ROW EXECUTE FUNCTION public.citation_forget_fact_records();

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
  -- the confirmer; a foreign confirmedBy is a forged provenance claim and is refused. confirmedBy is a UUID
  -- string the client accepts in EITHER case, so compare SEMANTICALLY via a case-fold on text (NO uuid cast on
  -- the arbitrary value — a malformed/non-uuid confirmedBy is not the owner and stays refused, fail-closed).
  -- confirmedAt is not trusted from the client at all — it is stamped from the authenticated action below.
  IF jsonb_typeof(p_record->'confirmedBy') IS DISTINCT FROM 'string' OR lower(p_record->>'confirmedBy') IS DISTINCT FROM lower(p_user::text) THEN
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
  -- The capture evidence must be one of THIS finding's own answer references. Compare by SEMANTIC uuid: the
  -- captureEvidenceId is stage-1 regex-validated to be a uuid, and the finding's evidence id is a free text(200)
  -- string that may be stored in a DIFFERENT case, so a raw e->>'id'=(a->>'captureEvidenceId') text match would
  -- miss a same-uuid uppercase/lowercase pair (wrongly reading capture_unresolved and blocking a complete
  -- inspection / owner_attested). lower() on both is a safe case-fold on text (NO cast on the arbitrary evidence
  -- id, so a non-uuid native/source id cannot raise); the downstream answer lookup already casts the validated
  -- captureEvidenceId to uuid (case-insensitive by type). This matches the lower()-normalised comparison the
  -- forget redactors use.
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_record->'evidence')='array' THEN p_record->'evidence' ELSE '[]'::jsonb END) e
      WHERE e->>'kind'='answer' AND lower(e->>'id')=lower(a->>'captureEvidenceId')) THEN
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
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
DECLARE auth record; f_sha text; f_id uuid; f_ver integer; f_reviewer uuid; frec jsonb; insp boolean; new_id uuid; f_erased timestamptz;
  existing public.ai_citation_finding_reviews%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_actor=p_owner OR p_finding IS NULL
     OR p_decision IS NULL OR p_decision NOT IN ('approved','rejected','needs_changes')
     OR p_expected_sha IS NULL OR p_expected_sha !~ '^[a-f0-9]{64}$'
     OR (p_note IS NOT NULL AND octet_length(p_note) NOT BETWEEN 1 AND 6000) THEN
    RAISE EXCEPTION 'citation_review_invalid' USING ERRCODE='22023';
  END IF;
  -- OPTIMISTIC membership admission BEFORE any lock: a non-reviewer / foreign / suspended-membership session is
  -- refused here (citation_review_authorized), so it never queues on an arbitrary victim owner's workspace lock.
  SELECT * INTO auth FROM public.citation_review_authorized(p_actor,p_owner,p_project);
  IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  -- ADDITIONAL finding-scoped gate (finding 4062796988): team review eligibility is necessary but NOT sufficient
  -- to submit against a finding's private evidence — the owner must have explicitly assigned THIS reviewer to
  -- THIS exact finding row. An unassigned team reviewer fails closed with the SAME citation_finding_unavailable
  -- as a missing/erased/withheld finding (below), so the save is not an oracle for whether the row exists.
  -- Optimistic (lock-free) check; re-verified authoritatively under the owner lock after the auth re-check below.
  IF NOT public.citation_review_assigned(p_owner,p_project,p_finding,p_actor) THEN
    RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
  END IF;
  -- OPTIMISTIC finding / hash / erasure / self-review validation BEFORE the victim workspace lock (the
  -- queue-a-write fix, mirroring remove_ai_citation_finding_review). Previously the owner workspace lock was
  -- taken FIRST and the finding/hash resolved AFTER, so an authenticated reviewer sending a schema-valid but
  -- RANDOM finding id or STALE hash could queue DB work behind an arbitrary owner's workspace lock — and a
  -- serverPromise.race timeout cannot cancel work already queued in the database, so the only real defence is to
  -- never enqueue it. These lock-free reads reject a bogus/foreign finding, a forgotten (erased) finding, a self
  -- second-review, and a stale hash before any lock is taken. They are re-run AUTHORITATIVELY under the lock
  -- below; nothing trusts this optimistic-only state for the mutation. The finding read fails with the finding's
  -- OWN error (not an account/workspace-unavailable) even when the victim workspace is gone — a missing-workspace
  -- tripwire proves the resolution precedes the lock.
  SELECT record_sha256,finding_id,version,reviewer_id,record,evidence_erased_at INTO f_sha,f_id,f_ver,f_reviewer,frec,f_erased
    FROM public.ai_citation_findings WHERE user_id=p_owner AND project_id=p_project AND id=p_finding;
  IF f_sha IS NULL THEN RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023'; END IF;
  -- MASKED-MATERIAL block BEFORE the hash comparison AND before idempotency (and before any lock): if the finding
  -- is erased, OR a cited source is revoked/missing so its copied passages are withheld from the reviewer, a NEW
  -- review is UNAVAILABLE (a blocked review, not an opinion). Enforcing it HERE means a guessed vs the correct
  -- expected_sha both raise the SAME error at the SAME point, so the save is not a stale-vs-success oracle for the
  -- withheld price/hours, and no receipt — new OR idempotent — ever returns the real digest for a masked finding.
  -- citation_finding_review_digest_masked subsumes the erasure check (er IS NOT NULL) and adds revoked/missing.
  IF public.citation_finding_review_digest_masked(p_owner,p_project,p_finding) THEN RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023'; END IF;
  IF f_reviewer = p_actor THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  IF f_sha <> p_expected_sha THEN RAISE EXCEPTION 'citation_review_stale' USING ERRCODE='22023'; END IF;
  -- Current-account admission (assert_project_team_account = a FOR SHARE NOWAIT probe of auth.users: fail-fast,
  -- NEVER a wait, and NOT the workspace lock) for the acting session AND the owner: a suspended/deleted/banned
  -- session is refused before reaching the workspace lock.
  PERFORM public.assert_project_team_account(p_owner);
  PERFORM public.assert_project_team_account(p_actor);
  -- Assess IDENTICAL-receipt idempotency BEFORE the lock where safe: an identical decision+note on the SAME
  -- content (matching the current record_sha256) is a pure no-op, so return the existing receipt WITHOUT ever
  -- taking the victim workspace lock (the missing-workspace tripwire path). Every OTHER outcome — a first
  -- receipt, a withdrawn-receipt reactivation, a changed-decision/note conflict, or the capacity cap — is a
  -- MUTATION and falls through to the locked, authoritative section below; dissent / withdrawal / receipt-cap
  -- semantics are unchanged.
  SELECT * INTO existing FROM public.ai_citation_finding_reviews
    WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_finding AND reviewer_id=p_actor;
  IF existing.id IS NOT NULL AND NOT existing.withdrawn
     AND existing.record_sha256=p_expected_sha AND existing.decision=p_decision AND existing.note IS NOT DISTINCT FROM p_note THEN
    RETURN (SELECT jsonb_build_object('id',id,'findingRowId',finding_row_id,'findingId',finding_id,
      'findingVersion',finding_version,'recordSha256',record_sha256,'reviewerId',reviewer_id,
      'reviewerRole',reviewer_role,'decision',decision,'note',note,'inspectionComplete',inspection_complete,
      'withdrawn',withdrawn,'createdAt',created_at)
      FROM public.ai_citation_finding_reviews WHERE user_id=p_owner AND project_id=p_project AND id=existing.id);
  END IF;
  -- Serialize the MUTATION under the OWNER workspace + account locks. assert_knowledge_project(...,true) and
  -- citation_lock_account each take a BLOCKING FOR UPDATE with no timeout of their own; this RPC bounds every
  -- such wait with SET lock_timeout='1500ms' (PER LOCK ACQUISITION, not a whole-RPC deadline; an exceeded wait
  -- raises 55P03 BEFORE any mutation). Account-first lock order matches the other write RPCs, adding no new
  -- deadlock cycle.
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.citation_lock_account(p_owner);
  -- AUTHORITATIVE re-check under the lock: re-probe BOTH accounts, RE-READ membership/policy (membership writes
  -- serialize on this same owner lock), and RE-READ the finding — a version bump, an erasure, a suspension or a
  -- membership change landing after the optimistic reads is caught here, and the receipt is stamped with the
  -- authoritative role/policy/membership revisions. Nothing trusts the optimistic-only state for the write.
  PERFORM public.assert_project_team_account(p_owner);
  PERFORM public.assert_project_team_account(p_actor);
  SELECT * INTO auth FROM public.citation_review_authorized(p_actor,p_owner,p_project);
  IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  -- AUTHORITATIVE re-check of the finding-scoped assignment under the owner lock: a concurrent revoke (or the
  -- finding's deletion cascading the assignment away) that landed after the optimistic check is caught here,
  -- before the write, and fails closed with the same citation_finding_unavailable.
  IF NOT public.citation_review_assigned(p_owner,p_project,p_finding,p_actor) THEN
    RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
  END IF;
  SELECT record_sha256,finding_id,version,reviewer_id,record,evidence_erased_at INTO f_sha,f_id,f_ver,f_reviewer,frec,f_erased
    FROM public.ai_citation_findings WHERE user_id=p_owner AND project_id=p_project AND id=p_finding;
  IF f_sha IS NULL THEN RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023'; END IF;
  -- MASKED-MATERIAL block, re-checked AUTHORITATIVELY under the lock (an erasure or a source revoke landing
  -- after the optimistic read is caught here): an erased finding — whose new receipt would otherwise pin the
  -- retained PRE-erasure record_sha256 to a redacted payload — OR a revoked/missing-source finding whose copied
  -- passages are withheld is UNAVAILABLE for a new review, refused BEFORE the hash comparison and idempotency
  -- below (no oracle, no unhashed receipt return). Existing historical receipts are kept; withdrawal is separate.
  IF public.citation_finding_review_digest_masked(p_owner,p_project,p_finding) THEN RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023'; END IF;
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
DECLARE auth record; reviews jsonb; total integer; active_dissent integer; active_approved integer; v_masked boolean;
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
    -- Finding-scoped gate (finding 4062796988): a non-owner sees the receipt list — reviewer identities,
    -- decisions and (unmasked) notes/digests, which can quote the private evidence — ONLY for a finding row the
    -- owner assigned them to. An unassigned team reviewer fails closed with citation_finding_unavailable,
    -- identical to a non-existent finding, so the list is not an oracle. The owner branch skips this (always
    -- allowed for their own data).
    IF NOT public.citation_review_assigned(p_owner,p_project,p_finding,p_actor) THEN
      RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
    END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_citation_findings WHERE user_id=p_owner AND project_id=p_project AND id=p_finding) THEN
    RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
  END IF;
  -- Mask the audit digest for a REVIEWER (never the owner) when the finding's reviewed material is hidden
  -- (erased, or a cited source revoked/missing) — otherwise this receipt-list digest, combined with the
  -- redacted record from the for-review read, would be an offline brute-force oracle for the forgotten/withheld
  -- value. The OWNER (p_actor=p_owner) always sees the real digest (owner retention). The digest is retained
  -- server-side on every receipt row for audit regardless.
  v_masked := (p_actor<>p_owner AND public.citation_finding_review_digest_masked(p_owner,p_project,p_finding));
  SELECT count(*),
    count(*) FILTER (WHERE NOT withdrawn AND decision IN ('rejected','needs_changes') AND reviewer_id<>p_owner),
    count(*) FILTER (WHERE NOT withdrawn AND decision='approved' AND reviewer_id<>p_owner)
    INTO total,active_dissent,active_approved
    FROM public.ai_citation_finding_reviews WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_finding;
  -- The note is masked on the SAME reviewer condition as the digest: a note is free reviewer text that may
  -- quote the forgotten/withheld value, so a reviewer never receives it for a masked (erased/revoked-source)
  -- finding. The OWNER (v_masked false) still sees the stored note — which is already the '[redacted: finding
  -- evidence forgotten]' marker for an ERASED finding (blanked in storage by the forget redactor), and the real
  -- note for a merely REVOKED (not erased) source, matching owner retention of the copied passage.
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'reviewerId',reviewer_id,'mine',reviewer_id=p_actor,
    'owner',reviewer_id=p_owner,'reviewerRole',reviewer_role,'decision',decision,'note',CASE WHEN v_masked THEN NULL ELSE note END,
    'inspectionComplete',inspection_complete,'withdrawn',withdrawn,'withdrawnAt',withdrawn_at,
    'findingVersion',finding_version,'recordSha256',CASE WHEN v_masked THEN NULL ELSE record_sha256 END,'createdAt',created_at)
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
  ans jsonb; src jsonb; srev integer; mat jsonb; nat boolean;
  fk text; fv text; ffrom timestamptz; funtil timestamptz;
  frec_response jsonb; passages_withheld boolean := false; native_missing boolean := false; v_masked boolean;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_id IS NULL THEN RAISE EXCEPTION 'citation_review_invalid' USING ERRCODE='22023'; END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project);
  -- Current account admission for both owner and actor, then the live review authority.
  PERFORM public.assert_project_team_account(p_owner);
  PERFORM public.assert_project_team_account(p_actor);
  SELECT * INTO auth FROM public.citation_review_authorized(p_actor,p_owner,p_project);
  IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  -- Finding-scoped gate (finding 4062796988) BEFORE the finding row (and thus any private answer/source/fact
  -- evidence + hash) is read: team review eligibility is necessary but not sufficient — the owner must have
  -- explicitly assigned THIS reviewer to THIS exact finding row. Fails closed with the same
  -- citation_finding_unavailable as an absent row, so an unassigned reviewer cannot even probe existence.
  IF NOT public.citation_review_assigned(p_owner,p_project,p_id,p_actor) THEN
    RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
  END IF;
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
        -- any (contract-violating) over-cap answer explicit rather than silently "complete". `inspectable`
        -- requires SUBSTANTIVE content (a string, non-empty after trimming, within the 50000 cap) — ALIGNED with
        -- citation_finding_inspectable — so a FAILED/empty/whitespace/missing/null/non-string capture reads
        -- available:true (the failed attempt stays visible with its real, possibly-empty content) but
        -- inspectable:false, never completing an independent inspection on no material.
        ev_json := ev_json || jsonb_build_object('kind','answer','id',e->>'id','available',ans IS NOT NULL,
          'inspectable',coalesce(ans IS NOT NULL AND jsonb_typeof(ans->'input'->'rawAnswer')='string'
            AND btrim(ans->'input'->>'rawAnswer', E' \t\n\r\f\v')<>'' AND char_length(ans->'input'->>'rawAnswer')<=50000, false),
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
        -- Any cited source that is NOT active (revoked, missing, or a missing/null status key) taints the
        -- reviewer's copied-passage view (see below): support[] carries no per-passage source pin, so once one
        -- cited source is not live we cannot prove which owner-copied passage came from a still-live source, and
        -- conservatively withhold ALL of them. The test is the NULL-SAFE `IS DISTINCT FROM 'active'` (not `<>`,
        -- which is NULL — not true — for a missing/null status), so it fails CLOSED and stays IDENTICAL to
        -- citation_finding_review_digest_masked's rule; otherwise a missing-status source would leave the copied
        -- passage AND the audit digest visible here while the digest helper masked them elsewhere.
        IF src IS NULL OR (src->>'status') IS DISTINCT FROM 'active' THEN passages_withheld := true; END IF;
        -- The reviewer receives ONLY the SELECTED records (finding 4059944844): the exact project_knowledge_records
        -- that an ASSESSED support[].selectedRecord pin RESOLVES to for THIS source at its CURRENT revision — never
        -- the source's other records, and never the whole corpus (a source id alone does NOT authorise the reviewer
        -- to see every record bound to it). A record is served ONLY when it is currently VALID evidence
        -- (citation_knowledge_selectable — accepted, reviewed, unexpired, not future-dated; finding 4060770032), so a
        -- proposed/disputed/expired/rejected or future/unreviewed selected record is NOT served and the source reads
        -- not inspectable (never misrepresented as usable). Each served value/excerpt/revision is the ACTUAL stored
        -- record's, plus its own status + validUntil so the reviewer sees the record's validity, not the owner's
        -- cached sourcePassage (that stays in `record` as recorded-only provenance). An unpinned/stale/missing/foreign/
        -- invalid pin resolves nothing, so `mat` stays empty. Semantic-uuid, tenant/project/source scoped; the pin's
        -- and the record's sourceRevision must both equal the source's current revision. No raw document bytes.
        IF src IS NOT NULL AND (src->>'status')='active' THEN
          SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('recordId',r.id,'value',r.payload->>'value',
              'excerpt',r.payload->>'excerpt','locator',r.payload->>'locator','category',r.payload->>'category',
              'recordRevision',r.revision,'status',r.payload->>'status','validUntil',r.payload->>'validUntil')),'[]'::jsonb) INTO mat
            FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(frec->'support')='array' THEN frec->'support' ELSE '[]'::jsonb END) s
              JOIN public.project_knowledge_records r
                ON r.user_id=p_owner AND r.project_id=p_project AND r.source_id=ref
               AND lower(s->'selectedRecord'->>'sourceId')=ref::text
               AND lower(s->'selectedRecord'->>'recordId')=r.id::text
               AND (s->'selectedRecord'->>'sourceRevision')=srev::text
               AND (r.payload->>'sourceRevision')=srev::text
               AND (s->'selectedRecord'->>'recordRevision')=r.revision::text
               AND public.citation_knowledge_selectable(src,r.payload,now())
            WHERE s->>'status' <> 'not_checked';
        ELSE
          mat := '[]'::jsonb;
        END IF;
        ev_json := ev_json || jsonb_build_object('kind','source','id',e->>'id','available',src IS NOT NULL,
          'inspectable',src IS NOT NULL AND (src->>'status')='active' AND jsonb_array_length(mat)>=1,
          'sourceKind',src->>'kind','status',src->>'status','label',src->>'label',
          'url',src->>'url','fingerprint',src->>'fingerprint','observedAt',src->>'observedAt','sourceRevision',srev,
          'material',mat,'materialCount',jsonb_array_length(mat));
      ELSIF e->>'kind'='native' THEN
        SELECT EXISTS(SELECT 1 FROM public.ai_native_report_artifacts WHERE user_id=p_owner AND project_id=p_project AND id=ref) INTO nat;
        -- A native staged artifact is opaque unparsed bytes: present-or-not, but NEVER independently inspectable.
        -- A MISSING (deleted) or malformed-id native (ref NULL -> nat false) means the finding's prose/notes
        -- describing that report can no longer be verified, so it MASKS the digest/prose/notes below — matching
        -- citation_finding_review_digest_masked exactly (finding 4061786099). A present native does NOT mask.
        IF NOT nat THEN native_missing := true; END IF;
        ev_json := ev_json || jsonb_build_object('kind','native','id',e->>'id','available',nat,'inspectable',false);
      END IF;
    END LOOP;
  END IF;
  -- WHOLE-RECORD reviewer withholding (finding 4062101980). A MASKED finding — erased, a cited source
  -- revoked/missing (its copied passages unverifiable), or a cited native artifact missing — can carry
  -- owner-authored ANSWER- or source-derived content in MANY structured fields: observation / hypothesis,
  -- recommendation.passage / target, support[].claimSpan / citedUrl / sourcePassage / reason, accuracy[].claimSpan,
  -- and any nested/future field. Blacklisting individual prose fields is NOT sound — the answer field redactor
  -- deliberately RETAINS citedUrl and recommendation.target/conclusions for the owner, so a reviewer added AFTER an
  -- answer delete could still recover answer-derived content from a field the per-field blacklist missed. So the
  -- ENTIRE owner-authored record is WITHHELD from the reviewer whenever masked — a whole-record-unavailable
  -- contract (record := NULL). The STORED record is UNTOUCHED (owner retention: the owner's own detail read still
  -- returns it in full — the approved retention policy, no extra owner deletion), and the truthful availability
  -- flags below (evidenceErased / sourcePassagesWithheld) say WHY it is unavailable, while recordSha256 and the
  -- receipt notes/digests are likewise masked. An UNMASKED finding still returns the full record verbatim so a
  -- reviewer can inspect it; dissent, withdrawal and unrelated valid findings are unaffected (they read the
  -- top-level status + receipts, not this record).
  v_masked := (frow.evidence_erased_at IS NOT NULL OR passages_withheld OR native_missing);
  frec_response := CASE WHEN v_masked THEN NULL ELSE frec END;
  -- The dated fact behind each assessed-accuracy claim. The owner-PRIVATE fact value/metadata is served ONLY for a
  -- FULLY VALID binding — resolution='resolved' from the canonical citation_accuracy_resolve: the entry is assessed,
  -- its pinned row exists with fact_id / version / kind ALL agreeing, its dated validity COVERS the resolved
  -- capture instant, and it is the sole logical fact of its kind with no newer overlapping correction (the exact
  -- owner/project/logical-id/version/kind + dated-capture semantics the resolver enforces; semantic uuid). A
  -- NOT_CHECKED/UNCLEAR (not_assessed), unpinned, capture-unresolved, MISSING, id/version/kind-MISMATCHED (fact_
  -- missing / wrong_kind — a wrong/foreign/guessed row uuid), or DATED-UNRESOLVED (out_of_period / ambiguous /
  -- superseded_correction) entry must NOT expose an owner-private fact via a bare factRowId lookup (finding
  -- 4062040467). So reuse the resolver (the single source of truth — never an approximate independent lookup) and,
  -- when it is not 'resolved', return TRUTHFUL unavailable metadata with NO private value (never a masked fake
  -- validity). This is ORTHOGONAL to the erase/mask axis: the fact value is LIVE-resolved and is NEVER stored in
  -- the finding record or its record_sha256, so gating it here changes no digest/erasure behavior; the owner's
  -- recorded PROSE stays governed by the mask condition above (owner-recorded prose vs resolved private fact
  -- material are distinct).
  IF jsonb_typeof(frec->'accuracy')='array' THEN
    FOR e IN SELECT jsonb_array_elements(frec->'accuracy') LOOP
      IF jsonb_typeof(e->'factRowId')='string' AND (e->>'factRowId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        IF (public.citation_accuracy_resolve(p_owner,p_project,frec,e)->>'resolution') = 'resolved' THEN
          SELECT kind,value,valid_from,valid_until INTO fk,fv,ffrom,funtil FROM public.ai_citation_business_facts
            WHERE user_id=p_owner AND project_id=p_project AND id=(e->>'factRowId')::uuid;
          facts_json := facts_json || jsonb_build_object('factRowId',e->>'factRowId','available',true,
            'kind',fk,'value',fv,
            'validFrom',to_char(ffrom AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
            'validUntil',CASE WHEN funtil IS NOT NULL THEN to_char(funtil AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ELSE NULL END);
        ELSE
          facts_json := facts_json || jsonb_build_object('factRowId',e->>'factRowId','available',false,
            'kind',NULL,'value',NULL,'validFrom',NULL,'validUntil',NULL);
        END IF;
      END IF;
    END LOOP;
  END IF;
  -- DIGEST MASKING for this REVIEWER response. When the reviewed material is hidden — the finding is erased, a
  -- cited source is revoked/missing so its copied passages are withheld above, OR a cited native artifact is
  -- missing/deleted (finding 4061786099) — the record_sha256 is a digest
  -- of content the reviewer can no longer see, and with the rest of the record visible a short forgotten/withheld
  -- value would be offline brute-forceable against it. So the top-level digest AND every embedded receipt's
  -- digest are masked to NULL here (this is the reviewer surface; the erased/withheld condition equals
  -- citation_finding_review_digest_masked, computed inline from the values already resolved above). The real
  -- digests are RETAINED server-side (the finding row + each receipt row) for audit; the owner detail read is
  -- unaffected. A fully-visible finding still exposes the exact binding hash a reviewer needs to submit. (v_masked
  -- is computed once above, where it also drives the whole-record withholding.)
  SELECT count(*) INTO total FROM public.ai_citation_finding_reviews WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_id;
  -- This is the reviewer surface (owner is refused above), so mask each note on the SAME masked condition as
  -- the digest: a note may quote the forgotten/withheld value verbatim, so it is never served to the reviewer
  -- for an erased/revoked-source finding (an erased finding's stored note is already the redacted marker).
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'reviewerId',reviewer_id,'mine',reviewer_id=p_actor,
    'owner',reviewer_id=p_owner,'reviewerRole',reviewer_role,'decision',decision,'note',CASE WHEN v_masked THEN NULL ELSE note END,
    'inspectionComplete',inspection_complete,'withdrawn',withdrawn,'withdrawnAt',withdrawn_at,
    'findingVersion',finding_version,'recordSha256',CASE WHEN v_masked THEN NULL ELSE record_sha256 END,'createdAt',created_at)
    ORDER BY created_at DESC,id DESC),'[]'::jsonb)
    INTO reviews FROM (SELECT * FROM public.ai_citation_finding_reviews
      WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_id ORDER BY created_at DESC,id DESC LIMIT 100) recent;
  RETURN jsonb_build_object('id',frow.id,'findingId',frow.finding_id,'version',frow.version,'family',frow.family,
    'decision',frow.decision,'panelId',frow.panel_id,'panelVersion',frow.panel_version,
    'client',jsonb_build_object('name',frow.client_name,'market',frow.client_market),
    'recordSha256',CASE WHEN v_masked THEN NULL ELSE frow.record_sha256 END,'record',frec_response,'createdAt',frow.created_at,
    'evidenceErased',(frow.evidence_erased_at IS NOT NULL),
    'sourcePassagesWithheld',(frow.evidence_erased_at IS NULL AND passages_withheld),
    'sourceAvailable',public.citation_finding_sources_available(p_owner,p_project,frec),
    'accuracyStatus',public.citation_finding_accuracy_status(p_owner,p_project,frec),
    'reviewStatus',public.citation_finding_review_status(p_owner,p_project,frow.id),
    -- The TOP-LEVEL live inspectionComplete must agree with the mask (finding 4063490498): when the finding is
    -- masked (erased / a cited source revoked-or-missing so passages are withheld / a cited native artifact
    -- missing) the whole record is withheld (record:null, digest null) and a new review is BLOCKED, so a
    -- complete independent inspection is NOT currently possible — even though citation_finding_inspectable can
    -- still read a LIVE selected record. A record-level source forget stamps EVERY citing finding
    -- evidence_erased_at while another selected record of that source stays live, so the bare predicate would
    -- report a misleading `true` here. Gate it with NOT v_masked so the live signal is fail-closed and matches
    -- record:null + the blocked save. This is the CURRENT-availability signal only; the per-receipt historical
    -- inspection_complete (in `reviews[]`, an audit fact of what was true when written) is NOT rewritten.
    'inspectionComplete',(NOT v_masked AND public.citation_finding_inspectable(p_owner,p_project,frec)),
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
