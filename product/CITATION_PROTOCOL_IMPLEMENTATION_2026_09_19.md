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
evidence result is in, then a valid new capture resolves `complete`. (Superseded by Review round 16:
`readResolvedCaptures` now reads the whole report from a SINGLE snapshot via one `read_citation_protocol`
RPC, so there is no longer a two-read ordering to sequence; the deterministic ordering regression was
replaced with a single-RPC assertion.)

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
- **Evidence-before-protocol read race.** (Superseded by Review round 16, which removes the two-read
  window entirely by reading answers, panels, runs and erasure from a SINGLE `read_citation_protocol`
  snapshot; the reconciliation below remains correct and is now exercised on the raw answers of that one
  snapshot.) A capture deleted BETWEEN the two reads shows live in the
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

### Review round 16 — return the whole report from a SINGLE database snapshot (P2 4057295124)

`readResolvedCaptures` read `readAnswerEvidence` (`read_ai_answer_evidence`) and then
`readCitationProtocol` (`read_citation_protocol`) as TWO separate statements — two database snapshots.
A capture committed between them appeared in the second read's authoritative consumption while its
evidence answer was still absent from the first, exposing consumed budget with no corresponding
capture. The round-5/round-10 "evidence FIRST, then protocol" ordering narrowed but did not eliminate
this: two statements still take two snapshots, and one RPC alone is insufficient if it runs multiple
volatile statements. This supersedes those earlier sequential-read rationales for the resolved-capture
path.

- **Fix (candidate SQL + `citation-protocol.server.ts`):** `read_citation_protocol` already built its
  payload from ONE `jsonb_build_object` SELECT (a single snapshot for every sub-select). It now carries
  an `answers` field as its first key, built exactly like the released `read_ai_answer_evidence`
  (`document || jsonb_build_object('id', id, 'createdAt', created_at, 'hash', document_hash)` ordered
  `created_at DESC, id DESC`, same owner/project predicate), so evidence answers, panels, brand runs,
  content-free tombstones, authoritative `runConsumed`, `erasureByVersion` and `erasureOverflow` all
  come from ONE snapshot. `readResolvedCaptures` now issues a single RPC and derives everything from
  `protocol.answers` — reconciling tombstoned chain roots on the raw answers BEFORE resolution,
  resolving surviving captures, erased slots, per-run consumption and reports — with no second read.
- **Contracts preserved.** The released `read_ai_answer_evidence` RPC and `readAnswerEvidence` helper
  are unchanged and still used by the standalone evidence path (`importManualCapture`); their public
  API is byte-compatible. `citationProtocolStateSchema` gains `answers: z.array(evidenceRowSchema)` as a
  **REQUIRED** field (bounded to the 100-record cap, NO default): the observation payload is the
  numerator the consumed-budget aggregate is measured against, so a snapshot that omits `answers` must
  FAIL the read loudly rather than parse to an empty evidence set that would let a nonzero `runConsumed`
  masquerade as "consumed budget, zero observed / never-observed". The candidate was never deployed, so
  there is no answers-less report shape to keep compatible; a genuinely empty snapshot still passes as
  `answers: []`. (The content-free erasure aggregates stay optional-with-default — they are not the
  observation payload.) The round-15 read-only `pgUuid` acceptance, tombstone identity /
  correction-chain / duplicate demotion / exact SQL consumption / truncation reporting and strict write
  authentication are all unchanged. The `read_citation_protocol` signature `(uuid, text)` is unchanged,
  so the rollback inventory (signatures/order) is unaffected.
- Tests: the mocked server unit tests now assert the resolved read makes exactly ONE RPC
  (`read_citation_protocol`) and throws on any other, so a second snapshot boundary cannot be
  reintroduced; a snapshot that reports a nonzero `runConsumed` but omits `answers` FAILS the read
  (well-formed consumption, missing observation payload — the masquerade is rejected) while a genuinely
  empty `answers: []` snapshot still reads as an empty report; an independent survivor sharing a slot
  with an erased original is preserved and flagged `erased_duplicate_slot` from one snapshot; a
  surviving correction leaf at an erased sibling's slot is preserved. A real-PGlite test reads capture,
  consumption, a correction leaf and a deletion coherently from one snapshot.
- **Coherence scope (accurate).** The snapshot guarantee is ARCHITECTURAL: every payload component is
  built by ONE SQL statement (`read_citation_protocol`'s single `jsonb_build_object` SELECT), which in
  PostgreSQL observes one MVCC snapshot for all its sub-selects — so answers, consumption and erasure
  cannot come from different points in time. The tests are single-connection coherence checks that
  verify the caller issues one RPC and parses it atomically; they do NOT run concurrent connections and
  do NOT empirically prove cross-connection/multi-transaction isolation. No cross-connection atomicity
  is tested or claimed.

### Review round 17 — reserve a lock slot per pending draft head so an owner is never stranded (P2 4057367487)

`save_citation_panel_draft` and `lock_citation_panel` both APPEND an immutable row to `citation_panels`
(a draft version, then a separate locked version), under one per-project 200-row cap. The draft guard
counted only current rows (`count(*) >= 200`), so an owner could fill the project to 200 with drafts and
then have every `lock_citation_panel` — which must append the locked version row — rejected by the same
`>= 200` guard. With no panel deletion or retirement RPC (immutable history, by design), the owner was
stranded.

- **Fix (candidate SQL only).** `save_citation_panel_draft` now admits a draft only if, AFTER inserting
  it, the row count PLUS one RESERVED lock slot for every pending draft head still fits within 200. A
  "pending head" is a panel whose latest version is a draft (it will append exactly one row when locked).
  The guard adds: current `count(*)` + `pending` (count of pending heads, via `DISTINCT ON (panel_id) …
  ORDER BY panel_id, version DESC` filtered to `status='draft'`) + this insert's own new head (1 unless
  the panel's current head is ALREADY a draft — a revision keeps the same single head, delta 0), and
  rejects at `>= 200`. This makes creating/revising one panel unable to consume the lock slot reserved
  for another pending head; repeated revisions of one head spend real rows but never a SECOND reservation.
  `lock_citation_panel` CONSUMES a head's own reservation (row +1, pending −1), so the count plus
  outstanding reservations never grows; its physical `>= 200` guard stays as a fail-closed backstop and
  is provably never triggered for a valid pending head (the draft-time reservation keeps the count ≤ 199
  whenever a pending head exists). It deliberately does NOT re-reserve, which would wrongly reject the
  final pending head.
- **Untouched.** No deletion/retirement of historical versions, no change to the 200 read/write cap
  (`MAX_PANEL_VERSIONS` and the read schema stay 200), no in-place mutation, no new retirement feature.
  The three draft-origin cases (new panel, revision of a pending head, draft on top of a locked head) are
  handled by the single delta rule above. Write auth, the grid guard, question binding, the workspace_meta
  row-lock serialization and the brand-run/answer caps are unchanged. The `save_citation_panel_draft` and
  `lock_citation_panel` signatures are unchanged, so the rollback inventory (signatures/order) is
  unaffected — only two function bodies changed.
- Tests (real PGlite via the draft/lock services, near the 200 boundary using a direct-write locked-panel
  fixture): a final admissible draft is accepted and then LOCKS (the pre-fix stranding is gone); a
  brand-new panel is refused when it would consume a pending head's reserved lock slot (specific
  `citation_panel_capacity` via direct SQL, generic via the wrapper) while that head still locks; two
  pending heads both remain lockable up to the reserved capacity; a revision is refused when every
  remaining slot is reserved for other heads' locks yet those heads still lock, and a revision is admitted
  when a free slot remains without opening a second reservation; and the reservation is project-scoped (a
  full project does not block a fresh one). Scope isolation and the missing-workspace serialization guard
  are unchanged.

### Review round 18 — surface additional erased attempts at one slot, never silently drop them (P2 4057410893)

`resolveErasedSlots` collapses multiple tombstones for one slot to a single erased fact (and skips a slot
a live capture holds). That is correct for PLANNED coverage — a slot must not be double-counted — but the
ADDITIONAL erased attempts were then silently dropped: two historical originals erased at one discovery
grid slot read as `erased 1, excluded 0`, hiding the second attempt entirely.

- **Fix (candidate SQL + P2 report layer).** `read_citation_protocol`'s `erasureByVersion` now also
  returns `duplicateRows` per bounded panel version: the EXACT count of additional grid erased attempts
  beyond one per slot — `count(*) − count(DISTINCT (question_id, round, brand_run_id))` over grid-shaped
  tombstone rows for that version. It is computed over the FULL tombstone set (not the LIMIT-bounded
  transmitted `tombstones`), so a truncated transmit can never hide an extra attempt; it is content-free
  (only counts). `citationProtocolStateSchema.erasureByVersion` gains `duplicateRows`; the service folds
  it into `CitationErasure.extraAttemptsByVersion`, and `citationReport` exposes it as a new
  `erasedExtra` field. `erased` stays one-per-slot (planned coverage never double-counted); `erasedExtra`
  is the explicit duplicate/extra-practice count. `resolveErasedSlots`' collapse is unchanged (its comment
  now records that the dropped attempts are surfaced exactly via the aggregate, not lost).
- **Coverage of the reviewer's cases.** Two erased originals at one slot → `erased 1` + `erasedExtra 1`.
  A fully erased correction chain tombstones only the ORIGINAL (supersedes null) → `erased 1`,
  `erasedExtra 0` (corrections never look like duplicate practice). A live original with an erased
  same-slot sibling → the live capture holds the slot (`erased 0`) and its ambiguous history is surfaced
  as a `protocol_deviant` OUTCOME (`erasedExtra 0`). A brand run's `consumed` (live originals + each
  tombstone row) is the existing authoritative SQL aggregate — unchanged. Under truncation `erased` stays
  a floor with `coverageComplete false`/`neverObserved null` as before, while `erasedExtra` remains exact
  (from the aggregate). No deleted content is ever returned; the grid-only content-free transmit, the
  read-only `pgUuid` identity guard, ownership scoping, and the new-capture one-per-slot write guard are
  all unchanged.
- Tests: a pure-report unit test (one erased slot + `extraAttemptsByVersion 1` → `erased 1`,
  `erasedExtra 1`, `excluded 0`, `neverObserved 39`) and real-PGlite tests — two historical originals at
  one discovery slot, released delete of BOTH → `erased 1` + explicit `erasedExtra 1`; the same
  order-independently, asserting the exact `erasureByVersion.duplicateRows`/`gridRows` aggregate; a fully
  erased correction chain → `erasedExtra 0`; and a mixed live/erased sibling → deviant outcome with
  `erasedExtra 0`. No unproven concurrency/truncation claims.

### Review round 19 — compare brandRunId by UUID value, not raw text (P2 4057741410)

`save_citation_capture` casts `captureContext.brandRunId` to a uuid (`v_run`) for FK resolution but
persists the client's ORIGINAL document verbatim, so the stored brandRunId string keeps its original
spelling (possibly UPPERCASE / mixed-case). Yet the budget count and `runConsumed` compared that raw
text to `run_id::text`, which Postgres renders as canonical LOWERCASE. An uppercase original therefore
escaped the count — evading the observation budget and under-reporting consumed — and the raw-text
same-slot and correction comparisons could likewise mis-judge identity (a duplicate slipping through, a
legitimate correction wrongly rejected).

- **Fix (candidate SQL only).** A new internal `IMMUTABLE` helper `public.citation_ctx_run(text)` returns
  the NORMALIZED uuid value for any Postgres-castable uuid spelling and `NULL` for a malformed/absent one
  (`RETURN p_text::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN NULL`), so a read never
  throws on bad history and a malformed run identity fails closed (matches nothing). All four brandRunId
  identity comparisons now use it: `runConsumed` (read) and the budget count (`save_citation_capture`)
  match live originals by `citation_ctx_run(...) = r.run_id`/`= v_run`; the same-slot guard and the
  correction-identity check compare `citation_ctx_run(...) IS [NOT] DISTINCT FROM v_run`. The tombstone
  side already stored a normalized `brand_run_id` uuid column and now compares to `v_run` directly. This
  fixes already-persisted mixed-case data (comparison-time normalization) without rewriting any immutable
  document or hash.
- **Untouched.** No document/hash rewrite; question-id case sensitivity is unchanged (`questionId` stays
  compared as exact text); the write RPC's authoritative `v_run := (ctx->>'brandRunId')::uuid` still
  rejects a malformed brandRunId on a NEW write (fail closed); the tombstone trigger's regex-guarded cast,
  the atomic single-statement read, tombstone count/privacy, ownership scoping and the read-only `pgUuid`
  guard are unchanged. The helper is granted to no role (called only by the P2 SECURITY DEFINER functions
  as owner). The RPC signatures are unchanged; the rollback inventory gains one internal function
  (`citation_ctx_run`), dropped after its callers.
- Tests (real PGlite, run id with hex letters so upper/lower differ as text but are one uuid value; the
  uppercase originals inserted directly, since the write RPC normalizes): consumed counts an uppercase
  historical original before AND after deletion (its tombstone keeps it counted); the budget refuses a new
  capture once an uppercase original consumed it (specific `brand_run_budget_exceeded` via direct SQL,
  generic via the wrapper); the same-slot guard refuses a lowercase duplicate of an uppercase original
  (`citation_slot_occupied`); and a correction whose predecessor differs only in brandRunId case is
  accepted. No multi-connection claim.

### Review round 20 — one coherent semantic-UUID identity packet across the resolver (P2 4057793975)

Round 19 fixed the SQL brandRunId compares; this generalizes UUID identity to EVERY P2 comparison and
key. Identifiers persisted inside immutable JSON (a capture's `captureContext.panelId`/`brandRunId`, an
`supersedesId`, a panel question's `promptId`) keep the client's original spelling (a uuid accepts
UPPERCASE), while ids surfaced from uuid COLUMNS or derived via `::text` (panel-document id, approved-run
id, tombstone columns) are canonical lowercase. Raw-string comparison therefore mis-judged identity: the
confirmed case was a validly-admitted capture reading `panel_unresolved` because
`resolveStoredCaptures` compared `p.panelId === context.panelId` across the case gap; the same gap hit
brand-run resolution, correction lineage, the slot/erased keys, tombstone reconciliation, prompt binding
and the report `runById`/`forVersion` grouping.

- **Fix — comparison/derived-representation normalization (never a stored-document rewrite).** A shared
  `canonicalUuid`/`canonicalRun` (lowercases only a uuid-shaped value; a non-uuid such as a grid
  questionId is returned UNCHANGED) is applied at every P2 identity boundary: in
  `resolveStoredCaptures` the parsed `context` has its `panelId`/`brandRunId` canonicalized ONCE, AND the
  released PR137 `protocolDeviations`/`slotOutcome` — which compare `answer.promptId` to the question
  `promptId` and run/panel ids by raw string — are fed DERIVED copies whose panel id, question promptIds
  and run ids are canonicalized plus a canonicalized `answer.promptId`, so a capture bound by uuid value
  at write time (e.g. against a panel whose question stored an UPPERCASE promptId) resolves AND stays
  eligible (not demoted with a spurious `panel_mismatch`/`prompt_mismatch`); plus the correction-lineage
  set, panel/brand-run matching and the slot key; in `resolveErasedSlots` the panel/run matching and the
  shared slot key; in `citationReport` the `forVersion` filter, `runById` map, both slot loops and the
  per-run output; in the server `readResolvedCaptures` the chain-root map, tombstoned-root set, tombstone
  slot key, consumed-by-run map and the `importManualCapture` prompt binding. `citation-panel.ts`
  (released) is NOT edited — only the P2 data handed to it is normalized; questionId and question TEXT
  stay verbatim.
- **SQL (candidate) parallel comparisons.** `save_citation_capture` now compares `panelId` and the
  question `promptId` by UUID value too, reusing the round-19 `citation_ctx_run` normalizer (a generic
  uuid-value helper) — every call is schema-qualified as `public.citation_ctx_run(...)` because the
  function runs under `SECURITY DEFINER SET search_path=''` and an unqualified call cannot resolve. A
  `v_panel` uuid is derived once and used for panel resolution, the same-slot guard, correction identity
  and the brand-run lookup, and the question binding matches `public.citation_ctx_run(question.promptId)`
  to the capture's `prompt` uuid. So a panel whose question stored an UPPERCASE promptId, or a mixed-case
  capture panelId, is admitted and bound rather than rejected. No new SQL object (helper reused), so the
  rollback inventory is unchanged.
- **Correction to the first round-20 attempt (this packet).** The initial round-20 edit shipped two
  defects that a Codex run surfaced (180 PASS / 47 FAIL, `tsc` not reached): the two new SQL helper calls
  were UNqualified (`citation_ctx_run(...)`), which cannot resolve under `search_path=''` and failed every
  capture write with a wrapper-masked `citation_protocol_unavailable`; and the released
  `slotOutcome` still saw a raw `answer.promptId`/question `promptId`, so an uppercase-stored question
  promptId kept demoting a valid capture. Both are fixed here (schema-qualified calls; normalized
  panel/runs/answer promptId into the released helpers), and a direct-SQL admission assertion now surfaces
  any root SQL error instead of the wrapper hiding it.
- **Untouched.** Question ids and prompt/answer text stay EXACT (case-sensitive) comparisons; immutable
  documents/hashes are never rewritten; strict write validation (the authoritative `::uuid` casts that
  reject a malformed NEW identifier) is unchanged; the read-only `pgUuid` acceptance and ownership
  scoping are preserved.
- Tests: pure-resolver unit tests — a mixed-case brand capture resolves eligible (complete) and the
  report groups it (observed/consumed 1, excluded 0); a correction chain links across case (only the leaf
  resolves, no spurious duplicate); a survivor is flagged `erased_duplicate_slot` across case. Real
  PGlite (letter-containing ids) — an UPPERCASE-identifier capture (question promptId, panelId,
  brandRunId) is admitted AND read back resolved + eligible + counted (not excluded); a lowercase
  duplicate at the same slot is refused (`citation_slot_occupied`); a lowercase correction of the
  uppercase original is accepted without double-charging; and an erased uppercase capture reconciles to an
  erased slot with consumed budget preserved.

### Review round 21 — enforce ONE v1 discovery baseline + close the legacy-intake case bypass (P2 4057895762 / 4057895765)

Two confirmed findings, one packet.

- **One project-scoped v1 discovery baseline (4057895762).** Spec §§2/5.2/5.3 (lines 34/38/47/205/430):
  v1 is exactly one manual consumer surface and ONE immutable approved 10×4 discovery panel version;
  changing protocol mid-pilot is a methodology break. `lock_citation_panel` only serialized/checked the
  chosen panel_id's own versions, so a project could lock a SECOND discovery baseline — a different
  discovery panel_id (parallel experiment) or a new version of the same panel (change mid-pilot) — silently
  authorizing a contradictory experiment. Fix (candidate SQL): under the account's `workspace_meta` lock
  already held, `lock_citation_panel` now refuses a discovery lock when the project already holds ANY
  locked discovery version (`document->>'kind'='discovery' AND document->>'status'='locked'`) →
  `citation_discovery_baseline_exists`. Editable drafts and every prior locked version remain (immutable
  audit history is never deleted); brand panels/runs are a separate opt-in and are exempt; an exact re-lock
  is still caught earlier by the version check, so idempotent behavior is unchanged. Read-side honesty: a
  project with HISTORICAL multiple locked+approved discovery baselines (pre-guard / direct writes) is NOT
  presented as one valid experiment — `resolveStoredCaptures` counts distinct locked+approved discovery
  `(panelId, version)` pairs and, when >1, flags every resolving discovery capture
  `discovery_baseline_ambiguous` and demotes a would-be `complete`, so the raw data stays inspectable but
  never reads as a clean single-baseline measurement. No new SQL object; rollback inventory unchanged. This
  is the accepted single-baseline rule only — no owner-pilot approval is invented and no multi-experiment
  platform is added.
- **Legacy-intake case bypass (4057895765).** `answer-evidence.server.ts` predecessor find used raw
  `a.id === input.supersedesId`; an UPPERCASE accepted-UUID `supersedesId` missed the canonical-lowercase
  DB id, BYPASSING `evidence_capture_correction_requires_context` and letting a context-less legacy write
  silently supersede (and, via the resolver, drop) a capture-bound observation. Fix: both the predecessor
  find AND the prompt find now compare by semantic UUID value using a SHARED helper. To avoid a circular
  import (importing from `citation-protocol.server.ts` would cycle through its `answer-evidence.server.ts`
  dependency), `canonicalUuid`/`canonicalRun` moved to a new leaf module `src/lib/pg-uuid.ts` that both
  `citation-protocol.ts` (re-exporting for its dependents) and `answer-evidence.server.ts` import. This is
  a TypeScript-boundary fix per the RPC contract; no applied SQL. A legitimate legacy correction of a
  legacy (context-less) row remains allowed, across case.
- Tests: SQL — a second discovery baseline is refused at a different panel id, with a different surface,
  and as a new locked version of the same panel (`citation_discovery_baseline_exists` via direct SQL,
  generic via the wrapper); the single baseline plus separate brand panels is allowed; the rule is
  per-owner/per-project (isolation); and a directly-inserted historical second baseline reads as
  `discovery_baseline_ambiguous` with no complete observation. Pure resolver — >1 baseline flags/demotes,
  a draft sibling is not a baseline. Legacy intake — an uppercase `supersedesId` of a capture-bound row is
  refused, a legacy-of-legacy correction is allowed across case. The round-17 capacity tests are
  unchanged and remain valid: they exercise the 200-row reservation with kind-less seed rows plus at most
  one discovery lock and separate brand locks, consistent with v1/brand scope.

### Review round 22 — semantic UUID identity at the draft/lock/approve ADMISSION boundaries (P2 4057958482)

Rounds 19–20 fixed capture-path and resolver identity; this closes the same raw-string UUID comparisons at
the panel-draft/lock/brand-approve admission boundaries.

- **Confirmed: `save_citation_panel_draft` panelId (SQL + wrapper).** The SQL compared the document's
  panelId to `p_panel::text` (canonical lowercase) by raw text, so a valid UPPERCASE panelId in both the
  document and the panel argument passed the server wrapper (`draft.panelId !== id`, both uppercase) but
  then failed the SQL with `invalid_citation_panel`; and the wrapper REJECTED the same uuid spelled
  differently in the document vs the argument. Fix: the wrapper compares `canonicalUuid(draft.panelId) !==
  canonicalUuid(id)`, and the SQL compares `public.citation_ctx_run(p_document->>'panelId') IS DISTINCT
  FROM p_panel` (uuid value). The document is stored VERBATIM (immutable); the row's `panel_id` column
  stays canonical; only the comparison is normalized. A malformed panelId still fails closed.
- **Analogous boundaries fixed.** The owner-receipt checks in `lockCitationPanel` and `approveBrandRun`
  compared the server-minted `approvedBy` (canonical lowercase `p_user::text`) to the caller's `ownerId`
  raw, false-mismatching the SAME owner spelled differently; both now compare by `canonicalUuid`. The
  brand-run idempotent-retry `existing->>'panelId'=p_panel::text` now uses
  `public.citation_ctx_run(existing->>'panelId')=p_panel`, so a historical run doc whose stored panelId is
  uppercase reads as the same panel (idempotent) instead of a spurious conflict. A genuinely different
  owner, panel, or run's params still fail closed. Authorization, the strict NEW-uuid input schemas,
  version-concurrency, the single-discovery-baseline rule and all caps are unchanged; question ids/text
  stay case-sensitive; `citation_ctx_run`/`canonicalUuid` are reused (NO new subsystem, NO new SQL object,
  rollback inventory unchanged).
- Tests: real storage — an UPPERCASE panelId in both the document and the argument is accepted, stored
  verbatim, then locked, read and resolved eligible; the same uuid spelled differently in the document vs
  the argument is accepted both directions; a genuinely different document panelId is refused by the
  wrapper (`citation_panel_draft_mismatch`) AND, via direct SQL, by the guard (`invalid_citation_panel`,
  visible); a brand-run retry across a historical UPPERCASE stored panelId returns idempotently while a
  differing-budget retry still conflicts (direct SQL). Mocked — a lock/brand-run owner receipt that is the
  same uuid spelled differently is accepted, a different owner still mismatches. Failing SQL is asserted
  directly, not only through the wrapper's generic error.

### Review round 23 — key per-version erasure metadata by CANONICAL uuid (uppercase panel) (P2 4058000378)

Round 22 admitted an UPPERCASE panel DOCUMENT (stored verbatim; only the `panel_id` column is canonical).
This round closes the last un-normalized per-version key, so an uppercase panel's erased/excluded facts are
not silently dropped in the report.

- **Confirmed: `citationReport` per-version `versionKey` used the raw document panelId.** The read RPC
  produces the per-version erasure metadata (`excludedByVersion`, `coverageCompleteByVersion`,
  `extraAttemptsByVersion`, and the received-count map that decides coverage completeness) keyed by the
  CANONICAL lowercase `panel_id` column (the delete trigger casts `captureContext.panelId` into a uuid
  column), while `citationReport` built its lookup key from the raw panel DOCUMENT panelId — UPPERCASE since
  round 22. So for an uppercase panel every lookup missed: `excluded` and `erasedExtra` dropped to 0 and
  `coverageComplete` defaulted `true`, yielding a **false definitive `neverObserved`** instead of `null`.
- **Fix (one shared narrow helper, applied on both sides).** A new `panelVersionKey(panelId, version)` in
  `citation-protocol.ts` returns `` `${canonicalUuid(panelId)}:${version}` ``. Both the producer
  (`readResolvedCaptures` — the `receivedByVersion`, `excludedByVersion`, `coverageCompleteByVersion` and
  `extraAttemptsByVersion` key builders) and the consumer (`citationReport`'s `versionKey`) now derive the
  key through this one helper, so the keys can never diverge again. The producer's `panelId`/`v.panelId`
  come from uuid columns (already lowercase) so the helper is a no-op there; the fix bites on the report
  side, where the document id may be uppercase. The `discoveryBaselines` key (a baseline-identity set built
  from the already-canonical `normPanels`, independent of the erasure maps) is unchanged. questionId and
  question TEXT stay case-sensitive; the immutable panel document/hash and the exact
  counts/truncation/no-invented-coverage semantics are preserved; a different uuid or version stays a
  separate report.
- Tests: pure report — an UPPERCASE panel document with lowercase-keyed SQL erasure metadata now counts
  `excluded` (malformed) and `erasedExtra` (duplicate) and reads `coverageComplete: true`; and with the
  coverage key flagged incomplete for the uppercase panel, `neverObserved` is `null` (never a false
  definitive). Real storage — a stored-UPPERCASE discovery panel with two same-slot originals erased (one
  distinct erased slot + one duplicate) plus two malformed tombstones is read end-to-end
  (`readResolvedCaptures → citationReport`): the exact SQL aggregate is `gridRows 2 / duplicateRows 1 /
  excludedRows 2`, and the report attributes `erased 1`, `erasedExtra 1`, `excluded 2`,
  `coverageComplete true`, `neverObserved 39` to the uppercase panel version.

### Review round 24 — an immutable owner-approved weekly run schedule for discovery (P1 4058057176)

A locked discovery panel carried a `rounds` COUNT but no owner-approved dated weekly schedule, so a
capture at round 1..4 could all be the same day and still resolve `complete` — the panel did not encode
the actual "ten questions, once weekly for four weeks" methodology (spec §§5.1 Frequency, 5.2 Time, 5.3).

- **The methodology fix (contract extension, in scope).** `citation-panel.ts` gains an optional immutable
  `schedule` on `panelProtocolSchema`: for a DISCOVERY panel, one owner-approved intended weekly slot per
  round, on **Europe/Stockholm** wall-clock time, once per week. The weekly cadence is defined on the
  Stockholm wall clock (same local time, seven local days apart), so it is **DST-correct** (a spring/autumn
  transition shifts the UTC gap to 167/169 h but the local cadence holds). Optional so a historical
  pre-schedule panel still parses and reads; a NEW discovery lock REQUIRES a valid **prospective** schedule.
  Two exported pure helpers, `discoveryScheduleValid` and `discoveryScheduleDeviations`, hold the policy.
- **Enforced at every boundary.** (1) *Lock* — `lockedPanelSchema` and the candidate SQL `lock_citation_panel`
  require a discovery lock to carry a Stockholm weekly schedule with one slot per round, exact weekly cadence,
  and every slot at/after the (server-minted) approval instant (prospective; no backdated slot). A BRAND
  panel stays unscheduled and must carry none. The SQL guard is NULL-safe (`IS DISTINCT FROM` shape checks;
  a single `bool_and` whose per-row predicate makes a missing round/`intendedAt`/timezone yield FALSE, never
  a skipped NULL), so a direct call cannot slip a malformed or same-day schedule past. (2) *Capture admission*
  — `save_citation_capture` binds a discovery capture's `intendedSlotAt` to its round's approved slot
  (compared as an absolute instant, so an equivalent offset spelling still matches) and requires a truthful
  whole-minute `delayMinutes` with the run at/after the slot; a forged/same-day slot or an untruthful delay
  is refused, so four same-day captures can never be admitted as four weekly rounds. (3) *Read resolver* —
  `resolveStoredCaptures` appends the per-capture schedule deviations (`discovery_schedule_missing`,
  `discovery_schedule_invalid`, `intended_slot_mismatch`, `delay_untruthful`, `capture_window_overrun`) and
  demotes a would-be `complete` when any is present, so a historical/off-schedule capture stays inspectable
  but is never a clean weekly observation.
- **Window policy (one documented rule, DST-consistent).** A capture belongs to its round's week when its
  actual run is at/after the intended slot and strictly before the NEXT round's slot; for the LAST round the
  window ends one Stockholm WALL-CLOCK week after its slot (`stockholmWeekLater`, DST-correct — not a fixed
  168 h, which round 23's earlier draft used). The window is derived from the schedule's own weekly cadence,
  inventing no arbitrary tolerance; a late-but-same-week run stays complete with its delay recorded.
- **Preserved.** Brand diagnostics remain separately approved, unscheduled and budgeted (never forced
  weekly). Failed/missed/truncated outcomes are still surfaced as themselves (the schedule gate only demotes
  a would-be `complete`). No approval/date is ever backfilled or inferred. The original 40 planned slots and
  the week-4 re-test are unchanged; no call/scheduler/reminder/owner-pilot approval was added. The
  one-baseline, semantic-UUID, idempotency, erasure and cap invariants are untouched.
- Tests: the released helpers (valid four-week schedule; same-day / six-day / short / missing rejected;
  DST-correct cadence; per-capture deviations; the last-round window across BOTH the autumn and spring DST
  transitions). Real storage (a coherent controllable timeline — lock with a FUTURE prospective schedule via
  the real RPC, then a fixture advances the panel to its historical state so on-schedule captures land at
  now-past slots within the `[2020, now]` capture bound): lock requires a valid prospective schedule and
  rejects no-schedule / same-day / past / brand-with-schedule / malformed (missing timezone/round/intendedAt,
  wrong tz) via direct SQL; admission binds `intendedSlotAt` + truthful delay (off-schedule and lying-delay
  captures refused); four distinct weekly rounds read all `complete`; an equivalent-offset intended slot is
  accepted; a schedule-stripped (historical) panel reads `protocol_deviant`/`discovery_schedule_missing`,
  never `complete`; and the locked schedule is frozen immutably. The resolver/pure tests also cover
  same-day, untruthful-delay and missing-schedule demotion and a timezone-equivalent on-schedule complete.

### Review round 25 — TS/SQL schedule-instant precision consistency (P1 4058548632)

Round 24's TS wall clock (`stockholmParts`/`stockholmWallClock`) dropped fractional seconds while the SQL
lock compares full-precision `timestamptz` local time. A schedule whose rounds differ in fractional seconds
(e.g. round 1 at `.000`, round 2 at `.500`) therefore passed `lockedPanelSchema` but the SQL lock rejected
it (surfacing as the generic unavailable error) — a TS/SQL divergence. Separately, `Date.parse` is
millisecond-precision while `timestamptz` is microsecond, so slot-equality and delay could diverge on
sub-millisecond variants.

- **Explicit supported precision: milliseconds**, enforced identically in TS and SQL across ALL schedule
  paths — cadence validation, slot equality, delay, and the final-week window. The TS Stockholm wall clock
  now includes milliseconds (`fractionalSecondDigits: 3`, comparing millisecond-of-day), so a differing
  fractional second is a real cadence difference in both layers; `stockholmWeekLater` carries the
  millisecond so the last round's DST window is neither shifted nor stripped of its fraction.
- **Sub-millisecond precision is refused at NEW admission** (narrow): the SQL lock rejects any slot where
  `ts <> date_trunc('milliseconds', ts)`, the SQL capture RPC rejects a sub-millisecond `intendedSlotAt` or
  `capturedAt`, and `lockedPanelSchema` (via `discoveryScheduleValid`) rejects a sub-millisecond slot. A
  historical finer instant **reads fail-closed** — `discoveryScheduleValid`/`discoveryScheduleDeviations`
  return invalid/off-schedule — and the stored document is never rewritten. This avoids "solving only
  `.001`": a `.000001` variant is refused, not silently truncated, so TS and SQL cannot disagree on it.
- **Preserved:** immutable historical documents (no rewrite), truthful comparisons (a consistent fractional
  second such as all-`.500` is a valid weekly cadence and locks; the fraction round-trips verbatim), and
  every round-24 invariant. Only the candidate SQL, `citation-panel.ts` (the precision helpers) and the
  three P2 test files changed.
- Tests: pure helpers — same-fraction valid, differing-fraction invalid, sub-millisecond invalid;
  equivalent-offset with a fraction on-schedule; the DST last-round window with a `.500` fraction (within
  vs at the wall-clock boundary). `lockedPanelSchema` — same-fraction locks, differing/sub-millisecond
  rejected. Resolver — a sub-millisecond capture demotes (fail closed). Real SQL — the lock rejects
  differing-fraction and sub-millisecond schedules and locks a same-fraction one (fraction preserved on
  read); the capture RPC refuses a sub-millisecond `intendedSlotAt` (mismatch) and `capturedAt`
  (delay-untruthful), proving TS and SQL now agree.

## Files

| File | Change |
| --- | --- |
| `src/lib/pg-uuid.ts` | New (leaf, no imports). Shared semantic-UUID identity: `PG_UUID_RE`, `canonicalUuid`, `canonicalRun`. Imported by the citation-protocol layer and the legacy answer-evidence intake without a circular import. |
| `src/lib/citation-panel.ts` | Released PR137 contract, extended COMPATIBLY (round 24): an optional immutable `schedule` on `panelProtocolSchema` (`scheduleSlotSchema`/`discoveryScheduleSchema`) plus pure helpers `discoveryScheduleValid` and `discoveryScheduleDeviations` (Europe/Stockholm weekly cadence, DST-correct via `stockholmWeekLater`). Round 25: the Stockholm wall clock compares to the MILLISECOND (`fractionalSecondDigits: 3`, `stockholmWeekLater` carries the fraction) and sub-millisecond precision is refused at admission / fails closed on read (`isMillisecondPrecise`), matching the SQL lock. Additive only — the field is optional (historical panels parse unchanged) and `protocolDeviations`/`slotOutcome`/`panelCounts`/`comparablePairs` signatures/behaviour are untouched. |
| `src/lib/citation-protocol.ts` | New. Pure storage contract: `panelDraftSchema`, `lockedPanelSchema` (now also requires a valid prospective weekly schedule for a discovery lock / no schedule for brand), `citationProtocolStateSchema`, `brandRunApprovalSchema`, `parseManualCaptureInput`, `resolveStoredCaptures` (semantic-uuid identity; discovery-baseline-ambiguity flag; per-capture weekly-schedule gate), `citationReport`/`citationReports`, caps. Exports the shared `panelVersionKey(panelId, version)`. Re-exports `canonicalUuid`/`canonicalRun` from `./pg-uuid`. Reuses PR137 schemas; never redefines them. |
| `src/lib/citation-protocol.server.ts` | New. Service RPC helpers: read, save draft, lock, approve brand run, import capture, read+resolve. Owner/time/approval derived server-side; network-free. Draft panelId, prompt binding and the lock/brand owner-receipt checks compare by SEMANTIC uuid value (`canonicalUuid`); the per-version erasure-metadata maps are keyed via the shared `panelVersionKey`. |
| `src/lib/citation-protocol.functions.ts` | New. Six `requireSupabaseAuth` endpoints, each refusing an owner mismatch and never accepting a client approval/reviewer/timestamp. |
| `src/lib/citation-protocol.test.ts` | New. Pure-contract + mocked-server unit tests. |
| `src/lib/citation-protocol.functions.test.ts` | New. Endpoint authentication/validation tests. |
| `src/lib/citation-protocol-migration.test.ts` | New. Real PGlite SQL round trips (isolation, auth, missing project, reference forgery, approval version, protocol binding, capacity, deletion, idempotency). |
| `supabase/migrations/20260920190000_citation_protocol.sql` | New (one migration). Three tables (panels, brand runs, content-free capture tombstones) + five service-only SECURITY DEFINER RPCs + one internal `IMMUTABLE` helper (`citation_ctx_run`, semantic brandRunId identity, granted to no role) + an `AFTER DELETE` tombstone trigger on `ai_answer_evidence`; RLS on, project-scoped FKs, project-deletion cascade. Round 24: `lock_citation_panel` requires a discovery lock to carry a NULL-safe, prospective Europe/Stockholm weekly schedule (one slot per round, exact wall-clock cadence) and forbids a brand schedule; `save_citation_capture` binds a discovery capture's `intendedSlotAt` to its round's approved slot and a truthful delay. Round 25: both refuse sub-millisecond precision (`date_trunc('milliseconds', ...)`), the supported precision that matches the TS validator. |
| `src/lib/answer-evidence.ts` | Additive only: optional opaque `captureContext` on `answerEvidenceSchema` so reads tolerate capture-bound records. Legacy documents are byte-identical (field absent). |
| `src/lib/answer-evidence.server.ts` | Additive only: `importAnswerEvidence` refuses a capture context (legacy path stays capture-blind; captures must use the panel-aware path), and now compares the predecessor and prompt by SEMANTIC uuid value (`canonicalUuid` from `./pg-uuid`) so an UPPERCASE `supersedesId` cannot bypass `evidence_capture_correction_requires_context`. |
| `product/CITATION_PROTOCOL_IMPLEMENTATION_2026_09_19.md`, `evidence/citation-protocol-storage-2026-09-19.md` | New. This doc and the evidence record. |

No other files were touched. `citation-panel.ts` is extended ONLY additively (round 24: an optional
`schedule` field + two pure helpers; existing exports/behaviour unchanged). `citation-finding.ts`,
`native-ai-*`, the released P1/answer-evidence SQL migrations, design/evidence and all conversation files
are unmodified.

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
write/auth `.uuid()` rules unchanged — `citation-protocol.ts` + P2 tests + docs only, no SQL change;
Codex ran round 15 at 135 focused PASS / 6299 full PASS. Round 16 (this turn) fixes P2 4057295124: the
resolved read no longer takes two snapshots (`readAnswerEvidence` then `readCitationProtocol`). The
candidate `read_citation_protocol` now also returns `answers` from its single `jsonb_build_object`
snapshot (built like the released `read_ai_answer_evidence`), `citationProtocolStateSchema` gains a
**required** bounded `answers` field (NO default, so a snapshot that omits the observation payload while
reporting consumed budget fails the read loudly instead of masquerading as empty evidence; a genuinely
empty snapshot still passes as `answers: []`), and `readResolvedCaptures` derives the whole report
(answers, panels, runs, tombstones, authoritative consumption, coverage) from that ONE RPC — closing the
window where a capture committed between the two reads exposed consumed budget without its evidence. The released
`read_ai_answer_evidence`/`readAnswerEvidence` contract, the round-15 `pgUuid` read acceptance,
tombstone identity / correction-chain / duplicate demotion / exact SQL consumption / truncation
reporting / strict write auth, and the `read_citation_protocol(uuid,text)` signature (so the rollback
inventory) are all unchanged — candidate SQL + `citation-protocol.server.ts`/`.ts` + P2 tests + docs
only. Round 17 (this turn) fixes P2 4057367487: `save_citation_panel_draft` now reserves one eventual
lock slot per pending draft head within the 200-row cap (row count + pending-head reservations + this
insert's own new head < 200), so an owner can never fill the project to 200 with drafts and then be
unable to lock; `lock_citation_panel` consumes a head's own reservation and preserves the others (its
physical `>= 200` guard is a never-triggered backstop for valid pending heads). No deletion/retirement,
no cap change (still 200 read/write), no in-place mutation; the `save_citation_panel_draft` /
`lock_citation_panel` signatures are unchanged, so the rollback inventory is unaffected — only two
candidate SQL function bodies plus the P2 migration tests and these docs changed. Round 18 (this turn)
fixes P2 4057410893: `resolveErasedSlots` collapsed same-slot tombstones for coverage but silently
dropped the ADDITIONAL erased attempts (two erased originals at one slot read as `erased 1, excluded 0`).
`read_citation_protocol.erasureByVersion` now also returns an exact content-free `duplicateRows` (grid
rows − distinct question/round/run slots, over the FULL tombstone set, not the LIMIT-bounded transmit);
`citationProtocolStateSchema.erasureByVersion` gains `duplicateRows`; the service folds it into
`CitationErasure.extraAttemptsByVersion` and `citationReport` exposes a new `erasedExtra` field, so
`erased` stays one-per-slot (planned coverage never double-counted) while the extra practice is surfaced
exactly, not hidden — corrections (root = one attempt) and a live+erased sibling (deviant outcome)
contribute 0, brand `consumed` is unchanged, deleted content is never returned, and the `pgUuid`/ownership
guards and new-capture one-per-slot write guard are unchanged. The `read_citation_protocol(uuid,text)`
signature is unchanged, so the rollback inventory is unaffected. Round 19 (this turn) fixes P2 4057741410:
`save_citation_capture` cast `captureContext.brandRunId` to a uuid but persisted the ORIGINAL spelling, so
the budget count and `runConsumed` compared raw (possibly UPPERCASE) text to the canonical-lowercase
`run_id::text` — an uppercase original escaped the count (evading the budget, under-reporting consumed) and
the raw-text same-slot / correction checks could mis-judge identity. A new internal `IMMUTABLE` helper
`citation_ctx_run(text)` normalizes any castable uuid spelling to its value (NULL for malformed, so reads
never throw and a bad run identity fails closed); all four brandRunId comparisons (budget, `runConsumed`,
same-slot guard, correction identity) now match by uuid VALUE. No document/hash rewrite, questionId case
sensitivity unchanged, atomic read / tombstone privacy / ownership guards unchanged; the RPC signatures are
unchanged and the rollback inventory gains one internal helper dropped after its callers — candidate SQL +
P2 migration tests + docs only. Round 20 (this turn) fixes P2 4057793975 as ONE coherent identity packet:
raw-string UUID comparison throughout the P2 resolver/reconciliation/report (a capture's mixed-case
`context.panelId` read as `panel_unresolved`, brand-run/correction/slot/prompt/report grouping likewise)
now normalizes via a shared `canonicalUuid`/`canonicalRun` at every comparison and derived key — including
canonicalizing the parsed `context` once so the released PR137 helpers see canonical identities (the
capture stays eligible, not just resolved) — and the candidate SQL compares `panelId` and the question
`promptId` by uuid value too (a `v_panel` and the reused `citation_ctx_run`), plus `importManualCapture`'s
prompt binding. Question ids/text stay case-sensitive, immutable documents/hashes are never rewritten,
strict write casts and the read-only `pgUuid` acceptance are unchanged, `citation-panel.ts` (released) is
not edited, and NO new SQL object is added (rollback inventory unchanged) — candidate SQL +
`citation-protocol.ts`/`.server.ts` + P2 tests + docs only. The FIRST round-20 attempt was defective —
a Codex run of it recorded **180 PASS / 47 FAIL (tsc not reached)** from two bugs now corrected here: the
two new SQL helper calls were unqualified (unresolvable under `search_path=''`, failing every write with a
wrapper-masked `citation_protocol_unavailable`), and the released `slotOutcome` still compared a raw
`answer.promptId`/question `promptId`. This packet schema-qualifies the calls and normalizes the
panel/runs/answer promptId into the released helpers, and adds a direct-SQL admission assertion so a root
SQL error is not masked. Round 21 (this turn) delivers two confirmed findings in one packet: (a) P2
4057895762 — `lock_citation_panel` now enforces ONE project-scoped v1 discovery baseline
(`citation_discovery_baseline_exists`) under the account lock, refusing a second discovery panel_id or a
new locked version of the same panel, while drafts/history stay and brand runs are exempt; and
`resolveStoredCaptures` flags a HISTORICAL multi-baseline project `discovery_baseline_ambiguous` (demoted,
inspectable, never a clean measurement). (b) P2 4057895765 — the legacy `importAnswerEvidence` predecessor
and prompt finds now compare by semantic uuid value via a shared leaf module `src/lib/pg-uuid.ts` (moved
from `citation-protocol.ts`, re-exported there; no circular import), so an UPPERCASE `supersedesId` can no
longer bypass `evidence_capture_correction_requires_context`. No new SQL object (rollback inventory
unchanged); `citation-panel.ts` released contract untouched; questionId/text stay case-sensitive; no
owner-pilot approval invented; candidate SQL + `citation-protocol.ts`/`.server.ts` +
`answer-evidence.server.ts` + `pg-uuid.ts` + P2 tests + docs only. Round 22 (this turn) fixes P2
4057958482: the panel-draft/lock/brand-approve ADMISSION boundaries compared uuids by raw text —
`save_citation_panel_draft` matched the document panelId to `p_panel::text` (so a valid UPPERCASE panelId
passed the wrapper but failed the SQL, and the wrapper rejected the same uuid spelled differently), and
the lock/brand owner-receipt checks and the brand-run retry compared raw. All now compare by uuid value
(`canonicalUuid` in the wrappers; `public.citation_ctx_run` in the SQL draft check and the retry), storing
documents verbatim and keeping authorization / strict NEW-uuid schemas / version concurrency /
single-discovery-baseline / caps intact; question ids/text stay case-sensitive; no new SQL object
(rollback inventory unchanged) — candidate SQL + `citation-protocol.server.ts` + P2 tests + docs only.
Round 23 (this turn) fixes P2 4058000378: `citationReport` keyed the per-version erasure metadata
(`excludedByVersion` / `coverageCompleteByVersion` / `extraAttemptsByVersion` / the received-count map) by
the raw panel DOCUMENT panelId — UPPERCASE since round 22 — while the read RPC produces that metadata keyed
by the canonical lowercase `panel_id` column, so an uppercase panel dropped its `excluded`/`erasedExtra`
counts and defaulted `coverageComplete` true (a false definitive `neverObserved`). A single shared
`panelVersionKey(panelId, version)` (canonicalizing the panelId) is now used by BOTH the server producer
and the report consumer so the keys cannot diverge; the immutable document/hash, exact
counts/truncation/no-invented-coverage and case-sensitive question ids/text are preserved, and a different
uuid/version stays a separate report — `citation-protocol.ts` + `citation-protocol.server.ts` + P2 tests +
docs only (no SQL change, rollback inventory unchanged).
Round 24 (this turn, on `a3641fef`) fixes P1 4058057176: a locked discovery panel had a `rounds` count but
no owner-approved dated weekly schedule, so four SAME-DAY captures resolved `complete`. It adds an immutable
owner-approved Europe/Stockholm weekly schedule (one prospective slot per round, once per week, DST-correct)
to the discovery protocol — a COMPATIBLE, in-scope extension of the released `citation-panel.ts`
(`panelProtocolSchema.schedule` optional + `discoveryScheduleValid`/`discoveryScheduleDeviations`) — enforced
at lock (`lockedPanelSchema` + the candidate SQL, NULL-safe), at capture admission (the candidate SQL binds
`intendedSlotAt` + a truthful delay so same-day rounds are refused) and at the read resolver (off-schedule /
missing-schedule captures demote to `protocol_deviant`, never `complete`). Brand stays unscheduled;
failed/missed/truncated evidence is preserved; no approval/date is backfilled; the 40 slots, week-4 re-test
and the one-baseline/UUID/idempotency/erasure/cap invariants are unchanged. Only the candidate SQL
(`20260920190000`), `citation-panel.ts` (compatible extension), `citation-protocol.ts`, the P2 test files
and these docs changed — no applied migration, no P3, no provider, no commit/deploy.
Round 25 (this turn, on `f555e00`) fixes P1 4058548632: the round-24 TS wall clock dropped fractional
seconds while the SQL lock compares full-precision `timestamptz` local time, so a schedule whose rounds
differed in fractional seconds passed `lockedPanelSchema` but the SQL lock rejected it (generic
unavailable) — a TS/SQL divergence; and `Date.parse` (ms) vs `timestamptz` (µs) could diverge on
sub-millisecond variants. The fix sets an explicit supported precision of **milliseconds** enforced
identically in TS and SQL across cadence, slot equality, delay and the final-week window (the Stockholm
wall clock now compares to the millisecond; `stockholmWeekLater` carries the fraction), and **refuses
sub-millisecond precision at new admission** (SQL lock + capture RPC + `lockedPanelSchema`) with a
**historical-read-fail-closed** validator — never rewriting stored evidence. A consistent fraction (e.g.
all-`.500`) remains a valid weekly cadence. Only the candidate SQL, `citation-panel.ts` (precision helpers)
and the three P2 test files changed — no applied migration, no P3, no provider, no commit/deploy.
**HONEST RUN STATUS.** The prior worktree process for round 24 terminated on a plan/credit limit, not
success; its partial Codex verification was `tsc` PASS but **150 tests PASS / 38 FAIL** in
`citation-protocol-migration.test.ts` — a **FAILED prior attempt of this work, not a passing baseline**. Two
verified causes are now fixed: (a) the future (2099) capture fixtures violated `answerEvidenceSchema`'s
`[2020, now]` `capturedAt` bound — resolved by a coherent two-anchor timeline (lock with a FUTURE prospective
schedule via the real RPC, then `backdatePanelApproval` advances the panel to a historical state with a
recent-PAST approval + schedule so on-schedule captures land at now-past slots that pass the bound); and
(b) a `round: 5` fixture built "September 35" and threw a RangeError before the out-of-panel admission was
exercised — resolved by real Date arithmetic in the slot helper. **No production future-date or
prospective-approval guard was weakened, no storage assertion was replaced with a mock, and no public
admission was bypassed to make tests pass.** All earlier PASS counts — including the latest verified Codex
baseline on `f555e00` (193 focused / 6357 full PASS, the round-24 weekly-schedule stage) — are a prior stage
and **do not carry over**; every check below — including the round-16…23 suites, the round-24
weekly-schedule tests, and the new round-25 precision tests (fractional-second cadence, sub-millisecond
refusal at lock/capture, the DST last-round window with a fraction, and lockedPanelSchema/SQL agreement) —
is UNRUN in this worktree and must be re-executed by Codex; this assistant did not run tests and claims no
PASS. The
repository-wide lint is separately RED (~3790 errors / 14 warnings, pre-existing across the repo); this
packet does NOT mass-format or claim a global-lint pass — only the SCOPED lint on the touched files applies.
The released P1 SQL migrations, global migration inventory, and P3/R09 files were not touched; the released
`citation-panel.ts` was extended ONLY additively (an optional field + two pure helpers), never breaking its
existing contract; USD50/manual-free is unchanged; a real pilot still requires genuine owner approval and a
real four weeks. The prepared deploy SQL / expected-identity artifacts are STALE — never execute them;
nothing here is deployed.

- `npx vitest run src/lib/citation-protocol.test.ts`
- `npx vitest run src/lib/citation-protocol.functions.test.ts`
- `npx vitest run src/lib/citation-protocol-migration.test.ts`
- Regression: `npx vitest run src/lib/answer-evidence.test.ts src/lib/answer-evidence.functions.test.ts src/lib/answer-evidence-migration.test.ts src/lib/citation-panel.test.ts src/lib/citation-intelligence-scope.test.ts`
- `npx tsc --noEmit` (types) and the repository lint task.

The migration test loads `20260909200000_project_knowledge.sql`,
`20260910210000_answer_evidence.sql` and the new `20260920190000_citation_protocol.sql` into PGlite,
so it validates the new SQL against the actual prior schema without applying anything to a database.

## Migration / rollback

One new, **unapplied** migration adds three tables, seven functions and one trigger. It depends on existing `assert_knowledge_project`, `ai_visibility_prompts`, `ai_answer_evidence`, `workspace_entities` and the account serialization row. It does not alter or replay released migrations. P1 artifact staging is already released; it is outside this rollback.

If rollback becomes necessary, first disable or roll back callers of these P2 RPCs and inspect later dependencies. Preserve any owner-required evidence before considering table removal: dropping these tables destroys panel approvals, run budgets and content-free erasure history. This is a rollback inventory, not an executed or pre-authorized destructive operation.

Remove objects in dependency order, using explicit names and signatures, without `CASCADE`:

1. Drop trigger `tombstone_citation_capture` **ON `public.ai_answer_evidence`**. This detaches the new behavior from the existing answer-evidence table.
2. Drop the five service RPCs: `public.read_citation_protocol(uuid,text)`, `public.save_citation_panel_draft(uuid,text,uuid,integer,jsonb)`, `public.lock_citation_panel(uuid,text,uuid,integer)`, `public.approve_citation_brand_run(uuid,text,uuid,uuid,integer,integer,integer)`, and `public.save_citation_capture(uuid,text,jsonb)`.
3. Drop the internal trigger function `public.tombstone_citation_capture()` and the internal helper `public.citation_ctx_run(text)` (a content-free `IMMUTABLE` uuid normalizer the read RPC and `save_citation_capture` call for semantic brandRunId identity; it is granted to no role and referenced only by the P2 functions dropped in step 2, so it is removed after them).
4. Drop `public.citation_brand_runs` before its referenced `public.citation_panels` table, and drop `public.citation_capture_tombstones` as well. These are all three tables created by this candidate.
5. Verify that all seven functions, all three tables and the trigger are absent, and that the legacy answer/knowledge objects and their existing triggers remain present. Reconcile the migration journal through the established release procedure; never edit an applied migration or silently reapply it.

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
