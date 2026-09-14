# Operational notification source completeness — 12 September 2026

Reviewed candidate 4e9e9db against R06 alert recheck/deduplication requirements. The queue and scheduler-lease queries requested 1,001 rows and rejected arrays over 1,000, but a database-side response cap could return fewer rows without proving source completeness. Syncing events from partial history could incorrectly clear active alerts or infer missing work.

Both queries now request exact counts. Their response is accepted only with an integer count from zero through 1,000 and a matching array length. Missing/unknown counts, truncated results and over-limit histories stop before notification sync and digest queueing. Existing alerts are preserved. Accounts above this bound still require pagination support; no complete large-history scan is claimed.

Two regressions (one per source, each exercising missing/null/mismatched/over-limit counts) failed before the fix and now pass. Existing valid empty-source fixtures now carry their verified zero count. All 47 notification server/evaluator/route tests across three files pass, plus full TypeScript (/tmp/milo-notification-completeness-types.log), scoped lint and whitespace checks. No full-suite or production-build repeat for this bounded query-contract change.

No email, live database, provider or deployment operation occurred. Real notification transport, larger-history support and full lifecycle/release acceptance remain open; the overall goal and release holds are unchanged.
