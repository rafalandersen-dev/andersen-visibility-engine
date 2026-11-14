# Native-report finding review — UI layer (2026-11-14)

Owner authoring + assigned-reviewer UI for citing saved native reports (Google GSC / Bing AI
Performance) in a finding and sharing their parsed material with an explicit, scoped reviewer grant.
Builds on the frozen server/SQL contracts (another session owns the migration + lib validation); this
stage is the component/route/i18n/test layer only. **No browser acceptance is claimed here** — the
static component tests below are supporting evidence; interaction, async retirement, duplicate
submission, mobile/keyboard and privacy races need the real-component browser fixture (next stage).

## Changed files (this stage)

Components / route
- `src/components/CitationFindingAuthor.tsx` — cited-native multi-select; per-artifact authoritative
  binding read on explicit "cite with current material"; every existing bound/bare reference preserved
  on edit; native-only findings omit the answer-derived sections and explain the absence; deleted
  native shown as stale.
- `src/components/CitationReviewPanel.tsx` — reviewer renders a bound+consented native's exact parsed
  material through the shared `ReportView` (same source-specific projection as owner intake), inside the
  existing `reviewerMaterialExposed` mask; a bare/unconsented native carries none. `GrantControls` takes
  the finding's cited native set and, for a native-bearing finding, offers the explicit full-set consent
  grant (`grantCitationReviewNativeAssignmentFn` with the client-composed `nativeConsentSetDigest`);
  consent is bound to reviewer+row+set+session epoch and cleared on any change. Grant/revoke/decision
  touch targets bumped to 44px.
- `src/components/NativeGoogleIntakePanel.tsx` — unchanged this stage; its `ReportView` export (prior
  work) is reused by the reviewer.
- `src/routes/_authenticated/app.citation-review.tsx` — owner authoring/grant AND reviewer surfaces
  mount only for a stable hydrated session whose live workspace userId matches the actor, and are keyed
  by the session epoch, so a same-actor re-login / hydration loss / actor switch retires pending
  reads/writes/consent and forces a fresh authorized read (UI1).

i18n (active EN/PL/SV/DA)
- `src/i18n/native-google-intake.ts` — +19 `nativeIntake.{bind,review,consent}.*` keys (all four active
  languages). **All new native-binding copy lives in the `nativeIntake` namespace on purpose**: it is a
  pure-fallback staged namespace with a single shared source-hash constant, so the staged completion is a
  one-line fingerprint change instead of editing the citation-authoring/citation-review batch of 20
  staged locales.
- `src/i18n/citation-review.ts` — owner intro updated (UI7): native report material can now be shared
  with an assigned reviewer; only independent destination proof remains open. Value-only edit (no key
  change).

i18n (staged, inactive — fingerprints/counts only, no translations invented)
- `src/i18n/staged/native-intake-fallback.ts` — `STAGED_NATIVE_INTAKE_SOURCE_HASH` recomputed (100→119
  keys).
- `src/i18n/staged/de-source.ts` — `"native intake"` and `"citation review"` reviewed-source
  fingerprints recomputed.
- 18 locale index files (`bg,cs,el,es,et,fi,ga,hr,hu,it,lt,lv,mt,nl,pt,ro,sk,sl`) — `"citation review"`
  inline `sourceHash` recomputed (French records none; German uses `de-source.ts`).
- Staged test totals updated: per-locale native-intake count 100→119 (5 suites) and the all-namespace
  per-locale total 5082→5101 (16 suites incl. `billing-screen-fallback.test.ts`).

Tests
- `src/components/CitationFindingAuthor.test.ts` — native-only omits answer sections + explains;
  mixed finding preserves bound + bare refs; deleted native shown stale.
- `src/components/CitationReviewPanel.test.ts` — reviewer renders bound material via the source-specific
  projection; bare/unconsented shows "not shared"; a revoked read hides cached native material.

## Key contract decisions / invariants honoured

- Binding comes ONLY from `readNativeReportBindingFn` (authoritative narrow owner read); never a
  browser-computed digest or a parse-state placeholder (UI2). A failed/pending read never cites.
- Every existing native reference is preserved on edit, bound or bare; no auto-bind of legacy refs, no
  silent drop; a deleted native is visible as stale and blocks save (UI3).
- Native-only `citation_source` findings omit answer completeness, own/competitor citation,
  recommendation and answer-anchored support/accuracy (the server `boundedFinding` forces this; the UI
  matches it so displayed choices never differ from the saved record — UI5).
- Consent binds the exact reviewer + finding row + whole cited native set + session epoch; an unbound/
  legacy set cannot be consented (digest null → disabled with an explanation). The server recomputes the
  set digest live and refuses mismatch/unbound/legacy (UI4).
- Reviewer native material renders only inside `reviewerMaterialExposed` (this mount's own successful
  scoped read); a revoked/expired read hides it; the reviewer never reads an owner intake endpoint
  (UI6). All retained rows/statuses, period/timezone/market unknowns, withheld counts, partial/
  incomplete and limitation note are preserved via the shared `ReportView`; all-unknown stays inspectable
  (UI7).

## Local checks run (this machine)

- `vitest run … src/i18n` → 42 files, 1227 passed (staged fingerprints/counts green).
- `vitest run … CitationFindingAuthor CitationReviewPanel citation-review-ui.test` → 66 passed.
- `tsc --noEmit -p tsconfig.json` → exit 0 (whole project, incl. tests).

Reviewed-source fingerprints recomputed with the staged suites' own algorithm.

## R3 corrections (ui-r2-independent-review.json — six defects + localization)

- **UIR2-01 (author reads + shows material).** `citeNative` now reads BOTH the authoritative binding AND
  the full parsed material (`readNativeReportParsedFn`), verifies both name THIS artifact and are
  parsed/available, and exposes the exact current material per cited bound native via `ReportView` (all
  rows/unknowns/withheld/limitations). Review/Save are gated by `nativeReady` (every bound native's current
  material loaded); a pending/failed/unavailable/mismatched read never attaches, and a cached success never
  qualifies. Bare legacy refs stay bare.
- **UIR2-02 (async retirement).** Reused the intake mounted + bound session (epoch/actor/project) + op-token
  pattern: re-checked before every transport and after every await before any dispatch/invalidate/refetch/
  onSaved; retired on unmount; immediate in-flight guards for double activation. All owner query keys carry
  the session epoch (fresh read on a new session even with a shared QueryClient); the reviewer mount-token
  mask is kept. The deferred native-consent digest and reviewer submit/withdraw late results are guarded.
- **UIR2-03 (pending cite bound to draft).** The cite is bound to the active draft via the op token, bumped
  synchronously by New/Edit/Cancel/scope (`retireNative`); a late response for a superseded draft is
  discarded and never patches another draft. Review/Save use the same `nativeReady` predicate as the form.
- **UIR2-04 (one native cache + honest freshness).** The author's `native-artifacts` query key is now
  IDENTICAL to the intake panel's (shared session-scoped cache) — import/delete above reflects without
  navigation. Freshness is gated on `isSuccess && !isError` (never cached success during pending/failed);
  a cited native can't qualify Save while the list is unconfirmed, and deletion is distinguished from
  loading (stale ref stays visible and blocks Save).
- **UIR2-05 (consent disclosure + no stale success).** `GrantControls` reads each cited native's CURRENT
  binding + full material, renders a distinguishable per-report `ReportView` (source + property + period),
  and validates every current binding against the finding's immutable `parsedSha256`; any missing/failed/
  pending/unbound/mismatched member disables the whole-set consent. The grant is bound to the exact
  reviewer/row/set/session via a grant op token bumped on identity change, so a late grant cannot restore a
  changed selection's success/link. The native grant stays separate from the (unchanged) legacy grant.
- **UIR2-06 (44px journey).** `min-h-11` applied to new/edit/native-picker/cite/view/review/save/cancel and
  grant/revoke/copy/withdraw controls, the consent checkbox label, and the share-link input; no global
  Button redesign.
- **Localization.** The displayed owner intro is now the truthful NEW `nativeIntake.review.ownerIntro`
  (EN/PL/SV/DA real text); the four `citationReview.owner.intro` literals AND the `citation review` staged
  fingerprints are restored to the b802 baseline (`6320ed…beae4`, now unused). `nativeIntake` is one key
  larger (120); the shared `STAGED_NATIVE_INTAKE_SOURCE_HASH`/de-source entry recomputed to
  `509f421f…d8eb` and verified by the staged suites (per-locale native count 120, total 5102) — not
  hardcoded blind.

## R4 corrections (ui-r3-independent-review.json — five defects)

- **UIR3-01 (operation ownership/cleanup).** The native-cite token (`citeOp`) is now DISTINCT from the
  save/startEdit mutex: a successful save resets the draft (bumping `citeOp`) but no longer strands its own
  `busy` — the mutation OWNS `busyRef` and releases it unconditionally in `finally` (only touching React
  state while mounted). `onSaved` runs only after re-checking the live mounted/session AFTER the awaited
  invalidation. In GrantControls, `run`/`grantNative` release the mutex unconditionally (success/error
  message still gated by the grant token + live session), so a reviewer change mid-grant can't leave it
  stuck; reviewer selection retires synchronously in `setGrantId`.
- **UIR3-02 (freshness/privacy + grant lifecycle).** Author `nativeListReady` now includes `!isFetching`
  (a background refetch/cached success never qualifies), and the SAME predicate gates both rendering and
  Review/Save; a bound native's `ReportView` is shown only while the current list confirms it live and
  non-stale (a deleted badge can't coexist with a full report). GrantControls observes the SHARED
  `native-artifacts` key, so an actual intake delete/refetch retires its disclosure+consent (a cited id
  absent from the live list disables consent), and its material is masked while either the shared list or
  the per-report read is pending/fetching.
- **UIR3-03 (session boundary everywhere).** A bounded local `useLiveSession(actorId, projectId)` (same
  pattern, not a new framework) is applied to OwnerReview, OwnerFindingDetail, GrantControls (roster/policy
  + native reads) and ReviewerFinding: epoch-scoped owner keys, live actor/epoch/hydration checks in every
  queryFn and after every awaited mutation (reviewer submit/withdraw, grant material read's post-await
  liveness). Reviewer mount token, sticky denial and own-withdrawal are retained.
- **UIR3-04 (View preserves the pin).** `citeNative(id, rebind)` separates read-only inspection
  (`rebind=false`, for an existing bound ref: confirm the returned binding equals the stored pin and only
  expose material — a mismatch is left stale/unavailable, never a silent rewrite) from deliberate
  bind/rebind (`rebind=true`, bare→bound/add: writes the new binding). Returned id/parse-state and the
  material's own `artifactId` are validated against the request; grant additionally matches
  `parsed.artifactId` and the stored parsed digest (no invented canonical hash).
- **UIR3-05 (remaining 44px).** The shared author `field` class now carries `min-h-11`, so scope/answer/
  entity/priority/decision (and support/accuracy) selects meet the 44px minimum; no global control redesign.

Local checks (R4): `vitest src/components src/i18n` → 69 files, **1481 passed**; `tsc --noEmit` → exit 0;
`eslint` (changed files) → clean. Localization accepted baseline preserved (native 120 / total 5102 / hash
`509f421f…d8eb`; original `citationReview.owner.intro` + staged fingerprints at b802; no locale text changed).

## R5 corrections (ui-r4-independent-review.json — three remaining original-scope omissions)

- **UIR4-01 (finish live-session admission / return guards / exposure masking).** EVERY read queryFn now
  re-checks the live session AFTER its await (not only before): author prerequisites via a `guarded(fn)`
  pre+post wrapper; OwnerReview/OwnerFindingDetail, GrantControls roster/policy/artifacts and reviewer
  view/reviews via inline pre+post. Reviewer `submit()`/`withdraw()` admission requires `mounted + current()`
  and the `withdraw` catch re-checks `current()`. Rendered exposure is gated on the live predicate: OwnerReview
  rows/detail (`sessionLive`), OwnerFindingDetail `d`, and ReviewerFinding (`live` gates `exposed`/`v`,
  cached `mine`, and an early-return so a retired session shows nothing — own withdrawal stays only within the
  still-current session). The clipboard `setCopied` is bound to the grant operation token + live session.
  Epoch keys, mount tokens and route keying remain as defense; owner active-project vs reviewer URL-target
  stay distinct.
- **UIR4-02 (retire consent on uncheck / loss of readiness, incl. pending grants).** The consent checkbox is
  disabled while a grant is in flight and its `onChange` synchronously bumps `grantOp` + clears msg/copied, so
  a continuation past a pending `nativeConsentSetDigest` can no longer issue the RPC after an uncheck. A new
  effect retires `grantOp` and clears the accepted consent + success/link whenever full-set `consentable` is
  lost (deleted cited artifact, or pending/error list/material), so no stale Granted/link survives an actual
  intake delete and recovery requires an explicit re-consent (checkbox stays unchecked after a refetch). The
  post-digest/post-grant checks already gate on the token, which now reflects every consent/readiness change.
- **UIR4-03 (paired native response coherence).** Author `citeNative` now also requires the material's
  `artifactSha256`/`input.source`/`parserVersion` to equal the binding's `rawSha256`/`source`/`parserVersion`
  (on top of the id/parse-state/artifactId checks), for both the read-only View-match and deliberate bind.
  Grant keeps BOTH responses' id + parse-state (no longer discarded) and a single `itemResolved` predicate —
  used for readiness AND disclosure — requires both response ids = requested id, parsed/available, material
  artifactId + raw-sha/source/parser agree with the binding, and the binding's parsed digest equals the
  finding's stored digest. No invented client canonical hash; a mismatch stays unavailable with existing copy.

Local checks (R5): `vitest src/components src/i18n` → 69 files, **1482 passed** (added a synchronous
retired-session exposure-mask regression driven by a mutable mocked workspace session); `tsc --noEmit` →
exit 0; `eslint` (changed files) → clean. Localization unchanged from the accepted R3 baseline.

## R6 correction (ui-r5-independent-review.json — one author exposure omission)

- **UIR5-01 (author live-session render/readiness/admission gate).** `CitationFindingAuthor` now derives
  `sessionLive = sessionCurrent()` at render (the component already subscribes to the live workspace session)
  and (1) MASKS the entire private surface — draft, cited-native list, loaded `ReportView` material/preview
  and the findings binding note — behind a loading placeholder while the session is retired; (2) folds
  `sessionLive` into `nativeReady` so Review is not admitted under a retired session; (3) re-checks
  `sessionCurrent()` in `review()` before dispatch; and (4) guards the shared `upd` edit choke point so no
  retained field handler can mutate a retired draft. The draft/material data survive in state for their
  authorized lifetime — only exposure/admission is gated — so ordinary current-session create/edit/View/
  Review/Save and all refs/pins are unchanged. The existing `save`/`startEdit`/`citeNative`/`startNew`
  mounted+session pre/post guards are retained; accepted reviewer/grant/coherence (R4/R5) untouched.

Local checks (R6): `vitest CitationFindingAuthor CitationReviewPanel citation-review-ui.test` → **73 passed**
(added a synchronous retired-session author exposure-mask regression via a mutable mocked workspace session);
`tsc --noEmit` → exit 0; `eslint` (author component + test) → clean. No i18n/reviewer/route/store changes.

## Remaining / next stage (not done here)

- Real-component synthetic browser fixture (adapt `scripts/native-google-intake-browser/*`): native-only
  + mixed create/edit/review, full-set binding, explicit grant scope, legacy denied vs new consented,
  row/unknown handling, revoke/expiry/project/session/same-actor races, duplicate/pending saves, delete
  invalidation, EN/PL/SV/DA desktop+390px and native keyboard/44px measurement. Root assigns next.
- The author review-stage summary (`FindingRecordView`) does not list cited natives (the edit stage
  does); add if the browser review wants it.
- PL/SV/DA copy is machine-authored against the English source; fluent human acceptance pending.
