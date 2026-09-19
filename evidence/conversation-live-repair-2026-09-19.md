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
