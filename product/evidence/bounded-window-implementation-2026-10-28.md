# Bounded weekly observation — implementation record, 28 October 2026

Author: Claude (implementation role, working agreement 19 September 2026).
Base: `a3c7f68b81dd787971866aeb1318cf524dff54ec`, worktree
`/Users/rafi/Projects/milo-owner-mail-recovery-20261028`, branch
`codex/milo-bounded-endurance-20261028`.

This records prepared code and executed local tests only. **Nothing is deployed,
funded, granted, activated or purchased.** No window, permit, budget row, cron
job, grant or provider call was created. No network, Lovable, provider or
production action was taken; no credential was read or written. Codex owns
independent review, release verification and any activation decision. The
seven-day clock begins at confirmed activation, not at this record.

Revised 28 October by the consolidated correction packet (five corrections from
the independent root and SQL reviews, below). Migration SHA256 before the
correction pass
`9c65d53342616c44c56673acc703b2dfe94395dd26a50b9f41aa2628e60bd553`; after
`25019b0874493109258de5c8380cfb32bb12d4853e324bd2d8077bb067503263`. Neither is a
deployed identity.

## What was built

| Path | Change |
| --- | --- |
| `supabase/migrations/20261028170000_bounded_weekly_test_windows.sql` | NEW. Policy/slot/contract/allowance storage, privileged register/read/stop RPCs, the final pre-dispatch guard, and integration into the existing target-selection, lease, stage and expense functions. |
| `src/lib/weekly-test-window.server.ts` | NEW. Strict bounded RPC adapter and pre-dispatch guard. Read, guard and stop only — no provisioning surface. |
| `src/lib/weekly-executor.server.ts` | MODIFY. Reads the optional policy, enforces the slot whitelist, repeats verification in `assertActive`, and passes the exact guard/signal through the three stages. |
| `src/lib/ai.functions.ts` | MODIFY. Research core accepts and forwards trusted `signal`/`beforeDispatch` (content already did). |
| `src/lib/image-gen.functions.ts` | MODIFY. Image core accepts and forwards the same trusted options. |
| `src/lib/ai-provider-expense.server.ts` | MODIFY. `generateBudgetedImage` gains text parity for the final check and the cancellation signal. |
| `src/lib/weekly-test-window-migration.test.ts` | NEW. 59 focused SQL cases over the real layered migrations. |
| `src/lib/weekly-test-window.server.test.ts` | NEW. 49 adapter and provider-boundary cases. |
| `src/lib/weekly-executor.server.test.ts` | AMEND. Policy-read seam (default `null` = unregistered) plus 8 focused policy cases; the 23 pre-existing cases are unchanged and pass. |
| `src/lib/ai-provider-expense.test.ts` | AMEND. 4 image cases mirroring the existing text cancellation/final-authority cases. |
| `src/lib/milo-candidate-chain-migration.test.ts` | AMEND (integration). One entry in `independentCandidates` enumerating the new migration. |

`src/lib/image-gen.server.ts` was **not** changed: `generateImageResult(prompt,
signal)` already forwards its signal into `directProviderFetch`, so the abort
reaches the actual HTTP request. The allowed narrow integration addition was
therefore unnecessary and was not taken.

## Design decisions and the reasoning behind them

**Lock order (the hidden `workspace_meta` lock).** `assert_knowledge_project(…,
true)` takes `workspace_meta … FOR UPDATE`. `public.dispatch_backlink_monitoring`
(`20260911170000`) already runs `workspace_meta -> global budget -> account
budget -> permit` because it calls `reserve_ai_expense` while holding that lock.
Adding a `workspace_meta` acquisition inside `reserve_ai_expense` would
therefore create a real deadlock cycle. The migration documents and obeys one
strict total order:

```
1 workspace_meta  2 global budget  3 account budget
4 weekly_test_windows  5 ai_expense_permits  6 weekly_test_window_allowances
```

- mint (`begin_weekly_preparation_stage`): 1 → 4 → 5 → 6, never 2/3
- money (`reserve_ai_expense`): 2 → 3 → 5 → 6, never 1, and the policy row at 4
  is read **without a lock** (READ COMMITTED sees a committed revoke on the next
  statement; the fresh pre-dispatch guard is the authoritative recheck)
- stop (`revoke_weekly_test_window`): 4 only
- existing backlink dispatch: 1 → 2 → 3 → 5, unchanged

**Direct-bypass ACLs and overloads.** The migration refuses to install if
`public.reserve_ai_expense`, `begin_weekly_preparation_stage`,
`claim_auto_scheduler_lease` or `next_weekly_preparation_targets` has more than
one overload, and re-asserts this after the four `CREATE OR REPLACE`s. A
re-introduced legacy seven-argument reserve is an unguarded money path, so
installation fails closed (`reserve_ai_expense_overload_present`). This is
tested on a second fresh database. The four new tables are revoked from
`PUBLIC`, `anon`, `authenticated` **and** `service_role`; the three internal
evaluator functions are revoked from every role and are reachable only from the
SECURITY DEFINER functions. Only `register_`, `read_`, `revoke_` and
`assert_weekly_test_window_dispatch` are granted to `service_role`.

**Refusal reasons reuse the existing contract.** `reserve_ai_expense` returns
the already-handled `permit_required` (no binding for a trial stage) and
`permit_invalid` (binding mismatch, closed window, drift). `ai-expense.server.ts`
is outside the authorized file list, and its `REASONS` allowlist would otherwise
collapse a new reason into the generic `reservation_unconfirmed`. The refusal is
identical either way; reusing the two reasons keeps the precise, already-tested
caller messaging without touching an out-of-scope file.

**Retention across deletion/recreation.** The window and allowance tables
deliberately carry **no** foreign key to `workspace_entities`/`auth.users`, and
a unique `(user_id, project_id)` index makes the window a once-per-lifetime
identity. Deleting the project cascades its stages, control and leases away; the
trial ledger stays, `register_weekly_test_window` refuses a second
registration (`weekly_test_window_exists`), and a recreated project is refused
with `weekly_test_window_exhausted`. Registration also refuses a project that
already holds weekly stages, which is what keeps the two-instant whitelist
authoritative.

**The final gate rechecks after its own acknowledgement.** A guard can
legitimately pass just before T1 while its reply lands after T1.
`createWeeklyTestWindowGuard`'s `beforeDispatch` therefore (1) checks the local
abort/deadline, (2) awaits the fresh database guard (server
`clock_timestamp()`, exact request/job/slot/stage/provider/model/operation/
ceiling, permit, lease and stage state), and (3) **rechecks the local
deadline/abort again after the await**, before the provider spy can be reached.
Both the `deadline_during_guard` path and the "money admission held across T1,
then released" path are asserted with the real supplier `fetch` spy at zero.
Correction 2 below adds a third, clock-independent bound to the same step.

**The monotonic cutoff (why the local wall clock is not trusted alone).** The
local `Date.now()` can trail the database, be stepped by an operator, or be
adjusted backwards by NTP; any of those lets a stale "still open" answer through
after T1. So the guard derives a second, independent bound from the server's own
remaining time:

- `sentAt = monotonic()` is taken immediately BEFORE the guard RPC is sent.
- The acknowledgement's `remainingMs` is reconciled with the server's own
  `endsAt - serverNow`; the SMALLER of the two is binding, and a non-positive
  result refuses outright. Inconsistent server timing therefore shortens the
  window, never lengthens it.
- The bound is `sentAt + serverRemaining`, so the ENTIRE round trip is charged
  against the remaining time rather than added to it. Anchoring at the reply
  instead would have let the reproduced 202ms-delayed, 100ms-remaining
  acknowledgement through.
- `monotonicDeadline` is only ever lowered (`Math.min`): a later, more generous
  acknowledgement can never buy back time that an earlier one already spent.
- The real cancellation timer is re-armed to the earliest of the absolute local
  cutoff and this bound, and never to a later one, so an in-flight provider
  request is aborted without the two clocks having to agree.
- Both bounds are checked before the RPC and again after the awaited
  acknowledgement, in the order abort → absolute local deadline → monotonic
  bound. All of them refuse; the order only fixes which refusal detail is
  reported, which keeps the existing late-reserve and same-clock cases exact.

**Post-lock lease behaviour (why the gate is evaluated twice).** The first gate
in `claim_auto_scheduler_lease` is cheap and runs before the lease row is
touched at all. It is not sufficient on its own: the subsequent
`INSERT … ON CONFLICT DO NOTHING` plus `SELECT … FOR UPDATE` can BLOCK for an
unbounded time behind another session — including the release path, which locks
that row without ever taking `workspace_meta`. A claim admitted before T1 could
therefore resume after T1, or after a stop had committed, and still mint an
active token. The function now re-reads the policy row and a fresh
`clock_timestamp()` once the lease lock is held and immediately before any token
is created or returned. Properties:

- READ COMMITTED gives that second statement a new snapshot, so a revoke
  committed during the wait is visible.
- The re-read takes NO row lock on the policy (plain `SELECT`), so the
  documented total lock order gains no cycle; the lock order section above is
  unchanged.
- A refusal raises, which rolls back the speculative insert of the current
  attempt and leaves a pre-existing lease row — including a `released` one —
  exactly as it was, with its original token and status.
- An unregistered project has no window row, so neither gate applies and its
  claim behaviour is bit-for-bit unchanged. Release, check, recovery and
  settlement paths are untouched.

**Cancellation is best effort.** The guard's `AbortSignal` is forwarded into the
real text and image requests, so an abort reaches an in-flight call. A supplier
request already dispatched cannot be guaranteed to stop remotely at T1:
cancellation is best effort and the attempt's outcome stays **unknown** until
evidence exists. The reservation is retained as `uncertain`, never refunded and
never retried, and the lifetime allowance is never returned.

**Lifetime capacity is month- and settlement-independent.** Capacity is the
count of allowances and the sum of their **original authorized** ceilings, not a
monthly reserved balance or any settled cost. A test ages every binding into
`2020-01` and reconciles a settled cost; monthly `reserved_microusd` returns to
0 while `authorizedMicrousd` stays at 2,200,000 and the seventh binding is still
refused. A permit minted before a month boundary fails conservatively afterwards
(`permit_invalid`) and mints no alternate retry identity.

**Price/model drift fails closed.** Per-stage ceilings are pinned by CHECK to
the audited 2026-09-08 envelope (text 500,000, image 100,000 microUSD), so two
slots × (research + content + image) is exactly 2,200,000 and exactly six
allowances. A repricing or a different model cannot be registered or admitted
without a new audited policy. These are internal reservation bounds, not
refreshed supplier prices or measured invoices.

**Opt-in only.** A project without a window row behaves exactly as before in
target selection, lease claiming, stage admission, monetary admission and
delivery. The policy read fails closed (it never defaults to "absent"), and
registration additionally requires `approve_first` with no `summaryEmail`, so the
controlled fixture cannot publish or mail by itself.

## Executed results

Commands run locally with the existing `node_modules`; no installs.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | clean, no output |
| `npx eslint` on the 7 new/edited source and test files | clean, no output |
| `npx vitest run src/lib/weekly-test-window-migration.test.ts` | 54 passed |
| `npx vitest run src/lib/weekly-test-window.server.test.ts` | 36 passed |
| `npx vitest run src/lib/weekly-executor.server.test.ts` | 31 passed (23 pre-existing + 8 new) |
| `npx vitest run src/lib/ai-provider-expense.test.ts` | 66 passed (62 pre-existing + 4 new) |
| 14-file focused batch (weekly, expense, image, metering, usage-claim suites) | 14 files, 442 passed |
| the same batch with `--no-file-parallelism` | 442 passed, 46.05s |

The unchanged accepted 49-test DE harness was **not** run.

### Correction pass — executed results (28 October, second pass)

One focused batch, unpiped and unmasked, after the five corrections:

```
npx --no-install vitest run --no-file-parallelism \
  src/lib/weekly-test-window-migration.test.ts \
  src/lib/weekly-test-window.server.test.ts \
  src/lib/ai-provider-expense.test.ts \
  src/lib/milo-candidate-chain-migration.test.ts
```

| Command | Result |
| --- | --- |
| the focused 4-file batch above | **4 files, 263 passed, 0 failed**, exit 0, 3.80s |
| `src/lib/weekly-test-window-migration.test.ts` | 59 passed (54 + 5 new SQL cases) |
| `src/lib/weekly-test-window.server.test.ts` | 49 passed (36 + 13 new adapter/boundary cases) |
| `src/lib/ai-provider-expense.test.ts` | 66 passed (unchanged count; one case corrected) |
| `src/lib/milo-candidate-chain-migration.test.ts` | 89 passed — the inventory guard is satisfied |
| `npx --no-install tsc --noEmit` | clean, no output, exit 0 |
| `npx --no-install eslint` on the 4 touched TS/test files | clean, no output, exit 0 |

No other suite was re-run: the untouched files were already green in the first
pass and the host is loaded. No provider, network, Lovable, production, git,
grant, funding, credential or install action was taken in this pass.

**Negative controls.** Each new case was confirmed to detect the defect it
describes, by temporarily reverting the corresponding fix and restoring it
byte-for-byte afterwards (verified with `diff`):

| Reverted correction | Failures observed |
| --- | --- |
| 4 + 5 (SQL slot shape, post-lock lease re-read) | 4 failed / 55 passed in the migration suite |
| 1 + 2 (strict envelope + scoped stop, monotonic cutoff) | 13 failed / 36 passed in the adapter suite |
| 3 (image signal observation) | the case fails at test level (`expected false to be true`) when the signal is not aborted — under the previous in-callback form the same condition was swallowed by the adapter's catch |

Pre-existing lint findings remain in `src/lib/ai.functions.ts` (1 `no-control-regex`,
2 `prettier/prettier`) and `src/lib/image-gen.functions.ts` (2 `prettier/prettier`).
`git diff` shows none of those lines were touched by this change; one of them was
incidentally resolved by reformatting the image core's execution parameter.

### Honest limitations of this evidence

- **PGlite serializes.** The migration suite runs one in-process connection, so
  its `Promise.allSettled` case proves the six/seven-allowance guard is correct
  under arbitrary **interleaving**. It is **not** evidence of multi-connection
  row-lock contention. A real host PostgreSQL proof of the documented lock order
  and of `FOR UPDATE` contention between the mint, money and stop paths is still
  open; per the packet it would belong only under the existing explicit
  local-acceptance configuration, never in default `src` discovery.
- **The post-lock lease re-read is proved by injection, not by a real wait.**
  One PGlite connection cannot stage a claim that blocks on another session's
  lease lock. The three focused cases instead install a temporary
  `BEFORE INSERT` trigger on `auto_scheduler_leases` that applies the stop (or
  moves T1 into the past) at exactly the point a blocked claim would resume:
  after the first gate has passed and before the lock is taken. That proves the
  gate is genuinely re-evaluated after the lease row is reached and that the
  refusal preserves pre-existing lease state. It does **not** prove the actual
  cross-session wait; that belongs to the separate real-PostgreSQL harness,
  which this packet does not touch. Note also that the injected stop rolls back
  with the refused transaction, which is why those cases assert on the lease
  rows rather than on the policy row.
- `src/lib/weekly-executor.server.test.ts` uses real 10-second `bounded()`
  timeouts and real `Date.now()` visit deadlines, so it is sensitive to CPU
  starvation. Under this host's load (observed 1-minute load average 35–78 from
  unrelated work) plus parallel vitest workers, a varying two or three of the 23
  **pre-existing** cases in the first describe intermittently fail with
  timeout-shaped assertions. The same 14-file batch is green with
  `--no-file-parallelism` (442/442), the file alone is green (31/31, repeated),
  and each affected case passes in isolation. This is a pre-existing property of
  that file's real-timer design, not of the new code; CI should be observed on an
  unloaded runner.
- Tests are not verified production behaviour. Nothing here establishes supplier
  availability, actual cost, deployed SQL identity or the account's real
  entitlement.

## Migration-inventory integration — COMPLETED, no longer blocked

`src/lib/milo-candidate-chain-migration.test.ts` is a deliberate migration
**inventory guard**: its first case fails whenever a file after the cutoff is not
enumerated, so a new migration is surfaced rather than silently treated as
released. That one entry has since been added to the `independentCandidates`
array (the migration binds to the weekly scheduler lease/stage chain, which that
fixture does not create, so it is enumerated there and executed by its own
suite):

```ts
// Bounded weekly observation policy (28 October): binds to the weekly
// scheduler lease/stage chain, which this fixture does not create, so it is
// enumerated here (never silently treated as released) and executed against
// the real weekly + expense migrations by weekly-test-window-migration.test.ts.
"20261028170000_bounded_weekly_test_windows.sql",
```

The whole file is green (89/89) and is re-run in the focused batch below. No
decision is outstanding on this item; it is recorded here only as the history of
the integration edit. The file is not re-authored by the correction packet.

## Review corrections applied (28 October, second pass)

Two independent reviews — of the adapter root and of the SQL — produced five
actionable corrections. All five are implemented and each is covered by a test
that was confirmed to FAIL against the uncorrected code and pass against the
corrected code.

**1. Strict RPC envelope and a scoped stop.** `call` now accepts a reply only
when it is an object, carries no error and carries an explicitly present
payload. A missing `data` key, an `undefined` payload or a non-object envelope
is UNREADABLE and throws `WeeklyTestWindowUnavailableError`; only an explicit
SQL `null` still means "this project has no policy". `revokeWeeklyTestWindow`
now runs the same owner/project identity check the read runs, so a positive
answer about a different scope can never be accepted as this scope's stop.

**2. Monotonic cutoff, not an absolute local clock.** The final guard previously
checked only that the server's `remainingMs` was positive and then trusted
`Date.now()`. Reproduced defect: a local deadline 2,000ms away, a positive
database acknowledgement reporting 100ms remaining, and a 202ms delayed reply —
`beforeDispatch` resolved, because the local clock trailed the database. The
guard now also maintains a conservative MONOTONIC bound (see the section below)
and re-arms the real cancellation timer to the earliest valid bound, so an
in-flight abort no longer depends on the two clocks agreeing. The absolute local
deadline is retained as an additional conservative check. The monotonic source
is injectable for deterministic tests and defaults to real `performance.now()`.

**3. Image signal assertion moved outside the product catch.** The new image
signal-forwarding case asserted inside the `fetch` mock while the surrounding
test accepted any rejection; the adapter's own try/catch swallowed assertion
failures, so the case could pass without proving anything. The observed signal
and its aborted state are now captured in the callback and asserted at test
level after the rejection. No provider code was changed: no functional defect
was shown, only a test that could not fail.

**4. Slot-array shape is validated, not just its length.** `array_length(p_slots,1)=2`
accepted a 2x2 `timestamptz[]`, which `FOREACH` then FLATTENED into four
authorized slot rows (confirmed on the full migration chain in isolated PGlite:
the RPC returned four slots instead of two; the separate six-allowance and
USD 2.20 lifetime monetary ceiling remained enforced).
`register_weekly_test_window` now requires exactly one dimension, lower bound 1,
upper bound 2, cardinality 2 and two explicitly non-null, distinct entries. The
explicit NULL tests matter because an out-of-shape subscript yields NULL rather
than an error, which would make `p_slots[1]=p_slots[2]` NULL and skip the
distinctness test entirely.

**5. The lease gate is re-evaluated after the lock.** `claim_auto_scheduler_lease`
gated the window BEFORE the blocking `INSERT` / `SELECT … FOR UPDATE` of
`auto_scheduler_leases`. The existing release RPC can hold that lease row
without holding `workspace_meta`, so a pre-T1 claim could wait until after T1 or
until a committed revoke and then still issue a fresh active token. The
authoritative policy and a fresh server clock are now read AGAIN once the lease
lock is held and immediately before any token is created or returned (see the
section below).

## Still required before any activation

1. Independent review of the exact SQL and source, plus required CI on an
   unloaded runner.
2. Host-PostgreSQL concurrency proof of the documented lock order (open item
   above), under the existing explicit local-acceptance configuration only.
   This now explicitly includes the cross-session case behind correction 5: a
   claim that genuinely BLOCKS on `auto_scheduler_leases … FOR UPDATE` held by
   another session until after T1 or a committed revoke must be refused and
   must leave the pre-existing lease row untouched. The separate real-PG
   harness owner holds that proof; this packet proves only the re-read ordering.
3. Deployment evidence: exact deployed runtime and SQL identity; fresh account
   entitlement and image quota (`assertImageGenerationAllowed` is still enforced
   and is **not** bypassed by any money grant); the two real future slot instants
   in UTC and Europe/Stockholm; owner/project and scheduler revision/
   configuration; T0/T1 in both zones; the no-publication/no-mail settings
   verified for the fixture (owner digest disabled, no eligible team recipient or
   scope); monthly budget availability; and the lifetime policy row.
4. Validation of the current native provider contract before accepting USD 2.20
   as the reservation envelope. Any free-account manual grant must be explicit
   and narrowly recorded; a grant bypasses neither result quotas nor the image
   entitlement.
5. The USD 50 global monthly ceiling, the manual-budget prerequisite for free
   accounts and the existing cron jobs stay unchanged. Weekly cron 189 and
   monthly cron 115 are not the stop mechanism; `revoke_weekly_test_window` and
   T1 expiry are, and both work with the operator's computer offline.
