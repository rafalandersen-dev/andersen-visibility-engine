# CG-03B — coverage of approved measurement panels (30 October 2026)

**Context**

- **Author and base:** Claude, the same implementation author, using the existing Claude Desktop subscription. Base `3734e2f5` (CG-03A merged, exact-main CI accepted), branch `codex/milo-panel-coverage-20261030`. Branch and head were verified before authoring.
- **State:** working tree only. Nothing has been committed, pushed, merged or published. Codex owns review, browser acceptance and release; CG-03B merge and publication follow CG-03A's live acceptance.
- **Scope:** read-only presentation of reports the server already computes. It is not a capture form, a collector, or CG-03 / whole-plan completion.
- **Unchanged:** server functions, protocol algorithms and schemas, SQL, providers, CG-03A answer comparison, CG-02A navigation, permissions, accounts, budgets, publication contracts and the protected 168h observer. The USD50/month global AI ceiling and the manual Free grant are unchanged. No dependency was added.

**Correction to my earlier assessment.** `readCitationProtocolFn` returns raw protocol state without reports. The reports come from the existing authenticated `readResolvedCapturesFn` (one snapshot: panels, brand runs, captures, erased slots, reports, `erasureOverflow`). This package uses that read.

## Behaviour (`src/components/CitationPanelProtocolPanel.tsx`)

1. **Separate read.** A "Coverage of approved panels" area sits under the existing authoring list. It reads `readResolvedCapturesFn` under its own query identity, `["citation-coverage", owner, project]`, never the `citation-protocol` cache, because the response shape differs.
   - **Refresh:** the existing save-draft and lock success path now invalidates both reads.
   - **What it adds:** one extra read per panel load and refresh. It makes no provider, collection or write call.
2. **Every locked, approved version.**
   - **Join:** `panelCoverageEntries` (`src/lib/citation-panel-ui.ts`) joins each locked, approved version to its report by canonical panel id and version, from the same resolved result.
   - **Older versions:** older locked versions stay visible behind a newer draft head, while the authoring list still shows heads.
   - **Missing report:** a missing report reads "unknown"; it is never shown as an empty success.
   - **Order:** panels by newest locked version, then versions newest first.
3. **Discovery.**
   - **Planned:** planned observations are shown as questions × rounds.
   - **Observed:** "planned observations with saved evidence: x of planned", with the explanation beside it. It counts distinct question-round slots with any record, including failed, cut-off or off-protocol records, and is not successful answers or citations.
   - **Deleted and not recorded yet:** "deleted" and "not recorded yet (deleted ones not included)" are their own lines. The second is `neverObserved`: planned observations never recorded, which excludes recorded-then-deleted ones (wording corrected in R1).
   - **Unknown absence:** `neverObserved: null` reads "unknown" with a cause-neutral note (history could not be matched or was not fully available). That note also says recorded and deleted counts may be lower bounds. No subtraction is done.
4. **Record details** (native `<details>`).
   - **Outcomes:** complete, failed, cut off, marked missed and off-protocol. The note says they need not add up to the planned observations.
   - **Other records:** extra saved records, extra deleted records ("not extra coverage, not necessarily retries") and records not matching a planned observation.
5. **Brand panels.**
   - **Runs:** shown as approved runs, each with its approval date, allowance, used, saved now and deleted, plus "observations, not money" and "used stays counted after deletion".
   - **No grid:** there is no planned grid and no 0/0.
   - **Consumption:** the server's `consumed` value is shown verbatim and never reconstructed.
6. **Unattributed history.** `erasureOverflow` is a separate global note; it is not assigned to any panel.
7. **States.** Loading, error, empty and missing-report states are distinct.
   - **Error first:** an error is checked before data, so a failed refresh with cached data shows the error and no numbers.
   - **Scope switch:** a project or actor switch uses a different query key under the route's existing owner+project remount, so the other scope's numbers never flash.
8. **No new actions.** The area adds no capture, import, collect or other write control. Existing authoring, validation, lock review and mutations are unchanged apart from the extra invalidation.

## Internationalisation

**New namespace.** `panelCoverage.*` (30 keys) in `src/i18n/panel-coverage.ts`, with English, Polish, Swedish and Danish text, registered in the central catalog. Kind, version and approval labels reuse `citationAuthoring.*`. The Polish, Swedish and Danish copy is author-written; no fluent-speaker acceptance is claimed.

**Staged locales.** Same approved pattern:

- `src/i18n/staged/panel-coverage-fallback.ts` and its test resolve exactly these keys to the English source, as declared fallback pending translation.
- One `panel coverage` batch was added to each of the 20 aggregators, with fingerprint `a536a3fb…f435` (recomputed in R1); German records it in `de-source.ts`.
- The staged total moved from 4735 to 4765 in the 15 locale tests and `billing-screen-fallback.test.ts`.
- The five unchanged-English suites (ga, lt, lv, mt, ro) each gained an exact 30-key partition.
- No locale was activated.

## Fixture

`scripts/panel-coverage-browser/` (see its README) mounts the actual panel over explicit synthetic datasets.

- **Datasets:** discovery v1 (complete history) and v2 (unknown completeness) behind a lockable draft v3; a brand run with used 2 / saved 0 / deleted 1; four unattributed deletions; a second project.
- **Variants:** `ready`, `loading`, `empty` and `error`, with a `check=1` scripted report.
- **Lock proof:** the script locks the draft through the real lock review, which is the only, audited, synthetic write. It then requires a coverage re-read showing v4, v2, v1 and the brand version.
- **Failed refresh:** the script also forces a failed refresh with cached numbers.
- **Project switch:** it switches project and checks no rows flash from the other scope.
- **Boundaries:** a strict network guard and CSP; Supabase, `.server` and the real function modules are refused or absent from the bundle.

I did not run it in any browser; Codex's CUA run owns that.

## Validation (this checkout, 30 October 2026)

| Check                                                                                                                                                                                                                                                                                                      | Result                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `npx --no-install vitest run` on `CitationPanelProtocolPanel` (new), `CitationFindingAuthor`, `citation-panel-ui`, `citation-protocol`, `citation-protocol.functions`, `citation-panel`, `panel-coverage` (new), `catalogs`, `parity`, `language-claims`, `device-preference` and all of `src/i18n/staged` | exit 0 — 36 files, 1190 tests                                                                                                          |
| `npx --no-install tsc --noEmit`                                                                                                                                                                                                                                                                            | exit 0                                                                                                                                 |
| `npx --no-install eslint` on the changed/new `src` files, and on `scripts/panel-coverage-browser`                                                                                                                                                                                                          | exit 0 / exit 0                                                                                                                        |
| `npx --no-install prettier --check` on all 54 changed/new files                                                                                                                                                                                                                                            | exit 0, after `--write`. On the staged aggregators this only re-flowed my inserted import onto one line                                |
| `node scripts/panel-coverage-browser/build.cjs`                                                                                                                                                                                                                                                            | exit 0, to the `os.tmpdir()` fallback. The real store and server-function modules were confirmed absent and the synthetic ones present |
| Protocol/server/schema files vs the independent review's baseline hashes                                                                                                                                                                                                                                   | unchanged                                                                                                                              |

The full suite was not run; that is left to normal CI.

**Tests added:**

- **Helper (4):**
  - an older locked version behind a draft head;
  - the semantic-id join, with a missing report kept null;
  - brand-run join with verbatim consumption and an unknown run;
  - ordering.
- **View and wiring (9):**
  - discovery separate facts, with outcomes ≠ observed, no percentages and no money;
  - unknown completeness;
  - brand without a grid or 0/0;
  - an older version with a draft, plus global overflow;
  - missing report;
  - empty, loading and error states;
  - the resolved read under its own key;
  - a failed refresh with cached data showing the error and no numbers;
  - another project showing loading, and no write calls.
- **Catalog (16 cases).**

Expected numbers are written out in the tests and fixture, not derived by the code under test.

## R1 correction (Codex stage-1 review and browser run)

Stage 1's data, query and protocol behaviour was accepted, and root's CUA run passed 8 ready cases (64 groups, four languages, desktop and 390×844). Only these changed, with no change to report numbers, algorithms, queries or the 30-key set:

1. **"Not recorded yet" wording (P2).** `panelCoverage.neverObserved` said "planned observations with no saved evidence". That also describes deleted observations, but the count excludes them. With planned 40, observed 0 and deleted 1, all 40 lack live evidence but only 39 were never recorded.
   - **New wording:** in English, Polish, Swedish and Danish it now reads "not recorded yet (deleted ones not included)". The unknown label uses the same wording, and null stays "unknown".
   - **Fingerprint:** the English fallback fingerprint and the German record were recomputed. Staged scope and totals are unchanged; no locale was activated.
2. **44px summary (P2).** Each new **Record details** summary was 20px tall at 390px. The `<summary>` now carries `min-h-11 py-3` (the padding moved from the `<details>` box onto the summary), so the whole summary row is at least 44px.
   - **Kept:** the native marker, the Enter/Space toggle, the browser's own focus ring and text wrapping.
   - **Unchanged:** existing authoring controls.

**R1 regressions:**

- **Panel:** the 40/0/1/39 report renders 0 of 40 with evidence, 1 deleted and 39 not recorded yet, never 40.
- **Panel:** the summary carries `min-h-11` and `py-3`.
- **Catalog, every locale:** the count and unknown labels share one wording that differs from the deleted line.
- **Catalog, English:** says "not recorded yet" and excludes deleted ones.

**R1 checks (no browser):**

- `tsc` exit 0; `eslint` and `prettier --check` on the six changed files exit 0.
- `vitest run` on `CitationPanelProtocolPanel`, `CitationFindingAuthor`, `citation-panel-ui`, `panel-coverage`, `catalogs`, `parity`, `language-claims` and all of `src/i18n/staged`: exit 0, 32 files and 1064 tests.
- Fixture rebuild exit 0, to the `os.tmpdir()` fallback.
- Compared with `cg03b-source-freeze-stage1.json`, only the component, its test, the copy, its test, the staged fallback and `de-source.ts` changed, plus this note.
- The actual 44px height, keyboard use and the four rendered languages are for root's CUA re-measurement.

## Limits and not done

- **What it shows:** values the server returns for the signed-in owner's project. Nothing here states that production panels are empty or non-empty; real counts need a scoped live read.
- **Manual capture:** there is still no capture form. It is a later write-path package needing security review.
- **Still separate dependencies:** genuine native exports, retained citation artifacts, retry identity/storage, actual-vs-estimated cost semantics and allowed automatic collection.
- **Static tests:** cannot click, so refresh after lock, keyboard use and the 390px layout rest on the fixture and Codex's browser run.
- **Fonts:** fixture fonts are system fallbacks.
- **Pending:** language review by fluent speakers, human usability review, browser acceptance, review, PR, CI and release.
