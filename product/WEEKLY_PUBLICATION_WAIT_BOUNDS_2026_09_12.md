# Weekly publication wait bounds — 12 September 2026

Reviewed 5c349ee against P3/R05 bounded weekly execution. The retained-content finalization path awaited publication approval and schedule admission without the weekly runner's bounded wait, so a never-settling dependency could prevent the project visit (and Promise.all dispatch batch) from finishing.

Both calls now use the existing ten-second operation bound. A typed timeout propagates past the ordinary review-refusal handler to recovery-required, preventing further stages or another admission in that visit. The existing finally path releases the lease. A timeout does not cancel the underlying call or assert that admission failed; later visits consult authoritative queue state. Existing SQL lease/version authority remains in place.

Two new orchestration cases failed against the prior implementation and now pass. They cover never-settling approval/admission, visit settlement, no new stage/mirror, lease release, late completion without continuing the timed-out path, and a late successful admission being read on the next visit without a second admission. These use mocked dependencies, not actual scheduling or publication.

All 29 tests across weekly executor, scheduler approval and batch dispatch pass. Full TypeScript passed (/tmp/milo-weekly-publish-timeout-types.log), as did scoped lint and whitespace checks. The full application suite passed at predecessor 16b1636; it was not rerun for this bounded change. No production build repeated.

Other dependency bounds and complete weekly/freshness/publication acceptance remain under review. Real logged-out destination verification, release/security-review gates and full R00–R24/D01–D08 completion remain open. No provider, database, deployment or task handoff action occurred.

## Follow-up: archived-result read recovery

At candidate 2bab021, inspected generation-result.server.ts and confirmed its shared RPC layer already bounds reads at ten seconds. No redundant runner wrapper or production behavior change was needed.

Added an executor integration case using the real readGenerationResult implementation with an injected pending RPC. After the read times out, the visit reports recovery-required with no delivered draft or image work. A late RPC response does not deliver the draft. A later visit recovers it from the retained archive with one content generation and one content stage total. This proves the local read/runner recovery interaction; provider calls and database execution remain mocked.

All 36 tests across the executor, generation-result storage and weekly-stage suites pass, with full TypeScript (/tmp/milo-weekly-archive-recovery-types.log), scoped lint and whitespace checks. The first harness attempt timed out because the fake clock advanced before asynchronous hashing reached the read; the corrected test waits for the observed RPC invocation before advancing its deadline. This was a test synchronization correction, not a production timeout fix.
