# Notification sweep wait bounds — 12 September 2026

Reviewed candidate 2c39589 against R06 background scan isolation. The sweep awaited accounts serially and its reads could stall indefinitely, preventing later accounts from being scanned.

The existing maximum batch of twenty accounts now runs concurrently. Target selection and each account's workspace, queue, lease, control, capacity, notification-sync and digest-queue operations use ten-second wait limits. A timed-out awaited read rejects its account flow, so late read completion cannot continue into notification sync. An already-issued mutation may still finish; no cancellation or no-side-effect guarantee is claimed, and a timed-out sync does not proceed to digest queueing.

The workspace reader is imported once at module scope instead of dynamically inside concurrent account scans. This also avoids a concurrent dynamic-mock resolution problem exposed by the test harness. No live workspace read was performed; test database access remained mocked.

A new fake-clock integration case verifies that the healthy account syncs while another account is pending, the batch returns scanned=1/failed=1 after the deadline, and resolving the late workspace response does not sync the timed-out account. All thirty notification server/route tests pass. Full TypeScript (/tmp/milo-notification-sweep-bounds-types.log), production build (/tmp/milo-notification-sweep-bounds-build.log), scoped lint and whitespace checks pass.

Concurrency can produce up to twenty account scans at once; this is still the existing bounded selection, with no new provider work. Per-operation limits are not a single global request deadline. Real database-load and email lifecycle acceptance remain open. No email, provider, deployment or task-handoff operation occurred; release holds and full-goal scope remain unchanged.
