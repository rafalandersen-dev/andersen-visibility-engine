# Calendar risk horizon — 12 September 2026

Reviewed source 14dd040. upcomingPublishRisks computed its local-day window using fixed 24-hour durations. Reproducing the spring transition included a scheduled item from the next local day; reproducing autumn omitted the intended final day's 23:30 item. Both new regressions failed on the previous implementation.

The cutoff now advances the local calendar date to midnight after the final included day, then subtracts one millisecond. The existing meaning of horizonDays (today plus that many following days) is preserved. This affects the upcoming-unready warning selector, not publication scheduling or dispatch.

All 22 calendar tests pass in Europe/Stockholm, America/Los_Angeles and Asia/Kolkata. Full TypeScript passes (/tmp/milo-calendar-horizon-types.log), as do scoped lint and whitespace checks. No production build repeated for this pure selector arithmetic change; build evidence in the prior calendar validation record belongs to that prior change.

No live scheduling, provider or deployment operation occurred. Browser and real-use acceptance, release holds and overall scope remain open.
