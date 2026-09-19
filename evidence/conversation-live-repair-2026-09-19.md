# Milo conversation live repair — 19 September 2026 (Claude)

Bounded conversation-executor repair under the 19 September working agreement
(Claude implements/tests/documents; Codex reviews, integrates `main`, runs the
prepared checks and releases). This isolated worktree started at the PR136 release `52261464`; the integrated
candidate now includes main through PR137 merge `465990cb`. No migrations were
reapplied, no dispatcher activation, and no provider / DB / network / browser /
email / deploy / git-mutation / credential / dependency / auto-memory operation
was performed in this stage. USD50-global and manual-free AI controls untouched.
This is not a production claim, and no full-repair acceptance is asserted: a new
live check is still owed after Codex runs the prepared checks below.

> **UPDATE — the live re-check FAILED again (a DIFFERENT, pre-brief incident).**
> The preview-lease split below was reviewed, integrated and deployed (PR143,
> released `main` `26b938c3`), and it still did not end-to-end repair the feature.
> Everything from here to "Codex integration verification" is now PRIOR-STAGE
> history: the reproduced preview-contention MECHANISM is validated, but it is
> **not** the confirmed cause of either incident and is not an end-to-end repair.
> The current stage adds bounded, service-only failure diagnostics so the next
> failure is inspectable, and makes **no** new root-cause claim. See
> "## Live re-check FAILED — new pre-brief incident and diagnostics packet
> (19 September, later)" at the end.

## Reported failure (observed stored trail, not a captured error log)

Owner, Safari Butelki project, one ordinary Polish question (difference between a
saved draft and a published article — no draft, no site checks, no publication
consent). Turn `642d004c-cbd1-470c-bd53-2613e1451f9d`, conversation
`084f4b06-9558-4aa5-8472-ff868b225547`, reported started 15:12:05 UTC, became
`unknown` 15:12:08. Stored events: `project_brief` tool_started; `project_brief`
tool_result completed (partial, clipped safe draft inventory); status
`execution_unknown`. No `analysing` event, no model expense reservation, global
and owner budgets unchanged. **No production error log for this turn existed**;
the analysis works from the stored event trail and the code paths, not a captured
provider/database exception.

## Root cause — reproduced contention MECHANISM, consistent with the trail

The reproduced mechanism is **admission contention on the browser preview-lease
budget**, and it is *consistent with* the reported stored trail; it is **not** a
confirmed historical cause of that specific turn (no production error was
recorded, so the exact runtime fault for `642d004c…` cannot be established from
here). The saved failure occurred in the post-brief / pre-model path. The bounded
fixtures below did not reproduce a serialization, catalog, prompt-build or event
validation fault; they do not exclude those causes for every possible input.

Every conversation RPC in `milo-conversation.server.ts` wrapped its storage call
with `admittedReadRpc(actor, rpc)` → `acquire_project_team_preview` (migration
`20260911020000_project_team_reads.sql`). That per-actor/owner budget exists to
bound *rendered browser previews*: it caps concurrent leases (2 for the actor
scope, 8 for the owner scope), enforces per-minute/hour rates, and takes a
non-blocking `pg_try_advisory_xact_lock` per acquire that refuses with
`team_preview_capacity` on contention.

The private, executor-only RPCs `claimConversationTurn`,
`assertConversationExecution`, and `advanceConversationTurn` drew on the **same**
budget, as did the executor's continuity `read` and `runSpecialistTool`'s project
snapshot read. A signed-in owner watching the turn's live progress polls the
private conversation read and export (`read_milo_conversation` /
`export_milo_conversation_page`, both via `admittedReadRpc`) on the owner 'actor'
scope — exactly the scope the executor's own checkpoint writes consume (actor ==
owner for an owner's own project). A budget refusal at the analysing checkpoint's
`advance` raises `team_preview_capacity` → `TeamAdmissionBusyError`. That is not
one of the classified provider/usage/budget holds, so `failure()` returns
`execution_unknown`; because the acquire fails *before* the `advance` RPC, no
`analysing` event is written and no model reservation is made. A transient
collision would then clear, so the catch's own `execution_unknown` `advance`
persists — the exact stored-event trail. The existing conversation/UI can and
does poll while a turn is visibly working, so this is not a hypothetical
interaction. The repair also covers pre-brief reads; their contention risk is not assumed
negligible or impossible.

The executor never needed the preview budget: its RPCs re-authorise the actor's
account, membership revision and durable claim inside storage on every call, and
the turn is already bounded by the dispatch enqueue limits and the running-turn
execution capacity gate (`20260913160000_milo_conversation_dispatch.sql`).
Sharing the browser preview budget only let live viewing starve the executor's
own reads and writes.

### Narrowing (empirical, bounded — does not clear all inputs)

- A worst-case owner `serializeSpecialistContext` fixture (5 KB clipped brief
  evidence, 12-turn Polish memory at cap, 8 KB user task) serialised to 19,266
  bytes, under the 56,000-byte shorten threshold, so *that fixture* never reaches
  the shorten path or its throw. This rules out **that fixture**; the size probe
  is not a proof over all realistic inputs.
- The full owner post-brief path (real DB, 40 Unicode-Polish drafts + 40
  opportunities, real `advance` with `progress.parse` + round-trip, real `claim`)
  completes deterministically single-threaded and reaches the `analysing`
  checkpoint and model normally. The large Polish fixture therefore rules out
  *that fixture* as the fault, not every input.
- The DB `advance_milo_conversation_turn` has no per-event content constraint;
  `analysing`/`responding` codes are accepted; the round-trip check is stable
  because `conversationEvent` parsing normalises key order.

## Fix — the trusted executor turn draws on no browser preview budget

The invariant is now complete: **no** step of a trusted executor turn draws on
the browser preview-lease budget, while every browser-facing read/list/export/
mutation keeps `admittedReadRpc` unchanged. No browser-controlled bypass flag was
added; the split is by distinct private functions whose only callers are the
executor/tool runner.

- `src/lib/milo-conversation.server.ts` — the three private executor RPCs
  `claimConversationTurn`, `assertConversationExecution`, `advanceConversationTurn`
  call `teamCall(..., rpc)` directly (prior accepted change, unchanged here). The
  continuity read is refactored into a shared, fully validated
  `readConversationPage` core with two entry points: browser `readConversation`
  (keeps `admittedReadRpc`) and a new private `readConversationForExecution`
  (preview-free, identical scope/ordinal/page/uniqueness validation). Browser
  `begin`/`read`/`list`/`cancel`/`resume` and the lifecycle export/erase keep
  `admittedReadRpc`.
- `src/lib/milo-specialist-executor.server.ts` — the production executor's
  continuity `read` is now `readConversationForExecution`; the interface documents
  the executor-only, preview-free contract. Browser reads still use
  `readConversation`.
- `src/lib/milo-specialist-tools.server.ts` — `runSpecialistTool` (verified to
  have exactly one non-test caller: the executor's production deps) reads its
  project/draft snapshot through the preview-lease-free `readTeamProject` instead
  of the browser-admitted `readAdmittedTeamProject`. `readTeamProject` still
  reauthorises membership, account and scope in one transaction. A stale
  site_crawl comment that attributed the liveness-recheck throttle to preview
  admission (no longer true after the checkpoint RPCs went preview-free) was
  corrected without changing the throttle. Browser project reads
  (`project-team.functions`) keep `readAdmittedTeamProject`.

All SQL authorization, membership-revision, lease-expiry, cancellation, running/
enqueue capacity, per-account/global AI budgets and provider checks are
preserved. No SQL migration was needed or written. The public error surface is
unchanged (sanitised `execution_unknown` / "outcome could not be confirmed"); no
diagnostics, logging, secrets or message content were added.

## Regressions (real executor + real SQL, synthetic model/provider only)

`src/lib/milo-specialist-executor-live.server.test.ts` runs the real executor
against a real PGlite database with the real conversation RPCs, real
`acquire_project_team_preview`, real `read_project_team_snapshot`, real
`project_brief`/`draft_seo_review` tools (40 Unicode-Polish drafts) and real
`advance`. Model/provider responses are synthetic.

1. **Saturated budget, nontrivial tool-using turn.** Two actor-scope preview
   leases are held before execution, filling the per-actor budget. The browser
   continuity read (`readConversation`) and export (`exportConversationPage`) are
   then hard-denied with `TeamAdmissionBusyError` (and are shown to call the
   admission gate), while the trusted executor completes a turn that runs the
   project brief, a real `draft_seo_review` tool read and a specialist reply. The
   test asserts the executor made **zero** `acquire_project_team_preview` calls,
   the turn completes with no `execution_unknown`, and the browser path *does*
   call the gate.
2. **Scope/expired/revoked refusal still stops dispatch.** With the executor path
   preview-free, a revoked (`active=false`) and then expired (`expires_at` past)
   collaborator membership still makes the SQL claim/continuity gate refuse before
   any model or tool dispatch; the model and tool spies are never called, no
   admission is attempted, and the turn stays `pending`. Removing the browser
   preview admission removed no authorization.
3. **Transient one-shot after the brief (retained).** A one-shot
   `team_preview_capacity` refusal is armed on the first preview acquisition after
   the brief's `tool_result` — the reported incident moment. Because the executor
   is fully preview-free, the one-shot is never consumed and the turn completes
   with its `analysing` checkpoint and reply retained.

Limitation (labelled in the test): PGlite is single-connection, so saturation and
a deterministic one-shot are a faithful proxy for a full/contended budget but
cannot reproduce a genuine concurrent `pg_try_advisory_xact_lock` race between two
live connections. Existing auth/membership fixtures and the released preview
migration are reused; `project-team-read-admission.server.test.ts` and
`project-team-membership-migration.test.ts` already cover the admission-gate and
capacity semantics referenced here.

## Independent before-fix confirmation (Codex)

Codex independently confirmed the pre-fix behaviour — the reproduced contention
persisting `execution_unknown` before the fix — in
`/tmp/milo-conversation-contention-before-20260919.log`. This stage does not
re-assert that before-state from a Claude-run command.

## Previous-stage results (superseded; not the new final)

The following were recorded in the PREVIOUS stage (claim/assert/advance-only
change) and are retained here only as prior context; they do **not** validate the
present delta (continuity read, tool snapshot read, and the new saturation/scope
regressions). They are not a new final result.

- Full unit suite then: **5948 passed | 3 skipped / 376 files**. The 3 skips were
  the neutralised scratch files (since moved out of the tree by Codex, see below).
- `tsc --noEmit`, focused vitest sets, ESLint, Prettier `--check`,
  `git diff --check`, and `vite build` all passed in that stage.

## Prepared checks for this delta (UNRUN in this stage; Codex to run)

No shell or test command was run in this stage. The changed packet's checks are
prepared for Codex to run after staging (the documented integration exception).
Approved executables only (`node_modules/.bin/...`), individually:

- `node_modules/.bin/vitest run src/lib/milo-specialist-executor-live.server.test.ts`
- Focused regression set (unchanged behaviour must hold):
  `node_modules/.bin/vitest run src/lib/milo-conversation.server.test.ts src/lib/milo-conversation-migration.test.ts src/lib/milo-specialist-executor.server.test.ts src/lib/milo-specialist-tools.server.test.ts src/lib/project-team-read-admission.server.test.ts src/lib/milo-conversation-lifecycle-migration.test.ts src/lib/milo-account-conversations-migration.test.ts src/lib/milo-dispatch-migration.test.ts src/lib/milo-draft-proposal-migration.test.ts`
- `node_modules/.bin/tsc --noEmit`
- `node_modules/.bin/eslint src/lib/milo-conversation.server.ts src/lib/milo-specialist-executor.server.ts src/lib/milo-specialist-tools.server.ts src/lib/milo-specialist-executor-live.server.test.ts`
- `node_modules/.bin/prettier --check` on the four changed source/test files
- Full suite `node_modules/.bin/vitest run` and production `node_modules/.bin/vite build`

## Files

- `src/lib/milo-conversation.server.ts` — shared validated read core;
  `readConversationForExecution` (preview-free); claim/assert/advance unchanged.
- `src/lib/milo-specialist-executor.server.ts` — production continuity read wired
  to the preview-free executor read.
- `src/lib/milo-specialist-tools.server.ts` — executor-only project snapshot read
  is preview-free; corrected site_crawl comment.
- `src/lib/milo-specialist-executor-live.server.test.ts` — saturation, scope/
  revoked/expired, and retained transient regressions.
- `product/LAUNCH_READINESS.md` — dated supersession note for the already-released
  knowledge-review candidate migration (documentation only; no SQL reapplied).

## Environment and limitations (accurate)

- Tests are unit/integration over PGlite with mocked runtime/model/transport;
  they prove function and DB-boundary behaviour, not live edge concurrency, real
  Supabase RPCs/grants, or a deployed turn. The dispatcher remains disabled.
- Sandbox note (corrected): in the PREVIOUS stage, tool-level read-only test
  commands were executed with a per-command sandbox-disable flag because the
  sandbox wrapper could not spawn; persistent sandbox settings were **not**
  changed, and other (non-read-only) commands were denied. This is not a standing
  precedent. In THIS stage no shell/test command was run and no
  disable/workaround was attempted; test execution for the delta is Codex-only.
  No secrets, raw log messages, request/response bodies or credentials are
  included anywhere in this packet, and no public production claim is made.
- Scratch files: three investigation scratch tests
  (`milo-live-repro.test.ts`, `milo-live-verify.test.ts`, `milo-size-probe.test.ts`)
  were moved out of the test tree by Codex to
  `/tmp/milo-chat-diagnostic-scratch-20260919` and are no longer present here.
  Only `milo-specialist-executor-live.server.test.ts` and the source changes above
  are intended for review.

## Codex integration verification — 19 September, 16:39 UTC

The source packet was reviewed independently and integrated with main `465990cb`
at `521b860b`. The private reader/tool entry points have no browser-facing caller;
browser read/export admission remains in place. Claude-authored regressions ran:
175 focused tests across 10 files passed, followed by 6034 tests across 377 files
in the integrated full suite. Type checking, scoped ESLint, whitespace checks
and production build passed. Logs are `/tmp/milo-chat-complete-{focused,types,full,build}-20260919.log`.

Codex integration exceptions: applied Prettier to one test formatting error,
corrected evidence wording that exceeded the bounded reproduction, reconciled
the applied-migration note with the actual temporary acceptance run, and ran
Claude-prepared checks because its permitted tool set excludes shell execution.
No new application logic was authored by Codex in this packet.

Production acceptance is still pending: no deployment, dispatcher activation,
new model call or replay of the old unknown turn was performed in this stage.

---

# Live re-check FAILED — new pre-brief incident and diagnostics packet (19 September, later)

Same 19 September working agreement (Claude implements/tests/documents; Codex
reviews, integrates `main`, runs the prepared checks, releases). This clean
worktree starts at released `main` `26b938c3`. No provider / DB / network /
browser / email / deploy / git-mutation / credential / dependency / auto-memory
operation was performed. USD50-global and manual-free AI controls, preview
separation, scope/access/claim/cancellation checks and the no-replay safeguards
are all untouched. The dispatcher/control loop and cron remain disabled. This is
not a production claim, and **no new root cause is asserted.**

## New failed production receipt (observed stored trail, no captured exception)

- Deployed build is exactly PR143 merge `26b938c3` (`modified=false`, source
  fingerprint `c6f366f2…f819d093a`), deployment `74ed7917-d05f-4071-846b-585024e03aee`,
  build `1789836365928`. Both external reviews were clean; 6034 tests / 377 files
  and the build passed before release.
- One owner UI question in Polish, no generation / site-check / publication
  permission. New conversation `dfba3bbe-022c-4ece-8449-3c83f7ae6068`, turn
  `47705f02-f9d1-402c-90c4-4e002873fb77`. Created `16:48:09.906099Z` →
  `unknown` `16:48:11.517729Z` (~1.6 s). Exactly **one** stored event,
  `execution_unknown`; **no `project_brief` start and no model checkpoint.** The
  old unknown turn `642d004c…` was **not** replayed.
- A browser refresh recovered an initial transient loading/access message and then
  allowed an ordinary send.
- **No production error log exists for this turn.** The analysis below is from the
  stored-event trail and the code paths, never a captured provider/database
  exception. This differs from the earlier `642d004c…` incident, which had a
  `project_brief` start and result BEFORE its failure; this one fails BEFORE the
  brief.

## Reproducible findings (verified by reading code + deterministic tests)

Stated separately from the hypotheses that follow. These are proven by the
regressions in this packet, not by live concurrency.

1. **The failure boundary is pre-brief.** The executor writes its first event only
   at `brief_start` (the `project_brief` `tool_started` advance). A throw in any of
   `assert_live` (`check_milo_conversation_execution`), `continuity_read`
   (`read_milo_conversation`), the local `continuity_check` invariant, or the
   `brief_start` advance itself ends the turn with exactly ONE `execution_unknown`
   event and no `project_brief` event — the exact shape of the new receipt. A
   deterministic regression injects a refusal at each of these points and
   reproduces that trail shape.
2. **Everything non-AI collapses to `execution_unknown` with zero diagnosis.**
   `failure()` classifies only the AI provider/usage/expense error types; every
   other throw — a DB/RPC error, the continuity invariant, a `TeamAdmissionBusyError`
   — becomes `execution_unknown` with no stage, class or code recorded anywhere.
   This is the concrete diagnosability defect this packet fixes.
3. **A NOWAIT row-lock refusal on a conversation RPC surfaces as
   `TeamAdmissionBusyError`.** `teamCall` → `assertTeamAdmission` raises it for
   SQLSTATE `55P03`. The executor is preview-lease-free (prior stage), so in the
   executor path a `TeamAdmissionBusyError` can only be a `milo_conversation*` row
   `FOR SHARE`/`FOR UPDATE NOWAIT` refusal, never a preview-budget refusal.
4. **The released SQL shares one row lock across live viewing and executor writes.**
   The owner's live-view `read_milo_conversation` takes `FOR SHARE NOWAIT` on the
   conversation row; the executor's `advance` (the `brief_start` write) takes
   `FOR UPDATE NOWAIT` on the SAME row; `assert`'s `check_…` takes `FOR SHARE
   NOWAIT` on the conversation row (and on `workspace_meta` / `project_team_members`).
   These lock modes conflict, so a concurrent overlap raises `55P03`. This is a
   property of the released schema; it is NOT evidence that it happened for this
   turn.

## Hypotheses (NOT claimed as the cause; no captured exception exists)

- **H1 — cross-connection NOWAIT contention on the conversation row.** A signed-in
  owner watching the turn polls `read_milo_conversation` (FOR SHARE NOWAIT) while
  the executor's `brief_start` advance takes FOR UPDATE NOWAIT on the same row; the
  collision raises `55P03` → `TeamAdmissionBusyError` → pre-brief `execution_unknown`
  (finding 1/3/4). It would also explain the browser's transient access message
  clearing on refresh (the browser read losing the same NOWAIT race, then
  succeeding). This is coherent and code-grounded but **unproven**: PGlite is
  single-connection and cannot reproduce a genuine two-connection lock race, and
  no production exception was captured. The prior preview-lease fix does not
  address this DB-level row-lock path, which is why "the mechanism is validated but
  the repair is not end-to-end."
- **H2 — a non-lock transient DB error (serialization/deadlock/cancel) or another
  pre-brief fault.** Also consistent with the trail; also unproven.

The honest position is that the exact runtime fault for `47705f02…` cannot be
established from here. Rather than deploy a guessed fix that would mask the next
failure, this packet makes the next failure inspectable.

## Fix — bounded, service-only failure diagnostics (no guessed behavioural change)

No dispatch, retry, admission, lock or user-facing behaviour is changed. The
executor now tracks its current execution STAGE (a fixed enum) and, on any
failure, records ONE service-only receipt with a SAFE error class correlated to
the turn and, where one exists, the operation id. There is deliberately no
speculative retry: the point is to confirm the boundary/mechanism on the next real
failure first (a safe read-only/pre-dispatch retry, if later justified, would be a
separate, evidence-backed step).

- `src/lib/milo-conversation-diagnostics.server.ts` (new) —
  `classifyConversationFailure(error, stage)` reuses the allowlist-only
  `classifyAiError` for the class / name category / validated HTTP status, and
  derives the SQLSTATE structurally: a `TeamAdmissionBusyError` in the executor
  path is recorded as `55P03`, everything else as `null`. It is **fail-closed**:
  the busy-error check goes through a guarded `isAdmissionBusy` (a bare
  `instanceof` invokes a hostile `Proxy`'s `getPrototypeOf` trap, which would
  throw), and the whole body is wrapped so any unexpected fault still returns the
  safest diagnosis at the recorded stage. Because it runs FIRST in the executor's
  catch, this guarantees a thrown value can never suppress the outcome write or the
  diagnostic; the genuine `55P03` positive case is unchanged.
  `recordConversationDiagnostic(...)` is a best-effort, service-only writer that
  uuid-validates the correlation ids, calls the service-role RPC through the raw
  team RPC (never `teamCall`), and swallows every failure. It NEVER throws out of
  the executor, is NEVER retried, and NEVER changes or suppresses the honest
  user-facing unknown/failed state.
- `src/lib/milo-specialist-executor.server.ts` — a `stage`/`stageOperation` tracker
  is set at each step; on failure the catch classifies at the ORIGINAL stage,
  writes the authoritative outcome first, then records the diagnostic best-effort,
  then (only if the outcome write itself was refused) re-throws the unchanged
  "outcome could not be confirmed" error. `failure()` (which also runs before the
  outcome write and also uses `instanceof`) is likewise fail-closed, so a hostile
  thrown value cannot turn the catch into a throw and skip the honest
  `execution_unknown` write. A new optional `diagnostic` dep wires
  `recordConversationDiagnostic` in production and is omitted by partial test deps.
- What is captured: stage ∈ {assert_live, continuity_read, continuity_check,
  brief_start, brief_dispatch, brief_result, plan_model, plan_parse, handoff_save,
  tool_start, tool_dispatch, tool_result, reply_model, reply_save, unknown};
  a fixed error class and name category; a validated HTTP status (400–599 or null);
  an allowlisted SQLSTATE (only `55P03` is emitted today); the outcome state/code;
  and the turn / operation ids. **Never** a message body, prompt, token, credential,
  raw exception text/stack/URL or provider payload.

### Safety, isolation, retention (candidate migration — NOT applied)

`supabase/migrations/20260919160000_milo_conversation_diagnostics.sql` is a
**candidate only**. It is not part of the applied release set and none of the eight
already-applied migrations are modified or reapplied. Codex applies this one during
integration; **until it is applied the guarded write simply no-ops**, so the
executor is safe either way — and the diagnostics only become inspectable once it
is applied (that is the step that makes the next failure inspectable).

- Table `public.milo_conversation_diagnostics`: opaque `turn_id` (FK →
  `milo_conversation_turns` `ON DELETE CASCADE`, and **UNIQUE** — at most one
  receipt per turn), optional `operation_id`, and CHECK-constrained `stage` /
  `outcome` / `outcome_code` / `error_class` / `name_category` enums, a
  `400–599`-or-null `http_status`, and an allowlisted
  (`55P03`/`40001`/`40P01`/`57014`)-or-null `sql_state`. No owner/actor/project
  identity and no content — every column is safe to read.
- Isolation/grants: RLS enabled with no policy; `REVOKE ALL` from
  PUBLIC/anon/authenticated/service_role; `GRANT SELECT` to `service_role` for
  inspection via the admin DB connector; writes go only through the SECURITY
  DEFINER `record_milo_conversation_diagnostic` (service-role EXECUTE), which is a
  silent no-op for a missing turn so diagnostics never raise a new error path back
  to the executor. The writer is first-receipt-wins (`ON CONFLICT (turn_id) DO
  NOTHING`), so a duplicate or racing write can never overwrite the original
  failure's stage/time.
- Retention/deletion: erasing a conversation/turn cascades to its diagnostics
  immediately; `prune_milo_conversation_diagnostics(before, limit)` (service-role)
  removes at most `limit` (default 5000) of the oldest expired receipts, so a
  single sweep is a bounded batch, never an unbounded delete. It is now actually
  wired: an ACTIVE daily pg_cron job `milo-conversation-diagnostics-prune` (using
  the same convention as the released dispatch migration, but ACTIVE on apply)
  calls it once a day and keeps running even while the conversation dispatcher is
  disabled. Precise cadence: a receipt older than 30 days is removed by the daily
  sweep, subject to the 5000-row batch limit. A backlog can extend retention across
  further sweeps; there is no hard 31-day maximum. This is a daily 30-day
  sweep, not a strict wall-clock cut-off. No existing job/control is altered and no
  owner permission is needed for this internal, in-scope retention.

Tradeoff (smallest reliable inspectable option): the prime, evidence-indicated
suspect (`55P03`) is captured via `TeamAdmissionBusyError` with **no** change to
the shared `teamCall`. Other transient SQLSTATEs (`40001`/`40P01`/`57014`) are
collapsed by `teamCall` into a generic error and are recorded as `sql_state=null`
(the STAGE and name category are still captured). If the next inspected failure is
pre-brief with `sql_state=null`, the follow-up is a small, well-scoped `teamCall`
enhancement to preserve those codes — no schema change needed (the allowlist and
column already permit them). A service-only receipt was chosen over server logs
because logs are not inspectable through the current tools; the receipt is a
minimal, constrained table, not a general observability platform.

## Regressions (this stage)

- `src/lib/milo-conversation-diagnostics.server.test.ts` — classification maps a
  NOWAIT refusal to `55P03` at the recorded stage; never derives a class from a raw
  message; **fails closed on a hostile Proxy (throwing `getPrototypeOf`) and a
  throwing getter without weakening the `55P03` positive case**; the recorder sends
  only correlation ids + fixed enums, passes a null operation when unknown, swallows
  both an RPC error object and a thrown transport failure without retrying, and
  never contacts the RPC for a non-uuid id. The recorder mocks are typed with the
  real `TeamReadRpc` (no as-any) so the asserted call shape is genuine.
- `src/lib/milo-conversation-diagnostics-migration.test.ts` — the candidate SQL
  stores a bounded receipt; is a no-op for a missing turn; rejects any value
  outside the enums / http range / SQLSTATE allowlist; **keeps at most one receipt
  per turn, preserving the first stage/SQLSTATE/time on a duplicate write**;
  cascades on turn erase and prunes only receipts past the 30-day window across
  DISTINCT turns; **prunes in a bounded batch, leaving a backlog for the next run**;
  **schedules an ACTIVE daily retention sweep independent of conversation dispatch**;
  and keeps writes function-only and reads service-only (anon/authenticated denied;
  service_role reads but cannot direct-write). PGlite stubs the pg_cron surface.
- `src/lib/milo-specialist-executor.server.test.ts` — a first-checkpoint NOWAIT
  refusal reproduces the incident trail (one `execution_unknown`, no brief, no
  model) AND records `stage=brief_start`, `sqlState=55P03`, correlated to the turn
  and brief operation; an initial liveness refusal records `assert_live` (no
  operation id); a continuity read refusal records `continuity_read`; a malformed
  routing plan records `plan_parse` with no SQLSTATE; a throwing diagnostic never
  changes the honest unknown outcome; **a hostile thrown value still writes the
  unknown outcome and a safe receipt (stage set, `sqlState=null`) rather than
  escaping the catch**; and the stage is still recorded when even the outcome write
  is refused, without suppressing the unconfirmed-outcome error.
- `src/lib/milo-specialist-executor-live.server.test.ts` — end-to-end against the
  real conversation RPCs plus the applied candidate migration: a pre-brief NOWAIT
  refusal writes a real service-only receipt (`stage=brief_start`, `sql_state=55P03`,
  `outcome=unknown`, `outcome_code=execution_unknown`) inspectable via a plain
  service-role read and correlated to the turn.

Limitation (unchanged): PGlite is single-connection, so these prove function and
DB-boundary behaviour and the exact trail SHAPE of a NOWAIT refusal, not a genuine
concurrent two-connection lock race or a deployed turn.

## Correction round (19 September, later — same worktree, base `main` `26b938c3`)

An independent Codex review of the first diagnostics packet raised four bounded
defects; this round corrects them in place without broadening the diagnostic
framework and without any app change outside these issues:

1. **One receipt per failed turn is now enforced in the DB.** `turn_id` is UNIQUE
   and the writer is `ON CONFLICT (turn_id) DO NOTHING` (first-receipt-wins), so a
   concurrent/duplicate write can never overwrite the original failure's stage/time.
   The migration test now uses DISTINCT turns for the retention/cascade proof and
   adds an idempotent-first-receipt proof (a different-payload duplicate is ignored,
   original stage/SQLSTATE/time retained).
2. **Ordinary 30-day retention is now actually enforced.** The `prune` RPC was
   never called; it is now wired to an ACTIVE daily pg_cron job
   `milo-conversation-diagnostics-prune` (included in THIS candidate migration), and
   the prune takes a bounded `limit` so one sweep is a bounded batch, not an
   unbounded delete. The job stays active while conversation dispatch is disabled
   and alters no existing job/control. PGlite fixtures stub the cron surface. Cadence
   is documented precisely as a daily 30-day sweep (not a strict wall-clock cut-off).
3. **`classifyConversationFailure` (and `failure()`) are now fail-closed.** The bare
   `error instanceof TeamAdmissionBusyError` invoked a hostile `Proxy`'s
   `getPrototypeOf` trap and could throw, and — running first in the executor's
   catch — would have prevented the outcome write and the diagnostic. Both now guard
   `instanceof` and swallow any fault, retaining `55P03` only for a genuine typed
   busy error, never from raw messages/stack/stringification. New regressions cover
   a hostile Proxy / throwing getter at both the classifier and executor levels.
4. **The `tsc` mock-type error at `milo-conversation-diagnostics.server.test.ts:127`
   is fixed** by typing the recorder mocks with the real `TeamReadRpc` (so
   `mock.calls` carries the true `[name, args]` tuple) instead of an as-any cast that
   hid the call shape.

Check status (accurate): **every check below is UNRUN in this correction round** —
no shell/test/build/type command was executed here (Read/Edit/Write/Glob/Grep only;
Codex runs the checks). The reviewer's earlier "262 focused / 11 files PASS" was a
pre-correction review probe of the previous packet, **not** a new-stage result, and
the earlier `tsc` run FAILED at line 127; that failure is addressed above but `tsc`
itself has not been re-run here. The base remains `main` `26b938c3`; no SQL was
applied, no PR opened, and no full suite/build run. The candidate-chain inventory
test is intentionally **not** edited or listed here — Codex owns integrating the
pending candidate migrations (explicit released/candidates) once finished packets
merge.

## Prepared checks for this stage (UNRUN; Codex to run after staging)

No shell or test command was run in this stage. Approved executables only
(`node_modules/.bin/...`), individually:

- New/changed behaviour:
  `node_modules/.bin/vitest run src/lib/milo-conversation-diagnostics.server.test.ts src/lib/milo-conversation-diagnostics-migration.test.ts src/lib/milo-specialist-executor.server.test.ts src/lib/milo-specialist-executor-live.server.test.ts`
- Unchanged behaviour must hold:
  `node_modules/.bin/vitest run src/lib/milo-conversation.server.test.ts src/lib/milo-conversation-migration.test.ts src/lib/milo-conversation.functions.test.ts src/lib/milo-specialist-tools.server.test.ts src/lib/project-team-read-admission.server.test.ts src/lib/milo-conversation-lifecycle-migration.test.ts src/lib/ai-error-diagnostics.test.ts`
- `node_modules/.bin/tsc --noEmit`
- `node_modules/.bin/eslint src/lib/milo-conversation-diagnostics.server.ts src/lib/milo-conversation-diagnostics.server.test.ts src/lib/milo-conversation-diagnostics-migration.test.ts src/lib/milo-specialist-executor.server.ts src/lib/milo-specialist-executor.server.test.ts src/lib/milo-specialist-executor-live.server.test.ts`
- `node_modules/.bin/prettier --check` on the six changed/added TypeScript files above
- Full suite `node_modules/.bin/vitest run` and production `node_modules/.bin/vite build`

## Files (this stage)

- `src/lib/milo-conversation-diagnostics.server.ts` (new) — stage enum, safe
  classifier, best-effort service-only recorder.
- `src/lib/milo-specialist-executor.server.ts` — stage/operation tracking and the
  best-effort diagnostic write in the failure path; `failure()` return typed as the
  shared outcome; production `diagnostic` dep wired.
- `src/lib/milo-conversation-diagnostics.server.test.ts` (new) — classifier +
  recorder unit tests.
- `src/lib/milo-conversation-diagnostics-migration.test.ts` (new) — candidate SQL
  grants/CHECKs/cascade/prune/no-op tests.
- `src/lib/milo-specialist-executor.server.test.ts` — stage-capture and
  inert-diagnostics regressions (diagnostic spy added to the harness).
- `src/lib/milo-specialist-executor-live.server.test.ts` — applies the candidate
  migration and proves the real receipt write for a pre-brief NOWAIT refusal.
- `supabase/migrations/20260919160000_milo_conversation_diagnostics.sql` (new,
  candidate — NOT applied) — service-only receipt table + writer + prune.
- `evidence/conversation-live-repair-2026-09-19.md` — this stage.

## Not done / still owed

- No confirmed root cause and no behavioural repair: this stage instruments the
  failure so the NEXT real failure is inspectable, then a targeted fix follows with
  evidence. No dispatcher activation, deployment, provider/model call, DB/network
  operation, or replay of any old unknown turn was performed. The eight applied
  migrations are unchanged; the diagnostics migration is a candidate for Codex to
  apply (which is what makes the next failure inspectable).

## Codex validation of corrected diagnostic packet — 2026-09-19

Changed-path tests **52/52 in 4 files** pass. Integrated full suite **6063/6063 in 379 files**, 46.04 s, passes; TypeScript, scoped ESLint, whitespace check and production build pass. Logs: `/tmp/milo-diagnostics-corrected-{focused,types}-20260919.log`, `/tmp/milo-diagnostics-final-full-20260919.log`, `/tmp/milo-diagnostics-build-20260919.log`. These supersede UNRUN for this stage only.

Codex integration exceptions: formatted three diagnostic TypeScript files; reconciled the migration-chain inventory to distinguish eight already-applied conversation migrations from the new diagnostic candidate and added both new service-only RPC grant checks. Preserved the unknown-migration guard. Corrected retention commentary/evidence to acknowledge bounded-batch backlog: the daily sweep is not a hard 31-day maximum. No application or SQL behavior changed by these exceptions.

No migration applied or production deployment performed for this packet. Production remains at `26b938c3`, with the last conversation acceptance failed and dispatch disabled. The packet adds safe failure-stage receipts; it does not establish a root cause or successful production conversation. Old unknown turns must not be replayed.
