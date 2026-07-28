# Milo Growth — Current State

**Status:** Canonical current state — Product Lead approved  
**Last updated:** 2026-07-28  
**Evidence baseline:** `main` at `0d163dd32cd807463fc40e6c41fafd1176b94e5f`  
**Product Lead / Outcome Owner:** Rafal Andersen  
**Current phase:** Private beta; transition from BUILD to REVENUE

## Recovery brief

Milo Growth remains a supervised private-beta product transitioning from BUILD to REVENUE. The first Andersen OS P0 cycle has completed audit, Product Lead approval, implementation, independent review, verification and merge. PR #36 is canonical on `main` at `0d163dd`, but the outcome is not closed: release, observation, learning review and final recovery verification remain open.

Production still serves an older pre-PR-#36 deployment. Issue #37 Gate 0 returned **PARTIAL PASS / NO-GO** because current evidence does not prove the Lovable/Cloudflare edge trust contract, direct-origin blocking, exact Workers egress property or isolated staging model. No P0 migrations or new production secrets have been applied.

Milo is not ready for an unattended paid public launch. Paid launch additionally requires server-authoritative billing, authenticated hard AI limits, completed legal identity and live operational verification.

## Readiness

These are operating estimates, not test-coverage scores.

| Launch mode | Estimate | Definition | Current verdict |
|---|---:|---|---|
| Assisted private beta | **~70%** | Small invited cohort, founder support, manual activation/payment, controlled spend and explicit limitations | **Proceed cautiously** after the public-audit P0 is contained |
| Unattended public SaaS | **~40%** | Open acquisition, self-serve paid billing, enforced cost controls, final legal identity, verified integrations, support and incident ownership | **Blocked** |

The estimates originate from the approved Andersen OS rollout. They must be
recalibrated after the first complete beta cohort and a fresh launch-readiness
review.

## Last verified achievement

**Public AI Visibility Audit safety implementation merged through PR #36; production release remains gated.**

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

### P0 — Public-audit safety implementation merged; release trust boundary unresolved

**Status:** Implementation complete on `main`; outcome open; production release NO-GO.

PR #36 replaced the unmetered public audit path with the approved safety envelope: bot proof, salted IP rolling-hour limit, independent global fetch and paid-AI ceilings, 24-hour cache, guarded outbound fetch, bounded redirects/body/timeouts and deterministic fallback.

Production release is blocked because Milo is hosted and published through Lovable Cloud. Current Gate 0 evidence confirms Cloudflare termination and a Cloudflare-compatible build target, but does not prove the security contract required by the merged code:

- client-supplied `X-Milo-Edge-Auth` is always stripped and a server-owned value is injected;
- direct-origin access is blocked;
- the runtime provides the exact Workers egress property assumed by `MILO_OUTBOUND_FETCH_MODE=workers`;
- the six environment values can be scoped correctly;
- a separate non-production Supabase data plane exists.

Required next:

1. obtain hard platform evidence for the required Lovable controls; or
2. approve a user-controlled Cloudflare Worker / verified egress proxy as the public-audit boundary; or
3. keep the public audit deterministic/no-AI without user-controlled server fetch.

Do not publish PR #36, apply its two production migrations or configure its secrets while Gate 0 remains NO-GO.

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

- The merged public-audit implementation depends on a Lovable/Cloudflare trust boundary that remains unproven; issue #37 is the controlling release gate.
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
- Issue #39 is the bounded implementation packet.
- No production DNS, secret, migration or deployment change is authorised.

## Next single recommended action

Implement issue #39: extract the complete public-audit boundary into a user-controlled Cloudflare Worker, prove it in isolated staging, and return an exact release recommendation. Gate 0 selected the Worker architecture in ADR-0001; production remains NO-GO.

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
