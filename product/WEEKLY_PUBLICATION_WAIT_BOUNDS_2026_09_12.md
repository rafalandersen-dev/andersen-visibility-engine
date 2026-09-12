# Weekly publication wait bounds — 12 September 2026

Reviewed 5c349ee against P3/R05 bounded weekly execution. The retained-content finalization path awaited publication approval and schedule admission without the weekly runner's bounded wait, so a never-settling dependency could prevent the project visit (and Promise.all dispatch batch) from finishing.

Both calls now use the existing ten-second operation bound. A typed timeout propagates past the ordinary review-refusal handler to recovery-required, preventing further stages or another admission in that visit. The existing finally path releases the lease. A timeout does not cancel the underlying call or assert that admission failed; later visits consult authoritative queue state. Existing SQL lease/version authority remains in place.

Two new orchestration cases failed against the prior implementation and now pass. They cover never-settling approval/admission, visit settlement, no new stage/mirror, lease release, late completion without continuing the timed-out path, and a late successful admission being read on the next visit without a second admission. These use mocked dependencies, not actual scheduling or publication.

All 29 tests across weekly executor, scheduler approval and batch dispatch pass. Full TypeScript passed (/tmp/milo-weekly-publish-timeout-types.log), as did scoped lint and whitespace checks. The full application suite passed at predecessor 16b1636; it was not rerun for this bounded change. No production build repeated.

Other dependency bounds and complete weekly/freshness/publication acceptance remain under review. Real logged-out destination verification, release/security-review gates and full R00–R24/D01–D08 completion remain open. No provider, database, deployment or task handoff action occurred.
