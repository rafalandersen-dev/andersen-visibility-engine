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

## Checks (status: UNRUN — prepared for Codex)

Prior stages: 143 (tsc failing) → 146 → 148/147-PASS-1-FAIL (corrected) → 150, and most recently a
reported 170 focused and 6081 full PASS. This round adds the context-less-correction vanish fix
(resolver + legacy-intake refusal) with its tests. That 170/6081 PASS is a PRIOR STAGE and does not
carry over — every check below, including the new legacy-intake roundtrip and resolver cases, is
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
