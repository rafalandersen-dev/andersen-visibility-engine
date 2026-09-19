# Milo conversation NOWAIT-contention repair — 20 September 2026 (Claude)

Branch `codex/milo-conversation-lock-repair-20260920` at `main` `b441`. Bounded repair
of the failed live acceptance recorded in
`evidence/conversation-diagnostics-release-2026-09-20.md` (Codex's authoritative
release/failure record, left unchanged). Controls remain OFF; no replay, no forced
recovery, no budget change, no dispatcher activation. Claude owns implementation/tests/
docs; Codex runs checks. Read/Edit/Write/Glob/Grep only, scoped worktree; no Bash/git/
live SQL/deploy/provider/network. USD50-global and manual-free AI controls untouched.

## Authoritative failure — facts vs hypothesis (from the release record)

FACTS (captured diagnostic + stored row):
- One acquired owner turn (`647e0828…`) ran project brief, reached the plan model
  (`analysing`), and recorded a **terminal** diagnostic at `handoff_save` with SQLSTATE
  **55P03** — a `FOR SHARE/UPDATE NOWAIT` refusal. The diagnostic captures the ORIGINAL
  failure only.
- The turn row stayed **RUNNING** (lease `22:11:38`). This proves the authoritative
  outcome write did NOT persist; it does NOT prove WHY — the diagnostic records the
  original handoff error, not the outcome-write error.

HYPOTHESIS (NOT proven): the catch's outcome write failed to the SAME transient
contention (plausible — it is the same `advance` on the same rows moments later — but no
outcome-write error was captured). The identity of the contending transaction is also
unproven.

NEW production trace (release doc, appended 22:12): a NORMAL `read_milo_conversation`
failed with 55P03 on the explicit `workspace_meta … FOR SHARE NOWAIT`
(`20260913120000…` L52) shortly after a lease expiry; a `pg_locks` sample showed the
conflicting writer held its lock for age **0.000794 s** — a sub-millisecond transient
writer, NOT a long-stuck lock. This backs the `workspace_meta`-read relation
specifically: the owner's live-view read can be spuriously refused by a brief concurrent
workspace write (e.g. an autosave), leaving the UI unable to read.

## NOWAIT paths investigated (`supabase/migrations/20260913120000_milo_conversations.sql`)

Every executor RPC calls `assert_milo_conversation_access`, which takes
`workspace_meta … FOR SHARE NOWAIT` (L52) and, for a collaborator,
`project_team_members … FOR SHARE NOWAIT` (L59). Then:
- `advance_milo_conversation_turn` — `milo_conversations … FOR UPDATE NOWAIT` (L168)
  and `milo_conversation_turns … FOR UPDATE NOWAIT` (L170), BEFORE the event append
  UPDATE (L175).
- `read_milo_conversation` — `milo_conversations … FOR SHARE NOWAIT` (L122).
- `check_milo_conversation_execution` — `FOR SHARE NOWAIT` on the conversation (L208)
  and turn (L212).
- `claim_milo_conversation_turn` — `FOR UPDATE NOWAIT` (L150/L152), before its UPDATE.

`teamCall` (`project-team-membership.server.ts:33`) maps **exactly** error `code
'55P03'` to `TeamAdmissionBusyError` via `assertTeamAdmission`
(`project-team-admission.ts:9`); a lease/expected/authorization refusal
(`milo_conversation_conflict` / `milo_conversation_unavailable`) becomes a generic
error. So in the executor a `TeamAdmissionBusyError` is ONLY a 55P03 NOWAIT refusal.

### What is structurally supported

Every executor NOWAIT lock (workspace_meta / project_team_members FOR SHARE in
`assert_milo_conversation_access`; the conversation/turn FOR UPDATE/SHARE in
advance/read/check/claim) is acquired BEFORE any row is written, so a 55P03 from any of
them is a clean rollback — nothing committed. That property (NOT the contender's
identity, NOT the outcome-write cause) is what the repair relies on: a clean-rollback
55P03 is safe to retry with the identical batch.

No `psql`/`postgres` is on PATH in this environment, and PGlite is single-connection, so
no genuine two-connection lock race was reproduced here; the tests inject the 55P03
class deterministically. No real multi-connection concurrency is claimed.

## Repair — bounded, idempotent contention retry (application level; no SQL change)

`src/lib/milo-specialist-executor.server.ts`: a `persistWithRetry` helper wraps the
executor's CLEAN-ROLLBACK persistence/verification RPCs — the checkpoint `advance`
(`save`), the liveness `assert` (`assertLive`), and the continuity `read`. It retries
ONLY on `TeamAdmissionBusyError` (== 55P03), up to `MILO_CONTENTION_ATTEMPTS = 4` total
attempts with a short bounded backoff (20/40/60 ms). Rationale and guarantees:

- **Known rollback ⇒ safe.** 55P03 is raised by a NOWAIT lock before any write, so the
  failed RPC committed nothing; re-issuing the SAME call (same `expected` event count,
  same `attemptId` lease, same events) is idempotent. It **never repeats a model or
  tool** — only `advance`/`assert`/`read` are wrapped; `deps.model`, `deps.tool` and
  the pre-`try` `claim` are not.
- **Never masks a real refusal.** Any non-55P03 error — a lost lease / stale expected
  count / revoked membership (`milo_conversation_conflict`/`_unavailable`), a timeout,
  or a hostile thrown value (guarded `instanceof`) — is rethrown on its FIRST
  occurrence. Authorization/revocation, the attempt lease, lock order and durable
  idempotency are unchanged.
- **Abort-aware; no late resume.** In-run retries take the execution `AbortSignal`: once
  the deadline aborts, no new attempt starts and a pending backoff is cancelled, so an
  abandoned retry can NEVER wake after the deadline and launch another advance/model/
  tool (the same late-stage invariant the per-stage `wait()` race already enforces). A
  first attempt already in flight is left to settle but is never retried. `expected` and
  the event batch are frozen per `save`, so a retry re-issues the IDENTICAL logical
  checkpoint.
- **Terminal cleanup is separately bounded and permitted after the deadline.** The
  catch's outcome write passes `afterDeadline` (NO signal guard) so it can still persist
  the honest `execution_unknown`/`unavailable` outcome even once the deadline aborted —
  a signal guard must never prevent recording the failure — while staying bounded by the
  same 4-attempt budget. IF the incident's outcome write failed to a transient 55P03
  (the hypothesis above), this is what now lets it commit instead of leaving the turn
  RUNNING; it is a real code path regardless of whether that was the exact cause.

### Owner live-view read reliability (`src/lib/milo-conversation.server.ts`)

The executor-only retries do NOT help the owner's browser read (`readConversation`),
which is the path the new 22:12 trace shows failing on `workspace_meta FOR SHARE
NOWAIT`. So `readConversation` now wraps its RAW rpc with `retryReadContention` (bounded
`MILO_READ_CONTENTION_ATTEMPTS = 4`, short backoff) applied INSIDE `admittedReadRpc`.
Because the retry sits inside the single admission, it re-issues only the storage read
and acquires NO extra preview lease (no admission-budget leak); each attempt re-runs
`read_milo_conversation` → `assert_milo_conversation_access`, rechecking membership/
scope. It retries ONLY a returned 55P03 result for `read_milo_conversation`; a non-55P03
result, a success, or a THROWN transport failure returns/propagates on the first
occurrence. No mutating UI action (begin/cancel/resume) is retried or changed.

### Expense reservation / reconciliation (inspected; no refund, no zero-cost claim)

The `handoff_save` failure occurs AFTER the plan model call, so a reservation may have
been made for that one model call (the release record shows reserved USD2.50→3.00,
spent 0, and explicitly does not prove cost zero). The retry touches ONLY persistence:
it never re-dispatches the model, makes no new reservation, and issues no refund or
zero-cost claim. A retried `advance` re-runs no provider work, so the single
plan-model reservation/reconciliation is unaffected. Recovering the already-stuck
incident turn stays with established lease-expiry semantics only.

### Why no SQL migration

The released RPCs are correct and idempotent-on-rollback; the minimal reliable repair
is a bounded client retry that also re-validates membership/lease/scope on each fresh
attempt. A SQL `lock_timeout` alternative (replace the released RPCs via a NEW additive
`20260920` migration so a brief overlap waits instead of failing) was considered and
**deferred**: it needs a new migration and cannot be validated for a genuine
two-connection lock race in single-connection PGlite, and the app retry already
re-checks authorization each attempt. Left to Codex if a future real-concurrency test
shows the app retry insufficient. Migration `20260919160000` stays APPLIED/IMMUTABLE
and is not touched.

## Regressions (fault-injection; PGlite is single-connection)

Meaningful but injected: PGlite cannot reproduce a genuine two-connection
`pg_try_advisory_xact_lock`/row-lock race, so contention is injected as
`TeamAdmissionBusyError` (== 55P03) at the exact incident checkpoints.

- `src/lib/milo-specialist-executor.server.test.ts` — a bounded-retry group: a
  transiently-contended `handoff_save` advance is retried to a commit and the turn
  COMPLETES with no repeated model/tool; a sustained contention gives up after exactly
  `MILO_CONTENTION_ATTEMPTS` and ends `unknown` at `handoff_save` (terminal receipt),
  still no repeated work; a non-contention advance failure is NOT retried (single
  attempt), preserving lease/authorization refusals; a transiently-contended OUTCOME
  write is retried so a failed turn is not left running; and — the abort-awareness proof
  (fake clock) — when the deadline fires DURING a 55P03 backoff, the abandoned retry
  launches NO second advance (handoff attempted exactly once), only the bounded terminal
  cleanup persists, and no model/tool is repeated. The existing diagnostic-capture tests
  (`assert_live`, `continuity_read`, first checkpoint `brief_start`, nested proposal
  status) were updated to inject SUSTAINED contention, since a single transient refusal
  is now correctly recovered.
- `src/lib/milo-specialist-executor-live.server.test.ts` — end-to-end: the retry drives
  the REAL `advance_milo_conversation_turn` RPC to a genuinely committed handoff
  checkpoint after transient injected contention (model dispatched only twice); the
  owner's live-view `readConversation` recovers a transient 55P03 with EXACTLY ONE
  preview lease acquired (no budget leak), bounds a sustained 55P03 to
  `MILO_READ_CONTENTION_ATTEMPTS` before surfacing `TeamAdmissionBusyError` (still one
  lease), and does NOT retry a non-55P03 (40001) read failure; the pre-brief and
  preliminary→terminal live cases now inject sustained contention.

## Prepared checks — UNRUN (Codex runs)

No shell/test/build/type command was run here. Prior test counts belong to earlier
stages and do NOT apply. Approved `node_modules/.bin/...` executables, individually:

- Changed behaviour:
  `node_modules/.bin/vitest run src/lib/milo-specialist-executor.server.test.ts src/lib/milo-specialist-executor-live.server.test.ts`
- Unchanged behaviour must hold:
  `node_modules/.bin/vitest run src/lib/milo-conversation.server.test.ts src/lib/milo-conversation-diagnostics.server.test.ts src/lib/milo-conversation-diagnostics-migration.test.ts src/lib/milo-specialist-tools.server.test.ts`
- `node_modules/.bin/tsc --noEmit`
- `node_modules/.bin/eslint src/lib/milo-conversation.server.ts src/lib/milo-specialist-executor.server.ts src/lib/milo-specialist-executor.server.test.ts src/lib/milo-specialist-executor-live.server.test.ts`
- `node_modules/.bin/prettier --check` on the four changed files
- Full suite `node_modules/.bin/vitest run` and production `node_modules/.bin/vite build`

## Files (this packet)

- `src/lib/milo-specialist-executor.server.ts` — `MILO_CONTENTION_ATTEMPTS`,
  `isContention`, `contentionBackoff`, abort-aware `persistWithRetry`; wraps
  `advance`/`assert`/`read` only; frozen `expected`; `afterDeadline` terminal cleanup.
- `src/lib/milo-conversation.server.ts` — `MILO_READ_CONTENTION_ATTEMPTS`,
  `retryReadContention`; the browser `readConversation` retries a transient read 55P03
  inside the preview admission (no extra lease). Executor read and mutating RPCs
  unchanged.
- `src/lib/milo-specialist-executor.server.test.ts` — bounded-retry + abort-awareness
  regressions; sustained-contention updates to the diagnostic-capture tests.
- `src/lib/milo-specialist-executor-live.server.test.ts` — real-RPC committed-checkpoint
  retry proof; owner live-view read no-leak/bounded/non-55P03 proofs;
  sustained-contention updates.
- `evidence/conversation-contention-repair-2026-09-20.md` — this packet.

## Scope / not done

Executor + the conversation server's browser read (permitted for the read fix) + their
tests + this evidence only. No P1/P2 files, no SQL migration, no candidate-chain/
inventory edits (Codex owns integration). No dispatcher activation, deployment,
provider/model/DB/network/git action, budget change, or replay of any turn. The stuck
incident turn recovers only through lease expiry.

## Codex independent review and executed checks — 20 September 2026

Reviewed the final abort-aware retry delta, browser read admission placement, deadline-backoff regression and injected-contention SQL round trip.108 focused tests/6 files PASS(2.01s), full6086 tests/379 files PASS(51.69s), TypeScript/scoped lint/Prettier/whitespace/production build PASS. Logs `/tmp/milo-lock-repair-final-{focused,types,lint,full,build}-20260920.log`. The PGlite path injects contention and verifies actual committed state; it does not reproduce multi-connection PostgreSQL locking.

Codex integration exception: comment-only corrections remove unsupported claims that a sampled writer was an autosave or that the terminal write had the same live SQLSTATE. No application logic authored by Codex. No migration/deployment/new AI turn, no old-turn replay or reservation refund. Production acceptance remains failed at the prior diagnostic release until a reviewed new release passes a bounded live check.
