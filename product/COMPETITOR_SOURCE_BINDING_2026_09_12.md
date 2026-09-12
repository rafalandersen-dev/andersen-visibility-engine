# Competitor snapshot source binding — 12 September 2026

Status: unreleased candidate. PR134's translations are separately released and must not be repeated. No migration, deployment or automatic analysis has been issued for this fix.

When an earlier competitor page fails to load, or the model reorders its summaries, array-position matching can attach a summary to the wrong fetch. Model-supplied URLs could also replace the observed source, and URLs longer than 300 characters were silently truncated.

Bind each summary to a unique matching source URL, retain the original requested order and URL, and derive retrieval status solely from captured fetch results. Failed fetches discard model claims; absent, unrelated, duplicate or contradictory source labels fall back to the observed page title without positioning or strengths. Matching permits normal host/default-port/fragment serialization while keeping paths, queries, schemes and credentials distinct. The competitor source input is limited to 4,096 characters before usage or retrieval, and returned source identities are no longer truncated.

The existing authenticated generator calls the binding helper after receiving the model result. Fetch transport, model budgets, scoring, gap conversion, saved analyses and publication authority remain unchanged. No migration or automatic reanalysis is required. This fixes source association; it does not certify the truth of a model-generated description or repair historical saved analyses.

Validation: 153 focused binding, page-fetch, public-fetch, metering and generation-usage tests across five files pass. Fifteen new cases cover captured failed/reordered results, unmatched/ambiguous URLs, forbidden identity substitutions, legacy aliases, full URL retention and refusal boundaries. Full TypeScript and the production build pass; the final exact-head full-suite/build CI is required before release. Changed-source lint adds no diagnostics; 17 pre-existing diagnostics remain in the large generator file. No real customer analysis or model request was performed.

## Source identity and remaining limits

The original `fetches.map((f, i) => normalizeCompetitorSnapshot(aiSnapshots[i], ...))` trusted model ordering even though the prompt requests snapshots only for successfully fetched competitors. A failed first page followed by one successful page shifts a shortened model array; any model reordering also breaks association. The old snapshot normalizer accepted a model URL and retained descriptions for failed fetches, while its 300-character string cleaner truncated longer source identities.

`bindCompetitorSnapshots` consumes captured request URLs, fetch success and observed titles, then matches only a unique model record bearing the same normalized URL. All nonempty URL aliases must agree. Unlabelled, mismatched or duplicate records cannot borrow a position in the request array. Retrieval status and the displayed source URL come from the captured input; failed fetches get no generated positioning or strengths. The model still supplies descriptions for matched successful sources, and those descriptions are not independently fact-checked by this change.

Source comparison adds HTTPS to scheme-less inputs as the existing page reader does, normalizes host case/default ports and ignores fragments. Path, query and protocol differences stay distinct; credential-bearing or control/space-bearing identifiers cannot match. No model URL is requested. The 4,096-character input limit is checked before the existing usage claim, and snapshot output preserves the accepted source string instead of truncating it. Other endpoints and their input schemas are unchanged.

Existing saved analyses are retained as historical data. This fix affects subsequent successful analysis responses; it does not rewrite histories, rerun paid operations, change displayed score values or certify old source associations. Model quality, actual provider acceptance and real concurrent transport journeys remain open.

## Validation and artifacts

The first regression run records11 failures and1 pass in `/tmp/milo-competitor-binding-before-tests.log`. Three cases also exposed a limitation of the concurrent dynamically imported transport mock: the second fixture did not consistently reach the test double. Its cause was not established. Temporary diagnostic code was removed. The three ordering/failed-fetch cases now exercise the actual pure binding function with captured results, while endpoint cases exercise the existing authenticated handler and refusal behavior with mocked external IO. These tests do not establish actual concurrent transport acceptance.

Current focused evidence: all153 tests/5files pass, including15 new source-binding cases and138 existing page transport, public-fetch, spending and generation-usage checks. `/tmp/milo-competitor-binding-final-focused.log`. Earlier intermediate failures and diagnostic logs remain retained; they are not reported as clean runs.

Lint comparison `/tmp/milo-competitor-binding-lint-comparison.json` confirms17 pre-existing generator diagnostics, no new diagnostics and no test-file diagnostics. Baseline/final JSON artifacts compare rule, message and original line content so shifted line numbers do not hide new issues. Full TypeScript and production build pass in `/tmp/milo-competitor-binding-final-types.log` and `/tmp/milo-competitor-binding-build.log`. Exact-head CI must cover the complete suite/build on both runtimes. A final test-only refinement keeps the empty-fetch endpoint fixture to one source with an exact mocked-call assertion; all15 binding cases are rerun in `/tmp/milo-competitor-binding-final-endpoint-tests.log`.

The full goal remains active. Overall60% / implementation75% (weighted58.25% /73.5%) remain unchanged; source binding is a bounded correctness fix and does not establish wider acceptance or paid-launch readiness.
