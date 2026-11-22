# Native findings review/authoring — local synthetic browser fixture

Loopback-only fixture that mounts the **actual** citation finding author/review surfaces — plus the
**actual** native intake panel — over synthetic store/auth and synthetic server functions:

- **Owner workspace** (`surface=workspace`, matching the route): `NativeGoogleIntakePanel` +
  `CitationFindingAuthor` + `CitationReviewPanel` under **one** QueryClient and the production-equivalent
  session/project boundary, so an import/delete through the real intake controls is observable by the
  author/grant freshness.
- Isolated surfaces for focused checks: `owner-author`, `owner-review`, `reviewer`, `report` (the native
  `ReportView` on the seeded Google interpretation).

No `.env`, no app server, no network — the in-page guard refuses every request, and Supabase/`.server.ts`
imports are refused at build time.

```
node scripts/native-findings-browser/build.cjs
# open the printed output dir's index.html (default /tmp/milo-native-findings-browser-20261114)
#   index.html?locale=en|pl|sv|da&surface=workspace|owner-author|owner-review|reviewer|report
#   index.html?locale=en&driver=1     → identity gate → self-checks → per-cell journeys (current viewport)
#                                       → EN races → #results + window.__nativeFindingsDriver
#                                       (identity mismatch / failed self-check / incomplete retirement HALTS)
# Root (per cell, after resizing the REAL browser to EXACTLY width x height CSS px, e.g. 1440x906 / 390x<fixed>):
#   window.__nativeFindings.driver.runCell({ locale, width, height })   // refuses unless innerWidth/Height match exactly
#   window.__nativeFindings.driver.runRaces({ locale, width, height })  // groups 10-11
#   CACHE: load from a fresh port / hard reload; bind the loaded bundle to build-info.json identity.

node scripts/native-findings-browser/smoke.cjs   # local contract/transport smoke (Node, no browser)
```

The bundle/boundary pipeline, store machinery and network guard are **reused** from
`scripts/native-google-intake-browser` (`buildFixture`, `createWorkspaceStore`, `network-guard.js`), not
copied; the old intake CLI/API is unchanged.

## Honesty boundaries (enforced, not decorative)

- **Every modeled response is schema-validated at dispatch** against the actual client-safe contracts: the
  raw-artifact staging summary (`status: pending_parser`, full 10-key owner-declared metadata) is kept
  **distinct** from the parsed interpretation and from the binding read; findings, reviewer projections,
  receipts, grants, parse states and bindings all `.parse()` before returning. A seed that drifts fails loudly
  (`setupCase` throws; `inspect.seedErrors()` is surfaced). No raw envelope bypasses validation.
- **The whole-native-set consent digest uses the REAL client helper** (`nativeConsentSetDigest` from
  `citation-review-ui`) over the **complete** scoped cited set. The per-artifact `parsedSha256` is an opaque
  deterministic TEST input; the full-set composition is the real one, so an empty/legacy/unbound/missing or
  changed member — or a wrong hash — is refused exactly as the server would. These sha256-**shaped** values
  are **not** the Postgres `jsonb` canonical digest and are never claimed to be. SQL authority is proven
  elsewhere; this fixture is **UI evidence only**.
- **Native-consent gate + immutable-binding resolution (R2).** A native-bearing finding (incl bare/legacy)
  requires **current full-set native consent** before the reviewer read/list/notes/save are admitted — an
  ordinary assignment alone never exposes the record/hash/notes/material (SQL `citation_review_native_gate_ok`
  / `read_ai_citation_finding_for_review_v2`). Each stored `nativeBinding` must RESOLVE live (raw/source/
  parser/parsed digest); a reparsed/replaced/**deleted** member makes the set digest NULL, so the owner
  cannot re-grant changed material to the old immutable finding and the reviewer read is **refused** (not
  masked). A legacy 4-arg grant CLEARS native consent exactly as the frozen SQL does.
- **No blanket owner.** `isOwner` is the actor's own role. Every modeled read/write/ledger is scoped to the
  captured actor + **exact** owner/project/row/receipt, with `expectedOwnerId` mandatory; a foreign scope or
  an owner-only endpoint under a reviewer session is recorded in `inspect.violations()` and refused. The
  reviewer never reaches an owner/native-owner endpoint.
- **Deferral is a timing boundary around the SAME validated scoped handler, bound to the request actor.**
  `commit` mode (default) runs the real handler synchronously at arm time (authorization, violation logging
  and the mutation all commit) and delivers the captured outcome on release; `hold` mode runs the handler at
  release UNDER THE CAPTURED REQUEST ACTOR (a later actor switch cannot authorize a held reviewer call). An
  async mutation (grant/stage/persist) checks the captured generation after its awaits, so a retired case is
  never mutated; a retired generation is disposed, never delivered.
- **Save is a real, owner/project-scoped version chain + idempotency ledger.** Immutable rows have stable
  deterministic ids; an exact lost-ack retry (same frozen payload + expected head) returns the same
  row/version with no second write; a changed payload or wrong expected head conflicts; editing advances the
  head while the old immutable row still reads its prior version.
- **Real-control driver (no stubs), not acceptance.** The driver drives the ACTUAL author / owner-review /
  reviewer / intake controls through real React/DOM event paths, asserting a visible outcome AND the
  transport/payload/stored effect. A missing, disabled or renamed control is a FAILURE, never a silent skip or
  hand-set pass. It is executed by the ROOT in a real browser; nothing here claims SQL/live-authorization,
  native-keyboard or human-language acceptance. Native keyboard (group 13) stays a **separate manual
  checklist** on `window.__nativeFindingsDriver.nativeKeyboardChecklist`; only target-size/overflow is measured.

## Stage status (R4B) — scripted coverage of all 14 groups (NOT browser acceptance)

R4A closed the shared verdict/teardown/identity/dimension findings and groups 1-5 (root-observed in a real EN
1440x906 run). R4B completes the scripted part of groups 6-11 and the required target/overflow states. Nothing
below is accepted until the ROOT runs it in the real browser (8 cells, races, native keyboard).

| Group | Status | What the driver asserts |
|---|---|---|
| 1 native-only create | complete (R4A, root-observed) | workspace; cite 2 reports (one paired binding+parsed read each); every row/cell/status via the actual `rawCellText`; long URL + note; frozen payload = stored v1, exact bindings, ledger 1, no grant; reopen the saved head, Review blocked until each View |
| 2 mixed edit + limit 20 | complete (R4A, root-observed) | untouched answer/binding byte-identical; deliberate add/remove/reselect; 21st item refused at Review, the original 20 saved |
| 3 legacy upgrade | complete (R4A, root-observed) | bare ref unbound, ordinary edit keeps it; explicit Bind → NEW bound version, old versions unchanged |
| 4 intake freshness | complete (R4A, root-observed) | real import becomes selectable; failed/pending shared list read blocks author + grant; real inline delete → stale ref visible; zero grants |
| 5 double submit / lost ack / conflict | complete (R4A) + **Continue now a required 44px target** | 1 write; 2 identical requests, one row; genuine competing head → explicit Continue → Save v3 |
| 6 consent/revoke | **complete** | seed: a second real-parsed Google report (long URL + note) + a finding citing both (two SAME-SOURCE members), editors may approve. Whole set disclosed (both resolved, source·property·period distinct, full ReportView each); consent starts unchecked; real grant = ONE request `{project,row,reviewer,nativeSetSha256}` equal to the full-set digest of the finding's bindings; stored assignment + native consent; Copy writes the exact scoped link to the LOCAL clipboard recorder (zero network); reviewer change resets success/link/copied/checkbox; a HELD old grant released after a selection change cannot restore success; revoke (email-only option) → exact payload, access + consent inactive; bare, unbound, deleted (external), pending (held) and failed (forced) members each block all-set consent; recovery is unchecked; legacy grant on a non-native finding stores NO native consent; same-actor epoch change clears the checked consent |
| 7 reviewer fresh read | **complete** | first authorized read held before mount: no record/native/note/hash/decision/receipt; full ReportView every row/cell/status (long report); exact stored record + whole-set inspectable claim; submit payload `{target, expectedSha = served hash, decision, note}`; stored receipt pins version/hash/inspectionComplete under the current full-set consent; bare and unbound native links are refused and never shown as inspectable |
| 8 unknown/partial | **complete** | seed: real-parsed all-unknown Google chart, Google pages with a withheld query row, Bing overview with a date gap, one finding binding all three. Every row incl the last equals the parsed record (real `rawCellText`/status); unknown never numeric; withheld count/partial; gap warning, unknown timezone, unsegmented market; source-specific metrics; whole-set inspectable shown while each source's incompleteness stays visible |
| 9 loss of access | **complete** | prior own receipt via the real control; then distinct branches on the same client: revoked (refused submit → immediate sticky hide, own withdrawal completes for the exact receipt id, history kept as withdrawn), fresh revoked remount (no receipt discoverable, no withdrawal), expired / policy denied / finding deleted (each refuses the submit, no receipt), schema-valid MASKED projection (withheld, not inspectable, Submit refused), failed read, failed submit transport — each hides all private material |
| 10 retirement races (`runRaces`) | **complete** | seven cases, each ONE held real chain on one tree/client with a distinct trigger, a `marks` transport snapshot at the boundary, then release: cite reads ↔ draft change; save ↔ sign-out (+ positive `onSavedCount` control); conflict follow-up read ↔ same-actor epoch; client consent DIGEST (harness-held real WebCrypto result) ↔ session epoch change (+ uninterrupted positive Grant first); grant ↔ project switch; review submit ↔ actor replacement; withdrawal ↔ hydration loss. Each asserts no dependent call/refetch/onSaved/patch/private flash/grant success after the boundary |
| 11 same-client remount (`runRaces`) | **complete** | reviewer: unsubmitted decision + note, reopen with a held fresh read (no flash of material/record/decision/note), success starts clean, fresh FAILURE after a cached success hides everything, later reopen needs its own read; owner: accepted consent, reopen → held member read shows nothing, recovery unchecked, failed member read blocks consent |
| 12-14 | as before | locale render; target/overflow; boundary refusal |

Required 44px targets / overflow are measured in their exercised states in every cell: author create/bind
(long report), edit picker, mixed edit, legacy edit/bind, intake import preview and inline delete confirmation,
conflict (Save/Back/**Continue**), grant/consent/copy (long same-source members), revoke, reviewer
decision/note/submit (long report), withdraw.

## Shared verdict, teardown and identity (BDR3-03/04/05)

- **Fail-closed retirement (entry `retire()`).** Proves the Sentinel cleanup committed, cancels+clears the
  client, calls the REQUIRED foundation `control.retireCase()`, then waits (bounded) for the ACTUAL
  `inspect.inFlight()` drain. A missing API, uncommitted cleanup, thrown error or undrained work becomes
  `retireError` and is STICKY: every later `case()` returns `{ ok:false, refused:true }` WITHOUT any
  reset/remount until a reload, so the unresolved evidence (traces/DB/auth) is never erased. An
  already-retired tree still reports current unsettled work.
- **Case verdict (driver `runCase`).** After the body: unreleased holds fail the case (holds must be released
  explicitly); then `retire()`; then an UNCONDITIONAL snapshot (calls, counts, violations, network, inFlight,
  generation, actor) even if retirement threw. All invariant misses are collected into the phase: committed
  unmount, required APIs, zero inFlight, no late calls after the boundary (no exemption by expected-refusal
  name), zero network, exact expected-refusal counts, no unexpected violations, no reviewer-phase owner reads.
  Startup waits use an actual drain observation (`inFlight ⊆ held`), never a fixed sleep.
- **Halt.** `runCell`/`runRaces` stop after a case whose retirement is incomplete (`halted`, `notRun`), so its
  proof is not reset by the next case.
- **Preflight before ANY case.** Matching executed identity, `control.retireCase()` + `inspect.inFlight()`, the
  entry API, and the EXACT requested `innerWidth` AND `innerHeight` (no tolerance). Every cell, race and case
  record carries `innerWidth`/`innerHeight` and the identity (incl. `buildInfo` hashes); every target record
  carries them too.
- **Executed-bundle identity.** The shared `buildFixture` now emits in memory (`write:false`), hashes the ACTUAL
  emitted bundle content (marker excluded) + guard + title into `sourceId`, prepends
  `window.__miloFixtureBundleId=<sourceId>` as the bundle's first line, and the HTML echoes it as
  `window.__miloFixtureExpectedBundleId` plus `window.__miloFixtureBuildInfo` (bundle/content/CSS/guard
  hashes). `build-info.json` keeps `bundleContentSha256`, the separate final `bundleSha256`, styles/guard/HTML
  hashes. A product-only edit changes the marker; the id also depends on the build's path layout (esbuild path
  comments), so compare HTML and bundle from the SAME build output. The old intake CLI/API is unchanged
  (it gets the same identity scheme).
- **Self-checks (halt the autorun if not all OK).** Owner read in a reviewer phase, an unexpected violation, a
  forbidden call during STARTUP (pre-mount `seed`), and fresh HTML + old/absent executed bundle id (runCell must
  refuse before any case, no setup, no record) — each must fail for its intended reason with a complete drain.

## Selectors (reconciled to the actual UI)

- **ReportView by actual structure, no product hook**: `div.space-y-2.text-sm` whose first `p.font-medium` is
  the localized native label and which has a `<ul>` of rows; raw-audit JSON excluded.
- **Author lookups are scoped to the author `section`** (its `header > h3`), so intake/review panels in the
  workspace can never satisfy them; the edit picker is the author's `label > span` "Edit existing" select and
  its option values are row ids; controls are activated only once ENABLED.
- **House Select**: exact trigger `aria-label`, exact option text inside the ACTIVE popup only, then wait for
  the popup to close and the trigger to show the selection. Grant options read `email · role`; revoke options
  read the email only (or `· departed`).
- **Intake delete**: inline `div[role=alert]` of the EXACT artifact article (no dialog, no fallback).

## Control / inspect API — `window.__nativeFindings`

```js
await __nativeFindings.case({ locale, actor, project, surface, findingRowId, deferBeforeMount, seed })
//   → { ok:true, generation } | { ok:false, refused:true, reason }  (refused = no reset/remount happened)
//   seed(fixture) runs after setupCase, before mount: valid starting data only, never a tested action
await __nativeFindings.retire()   // → { committed, drained, inFlight, retireError, retireCaseApi, inFlightApi, generation }
__nativeFindings.surface(name, rowId)   __nativeFindings.remount()              // within-case (same client)
__nativeFindings.teardownCounts         // { mountCount, unmountCount } — committed-unmount evidence
__nativeFindings.onSavedCount           // author onSaved callbacks this case (harness counter, no product hook)
await __nativeFindings.driver.selfCheck()                          // negative self-checks (must fail bad cases)
await __nativeFindings.driver.runCell({ locale, width, height })   // ONE externally-resized cell (exact size)
await __nativeFindings.driver.runRaces({ locale, width, height, names? })  // groups 10-11; names = subset
__nativeFindings.driver.races           // race case names (pick the critical 390px repetitions from these)
window.__nativeFindingsProduct.seedArtifact(fx, {...})   // REAL-parser seed helper used by case seeds
// navigator.clipboard.writeText is replaced by a LOCAL recorder (inspect.clipboard()); nothing leaves the page

control.setActor("owner"|"reviewer"|"none")  signOut() reHydrateSameActor() pauseWorkspace() resumeWorkspace()
control.bumpEpoch()  switchProject(id?)
control.defer(fn, "commit"|"hold")  undefer(fn)  failNext(fn, code?)  release(fn|id, "ok"|"fail"|code)
control.setFlag("readsFail"|"saveConflict"|"lostAck"|"reviewRevoked"|"reviewExpired"|"policyDenied"|
                "findingDeleted"|"evidenceErased"|"sourceRevoked"|"mask"|"failStage"|"failPersist", true)
control.grant(rowId)  grantNative(rowId)  revoke(rowId)  reparseArtifact(id)   // changed-member case
await control.expectedNativeSetDigest(rowId)   control.nativeSetItems(rowId)
control.rows  control.ids  control.artifacts

inspect.calls()/callsOf(name)/violations()/clipboard()/pending()/network()/seedErrors()/ledgerSize()/
inspect.findings()/artifacts()/headVersion(findingId)
```

## Case reset (BF03)

`__nativeFindings.case(...)` refuses outright after any failed retirement; otherwise it retires the old
tree/client FIRST — renders a retired placeholder (unmounts the old `QueryClientProvider` subtree), cancels +
clears the old client, foundation `retireCase()` + actual drain — and only if that is complete does `setupCase`
dispose pending
deferrals and scheduled timers and resets calls/violations/clipboard/ledger/failures/deferrals/flags/session
— then clears the network trace and mounts a brand-new client/tree. A reviewer case is hydrated **as** the
reviewer (auth actor == workspace `userId`). Within-case session/project/permission races keep the **same**
client/tree so the product's own guards are exercised.

## Seeded cases (bounded, within the 14 groups)

Owner project `p` seeds: a locked brand panel (scope), one complete answer, one active source + accepted
record, and six finding rows — **bound-native**, **legacy bare-native**, **mixed** (answer + bound native),
**multi-native** (two bound), **source** (answer + source), and **unbindable-native** (cites a parsed-but-
unbindable artifact). Four artifacts back them: Google (parsed+bound), Bing overview (parsed+bound), an
**unparsed** artifact, and a **parsed-but-unbindable** artifact (null binding). The independent reviewer is
granted (with matching full-set native consent) on the bound-native row by default.

Driver seeds (via `case({ seed })`, valid starting data only): group 1 gives the Google report a long declared
property URL + long limitation note (overflow example); group 2b adds 16 unparsed artifacts (20 = project cap) and
a mixed finding at exactly 20 evidence items. Group 5 inserts one external competing head (another session's
commit) after Review — an allowed external change, not a tested action. R4B: group 6 adds a second REAL-parsed
Google report (long URL + note) + a same-source finding and sets `editors_can_approve`; group 7 adds long report
+ ordinary (consent-less) assignments on the bare and unbound findings; group 8 adds three REAL-parsed variants
(all-unknown, withheld pages, Bing gap) + one finding under full-set consent; group 9 the long report. Group 6
deletes one artifact and groups 9/10 flip authority flags/assignments mid-case as external changes only.

## Local commands run (driver stage R4B)

- Product delta (authorized, one button): `CitationFindingAuthor.tsx` conflict Continue gets `className="min-h-11"`;
  the existing focused test now asserts it — `vitest run src/components/CitationFindingAuthor.test.ts
  --configLoader runner` → 25/25 (the default loader cannot write its temp file through the sandbox).
- `eslint` (driver, build, the product file + test) clean after `prettier --write`; both build CLIs succeed
  (temp output); old intake build identity unchanged.
- Scratch seed probe: the EXACT R4B seed code (driver seeds + entry `seedArtifact`, extracted verbatim) run
  against the real `fixture.js` transports in Node — 13/13: every seeded artifact/finding passes the actual read
  schemas, the same-source set digest resolves, the variant finding is admitted with all three materials
  (all-unknown statuses, 1 withheld page, Bing gap rows), bare/unbound links are refused, zero violations.
- Reviewer's independent boundary probes (paths redirected, logic byte-identical): unchanged from R4A — 8/9 + 1/1;
  the 9th is the already-adjudicated stale-identity setup; the own matching-identity stop probe passes 3/3.
- No browser, DOM, server or network run: groups 6-11 journeys are NOT executed yet.

## Local commands run (driver stage R4A)

- `eslint` on `driver.js`, `build.cjs` (both) — clean after `prettier --write` (entry.jsx is outside the eslint
  config, as before).
- Both build CLIs (output redirected to a temp dir) — succeed; actual-source inclusion incl.
  `native-google-intake-ui.ts`; no backend inputs.
- Scratch identity check (temp copies only): first line marker = build-info `sourceId` = HTML expected id;
  marker = hash of content without the marker; deterministic rebuild; a one-string PRODUCT-only edit changes
  the marker with identical fixture files.
- The reviewer's independent R3 boundary probes, path constants redirected to a temp snapshot (logic
  byte-identical): 8/9 driver probes + 1/1 entry probe pass. The 9th (`unsettled_case_stops_following_reset`)
  runs while the previous probe's deliberate identity MISMATCH is still set, so the identity gate correctly
  refuses before any case (0 setups vs the oracle's expected 1). An own scratch probe with a MATCHING identity
  shows the intended property: the unsettled case halts the cell and the next case is never set up; ±1px and a
  missing height are refused before any case.
- No browser, server, network or DOM run by this author: the journeys above are NOT executed yet. `smoke.cjs`
  belongs to the foundation author and was not re-run here (no fixture change in this stage).

## Known limits / reconcile points for the root stage

- **Conflict Continue target (fixed in R4B):** root measured it 312x32; it now carries `min-h-11` and is a
  REQUIRED target of `author-conflict-continue`.
- **Consent-digest race (R4C):** `group10_consentDigest_sessionEpoch` first runs an uninterrupted positive
  Grant, then arms a test-local ONE-SHOT hold on the real `crypto.subtle.digest` call whose input is the
  product's consent-set string (`native_review_set_v1…`); every other digest passes through. The original
  method computes the actual result; only delivery waits. The case observes the digest entered/held with zero
  grant requests, marks the boundary, retires the session with `control.reHydrateSameActor()` (a real
  same-actor epoch change the store notifies; a bare `bumpEpoch()` changes no observed state, so it is no DOM
  mask oracle), waits for the observed mask, then releases the REAL result
  (asserted equal to the expected full-set digest) and asserts zero later calls, no success and no re-exposure.
  `finally` restores WebCrypto and settles any open hold; an open hold also fails the case verdict. The hold
  patches the browser API object only — no product or foundation code is touched.
- **R4B owner-row selector (R4C fix):** row buttons are scoped to the owner list's `ul > li > button`; the
  opened detail's Select triggers (also `aria-expanded`) previously broke the row count and blocked group 6's
  later member/legacy/session branches. Those branches have NOT been executed yet — root run pending.
- **Native keyboard checklist (R4C):** the intake delete confirm is an inline alert without an Escape handler;
  the check is Tab/Shift+Tab to its Cancel/Delete and Enter/Space. Escape-close + focus return is checked on
  the house Select popups only.
- **Actor replacement:** `group10_reviewSubmit_actorReplacement` replaces the reviewer by the OWNER (the only
  other actor `setActor` offers); the new owner mount's own reviewer-endpoint read is refused and recorded once
  (`ctx.expect`, exact count) — it is the replacement's fresh read, not old work.
- Group 9 B-D (expired / policy denied / finding deleted) are distinct fixture/server branches that share ONE UI
  path (a refused submit → sticky denial); they are not distinct UI code paths.

- **Probe-13 parity delta.** The frozen oracle's `13_multi_one_deleted_projection` asserts a *masked success*
  for a deleted cited native. The R2 contract REFUSES that read (`read_ai_citation_finding_for_review_v2`
  :703-704 raises when the native gate fails — a NULL set digest). This fixture now **refuses** it (smoke
  check 13 asserts the refusal); the receipt explicitly flagged the masked-success as non-parity. Re-running
  the *unchanged* oracle will therefore show probe 13 as "failed" — that is the mandated correction, not a
  regression.
- `control.expectedNativeSetDigest` composes via the real helper over the finding's STORED bindings and
  returns NULL unless each resolves live; the per-artifact `parsedSha256` is opaque synthetic test data, not
  the SQL canonical per-artifact digest.
- The driver is executed by the ROOT in a real browser (resize per cell → `runCell`); its selectors come from
  the accepted product at d6ec1a06 (unchanged). Owner-author prerequisite shapes (panel via `citation-panel-fixture`, answer/knowledge) are
  frozen-contract valid; re-check them if a field moves.
- **Cache:** the root must load from a fresh port / hard-reload and bind the loaded bundle to
  `build-info.json` identity (an old cached `bundle.js` served at the same URL was observed).
- The browser/native-keyboard/390px matrix and the private export are the root stage's gates, run against the
  root's frozen product + fixture + driver candidate.
