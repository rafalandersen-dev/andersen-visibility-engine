# Milo Growth — Current State

**Status:** Canonical current state — Product Lead approved  
**Last updated:** 2026-07-28  
**Evidence baseline:** `main` at `cfeff9fcdc0ece06824a8c980061672e27a27282`; issue #39 implementation merged
**Product Lead / Outcome Owner:** Rafal Andersen  
**Current phase:** Private beta; transition from BUILD to REVENUE

## Recovery brief

Milo Growth remains a supervised private-beta product transitioning from BUILD
to REVENUE. The first Andersen OS P0 cycle has completed audit, Product Lead
approval, the original safety implementation, independent review, verification
and merge. Gate 0 then rejected the unproven Lovable trust assumptions and
ADR-0001 selected a dedicated Cloudflare Worker as the full audit boundary.

Issue #39 is implemented and merged through PR #41 at `cfeff9f`: the UI calls a
typed HTTP endpoint, the Worker owns Turnstile, limits, cache, fetch and AI, and
the old public TanStack paid path is removed. The exact implementation tree
passed independent verification and the code-only merge.
Production still serves the older deterministic flow. No Worker, route, DNS
change, migration, Turnstile resource or new secret has been created.

Milo is not ready for an unattended paid public launch. Paid launch additionally requires server-authoritative billing, authenticated hard AI limits, completed legal identity and live operational verification.

## Readiness

These are operating estimates, not test-coverage scores.

| Launch mode            | Estimate | Definition                                                                                                                                     | Current verdict                                               |
| ---------------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Assisted private beta  | **~70%** | Small invited cohort, founder support, manual activation/payment, controlled spend and explicit limitations                                    | **Proceed cautiously** after the public-audit P0 is contained |
| Unattended public SaaS | **~40%** | Open acquisition, self-serve paid billing, enforced cost controls, final legal identity, verified integrations, support and incident ownership | **Blocked**                                                   |

The estimates originate from the approved Andersen OS rollout. They must be
recalibrated after the first complete beta cohort and a fresh launch-readiness
review.

## Last verified achievement

**Dedicated Public Audit Worker implemented, independently verified and merged;
isolated staging and release remain gated.**

Verified evidence recorded on 2026-07-28:

- approved limits: 5 salted IP claims per rolling hour, 50 global fetch claims per UTC day, 50 global paid-AI claims per UTC day and 24-hour cache;
- targeted public-audit tests: 26/26 PASS;
- TypeScript for the changed boundary: PASS;
- both additive migrations executed successfully in an isolated PostgreSQL-compatible runtime;
- Vercel build/preview and automatic Claude Code Review: PASS;
- dedicated security review: all prior P0/P1/P2 blockers closed; no code change required before merge;
- independent verifier statically passed claim ordering and migration composition but could not run dependency-backed checks because its protected checkout lacked `node_modules`;
- squash merge to `main`: `0d163dd32cd807463fc40e6c41fafd1176b94e5f`;
- Gate 0 production discovery: PARTIAL PASS / NO-GO; no production mutation.

Supporting evidence:

- [PR #36](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/36)
- [Merge commit `0d163dd`](https://github.com/rafalandersen-dev/andersen-visibility-engine/commit/0d163dd32cd807463fc40e6c41fafd1176b94e5f)
- [Delegation Packet #35](https://github.com/rafalandersen-dev/andersen-visibility-engine/issues/35)
- [Release Configuration Packet #37](https://github.com/rafalandersen-dev/andersen-visibility-engine/issues/37)
- [`evidence/public-audit-safety-2026-07-27.md`](../evidence/public-audit-safety-2026-07-27.md)
- [ADR-0001](../docs/adr/ADR-0001-public-audit-boundary.md)
- [Issue #39](https://github.com/rafalandersen-dev/andersen-visibility-engine/issues/39)
- [PR #41](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/41)
- [Merge commit `cfeff9f`](https://github.com/rafalandersen-dev/andersen-visibility-engine/commit/cfeff9fcdc0ece06824a8c980061672e27a27282)
- [`evidence/public-audit-worker-2026-07-28.md`](../evidence/public-audit-worker-2026-07-28.md)

## Verified product baseline

The following is present on canonical `main`; it does not imply every external
integration has passed a live production E2E.

- Private-beta launch kit and production URL declaration.
- Authenticated workspaces with per-entity persistence and project caps.
- Multilingual application shell and product flows.
- Onboarding that can produce a first draft and open it in the editor.
- Article Studio with canonical assembly, sources, author, image workflow,
  structured data, publishing checks and responsive/arrange capabilities.
- Content calendar, monthly automation, safe publishing controls and audit
  history.
- Analytics, GSC import/OAuth code paths and monthly proof reporting.
- Custom, WordPress and Shopify publishing connectors in code.
- Agency tier model and white-label monthly proof report.
- Project-level Claude Code configuration:
  - Technical Builder default: Opus / high effort.
  - Security Reviewer: Opus / xhigh / read-only plan mode.
  - Technical Verifier: Sonnet / medium / guarded read-only Bash.

## Active outcome

**Make Milo safe enough for a small assisted beta while establishing the first
recoverable Product Operating Template implementation.**

Success requires:

1. no unmetered public path can trigger uncontrolled AI or outbound-fetch cost;
2. no paid entitlement relies on client-writable subscription state;
3. a new session can recover objective, evidence, blockers and next action from
   repository files;
4. the first 3–5 testers can complete the beta loop with honest limitations and
   no P0/P1 incident.

## Blockers

### P0 — Dedicated Worker merged; staging and release open

**Status:** Issue #39 implementation independently verified and merged through
PR #41; production release NO-GO.

ADR-0001 selected a dedicated Worker after Gate 0 showed that the prior
Lovable-hosted design relied on unproven controls. The merged implementation
now:

- terminates `POST /api/public-audit` in the Worker;
- enforces exact host/origin/content/body/schema checks;
- owns Turnstile, salted IP request claims, independent fetch and AI budgets,
  cache/lease, bounded fetch, AI generation and deterministic fallback;
- keeps service-role, AI, Turnstile and salt secrets Worker-only;
- removes the public TanStack paid-audit handler and shared-edge-secret bridge;
- commits `workers_dev=false`, `preview_urls=false` and no private binding.

Local evidence: Worker 36/36 tests, Worker TypeScript and dry-run build PASS;
full Milo 1163/1163 tests and production build PASS; fresh compatible migration
verification PASS.

Required next:

1. separately define and approve isolated staging;
2. apply migrations/configure secrets only in that approved staging;
3. deploy only the reviewed merge tree in staging;
4. repeat abuse/privacy/live-provider tests before any production decision.

Do not deploy the Worker, create routes/secrets/Turnstile resources or apply its
two migrations without the next explicit environment approval in issue #37.

Evidence:

- PR #36 and merge commit `0d163dd`
- issue #35 implementation record
- issue #37 Gate 0 discovery and platform-documentation follow-up
- `evidence/public-audit-safety-2026-07-27.md`

### P0 — Paid entitlements are not server-authoritative

**Status:** Confirmed and documented in code; blocks paid launch.

`workspace_meta.subscription` is still client-writable. Active-status checks
prevent accidental feature leakage but do not stop a determined client from
self-declaring an active/manual Agency subscription. Paddle webhook handling and
authoritative subscription synchronization are deferred.

Impact:

- Agency white-label access and project-cap elevation are not a security boundary;
- paid plan limits cannot be trusted;
- AI metering cannot safely enforce plan-specific caps.

Evidence:

- `supabase/migrations/20260727100000_agency_plan_project_cap.sql`
- `src/lib/billing.functions.ts`
- `src/lib/billing.ts`
- `src/lib/ai-usage.server.ts`

Required before selling any paid plan:

- service-role-only billing source;
- verified Paddle webhook lifecycle;
- client batch writes must be unable to mutate subscription/billing authority;
- entitlement tests for upgrade, downgrade, cancellation, past-due and replay.

### P0 — AI usage is recorded but hard enforcement is off

**Status:** Confirmed; acceptable only for a tightly controlled invite beta.

`claimAiUsage` records calls, but `AI_METERING_ENFORCED` is intentionally off and
metering infrastructure errors fail open. Authenticated generation therefore has
no hard per-user refusal while beta access is open.

Impact:

- a tester, bug or automation loop can exhaust shared gateway credits;
- owner and tester traffic share the same upstream failure domain;
- autonomous monthly generation magnifies exposure.

Evidence:

- `src/lib/ai-usage.server.ts`
- `src/lib/auto-scheduler.server.ts`
- `supabase/migrations/20260719160000_ai_usage.sql`

Required before expanding beyond the first cohort:

- server-authoritative plan source;
- enable and verify hard caps;
- add global budget ceiling and alerting;
- define fail-closed behaviour for paid external calls;
- test concurrent boundary claims and provider-outage behaviour.

### P1 — Legal identity and public documents remain placeholders

**Status:** Confirmed; blocks broad commercial launch.

The legal pages intentionally state that final legal entity details, address,
registration data and legal review are incomplete.

Evidence:

- `src/lib/legal.ts`
- `src/routes/subprocessors.tsx`

Required:

- confirmed operating legal entity and business address;
- final operator/registration/VAT data where applicable;
- qualified review of Terms, Privacy, DPA, subprocessors, AI disclaimer and
  cookie/analytics wording;
- working support and security mailboxes.

### P1 — External integrations are not fully live-verified

**Status:** Code-verified; live E2E incomplete.

The repository records GSC OAuth, WordPress and Shopify as blocked for live E2E
without target credentials/accounts. CSV GSC and the custom connector are the
current demo-safe paths, subject to per-environment verification.

Evidence:

- `docs/LIVE-E2E-TEST-LOG.md`
- `docs/GSC-OAUTH-SETUP.md`
- `docs/WORDPRESS-CONNECTOR-SETUP.md`
- `docs/SHOPIFY-CONNECTOR-SETUP.md`

### P1 — Canonical product documentation is stale and contradictory

**Status:** Confirmed documentation drift.

Examples:

- `README.md` still describes an MVP 0.1 mock/localStorage shell.
- `docs/PRODUCT-AUDIT-2026-07.md` audits commit `3dd798c` from 2026-07-20,
  before major later implementation.
- `docs/ROADMAP.md` still marks already-shipped packages as proposed or awaiting
  approval.
- private-beta copy and current publishing/automation capability need one
  authoritative positioning source.

Impact:

- a new agent can make a wrong product decision from obsolete facts;
- launch claims, roadmap priorities and technical state can diverge.

Required:

- this file becomes the state entry point;
- refresh README, roadmap and audit status;
- never silently treat the July 20 score as the current product score.

## Current risks that do not block the first supervised demo

- The Worker removes the unproven Lovable execution boundary, but DNS rebinding
  remains a documented residual risk and live AI/Turnstile/Supabase integration
  is not yet staged.
- Repository-wide lint/format baseline is intentionally dirty and there is no
  CI quality gate; changed-file verification remains the current workaround.
- The build passes but emits widespread `inputValidator()` deprecation warnings.
- Several `@react-email/*` dependencies report deprecation during clean install.
- Production incidents can still be amplified by cached old bundles, although
  stale-bundle detection and per-entity persistence materially reduce the
  previously observed failure mode.
- Unmerged remote branches are not canonical state and must not be assumed
  shipped, especially `codex/milo-worldclass-redesign` and
  `docs/phase-1c-ai-project-bootstrap-blueprint`.

## Explicitly not claimed

- Live AI visibility/rank monitoring.
- Multi-page technical crawling or JavaScript rendering.
- Live WordPress/Shopify/GSC OAuth verification for every customer.
- Working self-serve paid billing.
- Final legal/compliance approval.
- Public-SaaS readiness.
- That the 2026-07-20 product-audit scores describe the current codebase.

## Public-audit architecture checkpoint

- Gate 0 topology discovery is complete.
- ADR-0001 selects a dedicated Cloudflare Worker as the full audit execution boundary.
- Lovable remains the web-app host; the Worker owns Turnstile, limits, cache, outbound fetch and AI.
- The rejected design must not set `MILO_OUTBOUND_FETCH_MODE=workers` inside Lovable.
- Issue #39 is the completed bounded implementation packet; PR #41 is merged at `cfeff9f`.
- No production DNS, secret, migration or deployment change is authorised.

## Next single recommended action

Define the isolated staging host, data plane, configuration-presence matrix,
operators, live verification plan and rollback conditions. Then request a
separate Product Lead decision before creating or changing any environment.

Do not begin billing changes, WombatOps rollout, broad feature work or production configuration inside this discovery action.

## Closure rule for the active outcome

The public-audit outcome remains **implementation complete / outcome open** until:

- a production architecture is explicitly approved;
- staging or an accepted verification environment passes the abuse, privacy and cost-boundary checks;
- an exact production release is approved and executed or the audit is intentionally kept disabled/deterministic;
- the assisted release is observed and residual risks are recorded;
- `CURRENT_STATE`, `DECISIONS`, `OPERATIONS`, `LAUNCH_READINESS` and evidence reflect the final state;
- a learning review is completed;
- a fresh session recovers the next action from repository sources without chat history.
