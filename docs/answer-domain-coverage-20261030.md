# CG-03A — domain coverage from saved answer evidence (30 October 2026)

**Context**

- **Author and base:** Claude, the same implementation author, using the existing Claude Desktop subscription. Base `df7a891b` (CG-02A merged), branch `codex/milo-answer-domain-coverage-20261030`. The 12 baseline hashes were verified before authoring.
- **State:** working tree only. Nothing has been committed, pushed, merged or published. CG-03A waits for CG-02A's live acceptance; Codex owns review, browser acceptance and release.
- **Scope:** derived coverage and an evidence drill-down from already stored answers. It is not CG-03 monitoring, collection or proof of all AI visibility.
- **Unchanged:** storage, schemas, endpoints, migrations, providers, schedulers, cost, accounts, permissions, the USD50 AI ceiling, manual Free grants and the protected 168h observer. No dependency was added, and no CG-02A source changed.

## Behaviour

All of this is derived on read in `src/lib/answer-evidence.ts` and shown in the existing `AnswerEvidencePanel`.

1. **Domains.**
   - `declaredDomains` takes the answer's immutable prompt snapshot (identical within a cohort) and normalizes each declared URL to a host: lowercase, with one leading `www.` removed, as in `analyzeAnswer`.
   - Rows: the own domain first, then competitors in declared order. Identical competitor hosts collapse.
   - **Overlap rule:**
     - A competitor identical to the own host is not a separate row; the own row is flagged "also listed as a competitor".
     - Two declared hosts where one equals the other or is a subdomain of it, using the same label-boundary test as `analyzeAnswer`, are both counted non-exclusively. Each row names the other and says the results are not independent.
     - There is no registrable-domain or ownership inference.
   - Nothing is sorted by count, and there are no percentages or ranks.
2. **x of n.**
   - **n** (`eligibleAnswerIds`) is the cohort's current answers with status `complete` and `citationsComplete: true`. It is the same for every domain row.
   - **x** (`presentAnswerIds`) is those answers with at least one SUPPLIED citation whose host is in the domain. Each answer counts once, however many matching URLs it has.
   - URLs in the answer text and brand mentions never count.
3. **Quality.**
   - Four mutually exclusive lists add up to the cohort total: counted; complete but citation list incomplete; failed; truncated.
   - A complete answer with an explicitly complete empty list is a measured zero.
   - n=0 reads "unknown (not 0%)", says the group has no complete answer with a complete citation list, and shows no domain numbers.
4. **Cohorts.**
   - The existing boundaries are unchanged: prompt id and revision, market, language, surface, mode, method and model version.
   - A null model version is its own single-answer cohort. The UTC window stays half-open.
   - The cohort key is now derived from the row's snapshot, using the canonical prompt UUID instead of the stored `analysis.cohort` string.
   - `captureContext` is still not interpreted, and nothing claims protocol compliance; that remains `citation-protocol`'s contract.
5. **Corrections.**
   - `supersededAnswerIds` compares every loaded `supersedesId` with row ids through `canonicalUuid`, before the window applies. A correction outside the window, or one with an UPPERCASE or mixed-case reference, still retires its predecessor.
   - The same canonical set drives the panel's "Superseded" badge and the disabled Correct button, which previously compared raw strings.
   - Stored ids and references are shown and exported unchanged.
6. **Drill-down.**
   - Each domain with x>0 gets a "Show answers citing …" button, and each non-empty quality count is a button.
   - Pressing one filters the existing answer-record list to exactly those ids, with full raw answer, citations, completeness, status, prompt revision and source URL. It then moves focus to the records heading.
   - A status line says what is shown and offers **Show all records**.
   - `evidenceFocusIds` recomputes the ids from the current cohorts, so a selection outside the current result selects nothing.
   - Changing a date clears the selection, and the existing actor+project key remounts the panel on a scope switch.
   - Nothing is fetched: no provider call and no request to cited URLs.
7. **Errors.** Read and validation errors still show the existing alert, and loading shows the existing status. Neither renders coverage. An invalid window shows the existing alert.

The cohort summary line keeps the brand-mention count. The own-domain citation count moved from that line to the own-domain row.

## Internationalisation

**New namespace.** `answerCoverage.*` (20 keys) in `src/i18n/answer-coverage.ts`, with English, Polish, Swedish and Danish text, registered in the central catalog. The role labels reuse `answer.own` and `answer.competitor`, and no `answer.*` key changed. The Polish, Swedish and Danish copy is author-written; no fluent-speaker acceptance is claimed.

**Staged locales.** Same approved pattern as CG-01A and CG-02A:

- `src/i18n/staged/answer-coverage-fallback.ts` and its test resolve exactly these keys to the English source, as declared fallback pending translation.
- One `answer coverage` batch was added to each of the 20 aggregators, with fingerprint `cc2e55ca…efa3` (recomputed in R1); German records it in `de-source.ts`.
- The staged total moved from 4715 to 4735 in the 15 locale tests and `billing-screen-fallback.test.ts`.
- The five unchanged-English suites (ga, lt, lv, mt, ro) each gained an exact 20-key partition.
- No locale was activated.

## Fixture

`scripts/answer-coverage-browser/` (see its README) mounts the actual panel and helpers over a deterministic dataset. It has hard-coded expected counts and answer ids, covering both cases that should count and cases that must not. It has `ready`, `empty` and `error` variants, a `check=1` scripted report, fixture-only controls to switch project and actor, a strict network guard and CSP, and build-time refusal of Supabase and `.server` modules.

I did not run it in any browser. Browser acceptance (CUA, desktop, mobile, keyboard, four languages) belongs to Codex.

## Validation (this checkout, 30 October 2026)

| Check                                                                                                                                                                                                                                              | Result                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx --no-install vitest run` on the answer-evidence, its functions and migration suites, `citation-protocol`, `AnswerEvidencePanel`, `answer-coverage`, `catalogs`, `parity`, `language-claims`, `device-preference` and all of `src/i18n/staged` | exit 0 — 34 files, 1131 tests                                                                                                                                                                                    |
| `npx --no-install vitest run` on every other `citation-*`, `log-evidence*` and `native-ai-artifact*` suite and the `Citation*` component suites (all importers of the changed module)                                                              | exit 0 — 32 files, 793 tests                                                                                                                                                                                     |
| `npx --no-install tsc --noEmit`                                                                                                                                                                                                                    | exit 0                                                                                                                                                                                                           |
| `npx --no-install eslint` on the changed and new `src` files, and on `scripts/answer-coverage-browser`                                                                                                                                             | exit 0 / exit 0                                                                                                                                                                                                  |
| `npx --no-install prettier --check` on all changed and new files                                                                                                                                                                                   | exit 0, after `--write` on the new and changed files of mine                                                                                                                                                     |
| `node scripts/answer-coverage-browser/build.cjs`                                                                                                                                                                                                   | exit 0. The real store, auth and functions modules were confirmed absent from the bundle and the synthetic ones present. The sandbox could not write `/tmp/milo-…`, so the build used its `os.tmpdir()` fallback |

The full suite was not run; that is left to normal CI.

**Tests added:**

- **Lib (10):**
  - normalized and collapsed declared rows;
  - x of the same n from supplied citations only, counted once per answer;
  - the four quality lists partition the total;
  - empty eligible set;
  - own/competitor identity and subdomain overlap;
  - per-cohort separation and unknown-model separation;
  - half-open UTC window;
  - canonical supersession with mixed case and a successor outside the window;
  - prompt-id spelling;
  - exact and stale drill-down ids.
- **Panel (7 new, 2 extended):**
  - x/n text, the source line and the quality split;
  - mixed-case superseded badge;
  - exact filtered records with a pressed button and a clear control;
  - excluded-quality drill-down;
  - a stale selection selects nothing;
  - error and loading show no numbers;
  - no server function is called.
- **Catalog (16 cases).**

The case-variant tests use UUIDs with hex letters. I noticed and fixed an early draft that used digit-only UUIDs, where upper-casing changes nothing.

## R1 correction (Codex review of the 55-file stage 1 freeze)

The derived math, the oracle and the protected files were accepted unchanged. Only these changed:

1. **Phone wrapping.** Root's CUA run in Polish at 390×844 measured a page `scrollWidth` of 408px. The "Show answers citing shop.jasny-dom.example.com" button inherits the shared button's `whitespace-nowrap` and fixed height.
   - **Controls fixed:** the domain and quality buttons and **Show all records** now override those classes through the existing class merge: `h-auto min-h-11 sm:min-h-8 max-w-full whitespace-normal [overflow-wrap:anywhere]`. They wrap inside their container, keep the whole host name (no ellipsis) and keep a 44px touch target on phones.
   - **Text fixed:** the overlap and identity notes and the selected-evidence line also wrap.
   - **Unchanged:** the shared `Button` and unrelated forms.
2. **Truthful "no eligible" copy.** A group can have only failed or truncated answers with `citationsComplete: true`, so "no saved answer has a complete citation list" was false.
   - **New wording:** `noEligible` now says the group has no _complete answer_ with a complete citation list. The source line and the counted label name both conditions, in all four languages.
   - **Fingerprint:** the English fallback fingerprint and the German record were recomputed. The 20 keys, the staged scope and the inactive locales are unchanged.
3. **Fixture proof gaps.**
   - **End date:** a truncated-quality selection is made again before the end date changes, and that change alone must clear it and recount.
   - **Actor switch:** the wait requires the visible actor label to change, and waits for the restored actor.
   - **Label:** the window step no longer claims exact half-open boundary coverage. That stays with the unit tests.
   - **Output directory:** the build now probes that its output directory is writable before using it, falling back to `os.tmpdir()`. Root's earlier build left `/tmp/milo-answer-coverage-browser-20261030` unwritable from this sandbox.
   - **Fonts:** fixture fonts are system fallbacks; this limit is now documented.

**New regressions:**

- **Lib:** a group of only failed and truncated answers with complete citation lists has n=0 and keeps its quality split.
- **Panel:** the same data renders the "unknown" explanation, no x/n and the inspectable exclusions.
- **Panel:** a 63-character host label gets the wrapping, auto-height classes and not `whitespace-nowrap`/`h-8`.

**R1 checks:**

- `tsc` exit 0; `eslint` on the changed files and the fixture folder exit 0; `prettier --check` on every R1 file exit 0.
- `vitest run` on `answer-evidence`, `AnswerEvidencePanel`, `answer-coverage`, `catalogs`, `parity`, `language-claims` and all of `src/i18n/staged`: exit 0, 30 files and 1041 tests.
- Fixture build exit 0 (to the `os.tmpdir()` fallback).
- **Not rerun:** the other unchanged import suites, because their inputs did not change in R1.
- **Not run:** the browser; root's CUA run decides the phone result.

## R2 correction (Codex review of R1)

R1 math and copy were accepted and all 12 browser cases passed. Two residuals were closed; compared with `source-freeze-r1.json`, only `build.cjs`, `entry.jsx`, `AnswerEvidencePanel.tsx` and this note changed.

1. **Safe output probe.** `build.cjs` probed writability with a fixed `.write-probe` path opened without exclusive creation, so an existing file or symlink target could be truncated and removed.
   - **New probe:** a unique name (`.write-probe-<pid>-<uuid>`), created with `wx` (exclusive; never follows or truncates an existing file or symlink).
   - **Cleanup:** only a probe this call actually created is removed, in `finally`.
   - **Fallback:** still only on `EACCES`/`EPERM`.
2. **Focus after clearing.** **Show all records** now returns focus to the records heading, through the same handler that opening a drill-down uses. Removing the button no longer drops keyboard focus to the page body.
   - **Fixture:** the clear step now focuses **Show all records** first, as Tab would, activates it, and requires focus on that exact records heading, not `document.body`. Counts and ids are unchanged.

**R2 checks** (no browser):

- **Probe diagnostic** in a scratch directory, each case with a normal build that exited 0:
  - a pre-existing `.write-probe` keeps its content (`keep-existing`);
  - a `.write-probe` symlink stays a symlink and its target keeps its content (`keep-target`);
  - a brand-new directory builds normally;
  - no `write-probe-*` file is left behind.
- **Default build** exit 0, via the `os.tmpdir()` fallback.
- **Static checks:** `tsc` exit 0; `eslint` on the panel and fixture folder exit 0; `prettier --check` on the three changed files exit 0.
- **Panel test:** `vitest run src/components/AnswerEvidencePanel.test.ts` exit 0, 11 tests. Static render cannot observe focus; the fixture assertion and Codex's CUA run cover it.

## Limits and not done

- **What the numbers mean:** coverage only of the answers the owner saved. It is not market share, a ranking, verified citations, a representative sample, protocol-qualified capture counts or a causal result.
- **Overlaps:** overlapping declarations are flagged, not resolved. A citation to a shared subdomain counts for every row it belongs to.
- **Pending (Codex):** browser acceptance of the fixture; review; PR and CI; release, which waits for CG-02A's live acceptance.
- **Fonts:** the fixture renders in system fallback fonts, so text widths differ slightly from the app's Inter and Fraunces.
- **Language review:** fluent-speaker review of the Polish, Swedish and Danish copy has not happened, nor has human usability review.
- **Out of scope:** automatic multi-environment collection, extraction, the pilot, paid provider access, capture cost or retries, and business outcomes all remain separate CG-03 or backlog work.
