# Citation owner authoring — prepared stage, 26 September 2026

Owner journey (panel draft/approve-and-lock → dated facts → finding authoring for both families → P4 review
handoff) plus server-authenticated panel binding and atomic expected-head conflict guards. **Prepared and
locally verified on branch `codex/milo-citation-authoring-20260926` (base `a392775c`). NOT committed, pushed,
deployed or applied. Nothing here is production, pilot or two-person evidence.** Codex static review packet A
(`.coordination/codex-authoring-review-packet-a-20260926.md`) findings A1–A4 are addressed below.

## What was built (files)

Candidate migration (additive, uniquely timestamped, UNAPPLIED; never edits P1/P2/P3):

- `supabase/migrations/20260926190000_citation_scope_binding_versions.sql` — `scope_enforced_at` on both record
  tables; internal `citation_panel_scope_authenticated(owner, project, panel, version, name, market)` (stored +
  `status='locked'` + byte-equal client name/market); `citation_scope_binding_enforce()` BEFORE INSERT triggers on
  `ai_citation_findings` and `ai_citation_improvements` (raise `citation_panel_scope_unauthenticated`, stamp);
  `save_ai_citation_finding_v2(…, p_expected_version integer, p_expected_head uuid)` and
  `save_ai_citation_business_fact_v2(…, p_expected_version, p_expected_head)` (head ROW token, atomic RAISE →
  rollback, idempotent return never conflicts); `save_ai_citation_improvement_v2` (provenance projection);
  `read_ai_citation_findings_v2` / `read_ai_citation_finding_v2` / `read_ai_citation_improvements_v2` /
  `read_ai_citation_improvement_v2` / `read_ai_citation_finding_for_review_v2` (owner and reviewer projections of
  `scopeEnforcedAt`); grants: v2 RPCs `service_role` only, helper/trigger function no role, v1 RPCs keep their
  grants for rollout (the trigger enforces them regardless).

Contracts / server / functions (modified): `src/lib/citation-record.ts` (`expectedVersion` + `expectedHeadId`
with the pairing rule `inspectedHeadRefinement`, `scopeEnforcedAt` + `scopeBinding()`),
`src/lib/citation-record.server.ts` (v2 RPC names, `p_expected_head`, surfaced codes `citation_finding_version_conflict`,
`citation_panel_scope_unauthenticated`, `citation_finding_scope_drift`), `src/lib/citation-record.functions.ts`;
`src/lib/citation-business-fact.ts` / `.server.ts` / `.functions.ts` (same for facts,
`citation_business_fact_version_conflict`); `src/lib/citation-finding-review.ts` / `.server.ts` (reviewer
projection of the marker).

Pure UI helpers (new): `src/lib/citation-panel-ui.ts` (draft form ↔ P2 `panelProtocolSchema`, Stockholm weekly
slots, lock issues, heads, locked scopes), `src/lib/citation-business-fact-ui.ts` (fact drafts with the head ROW
token, chains, validity), `src/lib/citation-authoring.ts` (finding draft ↔ exact `findingSchema` record, stale
references, head rows, owner+project identity, and the pure `authoringReducer` that freezes the reviewed payload,
anchors edits to the inspected row, gates conflict continuation and binds state to the identity).

Components (new): `src/components/CitationPanelProtocolPanel.tsx` (list heads; new/revise draft; question picker
bound to saved prompt revisions; explicit "Review and lock" → confirmation → "Approve and lock" calling the
released `lockCitationPanelFn`; no auto-lock), `src/components/CitationBusinessFactsPanel.tsx` (list/create/
correct/delete/history), `src/components/CitationFindingAuthor.tsx` (both families; scope from locked panel
versions; answer/source/record/fact pickers by exact id/revision; review stage renders the frozen record with the
same `FindingRecordView` the reviewer sees; save with the head token; conflict comparison; legacy/enforced
footer). Modified: `src/components/CitationReviewPanel.tsx` (binding chip on owner rows/detail and reviewer
header), `src/routes/_authenticated/app.citation-review.tsx` (owner mode mounts the three panels above the
released list, keyed by owner+project).

Copy: `src/i18n/citation-authoring.ts` (202 keys, en/pl/sv/da; registered in `src/i18n/catalogs.ts`), 20
staged `src/i18n/staged/<code>-citation-authoring.ts` files registered as batch `citation authoring` in every
composer (`sourceRevision: "citation owner authoring candidate after a392775c"`, `sourceHash:
c1a0a251145f6db7e86ef21440fdc97b75cf3182a9fb87b5edc8bde4eef2316b`; German in `de-source.ts`; French without
hash per its composer), staged key counts 3984 → 4186, no activation.

Tests (new/modified): `src/lib/citation-scope-binding-migration.test.ts` (PGlite), `src/lib/citation-panel-fixture.ts`
(test-only locked-panel seed + head-row query), `src/lib/citation-authoring.test.ts`, `src/lib/citation-panel-ui.test.ts`,
`src/lib/citation-business-fact-ui.test.ts`, `src/components/CitationFindingAuthor.test.ts`; updated
`citation-record-migration.test.ts`, `citation-business-fact-migration.test.ts`,
`citation-finding-review-migration.test.ts`, `milo-candidate-chain-migration.test.ts`,
`citation-record.functions.test.ts`, `citation-business-fact.functions.test.ts`, `CitationReviewPanel.test.ts`,
15 staged locale tests.

Harness (isolated, not built/typed by the app): `.coordination/harness/*` — owner mode mounts the REAL three
authoring components + review panel over in-memory mocks with the v2 outcome codes (head ROW token, idempotency
before the head check, lost-response mode, project A/B switch). Recipes 12–22 in its README.

## Decisions carried out (product direction, final)

1. Scope change = NEW finding identity; `citation_finding_scope_drift` unchanged; the author explains it.
2. Server-derived persisted provenance (`scope_enforced_at`) projected to owner AND reviewer reads; legacy rows
   never re-stamped, including through an identical idempotent retry (v1 returns before any insert).
3. Atomic conflict checks under the existing account lock and version chain — corrected after packet A to the
   **(version, immutable head row id)** token because P3 delete + recreate reuses version numbers (ABA).
4. Trigger + wrappers: the trigger covers the v1 RPCs (still granted for rollout), the v2 wrappers and any direct
   insert; old callable paths cannot bypass enforcement.

## Codex packet A — corrections

- **A1 (ABA):** token is `(expectedVersion, expectedHeadId)` from the Zod contract (pairing rule refuses a bare
  version or a bare id) through the server function, server parse, RPC arguments and both forms; SQL reads the
  head row (id + version) and conflicts when either half differs; a bare version at the SQL boundary is fail-
  closed. Regression: delete head X2, recreate v2 as row Y, stale (v2, X2) edit → conflict, no row; bare number →
  conflict, no row; identical payload under the stale token → same row Y (idempotent); edit on Y → v3 chained to
  Y. Both findings and facts.
- **A2 (retry payload):** `authoringReducer` builds the record ONCE at review (its `reviewedAt` instant included)
  and keeps it for the save and every retry; busy/error re-renders, "back" without changes and conflict
  acknowledgement never mint a new instant; any field edit invalidates it. Fact `confirmedAt` is server-stamped and
  outside the digest, so facts needed no freeze. Reducer regression + harness recipe 19 (mock stores the row, throws,
  retry returns the same row id).
- **A3 (historical edit / invalid conflict):** the picker offers one row per finding (`headRows`); `startEdit`
  anchors the token to the row actually opened (`detail.id`/`detail.version`), never to the list; `conflictLoaded`
  with `record: null` (recordValid=false / unreadable) renders "cannot be shown or validated… draft is kept" and NO
  continue button (`canContinueOnHead` false, `continueOnHead` is a no-op); continuation moves only the token.
  Reducer + static component regressions; harness recipe 21.
- **A4 (project switch):** route keys the owner subtree by `owner:project`; each form binds its draft/candidate to
  the identity (derived null under another identity, late async results from an earlier identity are dropped).
  Reducer + static regression (foreign-identity state renders nothing of the draft); harness recipe 22.

## Checks executed (this sandbox, 26 September 2026)

- `vitest` PGlite + boundary: `citation-scope-binding-migration`, `citation-record.functions`,
  `citation-business-fact.functions`, `citation-business-fact-ui`, `milo-candidate-chain-migration` → 5 files /
  113 tests PASS (after the A1 ABA additions).
- `vitest` pure + component: `citation-authoring` (13), `CitationFindingAuthor` (static, incl. conflict gating and
  foreign identity), `citation-business-fact-ui`, `citation-panel-ui`, `CitationReviewPanel` → 5 files / 47 PASS.
- `vitest src/i18n` (active catalogs + 20 staged locales, fingerprints, key counts 4186, placeholder/number
  parity, no copied English) → 30 files / 753 PASS.
- Earlier in the stage (before packet A): the four P3/P4 migration suites + candidate chain: 6 files / 394 PASS.
- `tsc -p tsconfig.json --noEmit` → exit 0. ESLint (`--max-warnings=0`) on the 87 touched source/test files →
  clean. Prettier `--write` + `--check` on 103 touched files → formatted (`.sql` has no Prettier parser; formatted
  by hand).
- Full `vitest run` (node environment, after all packet-A corrections and formatting) → 6802 tests PASS, 0
  failures (file count in `.coordination/citation-authoring-result.md`).
- `vite build` cannot run in this sandbox (`.env` stat is denied); Codex runs the build.
- Browser harness: not run here (no browser in this sandbox); recipes and expected log lines are in
  `.coordination/harness/README.md` (12–22, 390 px, keyboard). Codex runs them.

## Codex browser packet B — corrections (same day)

Codex's independent pass: `npm run build` PASS, 5 critical suites / 214 tests PASS, real-browser confirmation of
A2 (lost response → same v1 row), A3 (unavailable head offers no acknowledgement; valid head → v2), A4 (fact
draft clears A→B), both families, fact lost-response retry, explicit lock, 390 px + keyboard. Two P2 UI gaps
remained and are fixed here (no SQL/contract change, SQL suites not re-run):

- **B1 reopened source timestamp invisible.** `draftFromRecord` fed a full ISO string to a `datetime-local`
  control, which cannot display it. Now the control shows the stored instant as UTC wall-clock with seconds
  (`instantToUtcInput`), keeps the stored string verbatim until the visible value changes
  (`instantFromUtcInput`), and flags a non-Z offset / fractional form next to the control
  (`instantDisplayDiffers`, "Stored exactly as …"). Regressions cover Z and `+02:00`/microsecond values, the
  actual rendered `value=`, no-edit resave (exact string, idempotent) and explicit edit (→ `Z`).
- **B2 review-and-lock showed a summary.** `PanelDetailView` renders the exact stored version (all questions with
  prompt id/revision/text/language, both languages, true mode incl. `api`, model/search evidence, every session
  and location control, schedule with timezone/rounds/slots as Stockholm wall-clock beside the UTC instant,
  approval instant) inside a labelled, focus-managed non-modal region before _Approve and lock_; locked heads can
  be inspected read-only. Regressions assert ten distinct question texts, a revision-2 prompt and non-default
  session/location/schedule values in the region, `api` shown as api, and no region without an explicit click.
- **Harness completion.** Visible mock-latency preset (250/4000 ms) for every call, an owner-subtree instance
  badge proving the route-key remount, recipes 22 (pending request during a switch), 23 (B2), 24 (B1). The
  closure-captured `startedFor` comparisons were replaced by a live `useRef` identity guard in all three forms
  and are documented as a fallback to the route-level remount, not as the guard.
- Copy: 14 new keys in all 24 catalogs (216 keys, staged 4200), fingerprint
  `3affd8936a8bce81ce411aaffbf2909c58d56d85e7ccc9e5c3efd6d11e650d4f`.
- Checks: affected suites 35 files / 805 PASS; `tsc` exit 0; scoped ESLint clean; Prettier formatted. Build and
  browser recipes are Codex's (sandbox limits unchanged).

## Limits (honest)

PGlite is a single connection: it proves the logical guard (RAISE after the delegated write rolls the insert back
within the statement) and the ABA/idempotency semantics, not true concurrent transactions. The harness mocks apply
the v2 outcome codes and the head ROW token but are not the database, and "Project B" shares the fixture stores;
the project-switch proof is the absence of A's draft/payload in B's calls. Static component tests render reducer
states; live clicks are the harness's job. Machine-authored pl/sv/da and all staged translations await fluent
acceptance. No live provider, production write, migration application, purchase, budget or credential change
occurred; USD 50/month and manual free-account AI grants are unchanged.
