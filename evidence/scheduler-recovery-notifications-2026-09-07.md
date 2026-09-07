# Scheduler recovery notifications

The in-app/background notification scan now reads service-only scheduler ownership metadata for its verified user, selecting project/period/status/timestamps explicitly and excluding ownership tokens. Expired active or unknown runs generate one recovery incident per acquisition; healthy active and released runs do not. Disabling the schedule does not conceal unresolved interrupted work. Release resolves the incident on the next successful scan.

The existing durable inbox provides deduplication, recipient isolation, read state and stale-snapshot handling. If the lease read fails, is malformed or exceeds the bound, existing alerts are retained. The optional email digest recognizes the new kind under the same existing opt-in and release gate; no recipients or flags are enabled by this change. Text is supplied in PL/EN/SV/DA. The action opens the project's calendar and does not restart or clear ownership.

Validation: 1,431 tests/110 files, TypeScript, production build, focused ESLint and diff checks. New cases cover healthy/expired/unknown/released ownership, disabled schedules, project isolation, unavailable source retention and actual SQL deduplication/resolution. Providers are mocked.

Migration `20260907200000_scheduler_recovery_notifications.sql` expands the kind constraint and service-only sync validation. Apply before the new application scan. Production migration/publication are pending in this record. For an application rollback, retain support for the new kind in inbox/email readers until active recovery incidents have been reconciled; do not erase unresolved records or reset unknown scheduler ownership to make the UI quiet.

This exposes interrupted scheduler work, not every budget failure, provider cost or generic task blocker. Automatic safe recovery and operator review controls remain separate. No real email, paid generation or publication is triggered by validation.
