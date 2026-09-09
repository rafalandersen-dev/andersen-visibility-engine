# Milo Growth — Operations

**Status:** Canonical operating record; configuration presence not reverified

**Last updated:** 2026-09-09

**Product Lead / incident owner:** Rafal Andersen

Do not store secret values or customer data in this file. Read [CURRENT_STATE.md](./CURRENT_STATE.md) for evidence limits and [ROADMAP.md](./ROADMAP.md) for the next outcome.

## Source, hosting and environment

| Item | Recorded state |
| --- | --- |
| Source | `rafalandersen-dev/andersen-visibility-engine`, application baseline main `c99a398177b55828e2e8e642a59304fd85421859` (#98), rechecked 9 September |
| Public domain | `https://milogrowth.com`; build `1788901947226` and #98 fingerprint rechecked 9 September; see CURRENT_STATE.md |
| App/platform | Lovable-connected application; Vercel deployment status also exists. Verify actual routing/build identity before production assertions |
| #63 deployment evidence | Vercel success on merge commit; [deployment record](https://vercel.com/andersen-hq/andersen-visibility-engine/2j1J3RS58sT5LHZsie8FxGAKAkxz) |
| Database | Lovable Cloud / Supabase-backed code; latest #98 permit migration applied/verified 8 September; no migration rerun in this review |
| Public-audit Worker | Direct Gemini boundary and staging harness in source; later production routes committed; actual deployed/account state requires discovery |
| Isolated staging | Separate data plane/configuration presence still requires evidence under #43 |
| AI limits | RPC/no-row metering fixed #65; native monetary admission #96 and restricted permits #98 live; zero budgets/permits/attempts in last recorded read; runner and actual reconciliation pending |
| Billing | Server entitlements and #80 isolated Stripe sandbox/receipts exist; configuration/lifecycle acceptance deferred; legacy Paddle alignment remains |
| Email | Inbox/outbox/sweep deployed; owner test delivered/opened; global operational sending last recorded disabled, team/lifecycle acceptance open |

## Existing public-audit boundary

ADR-0001 selects a dedicated Worker, not an edge-header bridge into Lovable. Preserve approved limits: 5/IP/hour, 50 fetches/day, 50 paid-AI claims/day, 24-hour cache. These values are not changed by the roadmap.

Issue #43 already authorizes read-only discovery. Complete outstanding account/runtime facts and return a configuration-presence matrix plus a concrete mutation/release package. Do not request that same read-only approval again. This plan performs no configuration mutation and issues no new staging/production GO.

Required presence checks (record **SET / NOT SET / UNKNOWN**, never values):

- Worker-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_AUDIT_IP_SALT`, `TURNSTILE_SECRET_KEY`, `GEMINI_API_KEY`.
- `PUBLIC_AUDIT_ALLOWED_HOSTS`, `PUBLIC_AUDIT_ALLOWED_ORIGINS`, optional `PUBLIC_AUDIT_AI_MODEL`.
- `PUBLIC_AUDIT_STAGING_HARNESS_HOST`, `PUBLIC_AUDIT_STAGING_TURNSTILE_SITE_KEY` for the isolated harness.
- Public `VITE_PUBLIC_AUDIT_API_URL`, `VITE_TURNSTILE_SITE_KEY`.
- Additive migrations `20260727220000_public_audit_safety.sql`, `20260727223000_public_audit_fetch_budget.sql`; check actual environment application rather than infer it from git.
- Current deployed routes/host allowlists, isolated data plane, bot verification, quota controls, logging/retention and rollback.

Do not reintroduce `PUBLIC_AUDIT_EDGE_SECRET`, `X-Milo-Edge-Auth`, Lovable-side `MILO_OUTBOUND_FETCH_MODE=workers` or Lovable AI-gateway credentials into the dedicated Worker architecture. The July statement that no route is committed is obsolete; runtime activation still needs evidence.

## New operating outcomes from September planning

- [ ] Cost ledger, account/global budget reserve/reconcile, bounded agent tools/retries, alerts and emergency pause. Track user allowances separately from provider expense and supplier placement costs.
- [ ] Background scheduler/job health, stuck/missed slots, duplicate/uncertain publication, per-project pause and safe recovery. Test while logged out.
- [ ] Durable notification outbox, dedupe/recheck, delivery/retry history, assigned recipient and preferences. Operational emails remain available during AI budget failure. No approval/publication side effects on email GET links.
- [ ] Stripe event reconciliation, payment/entitlement drift, quota period/reset/refund handling, existing subscriber migration and public policy alignment.
- [ ] AI observation freshness, collection method, missing samples and provider failures; separate crawler logs, answer citations, referrals and conversions.
- [ ] Connector expiration/revocation and credential storage/migration fallback verification. Do not expose credentials in client state, logs or screenshots.
- [ ] Tenant isolation, data export/deletion and backup/recovery exercise; practical support/incident handling and deploy verification.

## Weekly business refresh and specialist jobs — required implementation

Follow the [specialist/knowledge/weekly specification](AGENT_WEEKLY_PLAN_2026_09_09.md). Persist project-scoped source versions, affected-output dependencies, slot/job/asset identity, last-check time and bounded cost. One coordinator owns each slot across monthly→weekly cutover and rollback. Preserve completed output, pauses, cancellations, owner edits and approval versions through retries. Recheck relevant facts before publication; hold unresolved critical conflicts and show the specific next action. Source outages are unknown observations.

Use scoped, bounded refreshes and relevant specialist tasks, with authenticated/deduplicated store events where implemented and periodic reconciliation. Revoke extracted/cached knowledge when its source access is removed. Recheck notification state/recipient before a grouped readiness or blocked-content alert. Version/evaluate workflow changes and retain rollback; agents cannot alter their own authority or budgets. These are operating requirements, not evidence that weekly monitoring is running.

## Ownership and release

Rafal owns product/release/incident decisions. Assign execution, migration, secret rotation, rollback and verification operators in each concrete packet; do not assume an unnamed parallel chat is responsible. Existing approval context applies; avoid repeated approvals for already-authorized work.

Every release records exact SHA/tree, test/review scope, environment/build identity, migrations/configuration names, rollout window, observation and rollback. A plan or GitHub status alone does not authorize every external action. No customer emails, provider orders or production changes are executed by this documentation update.

## Incident and rollback baseline

1. Pause the affected paid/automatic operation; preserve safe reading/manual work and operational communication.
2. For public-audit failures, use verified deterministic/no-AI containment or disable the affected route through the authorized operator.
3. Verify destination state before retrying an uncertain publication; never create a duplicate blindly.
4. Restore the prior verified deployment/configuration under the release packet; retain additive data and evidence.
5. Rotate actual affected credentials/salts if exposure is suspected; the rejected edge secret is not part of this architecture.
6. Record incident, customer impact, cost, remediation and next action without secrets or unnecessary personal data.
