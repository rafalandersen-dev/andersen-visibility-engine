# Milo Growth — Launch Readiness

**Status:** Canonical gate checklist  
**Last updated:** 2026-07-28  
**Product Lead:** Rafal Andersen

Readiness percentages are operating estimates, not guarantees.

| Launch mode            | Estimate | Verdict                                                     |
| ---------------------- | -------: | ----------------------------------------------------------- |
| Assisted private beta  | **~70%** | Proceed only with founder supervision and explicit controls |
| Unattended public SaaS | **~40%** | Blocked                                                     |

## Security and cost

- [x] Public-audit safety implementation merged in PR #36.
- [x] Guardrails approved: 5/IP/hour, 50 fetches/day, 50 paid-AI claims/day, 24-hour cache.
- [x] Targeted tests, TypeScript, isolated migration execution, build and security review recorded.
- [x] Replace the unproven Lovable trust boundary with ADR-0001's dedicated Worker architecture.
- [x] Implement and merge issue #39 with no environment mutation.
- [x] Complete independent security review and exact-head verification; merge PR #41 at `cfeff9f`.
- [x] Replace the unsupported Lovable AI-gateway dependency with the Worker-only direct Gemini boundary; merge PR #45 at `696cb73`.
- [x] Merge the fail-closed, disabled-by-default minimal staging harness with empty committed configuration; merge PR #46 at `8037524`.
- [ ] Authorise and complete account-level read-only discovery (Cloudflare zone/Access, Supabase project slot, Google Cloud Gemini quota/budget) with a SET / NOT SET matrix under issue #43.
- [ ] Approve one bounded staging mutation package and establish isolated Worker staging with a separate data plane.
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

**NO-GO for deploying the public-audit Worker to staging or production.**

Gate 0 is complete. ADR-0001 selects the dedicated Worker boundary; the issue
#39 implementation merged through PR #41 at `cfeff9f`, the direct Gemini
provider boundary merged through PR #45 at `696cb73`, and the fail-closed
disabled-by-default staging harness merged through PR #46 at `8037524`.
Code-only work under issue #43 is complete. The active gate is account-level
read-only discovery of Cloudflare, Supabase and Google Cloud state, returning a
SET / NOT SET matrix and one bounded staging mutation package for separate
Product Lead approval; production remains separately gated.
