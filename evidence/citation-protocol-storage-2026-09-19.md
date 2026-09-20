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
`approve_citation_brand_run` (candidate `…170000`), plus one SQL regression exercising all three
missing-row/restored paths. All prior counts — including 31/PASS-with-types-FAILED — are a PRIOR STAGE
and do not carry over; every check below, including the new serialization gate and its regression, is
UNRUN and re-run by Codex.

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
