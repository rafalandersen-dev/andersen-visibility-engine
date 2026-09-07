# Milo release reconciliation — 2026-09-07

Executor: Codex. Owner: Rafal Andersen. Scope R00/R24 release identity and R05/R09 metering rollout; does not activate public-audit infrastructure under issue #43.

## Verified baseline

- Main `34cacf695baee8696582d94559c74880133647ed`; PR #64 `583fdc64213a6717936f45f9eb3bce0338fe27e4`, PR #65 `45b13fee442c3f6911e959da0216dd29d8fbfc4d`; both draft/mergeable before rollout.
- Lovable project `06b696f6-c02b-468f-b0a0-7ab8af92d6a0`, workspace `oC4kAHCUIYuuomG2Hwnl`, latest editor revision matches main. Connected account has workspace owner role. This is access evidence, not verification of the account's administrative email.
- Published `milo-growth.lovable.app/api/app-version` redirects to `milogrowth.com/api/app-version`; final HTTP 200 has `buildId=1787472935217` (August 23). DNS A returns `185.158.133.1`. Lovable editor synchronization and publication are separate. Vercel success does not verify this custom domain.
- Connected Supabase enabled. Actual `claim_ai_usage` is the old first-insert-bypasses-cap body, not the September replacement. Migration registry newest version is July 30; actual table inspection confirms additional objects, so registry absence alone is insufficient to infer absence.
- `ai_usage`, `entitlements`, `project_publish_secrets` exist with RLS enabled. Entitlement aggregate: one agency/manualComped account; external billing/subscribers not verified.
- Local focused revalidation: 68 tests in metering claims/SQL/scheduler/public-audit-boundary pass; TypeScript passes. Prior 1,298-test suite evidence remains scoped to PR #65.
- Browser Lovable inspection blocked by unavailable admin-policy verification. No browser bypass attempted; connected API discovery works.

## Concrete rollout

Apply exact additive `20260907110000_ai_usage_fail_closed.sql` and record migration in one transaction. Function signature and existing counters are preserved; grants remain service-role-only. Verify source and grants, then execute synthetic functional checks in a transaction rolled back in full. Multi-session boundary acceptance is still required separately.

Review/merge #64 and #65 without rewriting history, confirm Lovable latest revision, publish existing project, and verify both published aliases and version. Stop if latest revision differs from reviewed tree. No changes to public-audit Worker, DNS, provider credentials, flags or paid resources. No customer communications or content publication.

Rollback retains safer SQL and counters. Pause affected AI jobs before any rollback to older application logic; old fail-open application is not a safe stand-alone spend rollback. Lovable previous published artifact identity is recorded above; exact artifact restore availability has not been verified by API.

## Execution results

Pending; append actual outcomes after each step. Full roadmap remains open.

- Applied exact September metering migration through the connected project database and recorded version `20260907110000` in the same transaction.
- Real PostgreSQL synthetic transaction passed first cap-zero refusal, two-unit acceptance, next refusal and anon/authenticated/service-role privileges. Entire synthetic transaction rolled back; no customer counters used. This single-session check is not concurrency acceptance.
- #64 merged as `807c478dac567add213dafc993a72a7253817ea5`; #65 merged as `34c9093548e369f8960279aff61924c34f55aad6`, preserving published history.
- Lovable latest revision was verified at `34c9093548e369f8960279aff61924c34f55aad6` before publishing. Deployment request `fda80b8a-a428-40f9-b016-e6afbf33d56c` returned pending; subsequently domain HTTP 200 changed to build `1788781144340` (2026-09-07T11:39:04.340Z). This closes stale August publication, but current endpoint lacks a source-revision field, so exact runtime SHA is not independently exposed.
- Protected journeys, production flag presence/value and multi-session quota contention remain open. No claim of full launch verification.

## Next cost packet: onboarding and provider attempt bounds

Onboarding now claims the existing finite `aiCredits` allowance with enforcement, including freePreview, before AI extraction. A refused/unavailable meter retains website metadata and manual setup. No new package, price, quota count, provider or key is introduced. Text SDK calls use zero automatic retries and a 60-second abort signal. Provider cancellation does not prove zero expense; monetary reconciliation remains a separate follow-up.

Validation: five new regression tests cover successful bounded extraction, denied quota, unavailable meter, absent URL and malformed response; complete suite 1,303 tests/100 files, TypeScript and production build pass. All providers mocked; no paid request. Dependency audit reports seven high-severity transitive findings; remediation review is outstanding and this packet does not claim a clean dependency audit.
