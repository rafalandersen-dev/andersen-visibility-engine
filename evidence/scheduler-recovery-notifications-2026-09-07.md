# Scheduler recovery notifications

The in-app/background notification scan now reads service-only scheduler ownership metadata for its verified user, selecting project/period/status/timestamps explicitly and excluding ownership tokens. Expired active or unknown runs generate one recovery incident per acquisition; healthy active and released runs do not. Disabling the schedule does not conceal unresolved interrupted work. Release resolves the incident on the next successful scan.

The existing durable inbox provides deduplication, recipient isolation, read state and stale-snapshot handling. If the lease read fails, is malformed or exceeds the bound, existing alerts are retained. The optional email digest recognizes the new kind under the same existing opt-in and release gate; no recipients or flags are enabled by this change. Text is supplied in PL/EN/SV/DA. The action opens the project's calendar and does not restart or clear ownership.

Validation: 1,431 tests/110 files, TypeScript, production build, focused ESLint and diff checks. New cases cover healthy/expired/unknown/released ownership, disabled schedules, project isolation, unavailable source retention and actual SQL deduplication/resolution. Providers are mocked.

Migration `20260907200000_scheduler_recovery_notifications.sql` expands the kind constraint and service-only sync validation. Apply before the new application scan. Production migration/publication are pending in this record. For an application rollback, retain support for the new kind in inbox/email readers until active recovery incidents have been reconciled; do not erase unresolved records or reset unknown scheduler ownership to make the UI quiet.

This exposes interrupted scheduler work, not every budget failure, provider cost or generic task blocker. Automatic safe recovery and operator review controls remain separate. No real email, paid generation or publication is triggered by validation.

## Production acceptance

Migration20260907200000 applied/registered. Real SQL insert/dedupe/resolution acceptance rolled back fully; fixture0, anon/authenticated cannot invoke sync. #75 merged `4af673cf191afb78523944832cc72c36e953e689`, synchronized before deployment `d2b56265-07dd-4c0c-9cbd-80b8c5bf7087`; domain build1788788510691 matched revision, full fingerprint `f2c2128b8f67e6f0be6929ee045c2e3aa135f2c1e1db5845fa1aadb8ce9f26a0`, modified=false and every component. Private route returned401 unauthenticated. Automatic13:45UTC heartbeat after this release scanned5/failed0/stale0. No paid operation or email test was invoked.
