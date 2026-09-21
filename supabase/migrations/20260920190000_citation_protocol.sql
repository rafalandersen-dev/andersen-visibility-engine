-- Citation Intelligence v1, CI-2 immutable panel/protocol storage, brand-run binding and manual
-- capture context (product/CITATION_INTELLIGENCE_SPEC.md §5, §8;
-- product/CITATION_PROTOCOL_IMPLEMENTATION_2026_09_19.md). Owner-supplied and unverified, with
-- server-derived approvals. No collectors, cron, provider calls, classification or formula
-- execution. Reuses public.ai_visibility_prompts / public.ai_answer_evidence for captures; there
-- is no second capture table. Panels and brand runs are append-only; project deletion removes
-- them through the workspace_entities foreign key, and a removed panel leaves its raw captures in
-- place but no longer resolves them (dependent claims are invalidated, not cascaded away).

CREATE TABLE public.citation_panels (
  user_id uuid NOT NULL, project_id text NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  panel_id uuid NOT NULL, version integer NOT NULL CHECK(version BETWEEN 1 AND 1000),
  document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=60000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,panel_id,version),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
CREATE TABLE public.citation_brand_runs (
  user_id uuid NOT NULL, project_id text NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  run_id uuid NOT NULL, panel_id uuid NOT NULL, panel_version integer NOT NULL,
  document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=4000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,run_id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE,
  -- A run can only bind to an actual stored panel version; the RPC additionally requires it locked.
  FOREIGN KEY(user_id,project_id,panel_id,panel_version) REFERENCES public.citation_panels(user_id,project_id,panel_id,version) ON DELETE CASCADE
);
-- Content-free slot/budget tombstone. When a manual capture (an ai_answer_evidence row carrying a
-- captureContext) is erased — directly, or via a cascading prompt/correction-chain delete — the
-- released remove_ai_answer_evidence hard-deletes it, which would reopen its scheduled slot and lower
-- a brand run's observation count. This table durably records ONLY the slot/budget identity of the
-- erased ORIGINAL (panel version, brand run, question, round) — never any answer content — so the
-- immutable "this slot was observed / this budget was consumed" fact survives erasure and the write
-- guards keep counting it. Project deletion removes it (workspace_entities cascade); the trigger below
-- does not create one during a project delete, so nothing orphans.
CREATE TABLE public.citation_capture_tombstones (
  user_id uuid NOT NULL, project_id text NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  answer_id uuid NOT NULL,
  panel_id uuid NOT NULL, panel_version integer NOT NULL,
  brand_run_id uuid, question_id text NOT NULL, round integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,answer_id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.citation_panels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citation_brand_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citation_capture_tombstones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.citation_panels,public.citation_brand_runs,public.citation_capture_tombstones FROM PUBLIC,anon,authenticated,service_role;

-- Erasure preserves the slot/budget fact. This AFTER DELETE trigger records a content-free tombstone
-- for an erased citation ORIGINAL (supersedes null). Corrections and legacy (context-less) answers
-- occupy no slot and are skipped, so legacy erasure is unchanged. When the project itself is being
-- deleted, its rows cascade away and this skips (no orphan tombstone survives project deletion).
--
-- The slot/budget identity is validated with SAFE predicates (uuid/integer-shaped text) BEFORE any
-- cast, so a malformed HISTORICAL capture context (the released generic answer path stored arbitrary
-- `input` fields, and the reader tolerates invalid historical captures) can never throw a cast error
-- and block a user's erasure — it is simply erased with no tombstone (it never validly occupied a
-- slot). Only a well-formed protocol capture is tombstoned. There is deliberately NO broad exception
-- handler, so a genuine DB failure (e.g. an insert error) still propagates rather than being swallowed.
CREATE FUNCTION public.tombstone_citation_capture()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ctx jsonb; slot jsonb;
BEGIN
  ctx := OLD.document->'input'->'captureContext';
  IF OLD.supersedes_id IS NOT NULL OR ctx IS NULL OR jsonb_typeof(ctx)<>'object' THEN RETURN OLD; END IF;
  slot := ctx->'slot';
  IF jsonb_typeof(slot)='object'
    AND ctx->>'panelId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND ctx->>'panelVersion' ~ '^[0-9]{1,9}$'
    AND (ctx->>'brandRunId' IS NULL OR ctx->>'brandRunId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    AND slot->>'questionId' IS NOT NULL AND slot->>'round' ~ '^[0-9]{1,9}$'
    AND EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=OLD.user_id AND collection='projects' AND entity_id=OLD.project_id) THEN
    INSERT INTO public.citation_capture_tombstones(user_id,project_id,answer_id,panel_id,panel_version,brand_run_id,question_id,round)
      VALUES(OLD.user_id,OLD.project_id,OLD.id,(ctx->>'panelId')::uuid,(ctx->>'panelVersion')::integer,
        (ctx->>'brandRunId')::uuid,slot->>'questionId',(slot->>'round')::integer)
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN OLD;
END; $$;
REVOKE ALL ON FUNCTION public.tombstone_citation_capture() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tombstone_citation_capture AFTER DELETE ON public.ai_answer_evidence
  FOR EACH ROW EXECUTE FUNCTION public.tombstone_citation_capture();

-- Semantic UUID identity for captured/persisted identifiers. save_citation_capture persists the client's
-- ORIGINAL captureContext JSON verbatim (immutable — the document and its hash are never rewritten), and
-- panel documents likewise keep the reviewed question `promptId` spelling, so a historical brandRunId /
-- panelId / promptId string may be UPPERCASE or mixed-case (or, for pre-guard data, malformed). Budget
-- enforcement, consumed reporting, the same-slot guard, correction identity and question-binding must
-- therefore compare by UUID VALUE, not by raw text: an id rendered as text (`::text`) is canonical
-- LOWERCASE, so an uppercase original silently escapes a text compare — evading the budget/duplicate
-- guards, breaking a legitimate correction, or unbinding a valid question. This returns the NORMALIZED
-- uuid value for any Postgres-castable uuid spelling (case- and form-insensitive) and NULL for a malformed
-- or absent one, so a read never throws on bad history and a malformed/absent identity fails closed
-- (matches nothing). Pure and content-free: it reads and rewrites no row and touches no document text.
-- (Named for its first use on captureContext run ids; it is a generic uuid-value normalizer.)
CREATE FUNCTION public.citation_ctx_run(p_text text) RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
  RETURN p_text::uuid;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.citation_ctx_run(text) FROM PUBLIC,anon,authenticated;
-- Parse a stored ISO instant to a timestamptz for SAME-INSTANT comparison at the supported (millisecond)
-- precision (round 25). Two capturedAt spellings that denote the same instant — e.g. a '+02:00' offset and
-- its 'Z' equivalent — compare equal, so a raw-text compare no longer rejects a legitimate same-observation
-- correction; an ACTUALLY different instant stays DISTINCT and is refused. It FAILS CLOSED (returns NULL) on
-- an unsupported (sub-millisecond) precision, a non-finite (±infinity) instant, or a malformed/absent value
-- — it does NOT truncate a finer instant onto the millisecond (which would silently treat two genuinely
-- different sub-millisecond instants as equal and admit a correction at a changed instant). A NULL result
-- IS DISTINCT FROM any real instant, so such a historical value fails the identity check rather than raising
-- inside the caller (scoped datetime exceptions only, mirroring citation_ctx_run — a genuine fault still
-- propagates). This matches the round-25 admission guard, which refuses sub-millisecond precision at write,
-- so historical finer/malformed values read fail-closed and no stored document is ever rewritten.
-- Content-free: reads and rewrites no row.
CREATE FUNCTION public.citation_ts_ms(p_text text) RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v timestamptz;
BEGIN
  v := p_text::timestamptz;
  IF v IS NULL OR NOT isfinite(v) OR v IS DISTINCT FROM date_trunc('milliseconds', v) THEN RETURN NULL; END IF;
  RETURN v;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.citation_ts_ms(text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.read_citation_protocol(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  -- SINGLE-SNAPSHOT canonical read: every payload component — the answer-evidence rows, panels, brand
  -- runs, erased-slot coverage, the authoritative per-run consumed budget and the coverage metadata — is
  -- produced by this ONE jsonb_build_object SELECT, so all sub-selects see the SAME statement snapshot.
  -- A capture committed between two separate reads can therefore never expose consumed budget (which
  -- counts live originals + tombstones) without its corresponding evidence row, because both are read
  -- from the same snapshot here. `answers` mirrors read_ai_answer_evidence's answer rows verbatim
  -- (document merged with id/createdAt/hash) so the released row schema parses it unchanged; that RPC is
  -- untouched and its standalone contract is preserved. Owner/project scoping is the same assertion.
  RETURN jsonb_build_object(
    'answers',coalesce((SELECT jsonb_agg(document||jsonb_build_object('id',id,'createdAt',created_at,'hash',document_hash) ORDER BY created_at DESC,id DESC) FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project),'[]'::jsonb),
    'panels',coalesce((SELECT jsonb_agg(document ORDER BY created_at DESC,panel_id,version DESC) FROM public.citation_panels WHERE user_id=p_user AND project_id=p_project),'[]'::jsonb),
    'brandRuns',coalesce((SELECT jsonb_agg(document ORDER BY created_at DESC,run_id) FROM public.citation_brand_runs WHERE user_id=p_user AND project_id=p_project),'[]'::jsonb),
    -- Content-free erased-slot facts (spec §5.2 attempts semantics + erasure): only which slot was
    -- observed, NEVER any erased answer content. `question_id` was stored verbatim from the capture
    -- context, so a HISTORICAL tombstone may carry an arbitrary/empty/overlength string; only rows whose
    -- question_id is a real GRID-shaped id (^[A-Z]{2}-[DB][0-9]{2}$, ≤6 chars, structured — not free
    -- text) are transmitted, so arbitrary deleted content can never leak here and one bad row can never
    -- break the strict read. Malformed rows are counted (`tombstoneExcluded`), not sent. Bounded by a
    -- LIMIT so an unbounded tombstone set cannot produce an unbounded payload.
    'tombstones',coalesce((SELECT jsonb_agg(t ORDER BY t->>'answerId') FROM (
        SELECT jsonb_build_object('answerId',answer_id,'panelId',panel_id,'panelVersion',panel_version,
          'brandRunId',brand_run_id,'questionId',question_id,'round',round) t
        FROM public.citation_capture_tombstones
        WHERE user_id=p_user AND project_id=p_project AND question_id ~ '^[A-Z]{2}-[DB][0-9]{2}$'
        ORDER BY created_at DESC,answer_id LIMIT 10000) s),'[]'::jsonb),
    -- AUTHORITATIVE per-approved-run consumed budget, computed here with the EXACT predicate the write
    -- gate uses (save_citation_capture): every live ORIGINAL (supersedes null) bound to the run by
    -- captureContext.brandRunId, matched by UUID VALUE via citation_ctx_run (so an UPPERCASE/mixed-case
    -- historical brandRunId still counts — a raw-text compare to the lowercase run_id would miss it — while
    -- a malformed context counts nowhere, failing closed) PLUS each tombstone row for the run (its
    -- brand_run_id column is already normalized). One snapshot, owner/project scoped, bounded to the ≤20
    -- approved runs — never reconstructed from the LIMIT-bounded or slot-collapsed coverage above.
    'runConsumed',coalesce((SELECT jsonb_agg(jsonb_build_object('runId',r.run_id,'consumed',
        (SELECT count(*) FROM public.ai_answer_evidence e
           WHERE e.user_id=p_user AND e.project_id=p_project AND e.supersedes_id IS NULL
             AND public.citation_ctx_run(e.document->'input'->'captureContext'->>'brandRunId')=r.run_id)
      + (SELECT count(*) FROM public.citation_capture_tombstones tb
           WHERE tb.user_id=p_user AND tb.project_id=p_project AND tb.brand_run_id=r.run_id)))
      FROM public.citation_brand_runs r WHERE r.user_id=p_user AND r.project_id=p_project),'[]'::jsonb),
    -- Coverage completeness metadata, per ACTUAL stored panel version that has tombstones (bounded to
    -- real panels — never unbounded random-id groups): the TRUE grid-shaped row total (so a consumer can
    -- tell whether the LIMIT-bounded `tombstones` are complete for that version, and refuse to derive a
    -- definitive neverObserved when they are not) and the content-free malformed (non-grid) row count.
    'erasureByVersion',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'panelId',pv.panel_id,'panelVersion',pv.panel_version,
        'gridRows',(SELECT count(*) FROM public.citation_capture_tombstones tb
           WHERE tb.user_id=p_user AND tb.project_id=p_project AND tb.panel_id=pv.panel_id
             AND tb.panel_version=pv.panel_version AND tb.question_id ~ '^[A-Z]{2}-[DB][0-9]{2}$'),
        -- EXACT count of ADDITIONAL grid erased attempts beyond one per slot: grid rows minus DISTINCT
        -- (question,round,run) slots. Two historical originals erased at one slot → 1 duplicate. Computed
        -- from the full tombstone set (NOT the LIMIT-bounded `tombstones` above), so a truncated transmit
        -- never hides an extra attempt; content-free (only counts). A single-attempt slot and a fully
        -- erased correction chain (one tombstone at the ORIGINAL) contribute 0, so corrections and a lone
        -- erasure never inflate it.
        'duplicateRows',(SELECT count(*)-count(DISTINCT (tb.question_id,tb.round,tb.brand_run_id)) FROM public.citation_capture_tombstones tb
           WHERE tb.user_id=p_user AND tb.project_id=p_project AND tb.panel_id=pv.panel_id
             AND tb.panel_version=pv.panel_version AND tb.question_id ~ '^[A-Z]{2}-[DB][0-9]{2}$'),
        'excludedRows',(SELECT count(*) FROM public.citation_capture_tombstones tb
           WHERE tb.user_id=p_user AND tb.project_id=p_project AND tb.panel_id=pv.panel_id
             AND tb.panel_version=pv.panel_version AND tb.question_id !~ '^[A-Z]{2}-[DB][0-9]{2}$')))
      FROM (SELECT DISTINCT tb.panel_id,tb.panel_version FROM public.citation_capture_tombstones tb
            WHERE tb.user_id=p_user AND tb.project_id=p_project
              AND EXISTS(SELECT 1 FROM public.citation_panels p WHERE p.user_id=p_user AND p.project_id=p_project
                AND p.panel_id=tb.panel_id AND p.version=tb.panel_version)) pv),'[]'::jsonb),
    -- Explicit content-free overflow: tombstone rows not attributable to any stored panel version
    -- (orphaned by a deleted panel), so nothing is silently dropped and nothing is unbounded.
    'erasureOverflow',(SELECT count(*) FROM public.citation_capture_tombstones tb
        WHERE tb.user_id=p_user AND tb.project_id=p_project
          AND NOT EXISTS(SELECT 1 FROM public.citation_panels p WHERE p.user_id=p_user AND p.project_id=p_project
            AND p.panel_id=tb.panel_id AND p.version=tb.panel_version)));
END; $$;

-- Append one immutable draft panel version. Every question must bind to an actual saved prompt
-- revision AND repeat that revision's exact text, so a question cannot reference a missing prompt
-- or drift from the reviewed prompt text (reference forgery fails closed).
CREATE FUNCTION public.save_citation_panel_draft(p_user uuid,p_project text,p_panel uuid,p_expected integer,p_document jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_version integer;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  -- Serialize the 200-version capacity guard under the account's workspace_meta row. As in
  -- save_citation_capture, assert_knowledge_project(...,true) takes that row FOR UPDATE but a project
  -- references auth.users only, so the row can be absent and the lock a silent no-op. Re-take it in ONE
  -- statement so presence and lock acquisition are inseparable (FOUND reports an actually-locked row);
  -- a missing row fails closed, re-locking a row this txn holds is harmless.
  PERFORM 1 FROM public.workspace_meta WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'citation_workspace_unavailable'; END IF;
  IF p_panel IS NULL OR p_expected IS NULL OR p_expected<0 OR p_expected>=1000 OR p_document IS NULL
    OR jsonb_typeof(p_document)<>'object' OR octet_length(p_document::text)>60000
    -- Match the document's panelId to p_panel by UUID VALUE: p_panel::text is canonical lowercase, so a
    -- valid UPPERCASE panelId (the server wrapper now accepts the same uuid spelled either way) would
    -- otherwise fail this raw-text check. citation_ctx_run normalizes any castable spelling (NULL for a
    -- malformed one, which stays DISTINCT and fails closed). The document is stored VERBATIM; only the
    -- comparison is normalized.
    OR public.citation_ctx_run(p_document->>'panelId') IS DISTINCT FROM p_panel
    OR (p_document->>'version')::integer IS DISTINCT FROM p_expected+1
    OR (p_document->>'status') IS DISTINCT FROM 'draft'
    OR p_document->'approval' IS DISTINCT FROM 'null'::jsonb
    OR jsonb_typeof(p_document->'questions')<>'array' THEN
    RAISE EXCEPTION 'invalid_citation_panel';
  END IF;
  -- v1 is consumer-only (spec §§2, 5.2): a panel whose one surface is an API surface is out of the
  -- v1 boundary. The client schema (panelDraftSchema) refuses it before the RPC; this fails closed
  -- at the DB boundary too so a direct call cannot store a non-consumer panel.
  IF p_document->'surface'->>'mode'='api' THEN RAISE EXCEPTION 'citation_panel_not_consumer'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_document->'questions') AS t(q)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.ai_visibility_prompts pr
      WHERE pr.user_id=p_user AND pr.project_id=p_project
        AND pr.id=(q->>'promptId')::uuid AND pr.revision=(q->>'promptRevision')::integer
        AND pr.data->>'prompt'=q->>'text')
  ) THEN RAISE EXCEPTION 'citation_question_unbound'; END IF;
  SELECT coalesce(max(version),0) INTO current_version FROM public.citation_panels WHERE user_id=p_user AND project_id=p_project AND panel_id=p_panel;
  IF current_version<>p_expected THEN RAISE EXCEPTION 'citation_panel_changed'; END IF;
  -- Bounded capacity with a RESERVED lock slot per PENDING DRAFT HEAD. The 200 cap covers every row
  -- (drafts plus immutable locked history). A panel whose latest version is still a draft (a "pending
  -- head") will, when locked, append exactly one more row (lock_citation_panel below), so it must hold a
  -- reserved slot NOW; otherwise an owner could fill the project to 200 rows with drafts and then be
  -- unable to lock any of them, with no deletion or retirement path (immutable history, by design). Admit
  -- this draft only if, AFTER inserting it, the row count PLUS one reserved lock slot for every pending
  -- head still fits within 200. `pending` counts pending heads BEFORE this insert (the latest version per
  -- panel whose status is 'draft'); the CASE adds this insert's OWN new pending head UNLESS the panel's
  -- current head is already a draft — a revision keeps the same single head, so repeated revisions spend
  -- real rows but never a SECOND reservation and never the slot reserved for another pending head, while a
  -- brand-new panel or a draft on a locked head opens a new pending head. Locking consumes a head's own
  -- reservation (row +1, pending -1) and preserves the rest, so it always fits. Serialized by the
  -- workspace_meta row lock taken above; the total read/write cap is unchanged at 200.
  IF (
    (SELECT count(*) FROM public.citation_panels WHERE user_id=p_user AND project_id=p_project)
    + (SELECT count(*) FROM (SELECT DISTINCT ON (panel_id) document->>'status' AS status
         FROM public.citation_panels WHERE user_id=p_user AND project_id=p_project
         ORDER BY panel_id,version DESC) h WHERE h.status='draft')
    + (CASE WHEN EXISTS (SELECT 1 FROM public.citation_panels
         WHERE user_id=p_user AND project_id=p_project AND panel_id=p_panel
           AND version=current_version AND document->>'status'='draft') THEN 0 ELSE 1 END)
  )>=200 THEN RAISE EXCEPTION 'citation_panel_capacity'; END IF;
  INSERT INTO public.citation_panels(user_id,project_id,panel_id,version,document) VALUES(p_user,p_project,p_panel,p_expected+1,p_document);
  RETURN p_document;
END; $$;

-- Lock a reviewed draft. The reviewed content is copied verbatim (freezing client market,
-- languages, surface, session controls and collection location); only the server sets status,
-- the new version and the owner approval receipt (owner id from the authenticated caller, time
-- from the database clock). A non-draft, stale or unbound draft fails closed.
CREATE FUNCTION public.lock_citation_panel(p_user uuid,p_project text,p_panel uuid,p_expected integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE draft jsonb; current_version integer; locked jsonb; v_now timestamptz; v_sched_ok boolean;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  -- Serialize the 200-version capacity guard under the account's workspace_meta row (see
  -- save_citation_capture): the helper's FOR UPDATE is a silent no-op when the row is absent. One
  -- statement makes presence and lock inseparable; a missing row fails closed.
  PERFORM 1 FROM public.workspace_meta WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'citation_workspace_unavailable'; END IF;
  IF p_panel IS NULL OR p_expected IS NULL OR p_expected<1 THEN RAISE EXCEPTION 'invalid_citation_panel'; END IF;
  SELECT coalesce(max(version),0) INTO current_version FROM public.citation_panels WHERE user_id=p_user AND project_id=p_project AND panel_id=p_panel;
  IF current_version<>p_expected THEN RAISE EXCEPTION 'citation_panel_changed'; END IF;
  SELECT document INTO draft FROM public.citation_panels WHERE user_id=p_user AND project_id=p_project AND panel_id=p_panel AND version=p_expected;
  IF draft IS NULL OR draft->>'status'<>'draft' THEN RAISE EXCEPTION 'citation_panel_not_draft'; END IF;
  -- v1 consumer-only boundary (spec §§2, 5.2): never lock an API-surface panel, even if a pre-guard
  -- draft carried one.
  IF draft->'surface'->>'mode'='api' THEN RAISE EXCEPTION 'citation_panel_not_consumer'; END IF;
  -- v1 discovery is the fixed grid: exactly 10 questions × 4 rounds = 40 planned slots (spec §5.3,
  -- CI11-T13). An incomplete draft may be saved and edited, but a discovery panel can only lock at the
  -- full grid, so an under- or over-sized pilot never locks/approves and never reads as a complete v1
  -- measurement. Brand panels are unscheduled (rounds 0) and exempt. Checked before question binding.
  -- The ten must be ten DISTINCT questions, not ten labels for one: ten unique local ids all bound to
  -- the SAME prompt, or ten prompts carrying identical COPIED text, is not a ten-question experiment.
  -- Require ten distinct prompt bindings (promptId+revision) AND ten distinct texts; either collision
  -- fails closed. (The binding guard below forces text = the bound prompt's text, so a reused prompt
  -- also collides on text, but both are checked so the intent holds even if a row is malformed.)
  IF draft->>'kind'='discovery' AND (
    jsonb_array_length(draft->'questions')<>10 OR (draft->>'rounds')::integer<>4
    OR (SELECT count(DISTINCT (q->>'promptId')||'|'||(q->>'promptRevision'))
          FROM jsonb_array_elements(draft->'questions') AS t(q))<>10
    OR (SELECT count(DISTINCT q->>'text')
          FROM jsonb_array_elements(draft->'questions') AS t(q))<>10
  ) THEN RAISE EXCEPTION 'citation_panel_grid_invalid'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(draft->'questions') AS t(q)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.ai_visibility_prompts pr
      WHERE pr.user_id=p_user AND pr.project_id=p_project
        AND pr.id=(q->>'promptId')::uuid AND pr.revision=(q->>'promptRevision')::integer
        AND pr.data->>'prompt'=q->>'text')
  ) THEN RAISE EXCEPTION 'citation_question_unbound'; END IF;
  -- v1 is ONE immutable approved discovery baseline per project (spec §§2, 5.2, §5.3): a single manual
  -- consumer surface and a single locked 10x4 discovery panel version. Locking a SECOND locked discovery
  -- version — whether a DIFFERENT discovery panel_id (a parallel experiment) or a NEW version of this same
  -- panel (a change mid-pilot) — would silently authorize a second, contradictory baseline, so it fails
  -- closed here. Editable drafts and every prior locked version remain (immutable audit history is never
  -- deleted); brand panels/runs are a separate opt-in and are exempt. Serialized by the workspace_meta row
  -- lock held above, so two concurrent discovery locks cannot both pass. An exact re-lock is already
  -- refused earlier by the version check, so this never blocks an idempotent retry.
  IF draft->>'kind'='discovery' AND EXISTS (
    SELECT 1 FROM public.citation_panels
    WHERE user_id=p_user AND project_id=p_project
      AND document->>'kind'='discovery' AND document->>'status'='locked'
  ) THEN RAISE EXCEPTION 'citation_discovery_baseline_exists'; END IF;
  -- Locking CONSUMES this pending head's reserved slot (row +1, pending head -1), so the row count plus
  -- outstanding reservations is unchanged and never grows. The draft-time reservation in
  -- save_citation_panel_draft guarantees the row count is at most 199 whenever a pending head exists, so a
  -- valid pending head always fits. This physical guard is a fail-closed backstop (e.g. against a
  -- historical over-capacity direct write); it deliberately does NOT re-reserve, which would wrongly
  -- reject the final pending head that is only consuming its own reserved slot. Cap unchanged at 200.
  IF (SELECT count(*) FROM public.citation_panels WHERE user_id=p_user AND project_id=p_project)>=200 THEN RAISE EXCEPTION 'citation_panel_capacity'; END IF;
  v_now := clock_timestamp();
  -- Owner-approved weekly run schedule (spec §§5.1 Frequency, 5.2 Time, 5.3). A DISCOVERY lock requires
  -- an Europe/Stockholm schedule with exactly one intended slot per round (rounds 1..N once each), each
  -- consecutive round exactly one Stockholm WALL-CLOCK week later at the same local time (once per week,
  -- DST-correct via AT TIME ZONE — so four same-day "rounds" can never pass), and PROSPECTIVE (every
  -- slot at or after this lock instant; the owner approves the schedule before running it, never
  -- backdated). A BRAND panel is unscheduled and must carry no schedule. The client schema enforces the
  -- same before the RPC; this is the authoritative DB guard so a direct call cannot lock an unscheduled,
  -- contradictory or same-day panel. The approval receipt below reuses v_now, so a slot exactly at the
  -- lock instant is prospective consistently across the DB guard and the client schema.
  IF draft->>'kind'='discovery' THEN
    -- Shape gate, NULL-safe (IS DISTINCT FROM): a missing timezone/slots/round-count can never slip past
    -- as a NULL comparison. The schedule must be a Stockholm object whose slot count equals the rounds.
    IF draft->'schedule' IS NULL OR jsonb_typeof(draft->'schedule') IS DISTINCT FROM 'object'
      OR draft->'schedule'->>'timezone' IS DISTINCT FROM 'Europe/Stockholm'
      OR jsonb_typeof(draft->'schedule'->'slots') IS DISTINCT FROM 'array'
      OR jsonb_array_length(draft->'schedule'->'slots') IS DISTINCT FROM (draft->>'rounds')::integer THEN
      RAISE EXCEPTION 'citation_panel_schedule_invalid';
    END IF;
    -- Every slot must be the exact sequence rounds 1..N (one each), one Stockholm WALL-CLOCK week apart at
    -- the same local time (DST-correct via AT TIME ZONE), PROSPECTIVE, and at the supported MILLISECOND
    -- precision (`ts = date_trunc('milliseconds', ts)` — a sub-millisecond microsecond is refused so the TS
    -- validator, which compares to the millisecond, and this full-precision `loc::time` comparison agree).
    -- Each per-row predicate makes a NULL field yield FALSE (not a NULL that bool_and would SKIP), so a
    -- malformed slot can never be silently ignored into a passing aggregate. An empty set (impossible here —
    -- count = rounds >= 1) would yield NULL, which `IS NOT TRUE` also rejects.
    SELECT bool_and(
        rnd IS NOT NULL AND ts IS NOT NULL AND loc IS NOT NULL
        AND ts = date_trunc('milliseconds', ts)
        AND rnd = ord
        AND (prev_loc IS NULL OR (loc::time = prev_loc::time AND loc::date = prev_loc::date + 7))
        AND ts >= v_now)
      INTO v_sched_ok
      FROM (
        SELECT (s->>'round')::integer AS rnd,
               row_number() OVER (ORDER BY (s->>'round')::integer NULLS LAST) AS ord,
               (s->>'intendedAt')::timestamptz AS ts,
               ((s->>'intendedAt')::timestamptz AT TIME ZONE 'Europe/Stockholm') AS loc,
               lag((s->>'intendedAt')::timestamptz AT TIME ZONE 'Europe/Stockholm')
                 OVER (ORDER BY (s->>'round')::integer NULLS LAST) AS prev_loc
        FROM jsonb_array_elements(draft->'schedule'->'slots') AS t(s)
      ) q;
    IF v_sched_ok IS NOT TRUE THEN RAISE EXCEPTION 'citation_panel_schedule_invalid'; END IF;
  ELSIF draft->'schedule' IS NOT NULL AND jsonb_typeof(draft->'schedule') IS DISTINCT FROM 'null' THEN
    -- A brand panel is unscheduled: a missing key or a JSON null is fine, but a real schedule object is
    -- contradictory and refused.
    RAISE EXCEPTION 'citation_panel_schedule_invalid';
  END IF;
  locked := draft || jsonb_build_object(
    'version',p_expected+1,'status','locked',
    'approval',jsonb_build_object('approvedBy',p_user::text,'approvedAt',to_char(v_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  INSERT INTO public.citation_panels(user_id,project_id,panel_id,version,document) VALUES(p_user,p_project,p_panel,p_expected+1,locked);
  RETURN locked;
END; $$;

-- Approve one brand diagnostic run bound to a locked BRAND panel version. Owner and time receipts
-- are server-minted; the budget and round caps come from the owner but are bounded here. A run
-- bound to a missing, unlocked or non-brand panel fails closed. Idempotent by run id: an identical
-- re-approval returns the existing run; changed caps for an existing run id are refused.
CREATE FUNCTION public.approve_citation_brand_run(p_user uuid,p_project text,p_run uuid,p_panel uuid,p_version integer,p_budget integer,p_rounds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE panel_doc jsonb; existing jsonb; doc jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  -- Serialize the 20-run capacity guard under the account's workspace_meta row (see
  -- save_citation_capture): the helper's FOR UPDATE is a silent no-op when the row is absent. One
  -- statement makes presence and lock inseparable; a missing row fails closed.
  PERFORM 1 FROM public.workspace_meta WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'citation_workspace_unavailable'; END IF;
  IF p_run IS NULL OR p_panel IS NULL OR p_version IS NULL OR p_budget IS NULL OR p_rounds IS NULL
    OR p_budget<1 OR p_budget>50 OR p_rounds<1 OR p_rounds>2 THEN
    RAISE EXCEPTION 'invalid_citation_brand_run';
  END IF;
  SELECT document INTO panel_doc FROM public.citation_panels WHERE user_id=p_user AND project_id=p_project AND panel_id=p_panel AND version=p_version;
  IF panel_doc IS NULL OR panel_doc->>'status'<>'locked' OR panel_doc->>'kind'<>'brand' THEN RAISE EXCEPTION 'citation_brand_panel_unresolved'; END IF;
  SELECT document INTO existing FROM public.citation_brand_runs WHERE user_id=p_user AND project_id=p_project AND run_id=p_run;
  IF existing IS NOT NULL THEN
    -- Idempotent retry: the same run id (matched by uuid value on run_id above) with identical params
    -- returns the stored doc. Compare panelId by UUID VALUE so a historical run doc whose stored panelId
    -- is UPPERCASE still reads as the same panel rather than a spurious conflict; the other fields are
    -- integers.
    IF public.citation_ctx_run(existing->>'panelId')=p_panel AND (existing->>'panelVersion')::integer=p_version
      AND (existing->>'observationBudget')::integer=p_budget AND (existing->>'rounds')::integer=p_rounds THEN
      RETURN existing;
    END IF;
    RAISE EXCEPTION 'citation_brand_run_conflict';
  END IF;
  IF (SELECT count(*) FROM public.citation_brand_runs WHERE user_id=p_user AND project_id=p_project)>=20 THEN RAISE EXCEPTION 'citation_brand_run_capacity'; END IF;
  doc := jsonb_build_object(
    'id',p_run::text,'panelId',p_panel::text,'panelVersion',p_version,
    'approvedBy',p_user::text,'approvedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'observationBudget',p_budget,'rounds',p_rounds);
  INSERT INTO public.citation_brand_runs(user_id,project_id,run_id,panel_id,panel_version,document)
    VALUES(p_user,p_project,p_run,p_panel,p_version,doc);
  RETURN doc;
END; $$;

-- Store one manual capture into public.ai_answer_evidence, resolving its panel version, question
-- binding and any brand run against actual stored records before insert. The prompt-snapshot,
-- hash-dedup, correction-chain and 100-record capacity semantics match the legacy answer path;
-- what is added is the panel/brand authorization: pure capture validity is never authority.
CREATE FUNCTION public.save_citation_capture(p_user uuid,p_project text,p_document jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  ctx jsonb; digest text; result uuid; prompt uuid; rev integer; replaced uuid; saved jsonb;
  panel_doc jsonb; panel_kind text; run_doc jsonb; v_run uuid; v_panel uuid; question jsonb; rnd integer; pred_ctx jsonb; v_slot_at text;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  -- Serialization safety for the observation budget: the count+insert below must run under the
  -- account's workspace_meta row lock. assert_knowledge_project(...,true) takes it FOR UPDATE, but a
  -- project references auth.users only, so it can exist without a workspace_meta row and that lock is
  -- then a silent no-op. Re-take the lock here in ONE statement so presence and lock acquisition are
  -- inseparable: FOR UPDATE locks the row and FOUND reports whether one was actually locked. A missing
  -- row fails closed; re-locking a row this transaction already holds is harmless. (A bare EXISTS
  -- check would not prove the lock — a row inserted and committed by another transaction between the
  -- helper and the check would read as present yet never have been locked in this transaction.)
  PERFORM 1 FROM public.workspace_meta WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'citation_workspace_unavailable'; END IF;
  IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR octet_length(p_document::text)>100000
    OR p_document->'analysis'->'verified' IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'invalid_answer_evidence';
  END IF;
  ctx := p_document->'input'->'captureContext';
  IF ctx IS NULL OR jsonb_typeof(ctx)<>'object' THEN RAISE EXCEPTION 'citation_capture_context_missing'; END IF;
  IF p_document->'input'->>'capturedAt' IS DISTINCT FROM ctx->'time'->>'capturedAt' THEN RAISE EXCEPTION 'citation_capture_time_mismatch'; END IF;
  -- Critical-identity defence: the one record must not assert two contradictory surfaces about
  -- itself. The answer's own delivery mode and model version are the same identity the capture
  -- context surface records (the legacy analysis keys on the former, the citation resolver reads the
  -- latter), so a disagreement — an API answer wearing a consumer/search context, or a different
  -- model label — would let the same record be read two ways and is refused. Deviations FROM THE
  -- PANEL are untouched (they remain storable, flagged by the read resolver); only self-contradiction
  -- within the record is rejected. The free-text surface label is not equated to the service here.
  IF p_document->'input'->>'mode' IS DISTINCT FROM ctx->'surface'->>'mode' THEN RAISE EXCEPTION 'citation_capture_mode_conflict'; END IF;
  IF p_document->'input'->>'modelVersion' IS DISTINCT FROM ctx->'surface'->>'modelLabel' THEN RAISE EXCEPTION 'citation_capture_model_conflict'; END IF;
  -- v1 is consumer-only (spec §§2, 5.2): an API capture is not a consumer substitute. Refuse it so a
  -- non-consumer surface can never be stored as a v1 consumer observation (the read resolver also
  -- flags any pre-existing one). The general answer path still accepts API answers as non-panel evidence.
  IF ctx->'surface'->>'mode'='api' THEN RAISE EXCEPTION 'citation_non_consumer_surface'; END IF;
  prompt := (p_document->'input'->>'promptId')::uuid; rev := (p_document->'input'->>'promptRevision')::integer;
  replaced := (p_document->'input'->>'supersedesId')::uuid;
  SELECT jsonb_build_object('id',id,'revision',revision,'createdAt',created_at,'data',data) INTO saved
    FROM public.ai_visibility_prompts WHERE user_id=p_user AND project_id=p_project AND id=prompt AND revision=rev;
  IF saved IS NULL OR saved IS DISTINCT FROM p_document->'prompt' THEN RAISE EXCEPTION 'evidence_prompt_changed'; END IF;
  -- Resolve the owner-locked panel version the capture claims. Missing, unlocked or wrong-version
  -- fails closed (deletion, a draft, or a cross-version reference). v_panel is the capture's panel id as a
  -- uuid VALUE (the cast fails closed on a malformed NEW context) and is reused for every panelId identity
  -- comparison below, so an UPPERCASE captureContext panelId resolves and matches like its lowercase form.
  v_panel := (ctx->>'panelId')::uuid;
  SELECT document INTO panel_doc FROM public.citation_panels
    WHERE user_id=p_user AND project_id=p_project AND panel_id=v_panel AND version=(ctx->>'panelVersion')::integer;
  IF panel_doc IS NULL OR panel_doc->>'status'<>'locked' THEN RAISE EXCEPTION 'citation_panel_unresolved'; END IF;
  panel_kind := panel_doc->>'kind';
  -- Prospective panel approval (spec Appendix A: owner review BEFORE USE, then save the immutable
  -- panel). This locked version is a usable baseline only from its DB-minted approval instant
  -- onward, so a new capture collected before that instant was not under an approved protocol and is
  -- refused. A missing approval instant fails closed. This is independent of, and additional to, the
  -- brand run's own prospective guard below; both must hold for a brand capture.
  IF panel_doc->'approval'->>'approvedAt' IS NULL
    OR (p_document->'input'->>'capturedAt')::timestamptz < (panel_doc->'approval'->>'approvedAt')::timestamptz THEN
    RAISE EXCEPTION 'citation_panel_approved_after_capture';
  END IF;
  -- Question binding: the slot's question exists on the panel and binds to this exact prompt
  -- id+revision and this exact text (which equals the recorded questionText).
  SELECT elem INTO question FROM jsonb_array_elements(panel_doc->'questions') AS t(elem) WHERE elem->>'id'=ctx->'slot'->>'questionId';
  IF question IS NULL THEN RAISE EXCEPTION 'citation_question_not_in_panel'; END IF;
  -- promptId matched by UUID VALUE: the panel document keeps the reviewed question's original promptId
  -- spelling (possibly UPPERCASE), while `prompt` is the capture's promptId as a uuid, so a raw-text
  -- compare would unbind a valid question. questionText stays an EXACT text match (case-sensitive by
  -- contract), and promptRevision is an integer compare.
  IF public.citation_ctx_run(question->>'promptId') IS DISTINCT FROM prompt OR (question->>'promptRevision')::integer IS DISTINCT FROM rev
    OR question->>'text' IS DISTINCT FROM ctx->'instructions'->>'questionText' THEN
    RAISE EXCEPTION 'citation_question_unbound';
  END IF;
  rnd := (ctx->'slot'->>'round')::integer; v_run := (ctx->>'brandRunId')::uuid;
  IF panel_kind='discovery' THEN
    IF v_run IS NOT NULL THEN RAISE EXCEPTION 'brand_run_on_discovery'; END IF;
    IF rnd<1 OR rnd>(panel_doc->>'rounds')::integer THEN RAISE EXCEPTION 'round_out_of_panel'; END IF;
    -- Weekly schedule binding (spec §§5.1 Frequency, 5.2 Time, 5.3): when the locked panel carries an
    -- owner-approved weekly schedule (every v1 discovery lock now does), the capture's claimed intended
    -- weekly slot MUST equal the approved instant for its round, and the recorded delayMinutes must be
    -- the truthful whole-minute lateness with the run at/after that slot. A forged or same-day intended
    -- slot, or an untruthful/negative delay, is fabricated provenance and is refused — exactly as a
    -- forged prompt binding is — so four same-day "rounds" can never be admitted as four weekly rounds.
    -- Instants are compared as absolute values (an equivalent offset spelling still matches). A
    -- pre-schedule historical panel carries none; the read resolver flags such a capture instead.
    IF panel_doc->'schedule' IS NOT NULL THEN
      SELECT s->>'intendedAt' INTO v_slot_at
        FROM jsonb_array_elements(panel_doc->'schedule'->'slots') AS t(s)
        WHERE (s->>'round')::integer=rnd;
      -- The intended slot must equal the approved instant AND be at the supported MILLISECOND precision
      -- (a sub-millisecond microsecond is refused so this and the TS resolver, which compares to the
      -- millisecond, agree; an equivalent offset spelling of the same instant still matches).
      IF v_slot_at IS NULL
        OR (ctx->'time'->>'intendedSlotAt')::timestamptz IS DISTINCT FROM v_slot_at::timestamptz
        OR (ctx->'time'->>'intendedSlotAt')::timestamptz
           IS DISTINCT FROM date_trunc('milliseconds',(ctx->'time'->>'intendedSlotAt')::timestamptz) THEN
        RAISE EXCEPTION 'citation_intended_slot_mismatch';
      END IF;
      -- The run is at/after the slot, at millisecond precision, and delayMinutes is the truthful whole
      -- minutes; the millisecond guard keeps this floor identical to the TS `Math.floor((cap-slot)/60000)`.
      IF (ctx->'time'->>'capturedAt')::timestamptz < v_slot_at::timestamptz
        OR (ctx->'time'->>'capturedAt')::timestamptz
           IS DISTINCT FROM date_trunc('milliseconds',(ctx->'time'->>'capturedAt')::timestamptz)
        OR ctx->'time'->>'delayMinutes' IS NULL
        OR (ctx->'time'->>'delayMinutes')::integer IS DISTINCT FROM
           floor(extract(epoch FROM ((ctx->'time'->>'capturedAt')::timestamptz - v_slot_at::timestamptz))/60)::integer THEN
        RAISE EXCEPTION 'citation_delay_untruthful';
      END IF;
    END IF;
  ELSE
    IF v_run IS NULL THEN RAISE EXCEPTION 'brand_capture_without_run'; END IF;
    -- The run must be an owner-approved run for THIS exact panel and version. Missing, foreign or
    -- cross-version runs fail closed.
    SELECT document INTO run_doc FROM public.citation_brand_runs
      WHERE user_id=p_user AND project_id=p_project AND run_id=v_run
        AND panel_id=v_panel AND panel_version=(ctx->>'panelVersion')::integer;
    IF run_doc IS NULL THEN RAISE EXCEPTION 'brand_run_unresolved'; END IF;
    -- Owner approval is prospective: a run approved after the capture cannot sanction it.
    IF (p_document->'input'->>'capturedAt')::timestamptz < (run_doc->>'approvedAt')::timestamptz THEN RAISE EXCEPTION 'brand_run_approved_after_capture'; END IF;
    IF rnd<1 OR rnd>(run_doc->>'rounds')::integer THEN RAISE EXCEPTION 'brand_round_out_of_run'; END IF;
  END IF;
  -- Prompt-bound insert with hash dedup, correction validation and the 100-record capacity, exactly
  -- as the legacy answer path (the capture context inside `input` is part of the dedup hash). Dedup
  -- runs BEFORE any new-observation charge, so an identical, already-persisted capture returns its
  -- existing id without being re-checked against — or blocked by — the run budget or the capacity.
  digest := encode(sha256(convert_to((p_document->'input')::text,'UTF8')),'hex');
  SELECT id INTO result FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project AND document_hash=digest;
  IF FOUND THEN RETURN result; END IF;
  -- A correction (supersedesId set) re-describes the SAME observation and is therefore budget-exempt,
  -- so its predecessor must be a real record with the SAME observation identity: same panel version,
  -- brand run, question, round, capture instant and surface. A predecessor from another run, panel,
  -- slot or capture time — or a legacy context-less answer — is a DIFFERENT observation and must be a
  -- new (charged) capture; it can never be laundered into an exhausted run as a "correction".
  -- Branching is already impossible (UNIQUE(user_id,project_id,supersedes_id)), so a chain stays
  -- linear and, by transitivity of this identity, remains one observation. Raw originals and the
  -- deletion cascade are unchanged.
  IF replaced IS NOT NULL THEN
    SELECT document->'input'->'captureContext' INTO pred_ctx FROM public.ai_answer_evidence
      WHERE user_id=p_user AND project_id=p_project AND id=replaced AND prompt_id=prompt AND prompt_revision=rev;
    IF pred_ctx IS NULL THEN RAISE EXCEPTION 'evidence_correction_missing'; END IF;
    IF jsonb_typeof(pred_ctx)<>'object'
      -- panel identity by UUID VALUE (v_panel is the new capture's normalized panel), so an UPPERCASE
      -- historical predecessor still matches its lowercase correction rather than being rejected.
      OR public.citation_ctx_run(pred_ctx->>'panelId') IS DISTINCT FROM v_panel
      OR pred_ctx->>'panelVersion' IS DISTINCT FROM ctx->>'panelVersion'
      -- brand run identity by UUID VALUE (v_run is the new capture's normalized run), so an UPPERCASE
      -- historical predecessor still matches its lowercase correction — a raw-text compare would wrongly
      -- reject a legitimate same-observation correction; a malformed predecessor run resolves to NULL and
      -- is DISTINCT from a real run, so it is not a valid correction predecessor (fails closed).
      OR public.citation_ctx_run(pred_ctx->>'brandRunId') IS DISTINCT FROM v_run
      OR pred_ctx->'slot'->>'questionId' IS DISTINCT FROM ctx->'slot'->>'questionId'
      OR pred_ctx->'slot'->>'round' IS DISTINCT FROM ctx->'slot'->>'round'
      -- Capture instant by VALUE at supported (millisecond) precision, not raw text: an equivalent-offset
      -- re-spelling of the SAME instant (e.g. '+02:00' vs 'Z') is one observation and must be accepted; a
      -- genuinely different instant stays DISTINCT and is refused. A malformed historical predecessor date
      -- resolves to NULL and is DISTINCT from the new capture's real instant, so it fails closed (no crash).
      OR public.citation_ts_ms(pred_ctx->'time'->>'capturedAt')
         IS DISTINCT FROM public.citation_ts_ms(ctx->'time'->>'capturedAt')
      OR pred_ctx->'surface' IS DISTINCT FROM ctx->'surface' THEN
      RAISE EXCEPTION 'citation_correction_identity_mismatch';
    END IF;
  END IF;
  -- One scheduled observation per slot (spec §§5.2/6 attempts semantics): a NEW original (no
  -- supersedes) must be the only live original for its exact slot — panel version, brand run,
  -- question and round. An identical re-import already returned above via hash dedup, and a
  -- same-observation correction (supersedes set) re-describes the existing chain rather than taking a
  -- new slot; but a DISTINCT new capture for an already-occupied slot is refused, so two independent
  -- imports for one slot can never both be stored and later trip panelCounts' duplicate-slot guard
  -- (which would make the whole report unreportable). Atomicity: the account's workspace_meta row is
  -- held FOR UPDATE (required-present) from the top of this function, so this check and the insert are
  -- serialized with every other capture for the account and two concurrent originals cannot both pass.
  -- A superseded original keeps supersedes_id null, so it still occupies its slot (raw history kept).
  -- An erased slot stays occupied via its content-free tombstone, so erasing an observation never
  -- reopens the slot for a fresh (or even identical) re-import — the attempt is immutable.
  IF replaced IS NULL AND (
    EXISTS (
      SELECT 1 FROM public.ai_answer_evidence
      WHERE user_id=p_user AND project_id=p_project AND supersedes_id IS NULL
        -- panel identity by UUID VALUE (v_panel is this capture's normalized panel), so an UPPERCASE
        -- historical original at the same slot is still detected rather than read as a different slot.
        AND public.citation_ctx_run(document->'input'->'captureContext'->>'panelId')=v_panel
        AND document->'input'->'captureContext'->>'panelVersion'=ctx->>'panelVersion'
        AND document->'input'->'captureContext'->'slot'->>'questionId'=ctx->'slot'->>'questionId'
        AND document->'input'->'captureContext'->'slot'->>'round'=ctx->'slot'->>'round'
        -- brand run identity by UUID VALUE (v_run is this capture's normalized run), so an UPPERCASE
        -- historical original at the same slot is still detected — a raw-text compare would treat it as a
        -- different slot and let a duplicate original through (later making panelCounts unreportable).
        AND public.citation_ctx_run(document->'input'->'captureContext'->>'brandRunId') IS NOT DISTINCT FROM v_run
    )
    OR EXISTS (
      SELECT 1 FROM public.citation_capture_tombstones
      WHERE user_id=p_user AND project_id=p_project
        AND panel_id=v_panel AND panel_version=(ctx->>'panelVersion')::integer
        AND question_id=ctx->'slot'->>'questionId' AND round=(ctx->'slot'->>'round')::integer
        AND brand_run_id IS NOT DISTINCT FROM v_run
    )
  ) THEN
    RAISE EXCEPTION 'citation_slot_occupied';
  END IF;
  -- A genuinely NEW brand observation (no supersedes) consumes the run's observation budget, checked
  -- here (after dedup) so a re-imported identical capture is never re-charged. Live observations are
  -- the originals (supersedes null) carrying this run id; a same-observation correction is exempt.
  -- Concurrency: this count+insert is serialized per account by the workspace_meta row lock, taken
  -- FOR UPDATE and required-present in one statement at the top of this function, so two concurrent
  -- captures for one run serialize on that row and cannot both pass the budget. No per-run lock is
  -- needed. Erased observations still count via their tombstones, so erasing a brand capture never
  -- restores budget for a fresh one — the consumed attempt is immutable.
  IF panel_kind<>'discovery' AND replaced IS NULL AND (
    (SELECT count(*) FROM public.ai_answer_evidence
      WHERE user_id=p_user AND project_id=p_project AND supersedes_id IS NULL
        -- Match live originals to this run by UUID VALUE, so an UPPERCASE/mixed-case historical brandRunId
        -- still counts against the budget — a raw-text compare to the lowercase v_run::text would miss it
        -- and let the run exceed its approved budget. Mirrors runConsumed's read-side aggregate exactly.
        AND public.citation_ctx_run(document->'input'->'captureContext'->>'brandRunId')=v_run)
    + (SELECT count(*) FROM public.citation_capture_tombstones
        WHERE user_id=p_user AND project_id=p_project AND brand_run_id=v_run)
  )>=(run_doc->>'observationBudget')::integer THEN
    RAISE EXCEPTION 'brand_run_budget_exceeded';
  END IF;
  IF (SELECT count(*) FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project)>=100 THEN RAISE EXCEPTION 'answer_evidence_capacity'; END IF;
  INSERT INTO public.ai_answer_evidence(user_id,project_id,prompt_id,prompt_revision,document_hash,document,supersedes_id)
    VALUES(p_user,p_project,prompt,rev,digest,p_document,replaced)
    ON CONFLICT(user_id,project_id,document_hash) DO NOTHING RETURNING id INTO result;
  IF result IS NULL THEN SELECT id INTO result FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project AND document_hash=digest; END IF;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.read_citation_protocol(uuid,text),public.save_citation_panel_draft(uuid,text,uuid,integer,jsonb),public.lock_citation_panel(uuid,text,uuid,integer),public.approve_citation_brand_run(uuid,text,uuid,uuid,integer,integer,integer),public.save_citation_capture(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_citation_protocol(uuid,text),public.save_citation_panel_draft(uuid,text,uuid,integer,jsonb),public.lock_citation_panel(uuid,text,uuid,integer),public.approve_citation_brand_run(uuid,text,uuid,uuid,integer,integer,integer),public.save_citation_capture(uuid,text,jsonb) TO service_role;
