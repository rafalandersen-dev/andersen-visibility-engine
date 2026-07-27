# Milo Growth — Current State

**Status:** Canonical state candidate — Product Lead confirmation required  
**Last updated:** 2026-07-27  
**Evidence baseline:** `main` at `b24dfd1ab9e4149383cb601d15447286307ff777`  
**Product Lead / Outcome Owner:** Rafal Andersen  
**Current phase:** Private beta; transition from BUILD to REVENUE

## Recovery brief

Milo Growth is live as a supervised private-beta product and has a substantial
planning, content, publishing-governance and measurement codebase. The current
engineering baseline is healthy: PR #33 established the project-level Claude
configuration plus independent security and verification agents, and a fresh
checkout of `main` passes typecheck, all 1,154 tests and the production build.

Milo is not ready for an unattended paid public launch. The first implementation
branch must close the public AI-audit abuse surface and AI-credit-drain risk before
new feature work. Paid launch additionally requires server-authoritative billing
and completed legal identity.

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

**Claude project baseline and independent review agents merged through PR #33.**

Verified on 2026-07-27 against `main`:

- TypeScript: `./node_modules/.bin/tsc --noEmit` — PASS.
- Tests: `npm test` — PASS, 86 files / 1,154 tests.
- Production build: `npm run build` — PASS.
- Working tree before this state package: clean.

Supporting evidence:

- [PR #33](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/33)
- [Baseline commit `b24dfd1`](https://github.com/rafalandersen-dev/andersen-visibility-engine/commit/b24dfd1ab9e4149383cb601d15447286307ff777)
- [`evidence/verification-2026-07-27.md`](../evidence/verification-2026-07-27.md)

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

### P0 — Public audit exposes cost-drain and outbound-fetch abuse

**Status:** Confirmed in code; blocks broader acquisition.

`runPublicAiVisibilityAuditFn` is unauthenticated and explicitly unmetered. Every
request attempts an AI generation before falling back to a deterministic result.
No rate limit, CAPTCHA/Turnstile, global spend ceiling or duplicate-request cache
is applied. The same route accepts an arbitrary HTTP(S) URL and calls the generic
`fetchHtml`, which follows redirects and does not use the repository's guarded
`safeFetch` path.

Impact:

- automated requests can drain shared AI credits;
- the endpoint can be abused as a server-side fetch primitive;
- broad marketing traffic can exhaust the shared AI workspace and stop
  generation for legitimate testers.

Evidence:

- `src/lib/ai.functions.ts` — `runPublicAiVisibilityAuditFn`
- `src/lib/ai.functions.ts` — `fetchHtml`
- `src/lib/public-audit.ts` — `normalizeAuditUrl`

Required before widening beta:

- rate limit by IP plus a global daily ceiling;
- bot protection appropriate to the public form;
- request deduplication/cache;
- guarded outbound fetch with redirect revalidation;
- retain the deterministic fallback without spending AI credits when a limit is
  reached.

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

- `MILO_OUTBOUND_FETCH_MODE=workers` is a deployment invariant and has not been
  verified from repository evidence alone.
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

## Next single recommended action

Create one bounded P0 feature branch for the **public audit safety envelope**:

1. guarded outbound fetch with redirect revalidation;
2. IP rate limit plus global daily ceiling;
3. bot protection and duplicate-request caching;
4. deterministic no-AI fallback at the limit;
5. independent security review and verifier evidence.

Do not combine billing authority, repo-wide formatting, a redesign or new product
features into this branch.

## Closure rule for the next action

The P0 outcome is not complete until:

- adversarial tests cover internal/private targets, redirect-to-private,
  concurrency, rate-limit boundaries and AI-provider failure;
- TypeScript, full tests and build pass;
- the Security Reviewer returns PASS or all blockers are fixed;
- the Product Lead accepts the behaviour and spend limits;
- this file and the evidence record are updated;
- a fresh session successfully recovers the next action without chat history.

