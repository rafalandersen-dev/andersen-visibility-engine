# Milo Growth — Decisions

**Status:** Canonical decision log  
**Last updated:** 2026-07-28  
**Product Lead:** Rafal Andersen

## 2026-07-27 — Public-audit guardrails

**Status:** Approved  
**Decision authority / Outcome Owner:** Rafal Andersen  
**Evidence:** issue #35

### Decision

The public AI Visibility Audit safety envelope uses:

- 5 audit claims per salted IP identity per rolling hour;
- 50 outbound fetch claims per UTC day globally;
- 50 paid-AI claims per UTC day globally;
- 24-hour result cache;
- bot proof before fetch or AI;
- guarded outbound fetch and deterministic fallback.

### Reason

The unauthenticated audit must not become an uncontrolled AI-cost or server-side-fetch surface.

### Consequences

The limits are product guardrails. Changing them requires a new Product Lead decision. Implementation does not authorise production release.

## 2026-07-28 — Merge PR #36

**Status:** Approved and completed  
**Decision authority / Outcome Owner:** Rafal Andersen  
**Evidence:** PR #36, merge commit `0d163dd32cd807463fc40e6c41fafd1176b94e5f`, issue #35

### Decision

Merge the verified implementation by squash to `main`.

### Reason

Targeted tests, TypeScript, isolated migration execution, Vercel build, automatic review and dedicated security review supported merge. The independent verifier recorded its dependency limitation explicitly.

### Consequences

Implementation is canonical on `main`. Production migrations, secrets, edge configuration and publishing remain separately gated.

## 2026-07-28 — Production release remains NO-GO

**Status:** Approved operating position  
**Decision authority / Outcome Owner:** Rafal Andersen  
**Evidence:** issue #37 Gate 0

### Decision

Do not publish the merged public-audit implementation, apply its two production migrations or configure its secrets until the runtime and trust-boundary contract is proven.

### Reason

Lovable Cloud is the hosting platform and Cloudflare terminates public traffic, but current evidence does not prove:

- server-owned stripping and injection of `X-Milo-Edge-Auth`;
- direct-origin blocking;
- the exact Workers egress property assumed by the implementation;
- a separate non-production data plane;
- all required environment scopes.

### Alternatives

1. Prove the necessary Lovable controls.
2. Move the public-audit boundary to a user-controlled Cloudflare Worker or verified egress proxy.
3. Keep the public audit deterministic/no-AI without user-controlled server fetch.

### Review trigger

Review when hard platform evidence exists or a revised architecture is ready for approval.
