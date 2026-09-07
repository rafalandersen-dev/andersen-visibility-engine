# Milo cost controls — first implementation packet

Date: 2026-09-07. Owner: Rafal Andersen. Executor: Codex.

Status: implemented and locally verified; release and production database migration not performed.

This is the first bounded R05/R09 implementation from the September plan in PR #64. It does not complete wave 0, all cost controls, unattended acceptance or the launch gate. The baseline is main `34cacf695baee8696582d94559c74880133647ed`; PR #64 remains a separate documentation draft. This packet branches directly from main.

## Findings and changes

| Finding | Implemented behavior |
| --- | --- |
| Meter RPC errors and absent responses allowed paid work | Transport failures, RPC errors, missing/malformed/inconsistent confirmations raise `usage_unavailable` before the model call, including in record-only beta |
| First monthly claim bypassed cap because only the conflict-update path checked it | Additive SQL replacement seeds zero, then conditionally increments under the same cap for first and subsequent claims; zero and oversized first claims are denied |
| Invalid units or damaged counters could make accounting unreliable | Positive integer units checked before RPC and in SQL; invalid arguments, negative stored usage and overflow refuse work |
| Scheduler trusted the client-writable subscription blob and treated a quota read failure as unused allowance | Planning reads server entitlements and owner role through the shared usage layer; failed/malformed usage reads stop the project |
| Scheduler's planning hint was not a concurrent spend guard during beta | Each discovery/content core requires an atomic enforced claim when invoked by the scheduler, independently of the interactive beta flag |
| Scheduler retried remaining candidates after systemic budget failure | Stop remaining attempts, report the error through existing summary/heartbeat paths, and persist already prepared drafts through the existing workflow |

`AI_METERING_ENFORCED` still controls interactive plan-cap enforcement. This packet does not set its runtime value. A successful meter response is required in both modes. The owner has the same finite multiplier in planning and claims. Imports/manual edits/reading and the publishing layer do not receive a new AI generation gate.

## Verification

| Check | Result and scope |
| --- | --- |
| Baseline full app suite | 96 files, 1,235 tests passed before implementation; application source matched main, with only PR #64 documentation also present at that initial run |
| Updated full app suite | 99 files, 1,298 tests passed; 63 new regression cases |
| TypeScript | `npx tsc --noEmit` passed |
| Production build | `npm run build` passed |
| Lint on usage helpers, new tests and scheduler | Passed |
| Lint on `ai.functions.ts` | Existing `no-control-regex` error at the JSON cleanup regex, also present on baseline main. The new call-site formatting passes; no claim of a clean whole-repository lint |
| Patch hygiene | `git diff --check` passed |
| Provider invocation after failed claim | Actual content/discovery/image cores exercised with provider spies: no provider calls |
| Scheduler faults | Failed quota read stops before generation; zero quota ignores a forged workspace subscription; discovery meter failure is reported; content meter failure/limit retains first draft and stops remaining candidates |
| SQL execution | Original migration reproduced the cap-zero defect, then replacement passed first/subsequent/multi-unit claims, period/user/bucket separation, invalid arguments, overflow/corruption, repeated application and role access checks in isolated PGlite |

PGlite is a development-only dependency pinned at 0.5.8. Tests execute the actual migration in an isolated in-memory PostgreSQL runtime. PGlite serializes requests on a single connection; its burst test does **not** prove simultaneous independent database-session contention. The SQL uses a primary-key insert and conditional row update; multi-session acceptance remains part of the deployment check.

No paid AI, live customer generation, external publication, customer email, supplier order, production migration or hosting change was performed by verification.

## Deployment baseline and unresolved environment facts

| Surface | September 7 observation | Implication |
| --- | --- | --- |
| Git main | `34cacf695baee8696582d94559c74880133647ed` after fetch and connected GitHub read | PR #63 is merged |
| Vercel status | Success on that merge SHA; [deployment record](https://vercel.com/andersen-hq/andersen-visibility-engine/2j1J3RS58sT5LHZsie8FxGAKAkxz) | Confirms the reported Vercel deployment only |
| Custom-domain homepage/auth | Homepage and sign-in render; no authenticated session available | Protected workspace and provider settings not inspected |
| `https://milogrowth.com/api/app-version` | `buildId` = `1787472935217`, corresponding to `2026-08-23T08:15:35.217Z` | Source derives this ID from build time. It differs from September deployment timing. Do not claim #63 is verified live on this domain; investigate routing/release mapping |
| Production `AI_METERING_ENFORCED`, provider configuration and applied migrations | UNKNOWN | Source comments/local tests are not evidence of runtime values |
| Audit issue #43 infrastructure | Separate data plane, DNS/route ownership, account configuration and cost ceiling remain UNKNOWN | No audit environment mutation or release approval inferred from this task |

PRs #2, #58 and #62 remain open; their bootstrap/authoring/design requirements remain separate and were not merged. Issue #43 read-only authority remains valid. Full source-security review and remaining account-level discovery are not represented as complete by these checks.

## Concrete rollout and rollback

1. Identify the actual environment serving the custom domain and record its revision, applied migrations and the flag's presence/value status without exposing secrets. Resolve the timestamp/deployment discrepancy before claiming a production release.
2. In the selected database, apply `supabase/migrations/20260907110000_ai_usage_fail_closed.sql` through the environment's authorized migration process **before** enabling the new scheduler implementation. The function signature and counters are preserved; no destructive cleanup is included.
3. Using an isolated non-customer identity, verify first cap-zero refusal, cap-two claims, third refusal, separate periods, multi-session claims at the boundary and anon/authenticated denial. Do not use customer quota for testing; clean synthetic data under the environment's normal procedure.
4. Deploy the reviewed application revision. Verify domain build identity, manual read/edit, an intentional unavailable-meter response, a zero-quota background run and retention of a prepared draft. No real content publication or email is needed for the meter acceptance.
5. Observe `usage_unavailable` reasons and the existing scheduler heartbeat. Quota availability failure intentionally pauses AI; it must not be handled by allowing unrecorded calls.

Rollback: retain the additive SQL function and existing counters. Pause the affected AI/scheduler path and restore a verified application revision if required. Rolling the application back before this patch restores its historical fail-open behavior, so an old build is not itself a safe spend-control rollback. Do not reset counters, remove the migration or change interactive enforcement as an incident workaround. Environment/operator selection and release authorization are still separate from this code packet.

## Next implementation packet

1. Add a provider expense ledger with request/job IDs, model/method, measured usage and explicit unknown-cost states. Current counters measure attempts, not money or delivered articles.
2. Reserve and reconcile monetary budgets atomically per account and globally; cover retries, timeouts, model/tool bounds and onboarding's currently unmetered scan. Check supplier/pricing evidence before choosing numerical ceilings.
3. Separate delivered-result allowances from incurred provider costs, including failed drafts, image retries and imported external text. Do not introduce the new package promise on the existing attempt counter.
4. Build notification outbox/dedupe/recheck and delivery evidence after the execution events are defined. This patch reports pauses through existing scheduler summaries; it does not implement the new email/in-app notification centre.
5. Resolve runtime release mapping and configuration evidence in parallel with these local implementation packets. Stripe lifecycle and prices remain unimplemented by this change.
