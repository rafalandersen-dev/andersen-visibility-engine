# Citation Intelligence — CI-2 protocol storage (P2 packet)

**Packet:** P2 — immutable panel/protocol storage, brand-run binding and manual capture context.
**Prepared:** 19 September 2026 · **Author:** Claude (implementation) · **Direction/review:** Codex.
**Base:** released `main` at `26b938c3`. Independent of the P1 raw-artifact worktree and the
conversation-live-fix worktree; this packet touches none of their files.
**Status:** source, migration, tests and docs authored offline. **Not** applied, deployed or run
here. Codex runs the prepared checks (CLI wrapper `E2BIG` previously blocked local execution). No
pilot data collected; the Swedish Appendix A/B panels remain owner-review PENDING and are never
auto-locked or seeded as fixtures into a live project.

This packet builds packet 3 ("complete accepted D03 workflow") storage/auth layer on top of the
released PR137 validity helpers (`src/lib/citation-panel.ts`, `src/lib/citation-finding.ts`) and the
existing answer stack (`src/lib/answer-evidence.*`). It reuses `ai_visibility_prompts` and
`ai_answer_evidence`; there is **no second capture table**. Findings/improvements storage (P3), a
native parser (P5) and UI (P4) are out of scope and untouched.

## What this packet adds

1. **Immutable versioned panels** (`public.citation_panels`). A panel id accumulates immutable
   versions. A draft (`status:"draft"`, `approval:null`) is saved; the owner reviews it out of band;
   the server then **locks** it by appending a new version whose content is copied verbatim from the
   reviewed draft (freezing client market, question/interface language, the one surface/mode, session
   controls and the collection country/city) and whose approval receipt (`approvedBy`, `approvedAt`)
   is minted from the authenticated caller and the database clock. A draft is not approved; validity
   of a `panelProtocolSchema` object is never, by itself, authority to lock.
2. **Brand runs** (`public.citation_brand_runs`). A brand diagnostic run is separately approved
   against a **locked brand** panel version, with an owner-set observation budget (1–50) and round
   cap (1–2) and a server-minted approval receipt. Runs are bound to an actual panel version by a
   foreign key; discovery is never scheduled here. Brand output is excluded from discovery
   denominators by construction (separate table, separate resolver branch, distinct question series).
3. **Manual capture context** on the existing answer record. `answerEvidenceSchema` gains one
   optional, opaque `captureContext` field so the existing read path tolerates capture-bound records;
   the citation layer validates its exact shape (`captureContextSchema`) and **resolves** it. A
   capture is stored through `save_citation_capture`, which resolves the referenced owner-locked panel
   version, the slot's versioned question (prompt id + revision + exact text), and — for a brand
   capture — the approved run (existence, panel/version match, prospective approval, round and
   observation budget) before reusing the legacy prompt-snapshot / hash-dedup / correction-chain /
   100-record insert into `ai_answer_evidence`. Legacy intake (`importAnswerEvidence`) now refuses a
   capture context so an unresolved binding can never enter through the panel-blind path.

### Authorization vs comparability (deliberate split)

- **The write RPC rejects integrity/reference failures**: missing/unlocked/cross-version panel,
  question not in panel or unbound (drifted prompt id/revision/text), a discovery capture carrying a
  brand run, a brand capture with no/foreign/cross-version run, a run approved after the capture, a
  round outside the panel or run, an over-budget new observation, a tampered capture instant, a
  changed prompt snapshot, and the 100-record capacity. These are refused at write; they can never be
  stored.
- **The read resolver flags methodology deviations** (`resolveStoredCaptures` → the PR137
  `protocolDeviations`/`slotOutcome`): a stored capture collected under a different session, surface,
  language or collection location is preserved honestly and marked `protocol_deviant`, never silently
  eligible for a complete-pair comparison. A panel later deleted leaves the raw capture in place but
  no longer resolves it (`panel_unresolved`), invalidating the dependent claim without cascading the
  raw version away.

This mirrors the spec: reject forged/foreign/cross-version/run-budget references (§8), but retain
failed/truncated/missed/deviant outcomes as real evidence (§5.2, §6).

## Post-review corrections (Codex review round)

An independent review found the earlier-stage focused tests passing but `tsc` failing, plus three
soundness gaps. All four are corrected within the same disjoint file ownership, with no added scope:

1. **`captureContext` type / serialization.** The optional field was typed `z.unknown()`, which the
   TanStack Start server-function return serializer cannot represent, so `readAnswerEvidenceFn`
   (consumed by `AnswerEvidencePanel`) failed to type-check. It is now a bounded, finite-depth,
   JSON-serializable value schema (`captureContextValue`) defined **inside** `answer-evidence.ts`
   — no import of the citation layer, which would be circular (`citation-panel.ts` already imports
   `answer-evidence.ts`). The bounds exceed every `captureContextSchema` field, so real captures
   round-trip; legacy reads (field absent) stay byte-identical; the citation layer still performs the
   strict parse. No `any`, no cast.
2. **Budget checked before dedup.** `save_citation_capture` charged the brand-run observation budget
   *before* the hash-dedup lookup, so an exact re-import at a budget-1 run failed instead of
   returning its existing id. Hash dedup now runs first (returning the persisted id without charge),
   and the budget check moved after it — alongside the 100-record capacity, which was already
   post-dedup. Authorization/reference resolution (panel, question, run existence, prospective
   approval, round) is unchanged and still precedes dedup.
3. **`supersedesId` correction loophole.** A correction was budget-exempt but only checked
   prompt/revision, so any same-prompt answer from another run, panel, slot or a legacy context-less
   record could be named as a "correction" to add unbudgeted observations. The predecessor is now
   bound to the **same observation identity** — stored `captureContext` matching on panel version,
   brand run, question, round, capture instant and surface; a context-less predecessor fails closed.
   Genuine same-observation corrections remain possible (a correction is not a new charge); any
   change to the observation must be a new, charged capture. Branching is already impossible via the
   pre-existing `UNIQUE(user_id,project_id,supersedes_id)` constraint, so chains stay linear and, by
   transitivity of the identity check, remain one observation. Raw originals and the deletion cascade
   are untouched.
4. **Record self-contradiction.** `parseManualCaptureInput` equated only `capturedAt`, so an answer's
   own `mode`/`modelVersion` could disagree with its `captureContext.surface.mode`/`modelLabel` — and
   the read resolver, reading only the context, could mark an API answer complete under a consumer/
   search context. Both are now required to agree, at the input boundary **and** as an SQL defence in
   `save_citation_capture`. This is internal consistency only: deviations *from the panel* remain
   storable and flagged by `protocolDeviations`; the free-text `surface` label is deliberately not
   equated to the structured `service`, to avoid over-constraining genuine records.

### Prospective panel approval (spec Appendix A — implemented)

Appendix A (owner review BEFORE USE, then save the immutable panel) makes a locked panel version a
usable baseline only from its owner-approval instant onward. Alongside the brand run's separate
prospective guard, a capture is now refused when its `capturedAt` predates the panel version's
DB-minted `approval.approvedAt`:

- **Write (`save_citation_capture`):** after resolving the locked panel, a new capture whose instant
  is before that panel version's approval — or whose approval instant is missing — fails closed
  (`citation_panel_approved_after_capture`), for both discovery and brand. The brand run's own
  prospective guard is unchanged and additional (both must hold for a brand capture).
- **Read (`resolveStoredCaptures`):** a raw pre-approval record already on disk stays inspectable (it
  still resolves against the panel) but is never an eligible complete slot — a would-be `complete` is
  demoted to `protocol_deviant` and flagged `panel_approved_after_capture`, while a genuine
  failure/truncation is preserved as itself (never masked). Missing/unparseable approval fails
  closed. No change to the released `citation-panel.ts` helpers and no rewrite of raw history.

Fixtures were corrected honestly: the capture suites stamp the locked panel with an explicit
historical approval instant (a raw test-fixture write, not a product path), so their post-approval
captures are legitimately after approval. New tests cover pre-lock rejection, at/after-lock
acceptance with correct timestamps, an older stored pre-approval record resolving as not-eligible,
and the still-required separate brand-run approval. No real owner pilot approval is assumed, no live
capture is collected, and the one migration (`…170000`) remains unapplied.

### Review round 2 — active correction leaves, and budget serialization (assessed)

- **Duplicate observation slots on correction (fixed).** `readResolvedCaptures` mapped the whole
  answer history and dropped `supersedesId`, so a valid correction (a new record superseding the
  original) resolved as a *second* observation for the same slot — double-counting and tripping
  `panelCounts`' duplicate-slot guard. `StoredCaptureAnswer` now carries `supersedesId`, and
  `resolveStoredCaptures` resolves only the **active leaf** of each correction chain (records another
  supplied record supersedes are skipped), mirroring `evidenceCohorts`' supersession convention and
  handling correction-of-correction transitively. Raw superseded rows are **not** deleted — they stay
  readable via `readAnswerEvidence`; they are simply not re-counted. Tests: a `resolveStoredCaptures`
  chain (a←b←c) plus an unrelated capture roundtripped into `panelCounts` (recorded = distinct slots,
  no duplicate-slot throw), and a real `readResolvedCaptures` roundtrip after an RPC-stored correction
  (leaf-only resolved, both raw records preserved, `panelCounts` clean).
- **Brand-run budget serialization (normal path already serialized; missing-meta path now
  fail-closed).** The normal path is serialized: `save_citation_capture` calls
  `assert_knowledge_project(p_user,p_project,true)`, which takes the account's `workspace_meta` row
  `FOR UPDATE` before the count and insert — the same per-account serialization the released answer
  100-record capacity uses — so two concurrent captures for one run cannot both pass the budget. That
  `FOR UPDATE` only serializes when the row EXISTS, and a project references `auth.users` only, so a
  project (with a valid locked panel and approved run) can exist without a `workspace_meta` row, in
  which case the lock is a silent no-op. `save_citation_capture` now re-takes that row `FOR UPDATE` in
  a single statement immediately after auth and fails closed (`citation_workspace_unavailable`) when
  no row was locked (`IF NOT FOUND`), so presence and lock acquisition are inseparable — a bare
  `EXISTS` would not prove the lock, as a row another transaction commits between the helper and the
  check reads as present yet was never locked here. Re-locking a row this transaction already holds is
  harmless; lock ordering/auth is preserved and no new lock is introduced. The change is confined to
  `save_citation_capture`; the
  shared `assert_knowledge_project` helper and the other quotas are untouched. Test: a real SQL
  regression deletes the account's `workspace_meta` row (keeping a valid project + approved run),
  shows the capture fails before any insert with no data mutation, then restores the row and confirms
  a normal capture still succeeds. This is normal-path-serialized + missing-meta-fail-closed by code
  inspection and single-transaction SQL; PGlite is single-connection and does **not** prove
  multi-connection concurrency, so no such proof is fabricated.

### Review round 3 — a context-less correction must not vanish a capture

The Answer panel's Correct action submits `supersedesId` with **no** `captureContext` through legacy
intake, and legacy intake permits any same-prompt predecessor. When that superseded a capture-bound
row, the active-leaf resolver excluded the original (now superseded) and skipped the context-less
successor (unresolvable) — so a valid observation **vanished** from the resolved counts. Fixed
coherently at both boundaries:

- **Resolver (`resolveStoredCaptures`).** A record now only supersedes another in the resolved graph
  if it is itself a *resolvable capture* (its `captureContext` parses). A context-less or malformed
  successor therefore never marks its capture-bound predecessor superseded, so the capture stays the
  active leaf and remains counted. Genuine capture correction chains (every link carries a
  captureContext) and the duplicate-slot guard are unchanged; history is preserved.
- **Legacy intake (`importAnswerEvidence`).** A legacy (context-less) submission with `supersedesId`
  is refused when its predecessor is capture-bound (`evidence_capture_correction_requires_context`) —
  an actionable error instead of silent loss; correcting a capture belongs on the panel-aware capture
  path (with a captureContext). A legacy correction of a legacy (context-less) row is unchanged.

No released function is redefined: the guard is in source (`importAnswerEvidence`) and the resolver,
and the immutable `…10210000` legacy RPC is untouched; the resolver keeps any already-stored such row
from vanishing a capture regardless. Tests: a real legacy-intake/`readResolvedCaptures` roundtrip
(refusal + capture still resolved + legacy-of-legacy still works), and resolver unit cases for a
context-less and a malformed successor.

### Review round 4 — one observation per slot, and the consumer-only v1 boundary

- **Duplicate slot (hash-only dedup) → unreportable (fixed).** Two *independent* captures for the same
  panel version / question / round passed hash-only dedup (different answer text → different hash), and
  `resolveStoredCaptures` forwarded both to `panelCounts`, whose duplicate-slot guard threw and made the
  whole report unreportable. Fixed at two boundaries:
  - **Write (`save_citation_capture`).** A NEW original (no `supersedesId`) must be the only live
    original for its exact slot (panel version, brand run, question, round); a distinct second original
    is refused (`citation_slot_occupied`). Identical re-imports still dedupe (hash lookup precedes this
    guard) and same-observation corrections still attach to the chain (they set `supersedesId`, so they
    do not occupy a new slot). Per spec §§5.2/6 attempts semantics, one scheduled observation per slot;
    a retry is a correction of that slot, not a second original. **Atomicity/concurrency:** the check
    and insert run under the account's `workspace_meta` row held `FOR UPDATE` (required-present) from
    the top of the function, so two concurrent originals for one slot serialize and cannot both pass.
  - **Read (`resolveStoredCaptures`).** Defence for any already-stored duplicate: if two active-leaf
    captures still resolve to one slot, the slot is collapsed to a single explicitly-invalid entry
    (`protocol_deviant`, deviation `duplicate_slot`) and the extras are excluded from the counted set
    (raw rows remain in storage). The report stays reportable and a duplicate is never silently
    promoted to a measurement success.
- **Consumer-only v1 boundary (spec §§2, 5.2).** An API surface is not a consumer substitute, yet
  panels/captures admitted `surface.mode: "api"`. Now refused across the stack: `panelDraftSchema` /
  `lockedPanelSchema` (draft + lock validation), `parseManualCaptureInput` (capture input), and the
  candidate SQL (`save_citation_panel_draft`, `lock_citation_panel` → `citation_panel_not_consumer`;
  `save_citation_capture` → `citation_non_consumer_surface`). `resolveStoredCaptures` additionally
  demotes any already-stored API capture to `protocol_deviant` with `non_consumer_surface`, so historical
  invalid data can never read as a complete consumer measurement. Consumer web/search surfaces are
  unchanged, and the general answer-evidence stack still records API answers as ordinary non-panel
  evidence. Tests cover API refusal (schema, input, SQL) and the valid consumer path.

### Review round 5 — read evidence before its append-only dependencies

`readResolvedCaptures` used `Promise.all([readCitationProtocol, readAnswerEvidence])`, so it could
read a stale protocol snapshot against newer evidence: a capture imported concurrently with — just
after — its panel lock/run approval could resolve against a protocol snapshot taken before those
commits, yielding a spurious `panel_unresolved` / `brand_run_not_approved`. Fixed by reading evidence
FIRST, then the protocol, sequentially (never `Promise.all`). A capture's panel version and approved
run are committed before the capture, so reading the append-only protocol strictly after the evidence
makes the protocol snapshot at least as new as the evidence. Genuine deletion invalidation is
preserved; no new framework; auth/tenant limits unchanged. Test: a deterministic, sleep-free ordering
regression that holds the evidence RPC pending and asserts the protocol RPC does not start until the
evidence result is in, then a valid new capture resolves `complete`.

### Review round 6 — v1 discovery is the fixed 10×4 grid

The released `panelProtocolSchema` allows 1..10 questions / 0..12 rounds and the SQL lock only required
discovery `rounds ≥ 1`, so an under-sized pilot could lock/approve and read as a complete v1
measurement (violating spec §5.3, CI11-T13: exactly 10 questions × 4 rounds = 40 planned slots). Now:
- **Lock (`lockedPanelSchema` + SQL `lock_citation_panel`).** A discovery panel locks only at exactly
  10 questions and 4 rounds (`citation_panel_grid_invalid`); an incomplete/over-sized draft may still
  be saved and edited but never locked/approved. Brand panels (unscheduled, rounds 0) are exempt. The
  released helper keeps its broad contract for general/legitimate use.
- **Read (`resolveStoredCaptures`).** A capture resolving against a historical off-grid locked
  discovery panel is flagged `panel_grid_invalid` and a would-be `complete` is demoted to
  `protocol_deviant`, so invalid historical data never reads as a complete v1 measurement. Missing
  question identities are never fabricated; the raw record is preserved and explicit.
- Fixtures updated to a valid grid of 10 distinct, prompt-bound questions × 4 rounds (with 10 saved
  prompts); all prior approval/auth/correction/slot/budget fail-closed regressions retained (not
  weakened to pass). Tests: table-driven under/over rounds & questions refusal (schema + SQL), a valid
  10×4 lock, `panelCounts` planning exactly 40 slots with 1 observed → 39 unobserved, and a resolver
  case flagging an off-grid historical panel. Brand behavior unchanged; only the unapplied
  `…170000` migration changed.

### Review round 7 — erasure must not reopen a slot or restore budget

The released `remove_ai_answer_evidence` (immutable) hard-deletes an answer/correction chain, and via
its FKs a prompt or project deletion cascades to captures. For a citation capture this reopened its
scheduled slot and lowered the brand run's live observation count, so an owner could erase an
observation and re-submit a fresh one at the same slot / re-consume budget — breaking the immutable
attempts contract. Fixed without touching the released RPC:
- **Content-free tombstone (`citation_capture_tombstones`, in `…170000`).** An `AFTER DELETE` trigger
  on `ai_answer_evidence` records, for an erased *original* (supersedes null) that carries a capture
  context, **only** its slot/budget identity — panel version, brand run, question id, round, and the
  answer id — and **no** answer content. Corrections and legacy (context-less) answers occupy no slot
  and are skipped (legacy erasure is byte-identical). The trigger skips during a project deletion (its
  rows are cascading away), and the table cascades with the project, so no tombstone orphans.
- **Malformed historical captures stay erasable.** The trigger validates the slot/budget identity with
  safe predicates (uuid-/integer-shaped text) *before* any cast, so a historical row with a malformed
  captureContext — the released generic answer path accepted arbitrary `input` fields, and the reader
  tolerates invalid historical captures — never throws a cast error that would block a user's erasure;
  it is simply erased with no tombstone (it never validly occupied a slot). Only a well-formed protocol
  capture is tombstoned. There is deliberately **no** broad exception handler, so a genuine DB failure
  still propagates rather than being swallowed. (Authority boundary: only `save_citation_capture`
  stores a valid captureContext; the generic path never should, so its rows are never fabricated into a
  valid occupied slot.)
- **Write guards consult it.** `save_citation_capture`'s one-per-slot guard treats a tombstoned slot as
  occupied (`citation_slot_occupied`), and the brand budget check counts tombstones toward the run's
  consumed observations (`brand_run_budget_exceeded`). So erasing an observation never reopens the slot
  (even for an identical re-import) or restores budget; the cascading prompt/root removal bypass is
  closed because the trigger fires on every delete of the row.
- **Erasure obligation honored:** the answer content is genuinely deleted (the row is gone); only the
  content-free attempt fact persists. Tenant isolation, account-first serialization (delete and capture
  both hold the `workspace_meta` lock), authorization, hash dedup-before-budget and correction chains
  are all preserved. Tests: delete-then-replacement same slot denied (direct SQL + wrapper, nothing
  re-stored), brand budget not restored, correction-chain and prompt-removal paths, tombstone content-
  free (full-row inspection, exact column set) and tenant-scoped, malformed historical captures
  (bad uuid / missing keys / int overflow / non-numeric round) erasable with no tombstone while a
  well-formed one IS tombstoned, a project deletion with LIVE captures + an existing tombstone that
  cascades everything without the trigger blocking or recreating a tombstone (other tenant preserved),
  and legacy deletion still functional.

### Review round 8 — the three panel/run write RPCs must serialize like the capture path

Round 2 fixed `save_citation_capture` to re-take the `workspace_meta` row `FOR UPDATE` because
`assert_knowledge_project(...,true)`'s lock is a silent no-op when no account row exists (a project
references `auth.users` only). The three sibling write RPCs — `save_citation_panel_draft`,
`lock_citation_panel`, `approve_citation_brand_run` — still ran their capacity guards (`>=200` panel
versions, `>=20` brand runs) under only that helper, so the same count-then-insert could interleave
unserialized.

- **Fix (candidate `…170000` only):** each of the three now runs, immediately after
  `assert_knowledge_project(...,true)`, the identical single statement
  `PERFORM 1 FROM public.workspace_meta WHERE user_id=p_user FOR UPDATE; IF NOT FOUND THEN RAISE
  EXCEPTION 'citation_workspace_unavailable'; END IF;` — presence and lock acquisition are inseparable,
  a missing account row fails closed before any capacity count or insert, and re-locking a row this
  transaction already holds is harmless. `read_citation_protocol` is untouched (a pure read with no
  capacity guard, and it calls the helper without `true`). No released helper/SQL changed; all existing
  version/approval/capacity/owner/deletion guards are preserved and still run after this gate.
- **Regression:** one SQL test builds a lockable brand draft, a separately locked brand panel and (for
  approve) its v2 while the account row is present, then deletes `workspace_meta` and asserts each of
  the three RPCs fails closed — the specific `citation_workspace_unavailable` via direct SQL (proving
  the gate fires before the capacity count/insert) and a generic refusal via the public wrapper — with
  **no** mutation (no discovery draft stored, no lock appended to the brand draft, no run created).
  Restoring the row then lets all three legitimate paths succeed, proving the missing row (not a content
  or capacity guard) was the sole blocker. PGlite is single-connection, so this proves the fail-closed
  presence gate, not multi-connection lock contention.

### Review round 9 — ten DISTINCT questions, and erased attempts must not vanish

Two confirmed findings against the renamed candidate `20260920190000_citation_protocol.sql`:

- **Ten distinct discovery questions at lock (not ten labels for one).** The lock grid guard checked
  only `10 questions × 4 rounds`, so ten unique local ids all bound to ONE prompt — or ten prompts
  carrying identical COPIED text — passed as a "ten-question" experiment. Fixed in three places that
  must agree: the SQL `lock_citation_panel` grid guard now also requires ten DISTINCT prompt bindings
  (`promptId|promptRevision`) AND ten DISTINCT texts; the TS `lockedPanelSchema` (via
  `assertV1DiscoveryGrid` + the new exported `v1DiscoveryQuestionsDistinct`) refuses the same at the
  boundary; and the read resolver's `gridValid` includes the same distinctness so a HISTORICAL locked
  panel with a non-distinct grid can never read a capture as `complete` (it is flagged
  `panel_grid_invalid`, demoted to `protocol_deviant`). Incomplete drafts stay editable and brand
  panels stay exempt (rounds 0). The existing binding guard already forces text = the bound prompt's
  text, so a reused prompt also collides on text; both checks are kept so the intent holds even if a
  row is malformed. Tests: duplicate-binding and copied-text drafts refused at lock (specific SQL error
  + generic wrapper + nothing locked), the genuine 10×4 distinct grid still locks, and a capture against
  a historical non-distinct grid reads as an explicit deviation.
- **Erased consumed attempts must not read as absent/missed.** `readResolvedCaptures` ignored the
  content-free `citation_capture_tombstones`, so a deleted observation silently reappeared as a
  never-observed slot and a brand run looked under-consumed. Fix: `read_citation_protocol` now also
  returns a content-free `tombstones` array (only slot/budget identity: panel version, brand run,
  question, round, and the erased answer id — no answer text); `citationProtocolStateSchema` gains an
  optional-with-default `tombstones` field; a new pure `resolveErasedSlots` re-derives each tombstone
  into an `ErasedSlot` (panel/run resolution mirrors the live resolver), EXCLUDING any slot a surviving
  resolved capture still occupies (no double count of a deleted original whose chain or an identical
  re-import still resolves) and collapsing duplicate tombstones for one slot; and `readResolvedCaptures`
  returns `erasedSlots` alongside `captures` (additive — existing report consumers that destructure
  `{ panels, brandRuns, captures }` are unaffected). An erased slot is thus DISTINCT from a
  never-observed one, and a brand run's budget stays consumed even after every capture is deleted.
  Nothing retains erased answer content; tenant isolation, the read-order race fix (evidence before
  protocol) and conservative concurrency are unchanged. Tests: an erased discovery observation surfaces
  as an erased slot (and `read_citation_protocol` returns a content-free tombstone), a fully erased
  correction chain yields exactly one erased slot, an erased slot coexists with a surviving capture at
  another slot (each counted once), a brand run keeps two erased slots after all captures are deleted,
  no erased slot leaks across owners, plus pure-resolver unit tests for exclusion/collapse/unresolved.

### Review round 10 — make erased facts actually count, tolerate malformed history, close the read race

Four confirmed follow-ups on the round-9 delta:

- **Service-role read expectation (test-only).** The RLS test asserted `read_citation_protocol` returns
  `{ panels, brandRuns }`; the added `tombstones: []` broke it. Corrected the expected contract to
  `{ panels: [], brandRuns: [], tombstones: [] }`.
- **Erased facts must reach the counts, not just the array.** Returning `erasedSlots` alongside
  `captures` changed no report, because the report layer's `panelCounts` consumes only live captures.
  Added a canonical, typed, P2-owned report — `citationReport` (+ `citationReports`) in
  `citation-protocol.ts` — that folds live outcomes AND erased facts per locked panel version:
  `planned`, `observed`, `erased`, `recorded = observed + erased`, `neverObserved` (explicit erased vs
  never-observed), an `outcomes` tally taken ONLY from live captures (no eligible numerator from
  erasure), and per-approved-run `{ approvedBudget, consumed, observed, erased }` where `consumed`
  counts live originals plus erased attempts so a run's budget stays consumed after every capture is
  erased. It validates panel/question/round/run and de-duplicates so a slot is never double-counted.
  `readResolvedCaptures` now computes `reports` at the service boundary, so a consumer cannot read
  `captures` and silently drop the erased facts. `citation-panel.ts` is unchanged (composed, not
  edited); human-reviewed numerators stay the report layer's facts.
- **Malformed historical tombstones must not break the read.** The strict `erasedSlotFactSchema` would
  throw the whole read on a tombstone the trigger legitimately allows (arbitrary `questionId`,
  `round`/`panelVersion` 0..1e9). Relaxed the schema to exactly the trigger's bounds (uuid ids,
  `questionId` any 1..2000 chars, integers 0..2147483647) so every DB-storable tombstone parses;
  `citationReport` then classifies an unmappable fact as `excluded` (run budget still consumed) rather
  than rejecting the read.
- **Evidence-before-protocol read race.** A capture deleted BETWEEN the two reads shows live in the
  stale evidence while its tombstone is already in the newer protocol. `readResolvedCaptures` now
  reconciles: a stale live capture whose slot has a tombstone is dropped (a tombstone is written only on
  delete and the write path forbids a live capture at a tombstoned slot, so they never coexist in a
  consistent snapshot; the newer tombstone is authoritative). The deleted attempt is reported as erased,
  never a live positive. Preserves the append-only-dependency ordering, needs no released-answer SQL
  change, and is a conservative single-connection boundary check — NOT a multi-connection atomicity
  claim. Tests: an injected ordering test proves a delete-between-reads capture is not returned as a
  positive; SQL tests assert final report counts (erased discovery slot vs never-observed; brand budget
  consumed after all captures erased) and that a directly-inserted malformed historical tombstone reads
  without throwing and is `excluded` while a legitimate erased slot still counts; plus pure
  `citationReport` unit tests (erased-vs-absent, budget-consumed, malformed-excluded, no-double-count).

### Review round 11 — content-safe/bounded erasure read, and write-gate-faithful consumed budget

Two confirmed edge cases on the round-9/10 delta:

- **`questionId` content safety + bounded read.** The trigger stores `captureContext.slot.questionId`
  verbatim (any non-null text, incl. empty/2001+ chars), which the strict `min1/max2000` schema would
  reject — throwing the whole read — and which could leak arbitrary deleted content, and an unbounded
  tombstone set could hit the array cap. Fixed by reshaping `read_citation_protocol`: `tombstones` now
  emits ONLY rows whose `question_id` is a real grid-shaped id (`^[A-Z]{2}-[DB][0-9]{2}$`, a structured
  ≤6-char label — never free text), `LIMIT`-bounded; malformed rows are reduced to a content-free
  `tombstoneExcluded` count per panel version (no text transmitted). The schema requires the grid shape
  (SQL-guaranteed) so a malformed historical row can neither break the read nor leak content, and the
  report surfaces the excluded count as visible `excluded`.
- **Consumed budget must count each tombstone row, not each distinct slot.** `resolveErasedSlots`
  collapses same-slot tombstones for coverage, so two historical originals at one run/slot (each a real
  consumed attempt, both counted by the write gate) under-reported consumed. Fixed by computing
  consumed from TRUSTED facts, not the collapsed coverage: `read_citation_protocol` returns
  `tombstoneBudget` = per-run `count(*)` of tombstone rows (aggregated in SQL by answer id), and
  `readResolvedCaptures` adds every live ORIGINAL (`supersedes` null) still bound to the run — minus any
  stale original whose slot the newer protocol already tombstoned (the round-10 reconciliation, so it is
  counted once via its tombstone). `citationReport` now takes a `CitationErasure` bundle
  (`slots` + `consumedByRun` + `excludedByVersion`) and reports per-run `consumed` from `consumedByRun`
  while `erased` stays the distinct-slot (unique-observation) count — so `consumed` can exceed
  `observed + erased` exactly when historical duplicates existed. Corrections (`supersedes` set) are
  never counted as originals. This wires the service report from trusted facts, not a detached helper.
  Tests: SQL — empty/overlength/arbitrary `questionId` tombstones read without throwing, no content
  transmitted, panels still read, excluded count visible; two erased originals at one run/slot →
  consumed 2, erased-unique 1; other-owner/project excluded (existing isolation tests). Pure — the
  `citationReport` suite updated to the trusted-facts shape (erased-vs-absent, live-empty budget
  consumed, consumed-2/erased-1, malformed-excluded-visible, no-double-count).

### Review round 12 — authoritative SQL consumed, and truncation-aware coverage

Two final integration gaps on the round-11 delta:

- **A — `consumed` must equal the write gate.** The round-11 server reconstructed consumed in JS: it
  parsed live originals with the STRICT `captureContextSchema` (so a live original with a malformed
  context but a valid `brandRunId`, which the write gate counts via `captureContext->>'brandRunId'`, was
  skipped) and dropped any live original whose slot had a tombstone (so a SURVIVING original sharing a
  slot with an erased sibling — write gate = 2 — was under-counted to 1). Fixed by making consumed
  AUTHORITATIVE in SQL: `read_citation_protocol` now returns `runConsumed` per approved run, computed
  with the EXACT write-gate predicate — `count(*)` of live originals (`supersedes` null) bound to the
  run by `captureContext->>'brandRunId'` (malformed context included) plus `count(*)` of the run's
  tombstone rows — in one snapshot, owner/project scoped, bounded to the ≤20 approved runs. The server
  passes it straight through (no JS reconstruction, no reconciliation applied to consumed); `consumed`
  now matches the gate even when the surviving original's slot is reconciled out of coverage.
- **B — never claim `neverObserved` from truncated coverage; bound all aggregates.** The `tombstones`
  read is `LIMIT`-bounded with no truncation signal, so `neverObserved` could be computed from partial
  data, and the old per-`(panel,run)` aggregates could form unbounded groups on random historical ids.
  Fixed: `read_citation_protocol` now returns `erasureByVersion` (per ACTUAL stored panel version that
  has tombstones — bounded to real panels — its TRUE grid-row total and content-free malformed count)
  and a single `erasureOverflow` count of tombstone rows orphaned by a deleted panel. The server derives
  `coverageCompleteByVersion` (transmitted grid rows for a version ≥ its true total); `CitationReport`
  gains `coverageComplete` and makes `neverObserved` **`number | null`** — null whenever coverage is
  incomplete, so a definitive missing count is never derived from truncated tombstones. `erasureOverflow`
  is surfaced on `readResolvedCaptures`. Tests: SQL — a surviving live original plus an erased same-slot
  sibling → consumed 2; a malformed-context live original still counted while a correction is never
  charged, and other-owner rows excluded; a `generate_series` synthetic >10000-row set → transmitted
  coverage `LIMIT`-bounded, `coverageComplete` false, `neverObserved` null; an orphaned tombstone →
  `erasureOverflow` 1. Pure — a `citationReport` completeness test (neverObserved null when incomplete).

### Review round 13 — preserve a real survivor at a historically-duplicated slot (P1 4057186213)

`readResolvedCaptures` reconciled stale live captures against tombstones by SLOT KEY: it dropped any
resolved live capture whose slot matched a tombstone. But two independent original rows can share one
slot (historical, pre one-per-slot guard); erasing one leaves a genuine live sibling, and the slot-key
filter silently hid that survivor (and its duplicate/protocol-deviation evidence), turning it into an
erased-only slot — while authoritative `consumed` still correctly counted 2.

- **Fix (`citation-protocol.server.ts` only):** reconcile by correction-chain ROOT IDENTITY, not slot.
  A tombstone records the erased ORIGINAL's id, i.e. the chain root (the trigger writes one only for a
  `supersedes` null row). (Round 14 corrects this round's ORDER — the reconciliation must run on the raw
  evidence before resolution — and revises the truncation claim below.)

### Review round 14 — reconcile the raw chain BEFORE resolution; expose ambiguous duplicate history

Round 13's identity reconciliation ran AFTER `resolveStoredCaptures`, which first collapses two
independent originals sharing one slot to a single stable-first entry and DISCARDS the sibling. So in
the true delete-between-reads race (older evidence `[originalA, independentB]` at one slot, newer
protocol tombstone A), the resolver kept A (+duplicate_slot) and discarded B; the post-resolve filter
then removed A — leaving NO survivor. The order was also outcome-dependent on which row sorted first.

- **Fix (`citation-protocol.server.ts` + a bounded, defaulted param on `resolveStoredCaptures`):**
  reconcile deleted-chain identities on the RAW evidence BEFORE resolution. The server builds the full
  `supersedesId` ancestry map over all raw answers, computes each row's chain ROOT, and drops every row
  whose root is a tombstoned original. `resolveStoredCaptures` then runs on the surviving raw set, so a
  genuine independent survivor (and its own correction chain, whose active-leaf id is not its root) is
  never discarded by the collapse. This is order-independent.
- **Expose ambiguous duplicate history (no silent success):** a survivor that shares its slot with a
  KNOWN erased original is not a clean measurement. `resolveStoredCaptures` takes a bounded, defaulted
  `erasedSlotKeys` set (the transmitted tombstones' slot keys) and, for a survivor at such a slot, adds
  an `erased_duplicate_slot` deviation and demotes it to `protocol_deviant` — inspectable but never
  promoted to a silent `complete`. `resolveErasedSlots` still folds that tombstone into `consumed`
  (write-gate faithful) rather than double-counting the slot.
- **Truncation claim revised (no unproven guarantee).** Reconciliation identity comes from the
  transmitted (`LIMIT`-bounded, grid) tombstones; under concurrent > `LIMIT` deletions the newest-row
  assumption is NOT proven, so a deleted root whose tombstone fell past the limit could leave a stale
  positive. This is not claimed away: it is exactly the case the read already flags — when a version's
  tombstones are truncated, `coverageComplete` is false (and `neverObserved` null), signalling that both
  coverage AND the reconciliation identity for that version may be incomplete. Bounded-normal data
  (within the limit) reconciles exactly.
- Tests (unit, injected two-snapshot RPC): A-first/tombstone-A and B-first/tombstone-A both keep the
  independent survivor B (order-independent), flagged `erased_duplicate_slot`; a surviving corrected-B
  chain keeps its active leaf; the deleted original+correction chain is dropped with no stale content.
  SQL (real deletion): the two-independent-originals and surviving-sibling cases now assert the survivor
  is preserved AND flagged (not a clean single capture); brand `consumed` stays 2 with the survivor
  observed. The migration fixture `.find(...)` narrowing (TS18048) is guarded.

### Review round 15 — accept canonical (non-RFC) Postgres uuid shape on the tombstone READ (P2 4057264542)

The tombstone READ schemas used Zod `.uuid()` (RFC 4122, which checks the version/variant nibbles), but
the deletion trigger validates a capture context's ids with a canonical-hex `8-4-4-4-12` regex and the
tombstone table's `uuid` columns store any such value. A HISTORICAL identity that is PostgreSQL-valid
without RFC bits (e.g. `00000000-0000-0000-0000-000000000001`) therefore parses in the DB but was
REJECTED by `.uuid()`, failing the WHOLE protocol read on that one row.

- **Fix (`citation-protocol.ts` only):** a READ-ONLY `pgUuid` schema (canonical hex, superset of
  `.uuid()`) now types the DB-derived, content-free identity fields — `erasedSlotFactSchema.answerId`,
  `.panelId`, `.brandRunId`; `runConsumedSchema.runId`; `erasureByVersionSchema.panelId` — so every
  DB-storable tombstone identity parses and the canonical read survives. This is identity-only and does
  NOT loosen authorization: NEW capture/panel/run input+auth schemas (`brandRunApprovalSchema`, the
  scope/param `.uuid()` guards, and the released `captureContextSchema`) are unchanged, and identity
  MATCHING still requires a genuine locked+approved panel / approved run — a non-RFC id that resolves to
  no real entity stays `panelResolved: false` / excluded / overflow, granting no authority and dropping
  no consumed-budget or deletion-identity fact silently.
- Audited all tombstone-related read fields against the DB: `answerId`/`panelId`/`brandRunId` (uuid
  columns, canonical hex), `panelVersion`/`round` (int4, already `0..2147483647`), `questionId` (grid
  regex; non-grid → excluded count), and the per-version metadata (`erasureByVersion`,
  `erasureOverflow`, `runConsumed`) — no unrelated schema rewrite. No released SQL change (the trigger
  already emits the canonical shape).
- Tests (real PGlite): a non-RFC historical captureContext → released `remove` → the trigger writes the
  tombstone → `readCitationProtocol`/`readResolvedCaptures` both survive, mixed with a valid RFC erased
  slot that still counts, the non-RFC id honestly appearing as bounded `erasureOverflow`; a non-RFC
  `brandRunId` bound to a VALID panel parses and the read survives; no other-owner leakage.

## Files

| File | Change |
| --- | --- |
| `src/lib/citation-protocol.ts` | New. Pure storage contract: `panelDraftSchema`, `lockedPanelSchema`, `citationProtocolStateSchema`, `brandRunApprovalSchema`, `parseManualCaptureInput`, `resolveStoredCaptures`, caps. Reuses PR137 schemas; never redefines them. |
| `src/lib/citation-protocol.server.ts` | New. Service RPC helpers: read, save draft, lock, approve brand run, import capture, read+resolve. Owner/time/approval derived server-side; network-free. |
| `src/lib/citation-protocol.functions.ts` | New. Six `requireSupabaseAuth` endpoints, each refusing an owner mismatch and never accepting a client approval/reviewer/timestamp. |
| `src/lib/citation-protocol.test.ts` | New. Pure-contract + mocked-server unit tests. |
| `src/lib/citation-protocol.functions.test.ts` | New. Endpoint authentication/validation tests. |
| `src/lib/citation-protocol-migration.test.ts` | New. Real PGlite SQL round trips (isolation, auth, missing project, reference forgery, approval version, protocol binding, capacity, deletion, idempotency). |
| `supabase/migrations/20260920190000_citation_protocol.sql` | New (one migration). Three tables (panels, brand runs, content-free capture tombstones) + five service-only SECURITY DEFINER RPCs + an `AFTER DELETE` tombstone trigger on `ai_answer_evidence`; RLS on, project-scoped FKs, project-deletion cascade. |
| `src/lib/answer-evidence.ts` | Additive only: optional opaque `captureContext` on `answerEvidenceSchema` so reads tolerate capture-bound records. Legacy documents are byte-identical (field absent). |
| `src/lib/answer-evidence.server.ts` | Additive only: `importAnswerEvidence` refuses a capture context (legacy path stays capture-blind; captures must use the panel-aware path). |
| `product/CITATION_PROTOCOL_IMPLEMENTATION_2026_09_19.md`, `evidence/citation-protocol-storage-2026-09-19.md` | New. This doc and the evidence record. |

No other files were touched. `citation-panel.ts`, `citation-finding.ts`, `native-ai-*`, the P1
migration/design/evidence and all conversation files are unmodified.

## Caps (checked against the existing stack)

Existing per-project caps are 200 prompt versions and 100 answer records (incl. history), 20
answer-set style bounds elsewhere. This packet adds: **200 panel versions** per project (mirrors the
prompt-version ceiling; a project holds only a few panels, versions accrue through draft→lock) and
**20 brand runs** per project (baseline/re-test diagnostics, well under the answer ceiling). Captures
reuse the existing 100-record answer capacity unchanged; brand captures are additionally bounded by
their run's observation budget. Nothing auto-deletes, silently truncates or raises a cap.

## Requirement / test mapping

Spec §5, §8 and decision packet 3. Acceptance-test intent (all fixtures; none is live evidence):
CI11-T13/T14 (panel/round shape, brand unscheduled), T15/T16 (protocol deviation flagged not
silently comparable — read resolver), T17 (unknown model preserved — inherited), T30/T31
(dedup/provenance — hash includes capture context), T32 (capacity, no bypass), T33 (imported data is
data; verified/approval never trusted from input), T34 (cross-project isolation), T35 (no trusted
`verified`/approval flag), T40 (no collector/API/cron/automation added), T42 (deletion invalidates
dependent claims). Panel approval version, reference forgery, brand run budget/prospective approval,
and idempotency are covered by the new migration tests.

## Checks to run (UNRUN here — Codex executes)

Status honesty: successive stages ran 143 (tsc failing) → 146 → 148/147-PASS-1-FAIL → 150 → 170/6081
→ (round 5) read-ordering → (round 6) v1 10×4 grid → (round 7) the content-free erasure tombstone,
whose delta Codex ran at 30 SQL tests PASS + types PASS. The shape-guard amendment hardened the
tombstone trigger to validate the captureContext shape before casting (malformed historical captures
stay erasable, no tombstone fabricated) and strengthened the tests (malformed-capture erasability, a
live-capture project deletion, full-row content-free inspection); Codex ran that at **31 SQL tests
PASS (1.52s) but TypeScript FAILED** — `citation-protocol-migration.test.ts(1011,18)` TS2571, the
full-row `row_to_json` result was `unknown`; fixed (test typing only) with a `<{ r: Record<string,
unknown> }>` row generic, no broad `any`, assertion unchanged. Round 8 added the missing
`workspace_meta FOR UPDATE`+`FOUND` serialization gate to the three panel/run write RPCs; the migration
was then released into main (`bd0…` integrated at `fc33…`) and RENAMED to the unapplied
`20260920190000_citation_protocol.sql` (old `…170000` is historical), after which Codex ran the full
suite at **6265 PASS / 63 focused, with types + lint + build PASS and security clean**. Round 9 (this
turn) adds, in the renamed candidate + the TS contract/resolver/server + the two P2 test files + these
docs only: (1) ten-DISTINCT-question enforcement at lock (SQL grid guard, `lockedPanelSchema`, and the
resolver's `gridValid`); (2) content-free erased-slot resolution (`read_citation_protocol` returns
`tombstones`, `citationProtocolStateSchema.tombstones`, `resolveErasedSlots`, and `erasedSlots` on
`readResolvedCaptures`). Codex then ran the round-9 delta at **104 PASS / 1 FAIL of 105 focused
(2.01s), tsc NOT run because of the failure** — the sole failure was the round-9 service-role RLS
assertion still expecting `{ panels, brandRuns }` without the new `tombstones: []`. Round 10 (this turn)
corrects that test expectation and adds: the canonical erased-aware report `citationReport`/
`citationReports` wired into `readResolvedCaptures.reports` (so erased facts change the counts, not just
ride alongside), a permissive `erasedSlotFactSchema` so malformed historical tombstones never break the
read (classified `excluded`, budget still consumed), and a stale-read reconciliation that drops a live
capture whose slot has a newer tombstone (a delete-between-reads is reported as erased, not a positive);
Codex ran that delta green (**152 focused tests PASS in 2.06s, tsc PASS**). Round 11 (this turn) makes
the erasure read content-safe and bounded (only grid-shaped `questionId` transmitted; malformed rows →
a content-free `tombstoneExcluded` count; `LIMIT`-bounded) so an arbitrary/empty/overlength historical
`questionId` can neither break the read nor leak deleted content, and computes `consumed` budget from
TRUSTED facts (`tombstoneBudget` per-run row counts + live originals, reconciled) so two historical
originals at one slot count as consumed 2 / erased-unique 1 — `citationReport` now takes a
`CitationErasure` bundle; Codex ran that delta at **154 focused tests PASS in 2.06s, types PASS**.
Round 12 made `consumed` an authoritative SQL aggregate (`runConsumed`) and added truncation-aware
bounded coverage (`erasureByVersion`/`erasureOverflow`, nullable `neverObserved`); Codex ran that delta
at **127 focused tests PASS + types PASS**, and the full suite at **6291 tests PASS in 46.54s with
build + lint PASS** (a formatter-only exception applied), committed `e99dabb9` and cherry-picked into
PR146 (`5b3939fc`). Round 13 began the P1 4057186213 fix (chain-root identity reconciliation) but ran it
AFTER resolution; Codex then found types FAIL (TS18048, a fixture `.find(...)` possibly-undefined) with
130 focused tests, 4 PASS at 2.22s. Round 14 (this turn) delivers the coherent fix: reconcile the
deleted chain on the RAW evidence BEFORE resolution (so a collapsed sibling is never discarded — the
true delete-between-reads race with two independent originals at one slot now keeps the real survivor,
order-independent), expose a survivor that shares a slot with a known erased original as
`erased_duplicate_slot`/`protocol_deviant` (no silent success), guard the fixture narrowing, and revise
the round-13 truncation claim (reconciliation is exact within the LIMIT; beyond it, `coverageComplete`
false already flags the incompleteness rather than claiming no stale content). `citation-protocol.ts`
(bounded defaulted `erasedSlotKeys` param) + `citation-protocol.server.ts` + P2 tests + docs only; no
SQL/schema change; Codex ran that at **133 focused tests PASS, 6297 full PASS in 46.66s, types + lint +
build PASS**. Round 15 (this turn) fixes P2 4057264542: the tombstone READ schemas used Zod `.uuid()`
(RFC 4122) but the trigger/`uuid` column accept any canonical-hex value, so a historical non-RFC id
(e.g. `00000000-0000-0000-0000-000000000001`) failed the whole protocol read; a READ-ONLY `pgUuid`
(canonical hex) now types the DB-derived identity fields (`erasedSlotFactSchema` answerId/panelId/
brandRunId, `runConsumedSchema.runId`, `erasureByVersionSchema.panelId`), identity-only and with all
write/auth `.uuid()` rules unchanged — `citation-protocol.ts` + P2 tests + docs only, no SQL change.
**All prior counts — 6297/PASS and the 133-focused-PASS run included — are a prior stage and do not
carry over**; every check below, including the new non-RFC-identity read tests, is UNRUN in this
worktree and must be re-executed by Codex. No released SQL, released `citation-panel.ts`, global
migration inventory, or P3/R09 file was touched (the last commit `777ee67f` — Codex's doc rollback
inventory fix — is preserved); USD50/manual-free is unchanged. The prepared deploy SQL /
expected-identity artifacts are STALE — never execute them; nothing here is deployed.

- `npx vitest run src/lib/citation-protocol.test.ts`
- `npx vitest run src/lib/citation-protocol.functions.test.ts`
- `npx vitest run src/lib/citation-protocol-migration.test.ts`
- Regression: `npx vitest run src/lib/answer-evidence.test.ts src/lib/answer-evidence.functions.test.ts src/lib/answer-evidence-migration.test.ts src/lib/citation-panel.test.ts src/lib/citation-intelligence-scope.test.ts`
- `npx tsc --noEmit` (types) and the repository lint task.

The migration test loads `20260909200000_project_knowledge.sql`,
`20260910210000_answer_evidence.sql` and the new `20260920190000_citation_protocol.sql` into PGlite,
so it validates the new SQL against the actual prior schema without applying anything to a database.

## Migration / rollback

One new, **unapplied** migration adds three tables, six functions and one trigger. It depends on existing `assert_knowledge_project`, `ai_visibility_prompts`, `ai_answer_evidence`, `workspace_entities` and the account serialization row. It does not alter or replay released migrations. P1 artifact staging is already released; it is outside this rollback.

If rollback becomes necessary, first disable or roll back callers of these P2 RPCs and inspect later dependencies. Preserve any owner-required evidence before considering table removal: dropping these tables destroys panel approvals, run budgets and content-free erasure history. This is a rollback inventory, not an executed or pre-authorized destructive operation.

Remove objects in dependency order, using explicit names and signatures, without `CASCADE`:

1. Drop trigger `tombstone_citation_capture` **ON `public.ai_answer_evidence`**. This detaches the new behavior from the existing answer-evidence table.
2. Drop the five service RPCs: `public.read_citation_protocol(uuid,text)`, `public.save_citation_panel_draft(uuid,text,uuid,integer,jsonb)`, `public.lock_citation_panel(uuid,text,uuid,integer)`, `public.approve_citation_brand_run(uuid,text,uuid,uuid,integer,integer,integer)`, and `public.save_citation_capture(uuid,text,jsonb)`.
3. Drop internal trigger function `public.tombstone_citation_capture()`.
4. Drop `public.citation_brand_runs` before its referenced `public.citation_panels` table, and drop `public.citation_capture_tombstones` as well. These are all three tables created by this candidate.
5. Verify that all six functions, all three tables and the trigger are absent, and that the legacy answer/knowledge objects and their existing triggers remain present. Reconcile the migration journal through the established release procedure; never edit an applied migration or silently reapply it.

If later released objects depend on P2, stop the removal and plan their compatible rollback first. Removing P2 does not reverse already stored answer evidence, and loss of erasure history means previous consumed-slot guarantees cannot be assumed after a future reinstall.

## Limitations and P3 dependency

- No UI (P4), no findings/improvements store (P3), no native parser (P5).
- Human-reviewed capture facts (own-citation, mention, recommendation, support, accuracy) and the
  descriptive counts belong to P3; this packet stops at storing and resolving capture provenance and
  slot outcome. `panelCounts`/`comparablePairs` (PR137) already accept the review facts P3 will add.
- Capture-level and panel-level deletion beyond project deletion reuse the existing
  `remove_ai_answer_evidence` path and project cascade; a dedicated panel-retirement RPC is deferred
  to P3/P4 and is not forged here.
- Real acceptance still requires an owner-approved locked panel, owner-run captures and a signed-in
  round trip; unit/migration tests and this document do not establish it.
- Owner Swedish pilot approval is PENDING; no draft is auto-locked and no fixture is saved live.
- The USD50/month global AI cap and manual-AI free grants are unchanged; this packet makes no
  provider/API/OAuth/scheduler/email/paid-data call and applies no migration.
