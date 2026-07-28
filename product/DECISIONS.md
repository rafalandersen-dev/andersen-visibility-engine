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

## 2026-07-28 — Public audit moves to a dedicated Cloudflare Worker

**Status:** Accepted  
**Decision authority / Outcome Owner:** Rafal Andersen  
**Evidence:** issue #37 Gate 0, ADR-0001, issue #39

### Decision

Keep the Milo web application on Lovable Cloud, but move the complete public-audit execution boundary to a user-controlled Cloudflare Worker on the `milogrowth.com/api/public-audit*` route.

The Worker owns Turnstile, trusted client IP derivation, request/fetch/AI limits, Supabase RPC/cache access, outbound fetch and AI generation. It does not proxy the audit operation to Lovable. Public-audit secrets remain Worker-only, and the old Lovable server function stays fail-closed or is removed from the public flow.

### Reason

Official platform evidence does not prove the edge header ownership, direct-origin blocking or exact runtime guarantee required by the merged Lovable-hosted design. A Worker-owned endpoint removes the shared-header bridge and gives Milo a separately deployable, observable and reversible trust boundary.

### Consequences

Gate 0 architecture selection is complete. Production remains NO-GO until the Worker is implemented, verified against an isolated staging data plane, independently reviewed and approved for an exact production release. DNS, secrets, migrations and deployment require later explicit approvals.

## 2026-07-28 — Worker AI provider is direct paid Gemini

**Status:** Accepted and merged  
**Decision authority / Outcome Owner:** Rafal Andersen  
**Evidence:** issue #43 discovery checkpoint, issue #44, PR #45, merge commit `696cb73b8ae68af86bcf6f75c8c73b9a1fc7855a`

### Decision

Replace the Worker's assumed Lovable AI-gateway credential with the direct
native Gemini API behind a Worker-only `GEMINI_API_KEY`, keeping the
deterministic fallback, the approved limits and the 50/day atomic paid-AI
ceiling unchanged.

### Reason

Lovable documents `LOVABLE_API_KEY` as platform-managed and does not document
exporting it to an external Cloudflare Worker. Depending on it from the
dedicated Worker was an unsupported security assumption. Google's paid Gemini
API is directly supported, and paid-service prompts/responses are not used to
improve Google's products under the cited terms.

### Consequences

The provider boundary is code-complete on `main` with regression tests that
prevent Lovable gateway credentials or endpoints from returning to the Worker.
No Gemini key exists, no billing is enabled and no environment is mutated;
credential creation and paid-service activation require a separate approval
under issue #43.

## 2026-07-28 — Cloudflare-hosted minimal staging harness, code-only

**Status:** Accepted and merged; environment mutation remains NO-GO  
**Decision authority / Outcome Owner:** Rafal Andersen  
**Evidence:** issue #43 staging recommendation, PR #46, merge commit `80375249dfcf9e371d82ebf7c28f2983fc4ab047`

### Decision

Use a Cloudflare-hosted minimal staging harness served by the public-audit
Worker itself for the first isolated security verification, instead of a paid
Vercel custom environment. Merge only the fail-closed, disabled-by-default
code: a separately named `milo-public-audit-staging` Wrangler environment with
empty committed configuration, `workers_dev=false`, `preview_urls=false` and
enablement hard-limited to `staging.milogrowth.com`.

### Reason

The harness model keeps the first staging pass near USD 0 platform cost while
preserving the exact reviewed `POST /api/public-audit` code path. Fail-closed
configuration guarantees the production hostname cannot serve the harness even
through operator error.

### Consequences

Code-only staging work is complete at `8037524`. The active gate is
account-level read-only discovery of Cloudflare, Supabase and Google Cloud
state under issue #43, followed by one bounded, separately approved staging
mutation package. No route, custom domain, secret, widget, key, project,
migration or deployment exists as a result of the merge.
