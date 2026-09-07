# Milo Growth — Current State

**Status:** September application release reconciled; full public launch remains unverified

**Last updated:** 2026-09-07

**Repository baseline inspected:** `main` at `41aaf64be9ebb6a6d0f5c37b581acc168990ed6c` (PR #66 merge)

**Product Lead / Outcome Owner:** Rafal Andersen

**Current phase:** Private beta; premium rebuild and launch foundations

## Recovery brief

Read [ROADMAP.md](./ROADMAP.md) for execution order and [PLAN_REVIEW_2026_09_07.md](./PLAN_REVIEW_2026_09_07.md) for all scope/decision gaps. This update corrects the July 28 state file against current source and GitHub evidence. It does not convert a source review into an independent security audit or prove production configuration.

PRs #63–#66 are merged. Selected premium Today/list+inspector/calendar work, reconciled plans, fail-closed metering and bounded onboarding extraction are implemented. The whole product redesign, real observed AI tracking, production backlinks supplier, Stripe and all EU languages are not complete. The owner's Claude and ChatGPT MCP connections are existing capabilities; further client coverage and authoring work remain.

Unattended paid public launch remains **not verified / NO-GO** pending [launch gates](./LAUNCH_READINESS.md). The historical ~70% assisted/~40% public estimates are retired as current indicators: they predate substantial work and have no fresh denominator.

## Evidence levels

| Evidence | What is known | Limit |
| --- | --- | --- |
| Current source | `main` at `41aaf64be9ebb6a6d0f5c37b581acc168990ed6c` after #66 | Source is not runtime verification |
| #63 validation | Recorded 190 focused tests, TypeScript/build, responsive browser/workflow checks in `design-qa.md` | Earlier focused scope; not a fresh full release/security review |
| Application deployment | Lovable project latest revision matched #66 merge before publication; domain now serves build `1788781754158` (2026-09-07) | August stale release resolved; protected journeys and independently exposed runtime SHA still open |
| Metering acceptance | September SQL applied; eight concurrent PostgreSQL sessions admitted exactly three claims at cap 3; synthetic row cleaned | No real provider expenditure; monetary budgets are a separate layer |
| #66 validation | 1,303 tests/100 files, TypeScript/build pass | All suppliers mocked; not full launch acceptance |
| #67 foundation | Draft internal monetary ledger; 1,334 tests/102 files, TypeScript/build/focused lint pass | Migration unapplied; production provider callers not yet connected, no funded budgets |
| Historical independent baseline | #46 `80375249dfcf9e371d82ebf7c28f2983fc4ab047`: Worker 49 tests, Milo 1165 tests/build and recorded review | Valid for that historical tree, not all later commits |
| External/account configuration | Connected Lovable/Supabase read verified project, tables/RLS and one agency/manualComped entitlement; metering function upgraded | Runtime flags, secrets, actual provider pricing and external subscriber state remain unverified |

Full exact-head security and protected-journey acceptance remain open. Source tests, database acceptance, Lovable revision and live build observations have distinct scopes. See [release evidence](../evidence/release-reconciliation-2026-09-07.md) and [expense foundation evidence](../evidence/expense-reservations-2026-09-07.md).

## Present implementation to preserve

- Protected authenticated workspace, persistence/hydration, revision handling, project isolation/caps and owner controls.
- Premium shell, Today cockpit, searchable Plan list/inspector, board/archive/discovery/bulk workflows, day/week/month calendar and mobile navigation. #63 fixed stale selector caching and layout/field-save defects.
- Project create/edit, services/products, Brand Intelligence, markets/languages/voice/goals, CMS and automation settings. Full onboarding/setup design remains partial.
- Article Studio: canonical content assembly, hook, author, sources, internal links, visuals/anchors/arrangement, quality/staleness, preview/export and publishing readiness. Remaining design and connector destination acceptance are separate.
- Custom/WordPress/Shopify publishing and scheduled/background workflow code; controlled approvals, cancellations and idempotency. Logged-out live end-to-end acceptance is still required.
- Analytics/referrals, GSC import/OAuth paths, monthly proof and existing agency reporting. Real observed AI answers are not established by readiness advice or referral analytics.
- Backlinks intelligence/gaps, demo marketplace quotes/orders and controlled outreach path. Current supplier activation and production Linkhouse adapter remain unresolved.
- MCP OAuth/scopes, read/write/propose paths and idempotent create/update of non-live drafts (#59). Preserve publication restriction and token revocation. Existing client connections do not prove every future tool/client workflow.
- `entitlements.server.ts` is the authoritative plan read/write layer; metering resolves through it. Publishing secret-store and security-header implementations exist. Verify actual migration/key enforcement and credential fallback paths before claiming operational protection.
- Four application locales: PL/EN/SV/DA. All 24 EU languages remain a requirement.

The detailed [route/capability map](../docs/premium-redesign/FEATURE_INVENTORY.md) governs preservation; do not rebuild or delete functionality based on July audit labels.

## Current blockers and corrections

### Cost and billing

- PR #65 fixes RPC/no-row/malformed-confirmation fail-open behavior and first-claim SQL cap bypass. Migration applied and independent-session acceptance passed. Scheduler uses server entitlements and enforced claims. PR #66 adds finite onboarding extraction and zero automatic text retries/60-second timeout.
- Draft PR #67 provides internal account/global monetary reserve/reconcile, unknown-cost retention and overrun pauses. It is not connected to production provider callers and its migration is not applied. Verified rates, adapters and explicit budget provisioning remain required. Customer delivered-result allowance accounting remains separate.
- `AI_METERING_ENFORCED` determines cap enforcement; production value was not inspected. Do not assert that it is currently on or off.
- Server entitlements already exist; the July claim that the product still trusts the client blob as paid authority is obsolete. Verify deployment/RLS/lifecycle rather than reimplementing from that stale claim.
- Stripe is the required billing direction after Paddle rejection. Paddle-specific code and terms/refunds remain; no Stripe lifecycle acceptance or new pricing is claimed.
- Article/image/monitoring/agent unit costs and package counts/prices require measurement. See [NOTIFICATIONS_AND_PACKAGING.md](./NOTIFICATIONS_AND_PACKAGING.md).

### Product completeness

- Real AI observations/citations, shared growth agent, notification lifecycle, remaining premium modules, provider completion and language expansion are registered in R01–R23.
- Required featured images conflict with a possible truly text-only package. Preserve readiness checks until a documented policy resolves it.
- Team permission/approval behavior, unattended jobs and provider failure recovery need explicit acceptance; an existing agency price tier is not proof of a complete team experience.

### Public audit and operational truth

- Dedicated Worker, direct Gemini boundary and staging harness code exist. #35/#43 remain open at review time.
- Later commits **do include production routes and boundary changes** beyond #46. The July assertion “no routes/deployment” cannot be reused as current truth. Committed routes also do not prove a deployed Worker.
- Account-level discovery and exact runtime/migration state remain unverified here. Read-only discovery is already authorized in #43 and the user history; no repeat permission is needed.
- No new Worker staging/production release GO is issued by this plan. Finish the concrete evidence and mutation package under the existing release boundary.

### Legal, support and data

- `legal.ts` now contains operator identity/contact data; it is no longer placeholder-only. This is a source observation, not legal approval.
- Align actual seller/payment/tax/invoice/refund terms with Stripe and the chosen package rules; review localized documents, retention, data export/deletion and support delivery before launch.
- Do not infer support-email deliverability or provider credential configuration merely from code constants.

## Open related work

| Item | September 7 state | Next treatment |
| --- | --- | --- |
| #35 public audit | Open | Containment and final outcome evidence |
| #43 isolated audit staging | Open | Remaining authorized discovery, configuration-presence matrix and bounded release packet |
| PR #58 Claude authoring scope | Open | Reconcile proposals with #59 draft tools; image ingest/batches/profile/readiness remain explicit |
| PR #2 AI bootstrap blueprint | Open | Compare existing setup proposal implementation before claiming completion |
| PR #62 design engineering gate | Open | Review alongside remaining UI work; not merged in this task |

## Next single action

Continue R09 provider accounting integration once verified rates and owner test budget are available; meanwhile implement R05/R06 durable notifications and logged-out reliability. Keep remaining full-roadmap waves active. Do not repeat completed migration/deployments or treat this release milestone as 100% completion. Issue #43 retains its separate infrastructure mutation boundary.

## References and historical evidence

- [PR #63](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/63), [design-qa.md](../design-qa.md), [September review](./PLAN_REVIEW_2026_09_07.md).
- [August strategy](./STRATEGY_2026_2027.md), [decisions](./DECISIONS.md), [operations](./OPERATIONS.md).
- [ADR-0001](../docs/adr/ADR-0001-public-audit-boundary.md), [#43](https://github.com/rafalandersen-dev/andersen-visibility-engine/issues/43).
- [Public audit safety evidence](../evidence/public-audit-safety-2026-07-27.md), [Worker evidence](../evidence/public-audit-worker-2026-07-28.md), [staging harness evidence](../evidence/public-audit-staging-harness-2026-07-28.md).
- [Historical July state as preserved in git](https://github.com/rafalandersen-dev/andersen-visibility-engine/blob/19151c4/product/CURRENT_STATE.md). Historical evidence is retained, not overwritten as a new release assertion.
