# Calendar risk ordering — 12 September 2026

Reviewed source a238269. The risk selector filtered entries using parsed instants but sorted their original text. Two regressions showed offset timestamps in reverse chronological order and a date-only target preceding a morning publication despite the target's existing local-noon anchor.

The selector retains each calculated instant alongside its risk while sorting, then returns the original public risk shape. Original when values and the existing date-only noon convention are unchanged. This aligns ordering with the same instants used for inclusion; it does not give a target an actual publication time.

Both new regressions failed before the change. All 24 calendar tests pass in Europe/Stockholm, America/Los_Angeles and Asia/Kolkata. Full TypeScript passes (/tmp/milo-calendar-order-types.log); scoped lint and whitespace checks pass. No build repeated for this pure selector change.

No schedule or destination operation occurred. Prepared, unreleased; browser/real-use acceptance and release holds remain open.
