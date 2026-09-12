# Monthly report UTC boundaries and date validation

Prepared after 13749dc on codex/milo-report-branding-authority-20260912. Unreleased; overall 60% / implementation 75%, paid NO-GO and all release/provider boundaries persist.

monthKeyOf previously accepted any YYYY-MM prefix. It counted malformed dates and grouped offset timestamps by their written local month, even though the report month selector is derived from a UTC ISO timestamp. Added a shared report date parser: valid date-only planning/window values retain their calendar day; explicit-zone ISO timestamps resolve to UTC; impossible days, invalid times and zone-less timestamps are excluded rather than normalized or interpreted in the server timezone.

Page/email report aggregation now uses the validated month for recorded publications, drafted counts, scheduled counts and next-month plan membership. Publication sorting uses timestamp instants instead of lexical string order. Original stored timestamps and data are not mutated. Successful live-status/URL/project requirements remain unchanged. The four-language page date formatter and 24-language email date formatter use the same day basis. This deliberately supersedes earlier presentation tests that preserved an offset timestamp's written day; date-only planning and GSC windows still do not shift.

Examples: 2026-07-01T00:30:00+02:00 belongs to June UTC; 2026-06-30T23:30:00-02:00 belongs to July UTC. A timestamp without a zone is not sufficient evidence for UTC grouping. Existing generated UTC timestamps and valid calendar-only dates keep their behavior. Historical malformed/ambiguous dates may disappear from counts; no backfill is inferred.

All 123 tests across four files pass, covering cross-month counts, invalid dates, plan preservation, instant-based publication order and translated page/email date alignment. Full TypeScript, changed-file lint and production build pass. Logs /tmp/milo-report-utc-{tests,types,lint,build}.log. This is local aggregation/rendering validation, not verification of live destinations, growth outcomes or real report delivery. No external calls, account actions or data migration occurred.
