# Owner digest preflight/lease recovery — evidence (28 October 2026)

## Independent release checkpoint — 28 October 2026

Codex independently passed 169 tests (80 owner-email + 89 combined migration/ACL checks), TypeScript and scoped lint. Source/security review accepted migration SHA256 `57d47ddc9c0dc1931930dacdd6f43423d01066ac8ca242c8f9eced59719ec56d`. Codex applied only automatic formatting and one prefer-const correction as a recorded integration exception.

A separate disposable PostgreSQL 17 integration suite independently passed 7/7 scenarios: two genuinely contending recovery enqueues produce one new outbox and one reassigned item, the restored core sends once with the new identity, three expired leases recover safely, and four ambiguous/already-sent boundaries remain deduplicated with successful new-incident positive controls. The old failed row remains present with unchanged status, reason and attempts; this test does not compare every column byte for byte. External transport is stubbed and hourly expiry is simulated. The local suite is preserved in `milo-team-concurrency-20261028/src/lib/failure-recovery-owner-de.test.ts`; it is separate from the portable CI suite.

Production read-only preflight at 10:07:35 UTC found 13 accepted owner outboxes, zero strictly exhausted failed rows and zero active/unread/enabled stranded items. The old function body MD5 is `fd750972e2ae1b1f115d30d57193e84c`; the new migration is unregistered. A guarded application wrapper was tested successfully on a fresh local PostgreSQL database, verifying expected new body MD5 `e92785cdd0d9b2100e78a3bb22a2fe51`, empty search_path, SECURITY DEFINER and service-only execution; the cluster was stopped. These are current observations, not authorization or proof of production application. Production migration remains unapplied.

This checkpoint supersedes the initial author-only limitations below where they say no real-PG concurrency or affected-count evidence exists. It does not claim real-provider delivery or prolonged live observation.

Author: Claude (sole author of this change set, per the 19 September 2026 working
agreement — research, design, implementation and tests). Status: **pending,
local only; no migration applied to any environment.**

## Bug confirmed

`queue_operational_email_digest(uuid)` (migration
`20260907170000_operational_email_outbox.sql`) selected eligible notifications
with `NOT EXISTS(SELECT 1 FROM operational_email_items i WHERE
i.notification_id=n.id)`. Once a notification was linked to any
`operational_email_outbox` row — including one that later reached
`status='failed', reason='attempts_exhausted'` after three real
`preflight_unavailable` outcomes, or after three pre-transport leases expired
and were retired by `claim_operational_email_digest`'s cleanup sweep — that
notification was excluded **forever**. A later rescan of the same incident
(fresh workspace revision, fresh `operational_notification_scans` row, the
notification still active/unread) could never re-queue it, even once the
delivery service that caused the preflight failures recovered. This matches
the reported symptom: Stage 2 needs to resume after service recovery, but the
existing function had no path back to `pending` for an exhausted item.

## Fix

New migration `20261028120000_operational_email_preflight_recovery.sql`
`CREATE OR REPLACE`s `queue_operational_email_digest(uuid)` only (same
signature, same `RETURNS uuid`, `SECURITY DEFINER`, `SET search_path=''`).
Changes are additive to the eligibility predicate:

- A notification remains eligible if it has no existing item (unchanged), **or**
  if its existing item's outbox row, for the same owner, is exactly
  `status='failed' AND reason='attempts_exhausted' AND attempts=3 AND
  finished_at IS NOT NULL`.
- All other existing gates are unchanged and re-verified by the full test
  suite: owner's `workspace_meta` lock (`FOR UPDATE`), enabled preference, a
  fresh matching `operational_notification_scans` row, `active`/`read_at IS
  NULL`, the 50-item cap, and the existing hourly/outstanding-work exclusion
  (`created_at>now()-1h OR status IN (pending,leased,sending)`).
- The new `operational_email_outbox` row is inserted exactly as before. The
  matching `operational_email_items` row is repointed with `INSERT ...
  ON CONFLICT(notification_id) DO UPDATE SET outbox_id=excluded.outbox_id`,
  but the `DO UPDATE` is itself guarded by a `WHERE EXISTS(...)` clause that
  re-checks the exact exhausted-row condition (same owner, `failed`,
  `attempts_exhausted`, `attempts=3`, `finished_at IS NOT NULL`) against the
  outbox row the conflicting item currently points to. A row that no longer
  matches at the moment of the conflict (e.g. changed concurrently) is left
  untouched rather than repointed.
- The old `failed` outbox row is never updated, reset or deleted — it is
  retained in place as an auditable record. No other status
  (`pending`, `leased`, `sending`, `accepted`, `unknown`, `cancelled`) is ever
  reassigned or otherwise touched by this function.
- Least privilege is reasserted explicitly: `REVOKE ALL ... FROM PUBLIC, anon,
  authenticated` followed by `GRANT EXECUTE ... TO service_role` only, for
  `queue_operational_email_digest(uuid)`.

No other function, table, policy or historical migration is modified. No
production migration was applied; no network, browser, mail or provider calls
were made.

## Invariant checked: nothing can ever reach `failed` except through a leased row

No "never-sending" flag exists in this schema. The invariant this fix relies
on is structural, enforced by the existing (unmodified)
`finish_operational_email_delivery` and `claim_operational_email_digest`:

- `finish_operational_email_delivery` only ever writes `status='failed'` from
  branch `IF p_outcome='preflight_unavailable' AND o.status='leased'` with
  `attempts>=3` — i.e. only a `leased` row can become `failed`, and only via a
  real preflight failure reported before transport began.
- `claim_operational_email_digest`'s cleanup sweep only ever writes
  `status='failed'` from `WHERE o.status='leased' AND o.lease_until<now() AND
  o.attempts>=3` — again, only a `leased` row with an expired lease.
- A `sending` row (transport in flight) can only become `accepted` or
  `unknown`, never `failed`: `finish_operational_email_delivery` requires
  `o.status='sending'` and explicitly returns `false` without any row change
  when `p_outcome='preflight_unavailable'` is called against a `sending` row
  (`IF o.status<>'sending' OR p_outcome='preflight_unavailable' THEN RETURN
  false`).

Explicit tests added to `src/lib/operational-email-migration.test.ts`
(describe block "operational email preflight recovery") prove this:

1. **Real three-preflight-failure path**: three genuine
   `finish(c,'preflight_unavailable')` calls against a `leased` row age the
   row to `failed/attempts_exhausted`; a later rescan (fresh scan, same
   incident) produces a *second*, distinct `pending` outbox row; the original
   `failed` row is retained unchanged; the item now points at the new row;
   `begin`/`finish('accepted')` on the new row succeeds.
2. **Three expired pre-transport leases**: `attempts` reaches `3` purely
   through three real lease-expiry/`claim_operational_email_digest` cycles
   (never written directly); a fourth claim attempt against the still-expired
   lease is what retires the row to `failed/attempts_exhausted`. The stale
   lease token is refused both immediately (`begin` returns null, `finish`
   returns false) and again after the later rescan produces a new, distinct
   `pending` row (`finish` with the old token still returns false against the
   new row).
3. **Positive-state exclusion**: parameterized over all six non-`failed`
   outbox statuses (`accepted`, `unknown`, `sending`, `cancelled`, `pending`,
   `leased`), each reached through its real transition (`claim`/`begin`/
   `finish('accepted'|'unknown')`, or an opt-out/re-enable round trip for
   `cancelled`) rather than asserted by name only. Each case asserts the
   row actually reached the named status, then ages it two hours and rescans
   before calling `queue()` again so the hourly hold-off cannot be mistaken
   for the item-level exclusion, and asserts the outbox/item row counts are
   unchanged. An earlier version of this test called `finish(c,'accepted')`
   directly on a freshly `leased` row; that call is a no-op (`finish` only
   accepts `'accepted'`/`'unknown'` against a `sending` row) and so the test
   silently exercised only the `leased` case under all six names — corrected
   here.
4. **Illegal-transition guard**: calling `preflight_unavailable` after
   transport has begun (`status='sending'`) returns `false` and leaves the row
   `sending` — it can never become `failed` from `sending`.
5. **Negative eligibility**: a `failed` row with `attempts=2` (reason
   `attempts_exhausted`, `finished_at` set) is proven not recoverable in its
   own right, independent of the pending/leased/sending outstanding-work
   guard — the row is `failed`, not `pending`, when the check runs. A
   different `reason` (`disabled`), a null `finished_at`, and a `cancelled`
   row are each separately proven not recoverable. An earlier version set
   `attempts=3` directly while the row was still `pending` from a real
   `attempts=1` failure, so that case was actually excluded by the unrelated
   outstanding-work guard rather than by the attempts/reason/finished_at
   predicate — corrected here.
6. **Cross-owner guard**: a forged `operational_email_items` row that points
   another account's notification at the first account's exhausted outbox row
   is proven not to make that notification recoverable for the other account's
   `queue()` call; the original owner's own rescan still recovers normally.
7. **Unrelated gates preserved under recovery**: opt-out, a stale workspace
   scan, a read notification, a **resolved** notification (`active=false` via
   a real empty `sync_operational_notifications` call, then restored active
   by resyncing the same event), and the existing hourly/outstanding-work
   limit all still block a recovery queue call exactly as before; the
   pre-existing final assertion recovers once every gate is cleared, which
   also serves as the positive control proving the resolved→restored
   notification is eligible again. (The resolved case was named in this
   test's title but never actually exercised before this correction.)
8. **ACL preserved**: `anon` and `authenticated` roles are refused
   `queue_operational_email_digest` with `permission denied`; only
   `service_role` can call it (pre-existing grant structure, reasserted
   explicitly in the new migration). This is now also checked in
   `src/lib/milo-candidate-chain-migration.test.ts`, which lists
   `20261028120000_operational_email_preflight_recovery.sql` as a candidate
   so it is actually applied, in filename order, on top of the real released
   chain in that combined fixture (not just its own standalone fixture), and
   asserts `queue_operational_email_digest(uuid)` is executable by
   `service_role` only (`anon`/`authenticated`/`public` all refused) there
   too.

## Test results

Commands run (the only Bash commands used for verification, each iterated
until green):

```
./node_modules/.bin/vitest run src/lib/operational-email-migration.test.ts --maxWorkers=1
./node_modules/.bin/vitest run src/lib/operational-email-migration.test.ts src/lib/milo-candidate-chain-migration.test.ts --maxWorkers=1
```

Final result: **80 passed, 0 failed** in
`operational-email-migration.test.ts` alone, and **169 passed, 0 failed**
when run together with `milo-candidate-chain-migration.test.ts` (which now
also applies the new migration as a candidate and checks its ACL). The
"operational email preflight recovery" describe block holds 13 tests
(previously 8): the single "excludes ... accepted, unknown, sending,
cancelled, pending or leased" test was replaced by a 6-case parameterized
`it.each`, a net gain of 5 tests; the other two corrections below rewrote
existing tests in place without changing the count.

An independent source review of an earlier draft of this test file found it
contained **false coverage**: assertions that passed but did not exercise
what their names claimed. Three corrections were made as a result (detailed
inline in the scenario list above):

- The "excludes ... accepted, unknown, sending, cancelled, pending or leased"
  test called `finish(c,'accepted')` on a freshly `leased` row. That call is
  a no-op against a non-`sending` row, so the row stayed `leased` under all
  six names and the other five states were never actually reached. Replaced
  with a parameterized test that drives each of the six states through its
  real transition and asserts the status was actually reached before
  rescanning.
- The "does not recover items with fewer than three attempts..." test's
  first case left the row `pending` (a real but low, `attempts=1` failure),
  which the unrelated pending/leased/sending outstanding-work guard already
  excludes regardless of attempt count — so it did not independently test the
  `attempts=3` predicate. Replaced with a directly-seeded `failed,
  attempts=2, reason=attempts_exhausted, finished_at` row, which isolates the
  attempts predicate from the outstanding-work guard.
- The "still respects opt-out, read, resolved incidents..." test never
  exercised a resolved notification despite its title. Added a real empty
  `sync_operational_notifications` call (which marks the notification
  `active=false`) followed by a null assertion, then restored the event via
  another sync call so the test's existing final positive-control assertion
  also proves the restore worked.

Separately (pre-existing, from the original implementation pass): a
`finish(... 'preflight_unavailable')` call against a `sending` row returns
`false` rather than throwing, confirmed against the existing, unmodified
function body; a forged cross-owner `operational_email_items` row (not two
separate per-user rows, which can never collide on the `notification_id`
primary key) was needed to exercise the `o.user_id = p_user` guard; and one
assertion needed `db.query` rather than `db.exec` because PGlite's
simple-query path rejects positional parameters.

One correction needed to make the "retires expired leases at the attempt
limit" and "requeues after three expired pre-transport leases" tests use
three real lease-expiry claims to reach `attempts=3`, rather than writing
`attempts=3` directly alongside the expired `lease_until` — the prior form
asserted the right end state but did not prove the attempts counter is
actually driven to the limit by real claims.

## What this evidence does not establish

- **Concurrency under real Postgres is not tested here.** PGlite is
  single-connection; the `ON CONFLICT ... DO UPDATE ... WHERE EXISTS(...)`
  guard's behavior under concurrent `queue_operational_email_digest` calls
  for the same user (blocked by the existing `workspace_meta` row lock) or
  concurrent `claim_operational_email_digest` calls (protected by
  `FOR UPDATE SKIP LOCKED`) needs a real multi-connection Postgres harness to
  verify, as planned separately.
- **No migration has been applied to staging or production.** The later local PostgreSQL wrapper check is recorded above. This is prepared code and passing unit
  tests only, not verified production behavior, per the working agreement's
  distinction between research/tests and release.
- **No count of currently affected/stranded real accounts or messages is
  available.** Before any production apply, the count of notifications
  presently stuck behind an `attempts_exhausted` outbox row (and therefore the
  size of the backlog this fix would release into the normal queue/claim/
  begin/finish sweep on the next cron pass) should be measured against the
  real `operational_email_outbox`/`operational_email_items` tables, and that
  count should gate the decision to apply, per Codex's independent release
  verification role.
- Applying this migration does not itself deliver any stranded email; it only
  allows the existing, unmodified `queue_operational_email_digest` →
  `claim_operational_email_digest` → `begin_operational_email_delivery` →
  `finish_operational_email_delivery` sweep, running on its normal schedule,
  to pick previously permanently-excluded eligible messages back up.
