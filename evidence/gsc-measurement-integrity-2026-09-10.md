# R13 Search Console measurement integrity — implementation

Released through PR116 at19:16:18UTC. See [release evidence](gsc-measurement-integrity-release-2026-09-10.md); candidate statuses below are historical.

Recovered released record46d689b by fetch/fast-forward in8035 checkout; exclusive handoff from01a08c75. Previous PR115 release is complete and is not repeated. Final PR115 Claude34513905364 completedSUCCESS18:29:58UTC with6permissiondenials; log inspected and release record updated without rerun.

Code findings confirmed in existing CSV/API/Analytics/proof paths: blank/malformed numbers became0; mixed page/query/date rows were added together; path-only matches merged distinct hostnames; API absence fell back to overlapping samples; inclusive ranges were one day too long. Existing OAuth/auth/property membership plumbing is preserved.

Implemented bounded local CSV preview/save with declared property/window, strict one-table/unique-row validation, nullable metrics, explicit row-subtotal versus aggregate basis, conservative full-URL/property attribution and separate onsite statistics. API normalization rejects malformed/oversized responses, retains unknowns and exact aggregate versus samples, uses exactly28/90inclusivePacificdays/web/final requests. Analytics/proofUI/email/MCP and Launch labels do not attest saved browser provenance as verified. Four locales. Legacy originals remain unchanged; their numeric basis is unavailable, and new immutable publication observations refuse legacy/incomplete metrics. Existing frozen historical evidence and all R06/P0–P5 boundaries remain intact. Guide: docs/GSC-MEASUREMENT-INTEGRITY.md.

Final local full suite passes2,854tests/210files, TypeScript/build pass, focused lint0errors/1pre-existingreport-hookwarning (Prettier debt excluded). Static component regressions and legacy-observation refusal pass. Exact-head review/release remain pending. Focused logs /tmp/milo-gsc-{focused,component,full,types,build}.log. Focused lint excludes pre-existing broad Prettier debt in MCP; a misplaced existing control-regex directive is moved to its intended line, with no runtime change. No claim of signed-in or provider acceptance.

No migration/timer change is needed. No production operation, live Google/model/provider fetch, generation/funding, email/outreach/client publication, credentials/account/MFA changes or browser-policy retry has occurred. Public paid launch remains NO-GO; fullR13/R00–R24/D01–D08 and owner-only acceptance remain open.

Initial7790a6d Codex code review completed18:52:27UTC and security review18:51:44UTC. Both inline findings3982445664/3982445672 are corrected: explicit API sync again uses the same rolling five-import helper as automatic sync, and new publication observations require a valid declared property (including missing/empty/browser-edited cases). Review body and inline findings inspected. Linux34516532468 passes2,854tests/210files on bothBunversions/types/build/frozenlocks; /tmp/milo-gsc-final-linux-7790a6d.log. Final corrected candidate/review pending; no production mutation.

Corrected candidate local final2,855tests/210files/types/build/lint pass. Missing declared property also blocks Analytics page attribution. /tmp/milo-gsc-review-final-{full,types,build}.log and review-lint.log. An earlier test run overlapped the addition of the property regression and used the prior transformed matcher; discarded in favor of this complete settled-source run. No production mutation.

Review8ff7130completed19:00:00UTC found3982505285/3982505288: metric-lessmatchmustbeunavailable; browser-editedv2rowmustrevalidatemetricsbeforefreezing. Fixedbyusablemetricpresence andcreation-only strictcount/position/CTR/click-impressionvalidation, leavinghistoricalobservationschemaunchanged. Addedmalformedv2andhistoricalreadabilityregressions. Prior8ffLinux34517303077passes2,855/210bothBunversions. InitialClaude34516532328SUCCESS18:58:21with4permissiondenials/nobufferedcommentsinspected; final8ffClaude34517302987stillpending. No productionmutation.

Metric-fix candidate local2,857tests/210files/types/build/focusedlint pass; /tmp/milo-gsc-metrics-{full,types,build,lint}.log. Historical observation schema is deliberately unchanged; stricter invariants apply only before creating a new frozen observation. Final review/release pending.

Review88a6dfcompleted19:05:32UTC found3982549285 (over-limitbrowserimportcouldstillfreezeonepage). Creationnowrequiresanarraywith<=MAX_ROWS_PER_IMPORT beforefiltering; regressioncovers1,001rejectionand1,000admission. Allpriorfourfixespreserved. Finalreview/releasepending,no productionmutation.

Bound-fix focused44tests/3files/types/build/lint pass; /tmp/milo-gsc-bound-{focused,types,build,lint}.log. Previous88a6dfLinux34517997927 passed2,857tests/210files on bothBunversions/types/build/locks, /tmp/milo-gsc-final-linux-88a6df0.log. Final exact Linux/review pending.
