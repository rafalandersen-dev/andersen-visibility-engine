# Milo conversation persistent checkpoint contention — audit + bounded repair (20 September 2026, Claude)

New branch `codex/milo-conversation-persistent-contention-20260920`, base merged `main`
`2e4d7268` (PR147 released; not reverted or repeated). Prior release/failure records
(`evidence/conversation-contention-release-2026-09-20.md`, Codex-authored, preserved;
and the earlier diagnostics release) were read. Controls stay OFF; no provider/CLI test,
no replay/refund/forced mutation. Claude implements/tests/documents; Codex runs checks
and releases. Scoped Read/Edit/Write/Glob/Grep only; auto-memory off. USD50 global and
manual-free controls unchanged. Main goal: a SUCCESSFUL real conversation, not more
diagnostics. **All SQL here is UNAPPLIED and all checks below are UNRUN.**

## Regression found in review and corrected (this round)

The first draft of the candidate migration redefined `claim_milo_conversation_turn` by
copying the OLD body from `20260913120000_milo_conversations.sql`, which silently DROPPED
the latest released behaviour introduced by `20260913160000_milo_conversation_dispatch.sql`
(L118–140): the `enabled` dispatch-control gate, the `dispatch_until` release window, the
`pg_try_advisory_xact_lock('milo-execution-capacity',0)` admission and the global-8 /
actor-2 running-turn concurrency gates. That is now fixed: `claim` is rebuilt from its
LATEST released body (20260913160000) with every gate preserved verbatim, changing ONLY
the executor assert call, the two row locks (NOWAIT → blocking) and the bounded
`lock_timeout`. `advance` and `check_milo_conversation_execution` were never redefined
after `20260913120000`, so their copies are current; `assert_milo_conversation_access`
likewise. The redefined functions are now validated against their FINAL bodies (see
Tests). The earlier "14 focused / 2 files pass, types+lint pass" run was on the FLAWED
packet whose tests did not apply the dispatch prerequisite and so never exercised those
gates — it was NOT release clearance.

## The incident (from the preserved release record)

One owner UI question. Persisted events: project_brief tool_started/tool_result,
analysing, handoff, execution_unknown; terminal state UNKNOWN persisted (my PR147
abort-aware retry + terminal cleanup worked — handoff and the outcome write committed).
The diagnostic recorded stage `reply_model` with **SQLSTATE 55P03** (operation
`7421dd17…`) and no `responding` event was written. That absence is CONSISTENT WITH a
pre-model status-checkpoint failure, but the diagnostic does not pinpoint the exact
substage and does not prove the client retries were "exhausted" versus mis-timed. No
lock-holder identity was captured.

## Audit — actual RPC/SQL lock order (evidence, from released SQL)

Every executor checkpoint RPC (`claim` / `advance` / `check_milo_conversation_execution`)
calls `assert_milo_conversation_access` (`20260913120000`), whose lock order is:
`workspace_meta … FOR SHARE NOWAIT` (L52) → `assert_project_team_account`
(`auth.users FOR SHARE NOWAIT`) → (collaborator) `project_team_members FOR SHARE NOWAIT`
(L59) → then the write RPCs take `milo_conversations` + `milo_conversation_turns`
`FOR UPDATE NOWAIT`, and `check` takes both `FOR SHARE NOWAIT`. (The `claim` body itself
is the 20260913160000 version.)

Confirmed conflicting holders (grep of applied migrations):
- **`workspace_meta` FOR UPDATE** is held for the duration of many OWNER workspace
  writes: `save_project_team_edit` (`20260911050000` `UPDATE workspace_meta SET rev=rev+1`),
  the generic workspace save (`20260726120000`), content-write triggers that bump `rev`
  (`20260910180000`, `20260911105000`), approval/knowledge/technical paths. Any of these
  mid-flight makes the executor's `workspace_meta FOR SHARE NOWAIT` fail 55P03 INSTANTLY.
- **`milo_conversations` FOR SHARE** is held by the owner's own live-view poll
  (`read_milo_conversation`), which conflicts with the write RPCs' `FOR UPDATE`.

`teamCall` maps exactly `55P03` → `TeamAdmissionBusyError`; everything else is a generic
error. So the checkpoint's NOWAIT fails the instant a conflicting holder exists.

### Why the NOWAIT checkpoint cannot complete (root cause)

A `NOWAIT` request does not wait AT ALL: it fails immediately if any conflicting lock is
held by ANOTHER transaction. Client-side NOWAIT-polling can only succeed if an attempt
lands in a gap between holders; a short burst of owner workspace writes (or continuous
live-view polling) can keep a conflicting lock present across the whole retry window, so
all retries fail — yet a later attempt (e.g. the terminal write, after the burst)
succeeds. This is consistent with the incident's asymmetry (handoff + terminal committed;
the reply_model checkpoint did not). The correct mechanism to wait out a lock held by
another transaction is a BOUNDED server-side lock wait, not client NOWAIT retries.

### Evidence vs hypothesis (explicit)

- **Evidence (structural, from released SQL):** the executor checkpoint acquires
  `workspace_meta FOR SHARE NOWAIT`; owner workspace writes acquire `workspace_meta
  FOR UPDATE`; the live-view read acquires the conversation row `FOR SHARE`; these
  conflict with the checkpoint's NOWAIT locks, which fail instantly.
- **Hypothesis (NOT proven):** the specific transaction holding the conflicting lock
  during the `reply_model` checkpoint (an owner autosave/content write on `workspace_meta`,
  and/or the owner's live-view poll on the conversation row); and the precise substage /
  whether retries were "exhausted". No lock-holder was captured. The repair does not
  depend on identifying it — it addresses the confirmed mechanism (instant NOWAIT
  failure) for any brief conflicting holder.

## Fix — executor-only bounded lock wait (new additive migration `20260920180000`)

`supabase/migrations/20260920180000_milo_conversation_checkpoint_lock_wait.sql`
(candidate; existing applied SQL is immutable and untouched; `165000`/`170000` remain
pending so `180000` is the next free slot):

- New `assert_milo_conversation_execution` — identical checks to
  `assert_milo_conversation_access`, but `workspace_meta` and `project_team_members` use
  blocking `FOR SHARE` (no NOWAIT). Internal helper, granted to no client role.
- `claim` (rebuilt from `20260913160000`, all dispatch/concurrency gates preserved) /
  `advance` / `check_milo_conversation_execution` (from `20260913120000`) are redefined
  (`CREATE OR REPLACE`, unchanged signatures) to call the new assert, take the
  conversation/turn rows `FOR UPDATE`/`FOR SHARE` (no NOWAIT), and run under a bounded
  `SET lock_timeout='1500ms'`.

Net: a checkpoint now WAITS for a transient autosave/live-view holder to release, then
proceeds — instead of failing instantly. This is the minimal correct mechanism (not "more
retries"): it fixes the root cause that NOWAIT cannot wait out another transaction's brief
lock.

### Bounded total time (corrected — `lock_timeout` is PER lock, not a whole-RPC budget)

`lock_timeout` bounds EACH lock acquisition, and an RPC makes several sequential blocking
acquisitions: `workspace_meta`, [`project_team_members` for a collaborator], the
conversation row, the turn row (`auth.users` stays NOWAIT via the unchanged
`assert_project_team_account`). The worst case is the SUM — at most 4 blocking waits for a
collaborator (3 for an owner). At `1500ms` that is ~6 s worst case, kept under the 10 s
per-RPC `teamCall` timeout and the terminal-cleanup budget with margin (the value was
chosen so 4 × timeout < 10 s). The realistic case is a single contended lock (≤~1.5 s):
Postgres grants a queued request as soon as the current holder commits, and new requests
queue behind it, so a brief holder is waited out rather than failing instantly. If a lock
is genuinely held past the timeout the statement still raises 55P03 and the UNCHANGED
bounded, abort-aware client retry (PR147) is the secondary net — no retry count increased.
There is no unbounded wait: `lock_timeout` (per lock) and the summed worst case (< 10 s)
are the two explicit bounds; the 5-minute lease and the executor per-stage deadline bound
the turn overall.

### Deadlock (accurate, not overclaimed)

Converting NOWAIT → blocking introduces the POSSIBILITY of lock waits that NOWAIT
precluded. The account-first lock ORDER is preserved (workspace_meta → auth.users →
project_team_members → conversation → turn), consistent with every other function, which
avoids the obvious ordered-lock cycles; and `lock_timeout` (plus Postgres deadlock
detection) BOUNDS and BREAKS any residual/cross-subsystem cycle with a 55P03 rather than
an unbounded hang. This is a bounded, self-breaking guarantee — it is NOT a proof of
deadlock-freedom, and I do not claim one from lock ordering alone.

### Preserved invariants

- **Dispatch/concurrency gates:** the claim's `enabled` control, `dispatch_until` window,
  `pg_try_advisory_xact_lock` admission and global-8 / actor-2 concurrency checks are
  byte-for-byte from `20260913160000` (only the assert/lock-wait changed).
- **Authorization/revocation:** identical predicates and `milo_conversation_unavailable`
  raise; `auth.users` account checks stay fail-fast via the unchanged
  `assert_project_team_account`.
- **Lease / expected-count / idempotency:** advance's attempt-token, running-state,
  lease-expiry and `expected` event-count guards are unchanged. No model/tool/claim work
  is added or replayed; no budget change/refund.
- **Browser path untouched:** `read`/`list`/`begin`/`cancel`/`resume`/`enqueue` and
  `assert_milo_conversation_access` keep NOWAIT/fail-fast, so the PR147 browser
  read-retry and read deadline are unaffected. No application code changed.

## Tests (real SQL path; injected vs real concurrency stated)

- `src/lib/milo-conversation-checkpoint-lock-wait-migration.test.ts` (new, PGlite):
  applies the ACTUAL released prerequisite chain — project-team reads (`20260911020000`),
  conversations (`20260913120000`) AND the dispatch migration (`20260913160000`) with the
  net/vault/cron stubs — then `180000`, so `claim` is exercised against its LATEST body.
  It proves, on the real redefined RPCs: (a) a bounded `lock_timeout` is set on all three
  RPCs and the executor assert, with `4 × timeout < 10 s` (`pg_proc.proconfig`); (b) the
  `enabled` control gate (OFF → not acquired); (c) the dispatch window gate — it first
  asserts the PRECONDITION that `begin` arms a window (the `dispatch_until` column default)
  even while the control is OFF, so the disabled-control refusal is the `enabled` gate, then
  denies claim for an explicitly-NULLed window and for an expired window; (d) the actor-2
  and global-8 concurrency gates still deny, seeded through the real `begin`/`claim` RPCs
  with valid owner/actor bindings (authentic conversation + turn rows with paired
  attempt_id/lease_until — not orphan inserts, which the `conversation_id` foreign key
  forbids) and re-opening a freed slot; (e) already-claimed → not re-acquired (no attempt
  replay); (f) stranger (authenticated non-member) / suspended account / revoked
  collaborator → `milo_conversation_unavailable`; (g) a valid claim → advance (with
  wrong-count and wrong-token conflicts) → check_execution persists and confirms; (h) a
  lapsed lease refuses a late advance/recheck; (i) the executor assert is ungranted and the
  three RPCs stay service_role-only.
  **Limitation, stated in the file:** PGlite is single-connection and cannot hold a
  conflicting lock in another session, so the bounded-WAIT-under-real-contention
  behaviour is NOT exercised here — it requires a multi-connection PostgreSQL and is not
  claimed proven.
- `src/lib/milo-dispatch-migration.test.ts`: `180000` is now applied after the dispatch
  migration in the harness `beforeAll`, so the ENTIRE dispatch/lifecycle suite (enabled
  control, dispatch window, advisory + global-8/actor-2 concurrency, enqueue caps,
  revocation/suspension/cross-actor refusal, lease expiry, advance conflict, check) runs
  against the FINAL redefined bodies — the strongest proof the restored gates are faithful
  and only the lock wait changed.
- `src/lib/milo-specialist-executor-live.server.test.ts`: `180000` is intentionally NOT
  applied here — its redefined claim carries the `20260913160000` dispatch gates
  (`milo_conversation_dispatch_control` / `dispatch_until`) that this suite does not apply,
  and the suite seeds turns directly and injects contention through the executor deps, so
  it validates executor/diagnostic behaviour independently of the dispatch chain. A note in
  the file records this. The redefined RPCs' real end-to-end conversation is covered by the
  dispatch harness above and the new checkpoint test. (Only an explanatory comment changed
  here; no behaviour changed.)
- `src/lib/milo-candidate-chain-migration.test.ts`: reconciled in this worktree (see
  Scope). Its search-path and closed-table assertions also now cover
  `assert_milo_conversation_execution` and the redefined RPCs.

## Prepared checks — UNRUN (Codex runs)

No shell/test/build/type command was run here. Approved `node_modules/.bin/...`
executables, individually:

- New/changed behaviour + definitions-under-test:
  `node_modules/.bin/vitest run src/lib/milo-conversation-checkpoint-lock-wait-migration.test.ts src/lib/milo-dispatch-migration.test.ts src/lib/milo-candidate-chain-migration.test.ts src/lib/milo-specialist-executor-live.server.test.ts`
- Unchanged behaviour must hold:
  `node_modules/.bin/vitest run src/lib/milo-conversation.server.test.ts src/lib/milo-specialist-executor.server.test.ts src/lib/milo-conversation-diagnostics.server.test.ts`
- `node_modules/.bin/tsc --noEmit`
- `node_modules/.bin/eslint` on the four changed test files
- `node_modules/.bin/prettier --check` on the changed test files and the new migration
- Full suite `node_modules/.bin/vitest run` and production `node_modules/.bin/vite build`

## Scope / not done / for Codex

- Files changed here: the new migration `20260920180000_…`; the new checkpoint lock-wait
  test; `180000` added to the dispatch harness; a clarifying note in the live-executor
  harness (deliberately NOT applying `180000`, no behaviour change); the candidate-chain
  inventory reconciled; and this evidence. No application/`.server.ts` change; all PR147
  abort/read-deadline fixes preserved.
- **Candidate-chain inventory:** a PROVISIONAL reconciliation is in
  `milo-candidate-chain-migration.test.ts` (diagnostics `20260919160000` moved to the
  released conversation packet; `20260920180000` as the sole candidate; grant matrix +
  single-overload guards for the three redefined RPCs and the internal
  `assert_milo_conversation_execution`). It reflects THIS worktree only. Main has since
  applied a `165000` artifact; per the current instruction the inventory is NOT
  re-integrated here — Codex reconciles it against main after this test result. Not
  changed again this round.

## Review status (Codex)

The prior Codex run on the flawed fixtures was 120 pass / 2 fail (TypeScript clean; lint
clean apart from 7 Prettier-only formatting notes). The two failures were fixture bugs in
the checkpoint lock-wait test — the "absent window" case (it assumed `begin`-while-disabled
left `dispatch_until` NULL, but `begin` arms the column-default window regardless) and the
global-8 case (orphan turn inserts violated the `conversation_id` foreign key). Both are
corrected above (explicit-NULL window with a precondition check; real `begin`/`claim`
seeding) and the file was reformatted. No application behaviour and no released SQL
changed. All checks below remain UNRUN here; Codex re-runs them.
- No production/provider access, no deployment, no dispatcher activation, no budget
  change/refund, no old-turn replay. Real multi-connection lock-wait behaviour is NOT
  validated in PGlite and is left for a multi-connection check / the next reviewed live
  acceptance. Tests are UNRUN until Codex.

## Codex verification after restored author access

Existing authorized Claude context completed correction successfully on20September; no account or spending-limit change. New focused123tests/7files PASS3.37s, typesPASS, twoPrettier wraps corrected as integration exception. The three RPC bodies were mechanically compared with latest released definitions and match apart from intended assert and NOWAIT removal. Normal merge of mainfaaa195f resolved only candidate inventory:160000/165000 released,20180000 remains candidate. Integrated49focused/3filesPASS2.21s,6196full/382filesPASS45.34s,types/scopedlint/buildPASS. Logs /tmp/milo-lock-resumed-*-20260920.log. No SQL applied, no production conversation success claimed; actual multi-connection wait behavior remains unverified.
