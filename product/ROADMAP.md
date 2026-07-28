# Milo Growth — Roadmap

**Status:** Canonical outcome roadmap  
**Last updated:** 2026-07-28  
**Product Lead:** Rafal Andersen

This roadmap is not a delivery promise. Active work must have an Outcome Owner, acceptance criteria and evidence.

## Now

### Close the public-audit safety outcome

- [x] Complete issue #37 Gate 0 compatibility discovery.
- [x] Select the production trust-boundary architecture in ADR-0001.
- [x] Implement issue #39 locally: dedicated Cloudflare Worker owning the full public-audit operation.
- Complete exact-head security review and independent verification.
- Establish an isolated staging host and data plane.
- Run abuse-boundary tests and prepare an exact production release decision.
- After a separately approved release: observe, learn, write back and close.

## Next

### Establish paid-launch authority

- Make billing and plan entitlements server-authoritative.
- Implement and verify the Paddle webhook lifecycle.
- Prevent client writes from changing subscription authority.
- Enable hard authenticated AI limits with global budget control and provider-failure behaviour.

### Complete commercial readiness

- Confirm legal entity and operator details.
- Finalise Terms, Privacy, DPA, subprocessors, AI disclaimer and consent wording.
- Verify support and security contact channels.

### Run assisted beta

- Recruit 3–5 controlled testers.
- Verify onboarding, first value, support load, costs and product claims.
- Record incidents, conversion evidence and learning.

## Later

- Verify remaining WordPress, Shopify and GSC OAuth live paths.
- Improve product documentation and remove stale positioning.
- Recalibrate plans, limits and roadmap from beta evidence.
- Extract reusable Product Operating Template learning for WombatOps.

## Explicitly not committed

- Unattended public SaaS launch before billing, cost, legal and release gates pass.
- Ranking or revenue guarantees.
- Live rank monitoring unless separately built and verified.
- Multi-page crawler or JavaScript rendering unless separately approved.
- A redesign or broad feature expansion inside the public-audit safety outcome.
