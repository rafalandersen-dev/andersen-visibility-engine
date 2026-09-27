# Citation forward workflow — local candidate evidence (27–28 September 2026)

Branch `codex/milo-citation-forward-workflow-20260927` at base `64db7a4b18085bf1d3b80ec4dc5f384acd98c169`
(reviewed main), authoring worktree only. Nothing committed, pushed, deployed, applied or called on a provider.
Candidate migration `supabase/migrations/20260927190000_citation_improvement_head_guard.sql` is UNAPPLIED
(sha256 `a86b4b626c2144db95c23c366079228842f31e5fe57e21712840ce636cc75784`, 111 lines). Applied migrations,
the deployment, accepted AI turns and published articles are untouched.

## What the candidate delivers (packet N, corrected by Codex N1/N2/N3)

Finding version → Plan task (create or attach; exact finding ROW pinned in `sourceRefs`, store-minted task id)
→ manual Studio draft at zero AI cost (the AI path stays in Plan) → the EXISTING version-bound approval /
publication → improvement record bound to the exact published attempt (task id, approved version, destination,
baseline captures that precede the publication) → explicit owner inspection (positive / negative /
inconclusive) → list, detail, history, removal, retest readiness from live statuses.

Authority boundaries kept: accepting a finding grants nothing; a task, draft, approval or connector receipt is
never destination proof; `owner_attested` is an owner observation, never independent proof; local task metadata
grants no reviewer access; staged locales stay inactive; USD 50/month and manual free AI unchanged; no crawler
or receipt architecture.

## Corrections adopted from independent review

| Packet | Finding | Correction |
| --- | --- | --- |
| N1/R1 | frozen review could pin a finding version minted later | `expectedFindingRowIds` carried through schema → endpoint → server → v3 SQL; set-compared with the stored bound rows |
| N2/S1 | the check ran only for newly minted rows | v3 compares on idempotent returns too: same text with a different reviewed pin is refused (`citation_improvement_finding_stale`), the same frozen pin retries idempotently |
| N1/R2 | inspection sent the newer list head token with the displayed record | `inspectionRequest` binds token + rows to the displayed row; non-head rows get no radios; the request is frozen for an identical retry |
| N1/R3 | readiness counted historical rows | `currentImprovementHeads` + `retestReadiness` count heads only; history labelled; readiness withheld when list/attested reads fail |
| N2/S2 | readiness kept the older list status | the attested fetch keeps the whole fresh detail; a head counts only when the newer detail is still `owner_attested` + `baseline_recorded` for the same row/version |
| N1/R4 | tasks pinned to superseded/dismissed/deleted rows vanished | persistent "Plan tasks pinned to finding versions" view with live chain chips; explicit "bind the current version" checkbox; pins never move |
| N1/R5 | task creation mutated the store after scope loss / rejected reads | `createTaskFromFinding`: authenticated read first, identity + eligibility verified, alive/identity guard, in-flight de-duplication, fail closed |
| N1/R6 | publication evidence read page 0 only | `collectPublishedAttempts` pages through the released 20 × 50 contract; failing page fails the read; partial state shown |
| N2/S3 | approver defaulted to the owner with raw UUID entry | `read_publication_approval_provenance_v1` (candidate) + `readPublicationApprovalProvenanceFn`; approver shown as "me (owner)" or the delegate's roster email; unapproved/revoked blocks the payload |
| N3 | finding-version picker overflowed at 390 px | picker label/select constrained to the container; task-attach select capped |

Also in this candidate: repaired `taskId` contract (store `uid()` 8-char base36 and connector ids, no fabricated
UUID aliases); v3 improvement expected-head guard mirroring the released finding guard; the four active
locales' stale owner intro replaced; server allowlist widened to the fixed improvement outcome tokens so the
owner sees the exact refusal (no raw database text); a manual-draft path with no generation call.

## Changed files

Source (new): `src/lib/citation-forward.ts` (778 lines), `src/components/CitationForwardPanel.tsx` (1186),
`src/i18n/citation-forward.ts` (671, 129 keys × en/pl/sv/da), `src/lib/citation-approval.server.ts` (65),
`src/lib/citation-approval.functions.ts` (25), the candidate migration.
Source (modified): `citation-finding.ts` (taskId contract), `citation-record.ts` (head + finding-row tokens),
`citation-record.server.ts` (v3 call, allowlist), `citation-record.functions.ts`, `citation-panel-fixture.ts`
(improvement head query), `i18n/catalogs.ts`, `i18n/citation-review.ts` (owner intro), route
`app.citation-review.tsx` (mount).
Tests (new): `citation-forward.test.ts` (997), `CitationForwardPanel.test.ts` (568, static markup),
`citation-improvement-head-guard-migration.test.ts` (770, PGlite). Tests (modified): functions test, five
migration-list tests, record/review migration helpers now pass the improvement head token.
Staged locales: 20 new `xx-citation-forward.ts` modules (129 keys each, machine-authored, flagged), 20
registrations with source hashes, 20 corrected owner intros, `de-source.ts`, 15 key-count assertions
(4204 → 4333). No locale activated.
Harness (untracked `.coordination/harness`): mocks for publication evidence (paging mode), improvements (v3
semantics incl. finding-row check), approval provenance, Supabase client stub, entitlements stub; scenario
controls; README recipes 29–42.

## Checks on the final sources

| Check | Result |
| --- | --- |
| `tsc -p tsconfig.json --noEmit` | clean |
| ESLint on every touched source/test file | clean |
| Focused vitest: forward helpers, panel static, endpoints, PGlite guard | 4 files, 46/46 |
| vitest `src/lib` + `src/components` (run before the final picker CSS and author-open refetch deltas) | 375 files, 6197/6197 |
| vitest `src/i18n` (catalogs + 20 staged contracts, final sources) | 21 files, 704/704 |
| `npm run build` (final sources) | passes |
| `git diff --check` | clean |
| Prettier | all touched files formatted; one pre-existing warning on `src/routes/unsubscribe.tsx` (not touched) |

The PGlite suite exercises the REAL server module against the real migration chain and inverts the three
Codex N1 reproductions plus the two N2 reproductions (wrong-pin idempotent return; list → revoke → detail).

## Browser interaction evidence (real component in the local harness, in-memory store, no network)

Session at http://127.0.0.1:5179, owner surface, harness call-log times:

| Step | Observed |
| --- | --- |
| Create Plan task from finding v1 | one `getCitationFindingFn` read (22:52:30) then task listed under pinned tasks, state `active`, "Plan task created." |
| Create manual draft | `navigate → Studio` logged with the asset id (22:55:05); no generation call in the log |
| Open improvement author | `readPublicationEvidenceFn` re-read on open (22:56:00, 22:56:13); attempt offered; provenance `owner` (22:56:30) shown as "me (owner)" |
| Review → save | raw audit shows pinned rows and tokens; `saveCitationImprovementFn → ok → v1 (connector_receipt)` (22:56:47); readiness 0 of 2 |
| Positive inspection | v2 `owner_attested` (22:57:13); readiness 1 of 2; v1 labelled `earlier version (history)` |
| Negative inspection | v3 `connector_receipt` (22:57:25); readiness back to 0 of 2 although v2 still reads attested |
| Positive again, then approval revoked (refetch) | v4 `owner_attested` (22:57:43) → list re-read `v4:unverified v3:unverified …` (22:57:45); readiness 0 of 2; "Unverified: 1" (heads only) |
| Lost response then retry | `STORED v5 … then THROW citation_record_unavailable` (22:58:01); button became "Retry the same inspection"; retry → `idempotent → v5 (same id)` (22:58:07) |
| Paged evidence | `page 0: 50 of 51 … other-task`, `page 1: 1 of 51 … <task>` (22:58:15/21); only the task's attempt offered |
| Delegate approver | `readPublicationApprovalProvenanceFn → delegate` (22:58:39); "Approved by a delegate reviewer: reviewer@harness.invalid"; no actor id typed |
| Keyboard | Tab reaches the panel's native controls (activeElement reported a real button after three Tabs); radios are native inputs |

Codex additionally exercised, in its own browser, the scope-race (4 s read then project switch: no task in A
or B), keyboard ArrowRight on the radios, revoke-then-bind refusal and the paging case.

## Mobile geometry after N3

| Viewport | Measurement |
| --- | --- |
| 360 px (harness toggle) | stage scrollWidth 358 = clientWidth 358; no element wider than the stage |
| 390 × 844 (emulated) | document scrollWidth 390 = clientWidth 390; finding-version select right edge 340, task-attach select 183, published-attempt select 323; the stage reports a 2 px scrollWidth excess (rounded border), no control exceeds the viewport |

## Limitations (honest)

- No DOM test environment exists in the repository and no dependency was added: the handler logic is tested
  with deferred promises against the real store, the markup statically; the interaction evidence above is a
  browser session against the local harness, not an automated DOM test.
- The harness is fixtures only: it proves the panel's reactions to the mocked outcome codes; database rules are
  proven in PGlite. Plan and Studio routes are not mounted (navigation is logged).
- `owner_attested` remains an owner observation. Independent destination proof, listing/configuration receipts,
  a native report parser/export and the four-week pilot remain OPEN and are not implemented here.
- Staged-locale strings for the new namespace are machine-authored; fluent acceptance is pending.
