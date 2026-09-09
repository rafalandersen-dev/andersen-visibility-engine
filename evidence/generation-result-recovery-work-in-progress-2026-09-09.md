# Generated-result recovery — P0 validation and release packet

Updated 9 September 2026. Executor/verifier: current Codex implementation task. Status: implemented and locally validated; review, migration and runtime verification pending. Authenticated browser acceptance remains blocked by the recorded administrator-policy verification denial. Do not retry that unchanged access path or claim visual acceptance.

## Preserved baseline

The original uncommitted work was preserved in local commit `4eb7b40`, then current main was merged normally in `09067e8`. PR #105 FAQ save/dirty-state behavior is retained. PR #106 is merged at `c314c32607cf6c80a8a6a22bde6e42155156c700`; its exact-head checks succeeded. The previous portability finding is addressed by remote checkpoint `5d1320cbc4d5ba1399a4c277eae2c274908b9f12`. Review 34389961259 reported `is_error: false` but 22 permission denials, limiting automated review coverage; no new inline findings were posted. Documentation merging did not deploy application code.

Active worktree: `/Users/rafi/Projects/milo-growth-generation-result-recovery-20260909`, branch `codex/milo-generation-result-recovery-20260909`. Earlier 43-test/unwired notes are superseded by this packet.

## Implemented behavior

- Private immutable result archive, service-only read/list/discard RPCs and atomic result retention plus generation-quota completion. Strict normalized content/image contract; private images remain bound to user/project/asset paths. Account deletion cascades archive payload deletion.
- Shared ordinary, legacy, scheduler and restricted owner-benchmark integration. Stable generated asset/image identities survive lost browser responses. Uncertain retention does not trigger a blind quota refund or a second provider call.
- Authenticated Recent generations page with four UI locales, project filtering and bounded keyset pagination. Read/copy/download existing output or restore an unapproved draft/proposed private image without paid AI. Restore preserves an existing edited/approved asset, rejects unrelated/missing/armed targets, and does not silently retry a conflicting workspace mutation.
- Private download rechecks the authenticated owner's receipt and image path, signs for 60 seconds, rejects unsafe returned URLs, bounds storage waits and sanitizes errors. Download links are not archived.
- Browser content saves include the exact previously saved content row (or explicit null for a new row). The database checks that baseline after taking the existing per-account batch lock. A delayed original generation/image save cannot overwrite a recovered owner edit merely by carrying a newer timestamp. Conflicting batches roll back all changes; local edits remain available with a visible conflict message. Identical late replay remains safe. Existing revision checks, service-owned entitlements and merged metadata are preserved.
- Recovery flushes pending local workspace edits before its server mutation and reload. An original generation returning after same-tab recovery opens the existing draft instead of replacing it.

## Validation

- Full suite: **2,309 tests / 158 files passed**, captured exit 0; `/tmp/milo-recovery-full-final.log`.
- Focused recovery/download/authentication-wiring/migration/FAQ checks: **87 tests / 5 files passed**. Browser-store integration: **18 tests / 3 files passed**.
- TypeScript `--noEmit`, production build, focused lint on new recovery and changed persistence files, and diff whitespace checks passed with captured successful exits. Logs: `/tmp/milo-recovery-types-final.log`, `/tmp/milo-recovery-build-final.log`, `/tmp/milo-recovery-lint-final.log`.
- Database tests execute the proposed migration in PGlite and cover owner isolation/roles, immutable replay, discard tombstones, atomic quota completion, pagination, stale creation/update/deletion, identical save replay and preserved entitlement/metadata rules.
- Authentication tests verify middleware registration and authenticated-owner forwarding, including downloads; they do not establish a real signed-in browser session.
- No native provider call, benchmark funding, email, client content publication or browser-policy workaround was performed. Provider auth remains last recorded UNAUTHORIZED. The USD5/one scan/one article/one image authorization remains unused.

## Release procedure and rollback

Review the final PR head and meaningful findings before normal merge. Before database changes, inspect the actual batch function and migration registry. Apply only `20260909160000_generation_result_recovery.sql`, once in a transaction, and record its exact source hash. The #103/#104/#101/#98 migrations are already installed and must not be repeated.

Verify service-only archive/RPC access, browser denial, zero new generation/expense activity, and the installed batch precondition behavior. Deploy the clean merged application through existing Lovable hosting, then compare the custom-domain build, exact clean revision and every source fingerprint component; run HTTP checks. Preview success alone does not establish runtime equality.

Rollback application code to the prior verified release while retaining archive/receipt data and the compatible batch precondition addition. Never drop the archive, reset counters, erase expenses or refund unknown outcomes as rollback. Old clients omit the new optional precondition and retain their previous behavior; browser build-refresh acceptance remains required.

## Remaining acceptance and wider plan

Live lost-response/recovery/download and responsive signed-in browser journeys remain unverified under the recorded access restriction. Project-deletion retention policy, broader privacy/export acceptance and complete delivered-result packaging remain explicit work; discard removes only the archived payload, not attached copies or storage assets. No automatic retention purge is selected.

After P0 review/release, follow [P1–P5](../product/AGENT_WEEKLY_PLAN_2026_09_09.md), preserving R00–R24/D01–D08. Provider setup and owner-deferred Stripe work do not justify retries or new spending. Public paid launch remains NO-GO.
