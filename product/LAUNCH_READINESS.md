# Milo Growth — Launch Readiness

**Status:** Canonical gate checklist  
**Last updated:** 2026-07-28  
**Product Lead:** Rafal Andersen

Readiness percentages are operating estimates, not guarantees.

| Launch mode | Estimate | Verdict |
|---|---:|---|
| Assisted private beta | **~70%** | Proceed only with founder supervision and explicit controls |
| Unattended public SaaS | **~40%** | Blocked |

## Security and cost

- [x] Public-audit safety implementation merged in PR #36.
- [x] Guardrails approved: 5/IP/hour, 50 fetches/day, 50 paid-AI claims/day, 24-hour cache.
- [x] Targeted tests, TypeScript, isolated migration execution, build and security review recorded.
- [ ] Prove or replace the Lovable/Cloudflare trust-boundary assumptions.
- [ ] Establish isolated staging or approve a documented alternative.
- [ ] Apply and verify the two migrations in the approved environment.
- [ ] Configure secrets and Turnstile without exposing values.
- [ ] Run staging abuse-boundary and privacy tests on the exact release SHA.
- [ ] Enable and verify server-authoritative hard AI limits for authenticated users.

## Billing

- [ ] Make plan and subscription authority server-only.
- [ ] Verify Paddle webhook signatures, replay handling and lifecycle states.
- [ ] Test upgrade, downgrade, cancellation, past-due and entitlement enforcement.

## Legal and privacy

- [ ] Confirm operating legal entity, address, registration and VAT data as applicable.
- [ ] Finalise Terms, Privacy, DPA, subprocessors, AI disclaimer and cookie/analytics wording.
- [ ] Confirm support and security contact channels.
- [ ] Complete qualified review where required.

## Operations and release

- [x] Product Lead and incident owner identified.
- [x] Public domain and hosting platform recorded.
- [x] Rollback baseline recorded.
- [ ] Assign migration operator, secret owner and rollback operator for production.
- [ ] Record environment configuration as SET / NOT SET without values.
- [ ] Approve exact release SHA, migrations, hostname and window.
- [ ] Run low-volume production smoke tests and assisted observation.
- [ ] Complete learning review, canonical writeback and fresh-session recovery.

## Product and beta

- [ ] Validate the full loop with 3–5 assisted testers.
- [ ] Record first-value completion, support load, incidents, costs and conversion evidence.
- [ ] Recalibrate readiness from beta evidence.

## Current release decision

**NO-GO for publishing PR #36 to the custom production domain.**

The next gate is issue #37 Gate 0: prove Lovable's required controls or approve a revised public-audit boundary.
