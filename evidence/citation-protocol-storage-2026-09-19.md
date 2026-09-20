# Evidence — CI-2 citation protocol storage (P2)

**Date:** 19 September 2026 · **Author:** Claude · **Base:** `main` `26b938c3`.
**Scope:** immutable panel/protocol storage, brand-run binding, manual capture context. Offline
authoring only. Nothing applied, deployed, collected or run in this session; Codex runs the checks.

## Claim boundary

- Code, one migration, tests and docs authored. **No** database migration applied, **no** deploy,
  **no** provider/API/OAuth/scheduler/email call, **no** live capture stored.
- The Swedish Appendix A/B panels are owner-review PENDING; no panel is auto-locked, no fixture is
  written into a live project. Draft ≠ approved.
- P1 raw-artifact worktree, conversation-live-fix worktree, and the eight already-applied
  conversation migrations were not read for copying, edited or replayed.

## Files authored

New: `src/lib/citation-protocol.ts`, `.server.ts`, `.functions.ts`, `.test.ts`,
`.functions.test.ts`, `citation-protocol-migration.test.ts`;
`supabase/migrations/20260919170000_citation_protocol.sql`;
`product/CITATION_PROTOCOL_IMPLEMENTATION_2026_09_19.md`; this file.
Additive edits (capture-context passthrough + legacy guard, preserving legacy intake byte-for-byte):
`src/lib/answer-evidence.ts`, `src/lib/answer-evidence.server.ts`.
Unmodified: `citation-panel.ts`, `citation-finding.ts`, `native-ai-*`, P1 migration/design/evidence,
all conversation files.

## Server-authoritative receipts (verified by construction / tests, not runtime)

- Panel lock mints `approval.approvedBy` = authenticated caller and `approvedAt` = DB clock; content
  is copied from the reviewed draft, not from the lock request. Draft carries no approval.
- Brand-run approval mints `approvedBy`/`approvedAt` server-side, binds to a locked **brand** panel
  version via FK, and is idempotent by run id (changed caps for an existing id are refused).
- Capture write resolves panel version + versioned question (prompt id + revision + exact text) +
  brand run (existence, panel/version, prospective approval, round, observation budget) before the
  legacy prompt-snapshot/hash-dedup/capacity insert into `ai_answer_evidence`. Legacy
  `importAnswerEvidence` refuses any capture context.
- RLS on both tables; `REVOKE ALL` incl. `service_role`; only the five SECURITY DEFINER RPCs are
  `EXECUTE`-granted to `service_role`. Project deletion cascades panels and runs; a deleted panel
  leaves raw captures but resolves them as `panel_unresolved` (dependent claim invalidated, raw kept).

## Post-review corrections (same disjoint files, no added scope)

- `answer-evidence.ts`: `captureContext` moved from `z.unknown()` to a bounded, finite-depth,
  JSON-serializable value schema defined in-file (no citation-layer import → no circular dependency),
  fixing the TanStack server-fn return-type break for `readAnswerEvidenceFn`/`AnswerEvidencePanel`
  while preserving legacy (absent) reads and the citation layer's strict parse. No `any`, no cast.
- `save_citation_capture`: hash dedup now precedes the brand-run budget charge, so an exact re-import
  at an exhausted run returns its persisted id instead of erroring; reference/authorization
  resolution is unchanged and still precedes dedup.
- `save_citation_capture`: a `supersedesId` correction is bound to the predecessor's same observation
  identity (panel version, run, question, round, capture instant, surface); a cross-run/panel/slot/
  time or legacy context-less predecessor is refused, so an exhausted run cannot gain unbudgeted
  observations through a "correction". Branching stays blocked by the existing
  `UNIQUE(user_id,project_id,supersedes_id)`; raw originals and deletion semantics are unchanged.
- `parseManualCaptureInput` + `save_citation_capture`: the record's own `mode`/`modelVersion` must
  agree with its `captureContext.surface.mode`/`modelLabel` (input boundary and SQL defence), so one
  record cannot assert contradictory surfaces; panel deviations remain storable, flagged evidence.
- Prospective panel approval (spec Appendix A: owner review BEFORE USE) is now enforced: a new
  capture whose `capturedAt` predates the locked panel version's DB-minted `approval.approvedAt` (or a
  missing approval instant) fails closed at write (`citation_panel_approved_after_capture`), for both
  discovery and brand; the brand run's separate prospective guard is unchanged and additional. In
  `resolveStoredCaptures`, a raw pre-approval record stays inspectable but is demoted to
  `protocol_deviant` and flagged `panel_approved_after_capture` (failures kept as themselves), with
  no change to `citation-panel.ts` and no rewrite of raw history. Capture fixtures now stamp an
  explicit historical panel approval so their captures are honestly post-approval.

## Review round 2 (active correction leaves; budget serialization assessed)

- Duplicate-slot on correction (fixed): `readResolvedCaptures` mapped all answer history and dropped
  `supersedesId`, so a valid correction resolved as a second observation for one slot. `resolveStored
  Captures` now resolves only the active leaf of each correction chain (skips records another supplied
  record supersedes), mirroring `evidenceCohorts` and handling correction-of-correction transitively;
  superseded raw rows are kept in storage (readable via `readAnswerEvidence`), just not re-counted.
  Tests: a `resolveStoredCaptures` chain (a←b←c) + unrelated capture → `panelCounts` (recorded = 2,
  no duplicate-slot throw); a real `readResolvedCaptures` roundtrip after an RPC-stored correction →
  one leaf resolved, both raw records preserved, `panelCounts` clean.
- Brand-run budget serialization (normal path serialized; missing-meta path now fail-closed):
  `save_citation_capture` calls `assert_knowledge_project(...,true)`, which locks the account's
  `workspace_meta` row `FOR UPDATE` before the count and insert (same mechanism as the released answer
  100-record capacity), so two concurrent captures for one run cannot both pass the budget. Because a
  project references `auth.users` only, that row can be absent — then the `FOR UPDATE` is a no-op — so
  `save_citation_capture` now re-takes the row `FOR UPDATE` in a single statement immediately after
  auth and fails closed (`citation_workspace_unavailable`) when no row was locked (`IF NOT FOUND`), so
  presence and lock acquisition are inseparable (a bare `EXISTS` could read a row another transaction
  committed after the helper without ever locking it here). Re-locking a row this transaction already
  holds is harmless; lock ordering/auth is preserved and no new lock is added. The change is confined
  to `save_citation_capture`; the shared `assert_knowledge_project` helper and other quotas are
  untouched. Real SQL regression: delete the account meta row (valid project + approved run retained) →
  capture fails before insert with no data mutation; restore → a normal capture succeeds; the fixture
  is restored so no test is contaminated. PGlite is single-connection and does not prove
  multi-connection concurrency; none is claimed.

## Review round 3 (context-less correction must not vanish a capture)

- The Answer panel's Correct action submits `supersedesId` with no captureContext via legacy intake;
  superseding a capture-bound row, the active-leaf resolver excluded the original and skipped the
  context-less successor, so the observation vanished from resolved counts. Fixed at two boundaries:
  (1) `resolveStoredCaptures` now only lets a record supersede another when it is itself a resolvable
  capture (captureContext parses), so a context-less or malformed successor never marks its
  capture-bound predecessor superseded — the capture stays counted; (2) `importAnswerEvidence` refuses
  a context-less correction whose predecessor is capture-bound
  (`evidence_capture_correction_requires_context`) — an actionable refusal, not silent loss —
  while legacy-of-legacy corrections still work. No released function redefined (`…10210000`
  untouched); history, slot identity, panel authorization, normal capture chains and the duplicate-slot
  guard preserved. Tests: legacy-intake/`readResolvedCaptures` roundtrip (refusal + capture still
  resolved + legacy-of-legacy works) and resolver unit cases (context-less and malformed successors).

## Review round 4 (one observation per slot; consumer-only v1 boundary)

- Duplicate slot → unreportable (fixed): two independent captures for one panel version/question/round
  passed hash-only dedup and `resolveStoredCaptures` forwarded both to `panelCounts`, whose duplicate-
  slot guard threw. Write: `save_citation_capture` now refuses a DISTINCT new original for an occupied
  slot (`citation_slot_occupied`) — identical re-imports still dedupe (hash lookup first) and
  same-observation corrections still attach (they set supersedesId); one scheduled observation per slot
  (spec §§5.2/6). Atomicity: the check+insert run under the account's `workspace_meta` row held FOR
  UPDATE (required-present), so two concurrent originals for one slot serialize and cannot both pass.
  Read: `resolveStoredCaptures` collapses any already-stored same-slot duplicates to ONE explicitly-
  invalid entry (`protocol_deviant` + `duplicate_slot`), excluding extras from counts (raw kept), so the
  report is reportable and never a silent success. Tests: SQL slot-occupancy (second original refused,
  identical dedupes, correction allowed), a resolver-to-`panelCounts` roundtrip over a directly-inserted
  duplicate (collapses to one invalid slot, recorded 1), plus a resolver unit case.
- Consumer-only v1 boundary (spec §§2, 5.2): an API surface is not a consumer substitute. Refused in
  `panelDraftSchema`/`lockedPanelSchema`, `parseManualCaptureInput`, and candidate SQL
  (`save_citation_panel_draft`/`lock_citation_panel` → `citation_panel_not_consumer`;
  `save_citation_capture` → `citation_non_consumer_surface`); `resolveStoredCaptures` demotes any
  already-stored API capture to `protocol_deviant` + `non_consumer_surface`. Consumer web/search and the
  general answer-evidence stack (which still records API answers as non-panel evidence) are unchanged.
  Tests: API refusal at schema/input/SQL and the valid consumer path. No released migration changed.

## Review round 5 (read-ordering: evidence before its append-only dependencies)

> Superseded by Review round 16: `readResolvedCaptures` now reads answers + protocol from ONE
> `read_citation_protocol` snapshot, so there is no two-read window left to order.

- `readResolvedCaptures` used `Promise.all([readCitationProtocol, readAnswerEvidence])`, so it could
  read a stale protocol snapshot against newer evidence: a capture imported concurrently with (just
  after) its panel lock / run approval could resolve against a protocol snapshot taken before those
  commits, yielding a spurious `panel_unresolved` / `brand_run_not_approved`. Fix: read evidence
  FIRST, then the protocol, sequentially (not `Promise.all`). Because a capture's panel version and
  approved run are committed before the capture, reading the protocol strictly after the evidence
  makes the protocol snapshot at least as new as the evidence, so every dependency that existed when a
  capture was written is present. Genuine deletion invalidation is preserved (a panel/run deleted
  between the two reads is still seen as unresolved); no new framework, no auth/tenant change. Test: a
  deterministic, sleep-free ordering regression holds the evidence RPC pending and asserts the
  protocol RPC does not start until the evidence result is in, then a valid new capture resolves
  `complete` against the later-read protocol.

## Review round 6 (v1 discovery is the fixed 10×4 grid)

- The released `panelProtocolSchema` allows 1..10 questions / 0..12 rounds and the SQL lock required
  only discovery `rounds ≥ 1`, so an under-sized pilot could lock/approve and read as complete
  (violating spec §5.3, CI11-T13: exactly 10 questions × 4 rounds = 40 slots). Fixed: `lockedPanelSchema`
  and SQL `lock_citation_panel` lock a discovery panel only at exactly 10 questions and 4 rounds
  (`citation_panel_grid_invalid`); incomplete/over-sized drafts still save and edit but never lock.
  `resolveStoredCaptures` flags a capture against a historical off-grid locked discovery panel with
  `panel_grid_invalid` and demotes a would-be `complete` to `protocol_deviant`, so invalid historical
  data never reads as a complete v1 measurement; missing question identities are never fabricated and
  raw records are preserved. Brand panels (unscheduled) are exempt; the released helper keeps its broad
  contract. Fixtures rebuilt to 10 distinct prompt-bound questions × 4 rounds (10 saved prompts); all
  prior approval/auth/correction/slot/budget fail-closed regressions retained, not weakened. Tests:
  table-driven under/over rounds & questions refusal (schema + SQL), valid 10×4 lock, `panelCounts`
  planning exactly 40 with 1 observed → 39 unobserved, and a resolver off-grid case. Only the unapplied
  `…170000` migration changed.

## Review round 7 (erasure must not reopen a slot or restore budget)

- The released `remove_ai_answer_evidence` hard-deletes an answer/correction chain (and a prompt or
  project delete cascades to captures), which reopened a scheduled slot and lowered a brand run's
  observation count — letting an owner erase and re-submit at the same slot / re-consume budget. Fixed
  without touching the released RPC: a new content-free `citation_capture_tombstones` table and an
  `AFTER DELETE` trigger on `ai_answer_evidence` (both in the unapplied `…170000`) record only the
  slot/budget identity of an erased ORIGINAL (panel version, brand run, question, round, answer id) —
  no answer content. `save_citation_capture`'s one-per-slot guard treats a tombstoned slot as occupied
  (`citation_slot_occupied`) and the brand budget count adds tombstones (`brand_run_budget_exceeded`),
  so erasure never reopens a slot (even for an identical re-import) or restores budget; the prompt/root
  cascade bypass is closed because the trigger fires on every row delete. Corrections/legacy answers
  occupy no slot and are skipped (legacy erasure unchanged); the trigger skips during project deletion
  and the table cascades with the project, so no orphan. Erasure obligation honored (content deleted,
  only the content-free attempt fact persists); tenant isolation, account-first serialization,
  authorization, hash-dedup-before-budget and correction chains preserved.
- Amendment (this turn): the `AFTER DELETE` trigger no longer blindly casts the historical
  captureContext. It first checks the context is a jsonb object, the slot is a jsonb object, `panelId`
  and any `brandRunId` match the uuid shape, `panelVersion`/`round` are numeric within `^[0-9]{1,9}$`,
  and `questionId` is present, before any `::uuid`/`::integer` cast — so a malformed historical
  captureContext (bad uuid, missing keys, integer overflow, non-numeric round) can no longer raise
  inside the trigger and block the user's erasure. No broad `EXCEPTION WHEN OTHERS` is added, so a
  genuine DB fault still surfaces; a malformed payload is simply erased with no tombstone written
  (never fabricating a valid occupied slot / budget). This keeps the generic evidence-deletion path
  (which may carry any legacy context) erasable while the authenticated protocol capture path still
  writes exactly one well-formed tombstone. Tests: delete-then-replacement same slot denied (direct
  SQL + wrapper, nothing re-stored), brand budget not restored, correction-chain and prompt-removal
  paths, tombstone content-free via full-row `row_to_json` inspection asserting the exact column set
  (no answer content) and tenant-scoped, malformed historical captures stay erasable with zero
  tombstones while a well-formed capture IS tombstoned, a project deletion carrying LIVE captures
  (original + correction) plus an existing tombstone cascades every content/protocol/tombstone row
  without the trigger blocking or recreating a tombstone (a second tenant's answer is preserved), and
  legacy deletion still functional.

## Review round 8 (panel/run writes must serialize like the capture path)

- `save_citation_panel_draft`, `lock_citation_panel` and `approve_citation_brand_run` call
  `assert_knowledge_project(...,true)`, but that helper's `workspace_meta` `FOR UPDATE` is a silent
  no-op when the account has no `workspace_meta` row (a project references `auth.users` only), so their
  capacity guards (`>=200` panel versions, `>=20` brand runs) could count-then-insert unserialized —
  the same gap round 2 closed for `save_citation_capture`. Fixed in the unapplied `…170000` only: each
  of the three now runs, right after the helper, one atomic
  `PERFORM 1 FROM public.workspace_meta WHERE user_id=p_user FOR UPDATE; IF NOT FOUND THEN RAISE
  EXCEPTION 'citation_workspace_unavailable'; END IF;` so presence and lock acquisition are inseparable
  and a missing account row fails closed before any count/insert. `read_citation_protocol` (a pure read,
  no capacity guard, helper called without `true`) is untouched; no released helper/SQL changed; every
  existing version/approval/capacity/owner/deletion guard still runs after this gate. Regression: one
  SQL test provisions a lockable brand draft, a locked brand v2 and prompts while the account row is
  present, deletes `workspace_meta`, then asserts each RPC fails closed — specific
  `citation_workspace_unavailable` via direct SQL, generic refusal via the public wrapper — with no
  panel draft/lock or run inserted, and finally that restoring the row lets all three succeed. Note:
  PGlite is single-connection, so this proves the fail-closed presence gate, not multi-connection lock
  contention.

## Review round 9 (ten distinct questions; erased attempts must not vanish)

Against the renamed candidate `20260920190000_citation_protocol.sql` (old `…170000` historical).

- **Ten DISTINCT discovery questions at lock.** The grid guard checked only `10 questions × 4 rounds`,
  so ten local ids all bound to ONE prompt, or ten prompts with identical COPIED text, passed as a
  false ten-question experiment. Fixed in three agreeing places: the SQL `lock_citation_panel` grid
  guard now also requires ten distinct prompt bindings (`promptId|promptRevision`) AND ten distinct
  texts; the TS `lockedPanelSchema` refuses the same via the new `v1DiscoveryQuestionsDistinct`; and the
  read resolver's `gridValid` applies the same so a HISTORICAL locked non-distinct grid reads as
  `panel_grid_invalid`/`protocol_deviant`, never `complete`. Drafts stay editable, brand panels exempt
  (rounds 0). Tests: duplicate-binding and copied-text drafts refused at lock (specific SQL error +
  generic wrapper + nothing locked), the genuine distinct 10×4 still locks, and a capture against a
  historical non-distinct grid reads as an explicit deviation.
- **Erased consumed attempts are erased slots, not absent ones.** `readResolvedCaptures` ignored the
  content-free `citation_capture_tombstones`, so a deleted observation reappeared as never-observed and
  a brand run looked under-consumed. Fix: `read_citation_protocol` now returns a content-free
  `tombstones` array (slot/budget identity only — panel version, brand run, question, round, erased
  answer id; no answer text); `citationProtocolStateSchema` gains optional-with-default `tombstones`;
  the new pure `resolveErasedSlots` re-derives each into an `ErasedSlot` (panel/run resolution mirrors
  the live resolver), EXCLUDES any slot a surviving resolved capture still occupies (no double count of
  a deleted original whose chain — or an identical re-import — still resolves), and collapses duplicate
  tombstones for one slot; `readResolvedCaptures` returns `erasedSlots` alongside `captures` (additive;
  report consumers destructuring `{ panels, brandRuns, captures }` are unaffected). An erased slot is
  thus distinct from a never-observed one, and a brand run's budget stays consumed after all its
  captures are deleted. Nothing retains erased content; tenant isolation, the read-order race fix
  (evidence before protocol) and conservative concurrency are unchanged. Tests: an erased discovery
  observation surfaces as an erased slot (read RPC returns a content-free tombstone, asserted to contain
  no `FIXTURE` text), a fully erased correction chain yields exactly one erased slot, an erased slot
  coexists with a surviving capture at another slot (each counted once), a brand run keeps two erased
  slots after every capture is deleted, no erased slot leaks across owners, plus pure-resolver unit
  tests (exclusion, duplicate collapse, unresolved panel/run). Project-deletion cascade of the
  tombstone table is already covered in the deletion suite. Note: PGlite is single-connection, so read
  ordering/concurrency claims remain conservative, not a multi-connection proof.

## Review round 10 (erased facts must count; tolerate malformed history; close the read race)

- **Service-role read expectation (test-only).** The RLS test expected `read_citation_protocol` to
  return `{ panels, brandRuns }`; the round-9 `tombstones: []` broke it. Fixed the expected contract to
  `{ panels: [], brandRuns: [], tombstones: [] }`.
- **Erased facts must reach the counts.** `erasedSlots` alongside `captures` changed no report because
  the report layer's `panelCounts` reads only live captures. Added a P2-owned canonical report
  `citationReport`/`citationReports` (in `citation-protocol.ts`, composing — `citation-panel.ts`
  untouched) that folds live outcomes AND erased facts per locked panel version: planned, observed,
  erased, recorded=observed+erased, neverObserved (explicit erased vs never-observed), an outcomes tally
  from LIVE captures only (no eligible numerator from erasure), and per-approved-run {approvedBudget,
  consumed, observed, erased} with consumed = live originals + erased attempts (budget stays consumed
  after all captures erased). Validates panel/question/round/run and de-dupes (no doubled slot).
  `readResolvedCaptures` now returns `reports` at the service boundary so erased facts cannot be
  silently dropped.
- **Malformed historical tombstones must not break the read.** The strict `erasedSlotFactSchema` would
  throw the whole read on tombstones the trigger legitimately writes (arbitrary questionId, round /
  panelVersion 0..1e9). Relaxed to the trigger's exact bounds (uuid ids, questionId 1..2000 chars,
  integers 0..2147483647); `citationReport` classifies an unmappable fact as `excluded` (run budget
  still consumed), never rejecting the read.
- **Evidence-before-protocol read race.** (Superseded by round 16: the two-read window is removed —
  answers now come from the same `read_citation_protocol` snapshot; the reconciliation below stays
  correct and runs on that one snapshot's raw answers.) A capture deleted between the two reads shows
  live in the older evidence while its tombstone is already in the newer protocol. `readResolvedCaptures` drops a
  stale live capture whose slot has a tombstone (a tombstone is only written on delete and the write
  path forbids a live capture at a tombstoned slot, so they never coexist consistently; the newer
  tombstone wins), reporting the deleted attempt as erased, not a positive. Preserves the append-only
  ordering, no released-answer SQL change; conservative single-connection boundary check, not a
  multi-connection atomicity claim. Tests: an injected ordering test (delete-between-reads → not a
  positive), SQL final-report-count tests (erased discovery slot vs never-observed; brand budget
  consumed after all captures erased), a directly-inserted malformed historical tombstone that reads
  without throwing and is `excluded` while a legitimate erased slot still counts, and pure
  `citationReport` unit tests.

## Review round 11 (content-safe/bounded erasure read; write-gate-faithful consumed budget)

- **questionId content safety + bounded read.** The trigger stores `captureContext.slot.questionId`
  verbatim (any non-null text incl. empty / 2001+ chars), so the strict `min1/max2000` schema could
  throw the whole read, leak arbitrary deleted content, and an unbounded tombstone set could hit the
  array cap. `read_citation_protocol` now transmits in `tombstones` ONLY rows whose `question_id` is a
  real grid-shaped id (`^[A-Z]{2}-[DB][0-9]{2}$`, structured ≤6 chars — never free text), `LIMIT`
  10000; malformed rows become a content-free `tombstoneExcluded` count per panel version (no text
  sent). The schema requires the grid shape (SQL-guaranteed), so a malformed historical row can neither
  break the read nor leak content; the report shows the excluded count.
- **Consumed = each tombstone row + live originals (write-gate faithful).** `resolveErasedSlots`
  collapses same-slot tombstones for coverage, so two historical originals at one run/slot under-
  reported consumed. `read_citation_protocol` now returns `tombstoneBudget` (per-run `count(*)` of
  tombstone rows, aggregated in SQL by answer id); `readResolvedCaptures` adds live originals
  (`supersedes` null, run-bound) minus any stale original the newer protocol already tombstoned
  (round-10 reconciliation, counted once via its tombstone), and passes a `CitationErasure` bundle
  (`slots`+`consumedByRun`+`excludedByVersion`) to `citationReport`. Per-run `consumed` comes from
  `consumedByRun`; `erased` stays the distinct-slot (unique-observation) count — so consumed 2 /
  erased-unique 1 for a historical same-slot duplicate, and corrections (`supersedes` set) are never
  counted as originals. Reports are wired from trusted facts, not the collapsed helper. Tests: SQL —
  empty/overlength/arbitrary questionId reads without throwing, no content transmitted, panels still
  read, excluded count visible; two erased originals at one run/slot → consumed 2 / erased 1;
  other-owner isolation (existing). Pure — the `citationReport` suite in the trusted-facts shape.
- **Residual limitations (precise).** PGlite is single-connection: the stale-read reconciliation and
  read ordering are conservative correctness at the P2 boundary, NOT a proof of multi-connection
  atomicity across the two released RPCs. `tombstones` coverage is `LIMIT`-bounded at 10000 grid slots;
  beyond that, coverage is truncated — but this is now DETECTED (`coverageComplete` false per version)
  and `neverObserved` is `null` (unknown) rather than a wrong definitive count, while `consumed`
  (authoritative SQL aggregate) and the `excluded`/overflow counts remain exact. Content safety rests on
  the grid regex: a questionId that happens to be grid-shaped (≤6 structured chars) is transmitted,
  which by construction cannot carry meaningful deleted content. Erased facts for a DELETED panel
  version (no locked panel) are counted in `erasureOverflow` and appear in no per-panel report (there is
  no panel to report against). Human-reviewed numerators (citations/mentions/recommendations) remain the
  report layer's facts and are never derived here.

## Review round 12 (authoritative SQL consumed; truncation-aware bounded coverage)

- **Gap A — consumed must equal the write gate.** Round 11 reconstructed consumed in JS: it parsed live
  originals with the strict `captureContextSchema` (missing a malformed-context original the gate counts
  via `captureContext->>'brandRunId'`) and dropped any live original whose slot had a tombstone (under-
  counting a SURVIVING original that shares a slot with an erased sibling — gate = 2). Fixed:
  `read_citation_protocol` now computes `runConsumed` per approved run with the EXACT write-gate
  predicate — live originals (`supersedes` null) bound to the run by `captureContext->>'brandRunId'`
  (malformed context included) plus the run's tombstone rows — one snapshot, owner/project scoped,
  bounded to ≤20 runs. The server passes it through unchanged (no reconciliation on consumed). Tests: a
  surviving live original + an erased same-slot sibling → consumed 2; a malformed-context live original
  counted while a correction is never charged; other-owner rows excluded.
- **Gap B — no neverObserved from truncated coverage; bound aggregates.** `read_citation_protocol` now
  returns `erasureByVersion` (per ACTUAL stored panel version with tombstones — bounded to real panels —
  its TRUE grid-row total + content-free malformed count) and a single `erasureOverflow` count for
  tombstone rows orphaned by a deleted panel (no unbounded random-id groups). The server derives
  `coverageCompleteByVersion` (transmitted grid rows ≥ true total); `CitationReport.neverObserved` is now
  `number | null` — null when incomplete — and `coverageComplete` is exposed; `erasureOverflow` is
  surfaced on `readResolvedCaptures`. Tests: a `generate_series` synthetic >10000-row set → transmitted
  coverage `LIMIT`-bounded (10000), `coverageComplete` false, `neverObserved` null; an orphaned tombstone
  → `erasureOverflow` 1; a pure completeness unit test.

## Review round 13 (preserve a real survivor at a historically-duplicated slot — P1 4057186213)

- `readResolvedCaptures` reconciled stale live captures against tombstones by SLOT KEY, so a genuine
  surviving independent original at a slot a historical sibling also occupied was silently hidden
  (turned into an erased-only slot) when the sibling was erased — even though authoritative `consumed`
  correctly counted 2. Fixed (server only): reconcile by correction-chain ROOT IDENTITY. A tombstone
  records the erased ORIGINAL's id (the chain root; the trigger writes one only for a `supersedes` null
  row). The server walks each resolved active leaf's `supersedesId` to its root (a leaf's id is not its
  root) and drops the leaf ONLY when that root is a tombstoned original — never merely because another
  original shared its slot. The survivor and its correction chain are preserved; an actually-deleted
  chain's stale positive is still removed. `resolveErasedSlots` still folds a tombstone whose slot a
  live capture holds into `consumed` (write-gate faithful) rather than double-counting coverage, so
  `consumed` may exceed `observed + erased`. (Round 14 corrects the ORDER of this reconciliation and
  revises the truncation claim — see below.)

## Review round 14 (reconcile the RAW chain BEFORE resolution; expose ambiguous duplicate history)

- The round-13 reconciliation ran AFTER `resolveStoredCaptures`, which first collapses two independent
  originals sharing one slot to a single stable-first entry and DISCARDS the sibling — so in the true
  delete-between-reads race (older evidence `[originalA, independentB]` at one slot, newer protocol
  tombstone A) the resolver kept A and discarded B, then the post-resolve filter removed A → no
  survivor; it was also order-dependent. Fixed: reconcile deleted-chain identities on the RAW evidence
  BEFORE resolution. The server builds the full `supersedesId` ancestry map over all raw answers,
  computes each row's chain ROOT, and drops every row whose root is a tombstoned original; the resolver
  runs on the surviving raw set, so a genuine independent survivor (and its own correction chain, whose
  active-leaf id is not its root) is never discarded. Order-independent.
- A survivor sharing its slot with a KNOWN erased original is ambiguous duplicate history, not a clean
  measurement: `resolveStoredCaptures` takes a bounded, defaulted `erasedSlotKeys` set (the transmitted
  tombstones' slot keys) and flags such a survivor `erased_duplicate_slot`, demoting it to
  `protocol_deviant` — inspectable, never a silent `complete`. `resolveErasedSlots` still folds that
  tombstone into `consumed` (write-gate faithful) rather than double-counting the slot.
- **Truncation claim revised (no unproven guarantee).** Reconciliation identity comes from the
  transmitted (`LIMIT`-bounded, grid) tombstones; under concurrent > `LIMIT` deletions the
  newest-row-always-transmitted assumption is NOT proven, so a deleted root whose tombstone fell past
  the limit could leave a stale positive. This is not claimed away — it is exactly the case already
  flagged: when a version's tombstones are truncated, `coverageComplete` is false and `neverObserved`
  null, signalling that both coverage AND the reconciliation identity for that version may be
  incomplete. Within the limit (bounded-normal data) reconciliation is exact.
- Tests: unit two-snapshot RPC — A-first/tombstone-A and B-first/tombstone-A both keep independent
  survivor B (order-independent) flagged `erased_duplicate_slot`; a surviving corrected-B chain keeps
  its active leaf; the deleted original+correction chain is dropped with no stale content. SQL (real
  deletion): the two-independent-originals and surviving-sibling cases assert the survivor is preserved
  AND flagged; brand `consumed` stays 2 with the survivor observed; the fixture `.find(...)` narrowing
  (TS18048) is guarded. Ancestry not fully present in the snapshot is walked to the deepest reachable
  node (conservative — never over-drops). No released SQL / schema change; earlier round limits hold.

## Review round 15 (accept canonical non-RFC Postgres uuid shape on the tombstone READ — P2 4057264542)

- The tombstone READ schemas used Zod `.uuid()` (RFC 4122, version/variant nibbles), but the deletion
  trigger validates a capture context's ids with a canonical-hex `8-4-4-4-12` regex and the tombstone
  `uuid` columns store any such value. A historical identity that is PostgreSQL-valid without RFC bits
  (e.g. `00000000-0000-0000-0000-000000000001`) then failed the WHOLE protocol read on that one row.
  Fixed (`citation-protocol.ts` only): a READ-ONLY `pgUuid` (canonical hex, a superset of `.uuid()`)
  types the DB-derived content-free identity fields — `erasedSlotFactSchema` answerId/panelId/
  brandRunId, `runConsumedSchema.runId`, `erasureByVersionSchema.panelId` — so every DB-storable
  tombstone identity parses and the read survives. Identity-only: NEW capture/panel/run input+auth
  schemas (`brandRunApprovalSchema`, the scope/param `.uuid()` guards, the released
  `captureContextSchema`) are UNCHANGED, and matching still requires a genuine locked+approved panel /
  approved run — a non-RFC id that resolves to no real entity stays `panelResolved: false` / excluded /
  overflow, granting no authority and dropping no consumed-budget/deletion fact silently. Audited every
  tombstone read field vs the DB (uuid columns, int4 bounds, grid `questionId`, per-version metadata);
  no unrelated rewrite, no released SQL change (the trigger already emits the canonical shape). Tests
  (real PGlite): a non-RFC historical captureContext → released `remove` → trigger tombstone →
  `readCitationProtocol`/`readResolvedCaptures` both survive, mixed with a valid RFC erased slot that
  still counts and the non-RFC id honestly a bounded `erasureOverflow`; a non-RFC `brandRunId` bound to
  a VALID panel parses and the read survives; no other-owner leakage.

## Review round 16 (return the whole report from a SINGLE database snapshot — P2 4057295124)

- `readResolvedCaptures` read `read_ai_answer_evidence` and then `read_citation_protocol` as TWO
  statements = TWO snapshots. A capture committed between them appeared in the second read's
  authoritative consumption while its evidence answer was still absent from the first — consumed budget
  with no corresponding capture. The round-5/round-10 sequential ordering narrowed but did not close
  this; two statements still take two snapshots. Fix: the candidate `read_citation_protocol` (already a
  single `jsonb_build_object` SELECT — one snapshot for every sub-select) now also returns `answers`,
  built exactly like the released `read_ai_answer_evidence`
  (`document || jsonb_build_object('id', id, 'createdAt', created_at, 'hash', document_hash)`,
  `ORDER BY created_at DESC, id DESC`, same owner/project predicate). `citationProtocolStateSchema`
  gains a REQUIRED bounded `answers` field (NO default): the observation payload is the numerator the
  consumed-budget aggregate is measured against, so a snapshot that omits `answers` while reporting a
  nonzero `runConsumed` must FAIL the read loudly — never parse to empty evidence that would present
  consumed budget as "zero observed / never-observed". The candidate was never deployed, so there is no
  answers-less report shape to keep compatible; a genuinely empty snapshot still passes as `answers: []`
  (the content-free erasure aggregates stay optional-with-default — they are not the observation
  payload). `readResolvedCaptures` issues ONE RPC and derives everything (raw-answer chain-root
  reconciliation, surviving captures, erased slots, per-run consumption, reports, coverage) from that
  single snapshot — no second read.
- Preserved: the released `read_ai_answer_evidence` RPC and `readAnswerEvidence` helper (still used by
  `importManualCapture`, byte-compatible); the round-15 `pgUuid` read acceptance; tombstone identity /
  correction-chain / duplicate demotion / exact SQL consumption / truncation reporting / strict write
  auth; and the `read_citation_protocol(uuid,text)` signature — so the rollback signatures/order are
  unchanged. Candidate SQL + `citation-protocol.server.ts`/`.ts` + P2 tests + docs only; no released
  SQL, no P3/R09/global-inventory change.
- Tests: mocked server unit tests assert the resolved read makes EXACTLY ONE RPC
  (`read_citation_protocol`) and throw on any other call, so a second snapshot boundary cannot be
  reintroduced; a snapshot reporting a nonzero `runConsumed` but omitting `answers` FAILS the read (the
  empty-evidence masquerade is rejected) while a genuinely empty `answers: []` snapshot still reads as an
  empty report; an independent survivor sharing a slot with an erased original is preserved and flagged
  `erased_duplicate_slot` from one snapshot; a surviving correction leaf at an erased sibling's slot is
  preserved; and a real-PGlite test reads capture, consumption, a correction leaf and a deletion
  coherently from one snapshot.
- Coherence scope (accurate): the guarantee is ARCHITECTURAL — one SQL statement
  (`read_citation_protocol`'s single `jsonb_build_object` SELECT) observes one PostgreSQL MVCC snapshot
  for all its sub-selects, so answers/consumption/erasure cannot come from different points in time. The
  tests are single-connection coherence checks (one RPC, atomic parse); they do NOT run concurrent
  connections and do NOT empirically prove cross-connection/multi-transaction isolation. No
  cross-connection atomicity is tested or claimed.

## Checks (status: UNRUN — prepared for Codex)

Prior stages: 143 (tsc failing) → 146 → 148/147-PASS-1-FAIL → 150 → 170/6081 → (round 5) read-ordering
fix + regression. The round-6 grid delta then ran 94 focused at 93 PASS / 1 FAIL with types PASS: the
sole failure was a test-only assertion — the grid table-driven test expected the specific
`citation_panel_grid_invalid` through the public `lockCitationPanel` wrapper, which intentionally
normalizes DB errors to `citation_protocol_unavailable`. Fixed here (test only): each invalid-grid case
now asserts the specific error via a direct `lock_citation_panel` RPC, the generic refusal via the
public wrapper, and that no locked version was inserted (the draft stays editable); the 11-question
direct-SQL case is kept (that grid delta then passed). Round 7 added the content-free erasure tombstone
(new table + `AFTER DELETE` trigger) and made the write guards consult it; Codex then ran that delta at
30 SQL tests PASS + TypeScript PASS (lint reported only Prettier formatting in the test file, which
Codex will format). The shape-guard amendment hardened the trigger's captureContext shape validation
before any cast and strengthened two tests (malformed-capture erasability; a live-capture project
deletion; the content-free assertion now inspects the full tombstone row). Codex then formatted the
test and ran it at 31 SQL tests PASS (1.52s) but TypeScript FAILED at
`citation-protocol-migration.test.ts(1011,18)` TS2571 (the `row_to_json` full row typed `unknown`).
Fixed here (test typing only): the `db.query` full-row read now carries a
`<{ r: Record<string, unknown> }>` row generic — the same pattern as the existing `{ data: unknown }`
query — so the full-row content-free assertion is unchanged and uses no broad `any`; no application or
SQL behavior changed. Round 8 (this turn) adds the missing `workspace_meta FOR UPDATE`+`FOUND`
serialization gate to `save_citation_panel_draft`, `lock_citation_panel` and
`approve_citation_brand_run`, plus one SQL regression. That migration was then released into main and
RENAMED to the unapplied `20260920190000_citation_protocol.sql` (old `…170000` historical), after which
Codex ran the full suite at 6265 PASS / 63 focused, with types + lint + build PASS and security clean.
Round 9 added ten-distinct-question enforcement at lock and content-free erased-slot resolution; Codex
ran that delta at 104 PASS / 1 FAIL of 105 focused (2.01s), tsc NOT run because of the failure — the
sole failure being the round-9 service-role RLS assertion that still expected `{ panels, brandRuns }`
without the new `tombstones: []`. Round 10 (this turn) corrects that test expectation and adds the
canonical erased-aware report (`citationReport`/`citationReports` wired into `readResolvedCaptures`
reports), a permissive `erasedSlotFactSchema` so malformed historical tombstones never break the read
(excluded, budget still consumed), and a stale-read reconciliation (a live capture whose slot has a
newer tombstone is dropped, so a delete-between-reads is reported erased, not a positive); Codex ran
that delta green (152 focused tests PASS in 2.06s, tsc PASS). Round 11 (this turn) makes the erasure
read content-safe and bounded (only grid-shaped questionId transmitted; malformed → content-free
`tombstoneExcluded` count; LIMIT-bounded) and computes consumed budget from trusted facts
(`tombstoneBudget` per-run row counts + reconciled live originals) so historical same-slot duplicates
count as consumed 2 / erased-unique 1; Codex ran that delta at 154 focused tests PASS in 2.06s, types
PASS. Round 12 made consumed an authoritative SQL aggregate (`runConsumed`) and added truncation-aware
bounded coverage (`erasureByVersion`/`erasureOverflow`, nullable `neverObserved`); Codex ran that delta
at 127 focused tests PASS + types PASS, and the full suite at 6291 tests PASS in 46.54s + build/lint
PASS (formatter-only exception), committed `e99dabb9`, cherry-picked into PR146 (`5b3939fc`). Round 13
began the P1 4057186213 fix but reconciled AFTER resolution; Codex found types FAIL (TS18048, a fixture
`.find(...)` possibly-undefined) with 130 focused / 4 PASS at 2.22s. Round 14 (this turn) delivers the
coherent fix: reconcile the deleted chain on the RAW evidence BEFORE resolution (the true race with two
independent originals at one slot now keeps the real survivor, order-independent), expose a survivor
sharing a slot with a known erased original as `erased_duplicate_slot`/`protocol_deviant` (no silent
success), guard the fixture narrowing, and revise the round-13 truncation claim (exact within the LIMIT;
beyond it `coverageComplete` false flags the incompleteness). `citation-protocol.ts` (bounded defaulted
`erasedSlotKeys` param) + `citation-protocol.server.ts` + P2 tests + docs only; no SQL/schema change.
Codex ran round 14 at 133 focused PASS, 6297 full PASS in 46.66s, types + lint + build PASS. Round 15
(this turn) fixes P2 4057264542: the tombstone READ schemas used Zod `.uuid()` (RFC) but the trigger/
`uuid` column accept any canonical-hex value, so a historical non-RFC id failed the whole protocol read;
a READ-ONLY `pgUuid` (canonical hex) now types the DB-derived identity fields, identity-only with all
write/auth `.uuid()` rules unchanged — `citation-protocol.ts` + P2 tests + docs only, no SQL change.
All prior counts — 6297/PASS and the 133-focused-PASS run included — are a PRIOR STAGE and do not carry
over; every check below, including the new non-RFC-identity read tests, is UNRUN and re-run by Codex.
The last commit `777ee67f` (Codex's doc rollback inventory fix) is preserved. The prepared deploy SQL /
expected-identity artifacts are STALE — never execute; nothing here is deployed.

| Check | Purpose | Status |
| --- | --- | --- |
| `vitest run src/lib/citation-protocol.test.ts` | pure contract + mocked server | UNRUN |
| `vitest run src/lib/citation-protocol.functions.test.ts` | endpoint auth/validation | UNRUN |
| `vitest run src/lib/citation-protocol-migration.test.ts` | real SQL: isolation, auth, missing project, reference forgery, approval version, protocol binding, capacity, deletion, idempotency | UNRUN |
| `vitest run` answer-evidence + citation-panel + citation-intelligence-scope suites | additive-change regression | UNRUN |
| `tsc --noEmit` + lint | types / style | UNRUN |

Author-asserted expectation: the counterexamples (forged/foreign/cross-version references, over-budget
brand captures, tampered capture instants, owner mismatch, direct table access) are refused; valid
scoped panels/runs/captures are accepted; deletion invalidates dependents. Marked UNRUN, not passed,
because execution is Codex's stage.

## Open items / dependencies

- P3 findings/improvements store consumes these resolved captures and the PR137
  `panelCounts`/`comparablePairs`; human-reviewed facts are not stored here.
- Real acceptance needs an owner-approved locked panel and owner-run captures signed in.
- No dated-business-fact records are forged; if P3 needs them it keeps an explicit dependency.
- USD50/manual-free unchanged. Production conversation `26b` remains FAILED with dispatch OFF; this
  packet makes no stage-completion claim.

## Codex integrated verification — 19 September 2026

After the owner authorized scoped Claude file tools, all correction packets were applied with zero permission denials. Independent review covered actual stored panel/run binding, correction observation identity, budget-before-dedup fix, mode/model consistency, and prospective panel approval. The pre-approval test now distinguishes the public sanitized failure from the exact SQL guard and asserts neither invalid attempt inserts data.

**167 focused tests/9 files PASS** (3.11 s), **6078 full-suite tests/380 files PASS** (57.71 s); TypeScript, scoped ESLint, whitespace and production build PASS. Logs `/tmp/milo-p2-final-{focused,types,full}-20260919.log` and `/tmp/milo-p2-build-20260919.log`. Historical 147/148 failure and UNRUN author handoff entries above are superseded for this final stage, not erased.

Codex minimal integration exceptions: formatted six newly authored TypeScript files for Prettier-only findings; reconciled the migration-chain inventory so eight already-applied conversation migrations are distinct from candidate `20260919170000_citation_protocol.sql`; added the released answer-evidence prerequisite, five service-only RPC grant assertions and two table closed-access checks. The focused chain test passes 19/19, and the unknown-migration guard remains. No application or SQL behavior authored by Codex.

No migration applied, no deployment, no owner pilot approval and no genuine capture acceptance claimed. Main remains `26b938c3`; this packet is independently based on it. Pending artifact/diagnostic packages require chain reconciliation when integrated. UI, findings/support review storage and genuine native parsers remain later accepted packets.

### Codex verification of correction chains and required quota lock — 20 September 2026

Independent review confirmed that only active correction leaves reach counts while raw history stays readable. The capture writer now actually locks the account row and tests FOUND before proceeding; a separate later EXISTS check would not establish lock acquisition under concurrent row insertion. The existing account-first lock order is preserved. The missing-meta regression refuses insertion, restores the fixture, and verifies ordinary capture succeeds. This is SQL-path evidence and lock-semantics review, not a multi-connection concurrency experiment.

**170 focused tests/9 files PASS** (2.39 s); **6081 full-suite tests/380 files PASS** (56.73 s); types, scoped lint, whitespace and build PASS. Logs `/tmp/milo-p2-lock-{focused,types,lint,full,build}-20260919.log`. Codex integration exception: Prettier formatting of two authored TypeScript files; no application/SQL behavior authored by Codex. Candidate migration remains unapplied; no consumer collection or owner pilot approval is inferred.

### Codex legacy-correction and current-main integration verification — 20 September 2026

Legacy-correction delta:153 focused tests/8 files PASS(1.70s), types PASS. Normal merge of released diagnostic main b441a9e7 resolved only the candidate-chain inventory:160000 now released,170000 remains candidate, both grant matrices retained. Post-integration62 focused tests/3 files PASS(1.61s), types/scoped lint/whitespace PASS, full6126 tests/382 files PASS(43.69s), build PASS. Logs `/tmp/milo-p2-integrated-{focused,types,lint,full,build}-20260920.log`. Codex exceptions limited to test formatting and migration-inventory merge resolution. No candidate SQL applied or collection performed.

## Codex slot/consumer-boundary verification — 20 September 2026

Reviewed atomic occupied-slot rejection after dedup under the required account lock, correction-chain preservation, historical duplicate deviation and consumer-only validation. Confirmed fixture repair uses an authorized distinct round2 with unchanged no-insert assertion.98 focused tests/5 files PASS(1.74s), full6133 tests/382 files PASS(43.93s), types/scoped lint/whitespace/build PASS. Logs `/tmp/milo-p2-slot-final-{focused,types,lint,full,build}-20260920.log`. Codex integration exception: Prettier on three changed TypeScript files. No applied SQL, production observation, owner approval or consumer automation. Candidate170000 remains unapplied.

## Codex read-order correction verification — 20 September 2026

Reviewed sequential evidence-first/protocol-second reads and deterministic deferred-RPC ordering regression, preserving deletion invalidation.52 focused tests/3 files PASS(1.41s), full6134 tests/382 files PASS(42.15s), types/scoped lint/whitespace/build PASS. Logs `/tmp/milo-p2-read-order-{focused,types,lint,full,build}-20260920.log`. No SQL changes, deployment, owner approval or production acceptance.

## Codex fixed-grid verification and main integration — 20 September 2026

Reviewed SQL-specific refusal plus public normalized refusal and no inserted locked version.94 focused tests/4 files PASS(1.38s), types/scoped lint PASS. Normal merge includes released PR147main2e4d7268 without conflicts. Integrated full6151 tests/382 files PASS(43.13s), TypeScript/build PASS. Logs `/tmp/milo-p2-grid-final-{focused,types,lint}-20260920.log` and `/tmp/milo-p2-grid-integrated-{full,types,build}-20260920.log`. Codex exception: Prettier on two changed test files and normal integration merge. Candidate170000 unapplied; no owner approval/pilot measurement/live acceptance.

## Final erasure correction and integration — 20 September

Codex verified query typing without weakening full-row assertions.31 SQL tests PASS1.50s, types/lint PASS. Normal merge of released mainfaaa195f resolved only migration inventory:165000 is released,170000 remains the only candidate. Included artifact release receipt. Integrated56 focused PASS1.93s,6248 full/384 files PASS50.95s, types/scoped lint/build PASS. Final test-only grant inventory adds internal UTF16/tombstone helpers;27 chain tests PASS1.14s and lint/whitespace PASS after that addition (full suite preceded those two assertions). Logs /tmp/milo-p2-erasure-{typed,integrated}-*-20260920.log and /tmp/milo-p2-erasure-grants-20260920.log. Codex exceptions: formatting, merge inventory and grant inventory only. No protocol SQL applied or live acceptance claimed.

## Account-row serialization correction verified — 20 September

Codex independently reviewed the three new FOR UPDATE + FOUND gates, matching capture admission without modifying released SQL.89 focused/4files PASS1.84s,6251 full/384files PASS41.86s, TypeScript/scoped lint/whitespace/build PASS. Logs /tmp/milo-p2-presence-{focused,types,lint,full,build}-20260920.log. Codex exception: two formatting wraps in the test corrected with Prettier. The initial lint log records those two failures; lint passed after formatting. No migration applied, no real concurrency or production workflow acceptance claimed.


## Integration after PR148 — 20 September 2026
Current candidate is `20260920190000_citation_protocol.sql`, renamed byte-identically from historical `20260919170000_citation_protocol.sql` to follow already-applied checkpoint migration20180000. SHA256 `d5955cc1cb19c9aaf632559d2c34760a4e71d4fc7651121115c812c5a75bd63b`. Still UNAPPLIED. Earlier filename references are historical. Latest f56 code review5749963376 and security5749970573 clean; all CI checks passed. Normal merge of released bd0 required only migration-inventory reconciliation. Codex integration-only exception: rename/references/inventory and preserve release evidence, no application behavior changes. Integrated validation pending.

Integrated validation after released bd0: 63 focused tests/2 files passed (1.90s), 6265 full tests/385 files passed (44.20s), TypeScript, scoped lint, whitespace, production build all passed. Logs `/tmp/milo-p2-ordered-{focused,types,lint,full,build}-20260920.log`. No SQL applied or live P2 acceptance claimed.

## Codex integrated validation — authoritative counts, 20 September

Reviewed SQL consumed aggregates against the actual capture write-gate predicate, deletion/coverage semantics, and bounded truncation metadata. Current focused run: 127 tests / 4 files PASS (2.24s); TypeScript PASS. Full suite: 6291 tests / 385 files PASS (46.54s); scoped lint, production build and git diff --check PASS. Logs: /tmp/milo-p2-authoritative-{focused,types,lint,full,build}-20260920.log. Codex formatter-only integration exception on four citation-protocol TypeScript files. This supersedes earlier validation counts for the current packet, but is not multi-connection or production acceptance. Candidate migration remains UNAPPLIED; guarded apply SQL and release identity remain STALE until regenerated for the approved final head.

## Codex validation — raw identity reconciliation, 20 September

Reviewed raw-chain deletion reconciliation before duplicate collapse and explicit erased-duplicate deviation. Focused133tests4filesPASS2.27s; TypeScriptPASS. Full6297tests385filesPASS46.66s; scopedlint/build/diffPASS. Logs /tmp/milo-p2-ordering-{focused,types,lint,full,build}-20260920.log. Formatter-only Codex integration exception on four P2 TypeScript files. Tests cover both input orders, surviving correction chains and deleted-chain races through injected snapshots; no multi-connection or production claim. Truncated tombstone coverage remains explicitly incomplete and cannot prove full reconciliation. Candidate UNAPPLIED; prepared release SQL/identity STALE pending final approval.

## Codex release-documentation correction

Review4057250786 on1351520b identified an incomplete rollback inventory. Codex made a documentation-only integration exception: enumerated all three tables, all six exact function signatures and the trigger attached to ai_answer_evidence; clarified dependency order, data loss, later dependencies and already-released P1. Verified inventory directly against CREATE statements in candidate20190000; no application code, SQL or production state changed. Previous code validation remains applicable; rollback was not executed.

## Codex validation — historical PostgreSQL identities

Read-only UUID schema delta reviewed against trigger/table representation; write/auth inputs unchanged. Focused135tests4PASS3.39s/typesPASS; full6299tests385PASS49.26s/lint/build/diffPASS. Logs /tmp/milo-p2-uuid-{focused,types,lint,full,build}-20260920.log. Codex formatter-only integration exception on two P2 TypeScript files. No deployment or real-use acceptance claimed; candidate UNAPPLIED, preparedSQL/identity STALE.

## Single-database-snapshot resolved read — status UNRUN (P2 4057295124)

Round 16 makes `readResolvedCaptures` return the whole report (answers, panels, brand runs, content-free tombstones, authoritative `runConsumed`, `erasureByVersion`/`erasureOverflow`, coverage) from ONE `read_citation_protocol` snapshot — the candidate SELECT now also emits `answers` built like the released `read_ai_answer_evidence`; `citationProtocolStateSchema` gains a REQUIRED `answers` field (NO default, so a snapshot that omits the observation payload while reporting consumed budget fails the read loudly rather than masquerading as empty evidence — a genuinely empty snapshot still passes as `answers: []`; the content-free erasure aggregates stay optional-with-default); `readResolvedCaptures` issues a single RPC. Released `read_ai_answer_evidence`/`readAnswerEvidence`, the round-15 `pgUuid` read acceptance, tombstone identity / correction-chain / duplicate demotion / exact SQL consumption / truncation reporting / strict write auth and the `read_citation_protocol(uuid,text)` signature (hence the rollback inventory) are unchanged. Edited only the candidate migration `20260920190000_citation_protocol.sql`, `citation-protocol.ts`/`.server.ts`, the two P2 test files and these docs.

The single-snapshot guarantee is ARCHITECTURAL (one SQL statement = one PostgreSQL MVCC snapshot across all its sub-selects); the tests are single-connection coherence checks (one RPC, atomic parse, masquerade rejected) and do NOT run concurrent connections or empirically prove cross-connection/multi-transaction isolation — no cross-connection atomicity is tested or claimed.

The prior stage (round-15 Codex run: 135 focused / 6299 full PASS) does NOT carry over; every check below is UNRUN in this worktree and must be re-executed by Codex under the recorded exception — this assistant did not run tests and claims no PASS. New/changed checks: the mocked server tests assert the resolved read makes exactly one RPC (`read_citation_protocol`) and rejects any other; a consumed-budget-but-no-answers snapshot FAILS while an empty `answers: []` snapshot still reads empty; single-snapshot survivor/correction tests; and a real-PGlite coherent capture/consumption/correction/deletion read. Candidate remains UNAPPLIED; prepared deploy SQL / expected-identity artifacts remain STALE (never executed); USD50/manual-free budget unchanged; nothing is deployed.


### Round 16 independent verification, 2026-09-20

Codex inspected the single-statement SQL payload, unchanged released evidence-row construction and single-RPC resolver, including rejection of missing answers. Focused:135 tests/4 files PASS (2.39s); full:6299 tests/385 files PASS (59.66s); TypeScript, scoped ESLint, production build and git diff --check PASS. Formatter-only Codex integration exception on four P2 TypeScript files. Logs:/tmp/milo-p2-requiredanswers-{focused,types,lint,full,build}-20260920.log. These checks are local evidence; no multi-connection experiment, production migration or deployment is claimed. Candidate SQL and expected identity artifacts must be regenerated for the final approved commit.
