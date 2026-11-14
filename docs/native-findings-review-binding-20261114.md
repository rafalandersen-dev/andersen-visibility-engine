# Native-report finding review binding — SQL/security + trusted server layer (2026-11-14)

> **R2 security correction (executed; supersedes R0/R1).** The 4 R1 findings + 3 TS cases are resolved and
> the full legacy-upgrade matrix is implemented and PASSING locally (`vitest --configLoader runner`):
> (R1-01) `citation_native_parsed_supported` is now a complete fail-closed contract mirroring
> nativeReportParsedRecordSchema + the import/cell schemas + Google/Bing descriptors — NULL-safe
> presence/type/strict-key-set/bounds before any cast, civil-date period with the source timezone, market/
> filters per source, metric key-set per file, cell value↔status (non-negative, percent≤100, Bing
> whole-count lexeme), and complete Bing-overview day coverage; the 16 probe invalids fail closed while
> genuine Google (chart/pages)/Bing (overview/pages)/all-unknown controls pass. (R1-02) the owner binding
> read constructs the candidate binding and resolves it through the SAME full resolver (artifact
> identity/hash/tombstone) before emitting; unbindable→`binding:null`. (R1-03) `..._for_review_v2` runs
> account/authority/assignment admission, THEN the native gate, THEN the internal base — no material work
> before consent. (TS) the reviewer read boundary rejects an inspectable item with empty rows, a
> `nativeMaterial.artifactId` ≠ evidence id, and material on a masked/erased record. The whole-set sort uses
> `COLLATE "C"`. New suites: `native-report-binding-migration.test.ts` (validator + binding + gates) and
> `native-report-binding-legacy-upgrade.test.ts` (two-phase 6-case + linked improvements + late-parse +
> caps-unchanged-after-install + positive control). Verified: `tsc` (my files clean), `eslint` (clean),
> `vitest --configLoader runner` 7 suites / 298 + 11 tests PASS. The whole-project `tsc` currently also
> reports 2 syntax errors in `src/components/CitationFindingAuthor.tsx` — that file belongs to the
> concurrent UI author's in-progress session, is out of this stage's scope, and is left untouched.


> **Security-correction update (supersedes any earlier "complete" claim).** The first SQL/server pass was
> NOT accepted; independent review (`sql-server-independent-review.json` NS01–NS07, `ts-contract-independent-review.json`
> NFTS-01/02) found gaps now corrected in `20261114120000_citation_native_review_binding.sql` and the TS
> boundary: (NS01) a central NULL-safe `citation_native_parsed_supported` validator + a hardened resolver
> (full integrity, supported source/parser/pair/file, NULL-safe rows, artifact identity, tombstone
> rejection) — the 8 probe invalids now fail closed, genuine + all-unknown pass; (NS02) a BEFORE INSERT
> trigger on `ai_citation_findings` authoritatively verifies every bound native at the real save boundary
> (bare refs preserved, never auto-promoted); (NS03/NS04) the base `read_ai_citation_finding_for_review` is
> made internal-only (REVOKE from service_role) and v2 gates AFTER authority admission (no existence/type
> oracle); (NS05) consent binds the exact `citation_review_authorized` membership+policy revisions and
> scope `native_v1` — remove/restore or policy disable/restore invalidates it; (NS06) tombstoned/erased
> native identities never resolve, regain consent, or gain `nativeMaterial`; (F/NFTS-01) the reviewer is
> served the exact strict `nativeReportParsedRecord` under `nativeMaterial` with availability/inspectable/
> material coherence enforced at the read boundary; (NFTS-02) the binding read has cross-field coherence +
> a request-id cross-check; the whole-set sort is `COLLATE "C"` to match the client digest; the migration is
> registered in `milo-candidate-chain-migration.test.ts`; and `native-report-binding-migration.test.ts` is
> the real-foundation PGlite security matrix. Verified locally: `tsc` (pass) and changed-file `eslint`
> (pass); **`vitest` could not run in this sandbox** (it needs to write `node_modules/.vite-temp`, which the
> filesystem sandbox denies) — Codex/root must execute the suites.


Stage 2 of native-report findings. Stage 1 (schema + authoring pure logic) is preserved. This stage adds
the security core and the trusted server/schema layer. **No UI / i18n / browser work yet** (next stage).
One NEW additive migration; historical migrations untouched. No commit/CLI/live migration/grant/publish
by Claude. Codex runs tests and reviews.

## What a NEW bound finding version is
A native evidence item may carry an all-or-nothing strict binding `{ rawSha256, source, parserVersion,
parsedSha256 }` embedded in the finding content, so `record_sha256` already carries it (no new hash
machinery). `parsedSha256` is the server's **central canonical digest** over the ENTIRE persisted parsed
interpretation (`citation_native_parsed_digest` = `sha256('native_review_binding_v1' || parsed::text)`,
using Postgres's deterministic `jsonb::text`). The client NEVER computes it — it is read from the new
narrow owner RPC `read_ai_native_report_binding` and embedded verbatim; the SQL re-verifies every field
against the live artifact on save/consent/read/inspectability.

## New / changed (migration `20261114120000_citation_native_review_binding.sql`)
- `ALTER ai_citation_review_assignments ADD native_scope, consented_set_sha256, consent_at` (nullable; a
  presence CHECK keeps the three together). Generic assignments carry none.
- New helpers: `citation_native_parsed_digest`, `citation_native_binding_resolves` (live per-field
  verification + material present, all-UNKNOWN cells still count), `citation_finding_is_native_bearing`,
  `citation_review_native_set_digest` (canonical digest over the ENTIRE cited bound set; NULL if any item
  is bare/unresolving or none is native), `citation_review_native_consented`, `citation_review_native_gate_ok`.
- New RPCs: `read_ai_native_report_binding` (authoritative binding; null for unparsed; SEPARATE from the
  frozen 5-key `read_ai_native_report_parsed`) and `grant_ai_citation_review_assignment_v2` (records
  EXPLICIT full-set consent; refuses a legacy/unbound/mismatched set).
- `CREATE OR REPLACE` (one authoritative body each, no duplicate bodies):
  - `citation_finding_inspectable` — native arm now inspectable iff the binding resolves live; bare/legacy
    native still false, so legacy findings stay globally uninspectable and the improvement cap is unchanged.
  - `grant_ai_citation_review_assignment` (old 4-arg) — now CLEARS all native-consent columns on every
    insert AND conflict-reactivation, so `v2 grant → revoke → old grant` cannot resurrect consent.
  - `read_ai_citation_finding_reviews` and `save_ai_citation_finding_review` — add the native gate (after
    the existing generic assignment gate; in save at BOTH the optimistic point before any hash/idempotency
    AND under the owner lock) so any native-bearing finding (incl legacy) without current full-set consent
    fails closed with the SAME `citation_finding_unavailable`.
  - `read_ai_citation_finding_for_review_v2` — gates native-bearing findings before returning anything, and
    when consented injects the bounded parsed material into each resolving bound native item (base read
    unchanged). Material = exact stored parser projection (source/parser/dimension/aggregation/reportKind/
    period/completeness/marketScope/filters/withheld/partial/limitationNote/rows-cells). Never raw
    bytes/base64, never another artifact/finding.

## Trusted TS layer
- `citation-finding.ts`: the native binding shape + `nativeOnlyFindingIssues` (native-only NEW-save rules)
  were **moved OFF the global `findingSchema`** into a save-only validator applied by `citation-record.ts`
  `boundedFinding`. Reason: `findingSchema` is reused by historical READS (`citation-record.server.ts`
  `getCitationFinding`), and a historical native-only row may carry answer-like fields — it must stay
  readable/editable. New saves are still rejected at the trusted boundary.
- `citation-finding-review.ts`: bounded `citationReviewNativeMaterialSchema` (reuses native-ai-report
  cell/period/market schemas); the native evidence member is now `inspectable: boolean` + optional
  `nativeMaterial`; new `citationReviewNativeAssignmentInput/Receipt` schemas.
- Server + endpoints: `grantCitationReviewNativeAssignment(Fn)`, `readNativeReportBinding(Fn)`,
  `nativeReportBindingReadSchema`. The frozen `read/persist` native RPC responses are unchanged.

## Consent / legacy limitations (intentional access reduction)
- After this migration, ALL native-bearing findings (including legacy/unbound and mixed) are WITHHELD from
  a reviewer (detail/receipts/notes/digests/save) until the owner grants current full-set native consent via
  `grant_ai_citation_review_assignment_v2`. This does NOT equal the old reviewer-visible baseline; owner and
  historical audit rows are untouched. Legacy improvement caps are unchanged; migration/parse/read/regrant
  never upgrade a legacy version.
- Deleted/recreated artifact or a numeric-version re-creation never regains old binding/consent (hashes no
  longer match; a new row has no assignment). Historical `inspection_complete=false` receipts never upgrade
  on identical retry. Withdrawal is preserved.

## Verification (Codex runs — NONE executed here)
- `bunx vitest run src/lib/native-report-binding-migration.test.ts` — deployment-compat (frozen 5-key
  read/persist shapes unchanged after the migration) + the new binding read (null→authoritative,
  deterministic digest, raw hash binds the artifact).
- `bunx vitest run src/lib/citation-panel.test.ts src/lib/citation-authoring.test.ts` — schema binding +
  native-only save-only rules + authoring full-set preservation (stage 1 + relocation).
- `bunx tsc -p tsconfig.json --noEmit`, changed-file ESLint, `git diff --check`.

## Remaining (next stages, NOT done here)
1. **Full PGlite legacy-upgrade matrix** (`legacy-upgrade-acceptance-plan.json`): a NEW test applying the
   citation review bootstrap + `20261113120000` + `20261114120000`, seeding the six legacy native-only /
   mixed cases (bare `{kind,native,id}`, `saveFRaw` + explicit assign/submit, honest non-answer capture
   fields) + the late-parse control + delivered improvements; assert post-migration withholding, no silent
   promotion, `v2 grant→revoke→old grant` consent-cleared, and the positive control (a new fully-bound
   version + full consent + fresh complete review → inspectable/owner_attested subject to existing gates).
2. **UI / i18n / browser** (CitationFindingAuthor native multi-select; CitationReviewPanel native material
   via the source renderer; EN/PL/SV/DA + 20 staged keys + fingerprints; synthetic browser fixture). The UI
   must compute the full-set consent digest as `sha256('native_review_set_v1' || join('|', sorted
   lower(id)+':'+parsedSha256))` from the per-artifact `read_ai_native_report_binding` results.

## Stage 3 (UI/i18n/browser) — partial landing (2026-11-14)
Only the correct, non-breaking, security-critical client pieces landed this turn; the coupled
component+i18n+fixture work is handed off (it cannot be completed correctly without execution: the staged
i18n needs recomputed fingerprints, and shipping blind rewrites of the two ~1000-line components + 14-group
browser fixture would be unverifiable).

Landed:
- `src/lib/citation-review-ui.ts` — `nativeConsentSetString` / `nativeConsentSetDigest` (client full-set
  consent digest, byte-identical to the SQL `citation_review_native_set_digest` canonical formula; hashes
  ONLY the authoritative per-artifact `parsedSha256` from `read_ai_native_report_binding`, never a
  browser-recomputed parsed digest; null = unconsentable set) and `nativeConsentIdentity` (clears accepted
  consent on any finding/reviewer/set/epoch change). `+ citation-review-ui.test.ts`.
- `src/components/NativeGoogleIntakePanel.tsx` — `ReportView` is now a named export for reviewer reuse
  (pure renderer; the reviewer never mounts the intake panel or uses owner endpoints).

Remaining (exact, line-referenced to `ui-integration-review-map.json`):
- **CitationFindingAuthor.tsx** (UI3/UI5): native artifact multi-select from `readNativeArtifactsFn`
  summaries (labels) + `readNativeReportParseStatesFn`; per-explicitly-selected artifact
  `readNativeReportBindingFn` (authoritative binding) + `readNativeReportParsedFn` (inspect via `ReportView`);
  wire `draft.natives` (stage-1) + `fresh.natives` into `staleSelections`; native-only branch hides
  answer/completeness/competitor/own/recommendation/support/accuracy controls with truthful copy; preserve
  every bare/bound ref on edit (no auto-upgrade); total evidence (answer+source+native) ≤ 20.
- **CitationReviewPanel.tsx** (UI4/UI6/UI7): `GrantControls` shows the native scope + per-artifact material
  disclosure and an explicit unchecked consent whose digest = `nativeConsentSetDigest(...)`, cleared via
  `nativeConsentIdentity` on reviewer/row/set/epoch change, calling `grantCitationReviewNativeAssignmentFn`
  for native-bearing findings (old `grant...AssignmentFn` for non-native only); `ReviewerEvidence` renders
  each authorized `evidence[].nativeMaterial` through the exported `ReportView`, strictly inside the existing
  `reviewerMaterialExposed`/`denied`/mount-token mask.
- **app.citation-review.tsx + components** (UI1): bind author/grant/reviewer remount keys + pending/frozen
  state to `getWorkspaceSaveContext().epoch`/hydration (reuse NativeGoogleIntakePanel's pattern), so a
  same-actor re-login / hydration loss retires late reads/writes and hides cached native material.
- **i18n** (UI9): EN/PL/SV/DA native keys in `citation-authoring.ts`/`citation-review.ts` + `REVIEW_SHARE_SCOPE`
  native entry; a `citation-review-fallback.ts` composer (English-source-first/local-last, per R21
  `billing-screen-fallback.ts`) wired through the 20 `*-citation-review.ts` files; recompute ONLY affected
  fingerprints; preserve all existing translations and parity/purity suites; update the owner intro to
  "native parsed review now available" truthfully.
- **Browser fixture** (`scripts/native-google-intake-browser/*`): mount ACTUAL CitationFindingAuthor +
  CitationReviewPanel + ReportView with stubbed transport, the 14 `browserAcceptanceMatrix` scenario groups,
  zero unexpected network, EN/PL/SV/DA desktop+390px, keyboard + 44px measurement.
- Supporting static component tests remain supplementary; the browser matrix is the interaction proof.

## R3 SQL-contract completion + lifecycle coverage (executed; supersedes R0–R2 for the SQL validator)
The independent R2 differential (1050) + helper-edge (48) runs demonstrated the shared SQL validator
`citation_native_parsed_supported` was NOT a faithful mirror of the persisted TS contract
(`nativeReportParsedRecordSchema` + `nativeReportImportInputSchema` + `nativeCellSchema` +
`interpretExportCell`/`interpretBingCountCell`). It was rewritten to assert the WHOLE contract, not the listed
examples:
- **Strict key sets** at every object level via the new `citation_native_exact_keys` (record/input/period/
  marketScope/artifact/row/cell): a missing required key, an extra/forged key, or a forbidden cell `review`
  (so an import-forbidden `known_zero` can never be a stored cell) fails closed. `filters` is required even
  though Zod defaults an omitted one — a deliberate canonical-object requirement.
- **Null-safe enums** (`jsonb_typeof='string'` before every `NOT IN`) for completeness/status/unit.
- **UTF-16 bounds** via the existing `native_artifact_utf16_length` for note/declaredProperty/filename/row
  key/cell raw/filter key+value (an astral-padded over-cap value is now rejected; the exact-2000 limit still
  accepts). declaredProperty is JS-trimmed first.
- **Deterministic cell semantics**: known_value/preliminary must equal `interpretExportCell(raw,unit)` —
  JS-trim (new `citation_native_js_trim`, the ECMAScript WhiteSpace+LineTerminator set, not `btrim`), reject
  unavailable markers, plain integer/decimal digits only (no formula/scientific/grouping), percent≤100, a
  bare zero reads as unknown_export_zero. Bing cells are count-only with the whole-event integer lexeme guard
  applied to known_value/preliminary AND unknown_export_zero. Google fractional counts + visible
  unknown/preliminary are preserved.
- **No-raise numerics**: withheldPageRows/bytes compared as `numeric` (an int32-overflow value no longer
  raises); capturedAt grammar tightened to the reader's exact ISO-8601 (hour 00-23, min/sec 00-59, colon
  offset) so PG's lenient cast cannot normalize `24:00:00` / `:60`.

Independent acceptance (read-only frozen scripts, SQL SHA `b092f8a6b626345dfbb032af47078f76065037fdfdc70656f2ca69f407a29031`):
`contract-differential-acceptance.ts` → exit 0, 1050 cases, 0 unsafe/error/requires_review (165 former unsafe
acceptances now rejected; the 10 intentional stricter cases classified as canonical-filters(6)+google-empty-
cells(4); 12 external-identity rejections on the resolver). `helper-edge-acceptance.ts` → exit 0, 48 cases,
20 accepted / 28 rejected, 0 unsafe/error.

**Lifecycle acceptance tests actually completed** (real server helpers + PGlite, no stubs):
- `native-report-binding-legacy-upgrade.test.ts`: the late-parse control now stages a GENUINE unparsed report
  in Phase 1 and REALLY parses it in Phase 2 — the bare legacy ref stays uninspectable and its immutable
  record, approval receipt AND delivered-improvement detail are byte-identical. The six-case matrix now also
  snapshots + compares the exact receipt rows and full improvement detail (record/hash/pins) before/after
  install+parse+read+regrant. The positive control is now a true SUCCESSOR of an EXISTING legacy logical
  finding (its expected head, next version; the superseded legacy row unchanged) that requires fresh whole-set
  consent + a fresh complete review.
- `native-report-binding-migration.test.ts`: two distinct native artifacts (order-independent full-set digest;
  subset/stale consent refused; losing either invalidates); delete→tombstone→recreate-same-id-and-material
  denial; a member remove/restore AND a restrictive-policy revision bump invalidate detail + standalone
  receipts + save-retry until an explicit fresh grant restores them; and a reviewer withdrawing their OWN
  native receipt after consent-revoke / membership-loss / native-erasure (another actor refused; the response
  is the content-free `true`).

Placement note: the withdrawal lifecycle lives in `native-report-binding-migration.test.ts` (which installs
the candidate) rather than `citation-finding-review-migration.test.ts` (which deliberately stops before the
candidate), because the requirement is explicitly "with the new migration installed".

Owned suites green: `native-report-binding-migration` (14), `native-report-binding-legacy-upgrade` (1),
`citation-finding-review-migration` (223-case file), `citation-finding-review.functions`,
`milo-candidate-chain-migration`, `citation-panel` — `tsc --noEmit` clean, eslint/prettier clean. Residual
limit: PGlite's planner/collation and `::timestamptz`/`COLLATE "C"` behaviour are close to but not identical
to hosted Postgres; the civil-date guarded cast and the whole-set sort should be re-confirmed on the
production engine at release.

## R4 numeric-semantics fix + two test-proof extensions (executed; SQL SHA `942690b2f1ddb7226ceec9bc98a836424da9886fd8ddd078acc4e431b1f72737`)
R3-V-01 (P1, demonstrated): the validator compared cell values and `withheldPageRows` with PostgreSQL
arbitrary-precision `numeric`, which diverges from the finite JS `Number` the strict reader/parser use — it
wrongly REJECTED four genuine Google parser outputs (`12.50000000000000001`→`12.5`, `0.10000000000000001`→
`0.1`, `9007199254740993`→`...992`, a `5e-324` subnormal) and wrongly ACCEPTED three records JS reads as
non-finite (`known_value` value `1e400`→Infinity, an underflow-to-zero `known_value`, `withheldPageRows`
`1e400`→Infinity). Fix: a new `citation_native_js_number(text) → double precision` helper that mirrors
`Number` exactly — a guarded `::float8` cast rounds to the nearest double (subnormals kept) and, on the only
range errors Postgres raises, maps overflow (|x|≥1) to `+Infinity` and underflow (|x|<1) to `0`, never
raising. Known_value/preliminary now parse the raw to that double, reject non-finite / `>100` percent / a
value rounding to `0` (reads as `unknown_export_zero`), and require the stored value to be the SAME finite
double (so `12.50000000000000001 === 12.5`); `withheldPageRows` must be a finite nonnegative integer. NO
Google safe-integer cap introduced, Bing's separate integer-lexeme guard preserved, existing unknown/invalid
null statuses unchanged.

Independent acceptance against the final frozen SQL (SHA above): `contract-differential-acceptance.ts`
(1050) exit 0, `helper-edge-acceptance.ts` (48) exit 0, and `r3-numeric-delta-extended-probe.ts` (8) exit 0
with **5 accepted / 3 rejected** — the five genuine Google records (decimal/fraction/large-integer rounding,
subnormal, `1e308` control) accepted, the three forged non-finite records rejected; zero unsafe/error/
unexplained-reject in all three.

Test-proof groups (test-evidence only; no new implementation bug exposed):
- **R3-T01**: the NS05 epoch test now establishes a GENUINE successful approved receipt bound to
  `view.recordSha256`, retains its exact payload, and proves the detail, the standalone receipts read AND the
  identical same-payload retry (so a rejection is the native gate, not a stale hash) are all denied — with the
  receipt count unchanged (no new/promoted receipt) — after a member remove/restore AND an ACTUAL policy
  `disabled`→`separate_reviewers` cycle, recovering (idempotent same-receipt retry) only after an explicit
  fresh grant. The delete→recreate-same-id test now also retains a previously-successful review payload and
  proves re-submitting it cannot resurrect the deleted/recreated native.
- **R3-T02**: the two-native test now saves an EXPLICIT successor (same logical finding, expected head, next
  version), asserts the old version is byte-identical, both exact bindings are preserved (identical canonical
  set digest, both materials inspectable) and the successor needs its OWN fresh whole-set consent; loss is now
  parameterized over BOTH artifacts (a and b) on fresh pairs. The accepted order-independent / subset / stale
  cases are retained.

Residual gates unchanged: hosted-Postgres parity (now also the `::float8` rounding/overflow/underflow
behaviour, which matches standard `strtod`/PGlite here) and the UI/browser stage remain separate; no release
claim.
