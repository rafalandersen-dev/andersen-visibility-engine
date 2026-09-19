# Monthly report pending schedule count

Prepared after 355bf28 on codex/milo-report-branding-authority-20260912. Unreleased; overall 60% / implementation 75%, paid NO-GO and existing release/provider boundaries persist.

The report's scheduledCount previously counted an asset when it had a matching scheduledPublishAt and no liveUrl, regardless of scheduledPublishStatus. That admitted cancelled/failed/review-required or unstated schedules with retained timestamps and omitted pending updates of already-live pages.

The shared page/email builder now requires scheduledPublishStatus pending plus a valid timestamp/date in the selected UTC reporting month. Presence of an older liveUrl no longer excludes a pending update. Publishing (already in progress), published, failed, cancelled, review_required and absent status are excluded. Own-project and month filters remain intact. This matches the pending filter used by pipeline.ts for armed work.

This count describes saved workspace mirrors; the scheduled_publishes table remains the runner's authority, as documented in types.ts. The report does not perform a fresh queue lookup and the count does not guarantee eventual publication. No queue, asset, approval or stored timestamp was changed.

All 124 tests across four files, full TypeScript, changed-file lint and production build pass. Regression coverage includes all current schedule statuses, an already-live pending update, another project/month, an invalid date and a missing date. Logs /tmp/milo-report-scheduled-{tests,types,lint,build}.log. No live scheduling, publication, email or database operation occurred. Independent queue consistency and real scheduled-publication acceptance remain open.
