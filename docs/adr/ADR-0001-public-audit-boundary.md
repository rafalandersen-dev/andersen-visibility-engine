# ADR-0001 — Public audit boundary

**Status:** Accepted  
**Date:** 2026-07-28  
**Decision authority:** Rafal Andersen, Milo Product Lead  
**Gate:** Issue #37 Gate 0  
**Implementation packet:** Issue #39

## Context

Milo is hosted by Lovable Cloud and served on `milogrowth.com` through Cloudflare. The merged public-audit implementation assumed controls that the documented Lovable platform contract does not prove: trusted edge header stripping/injection, direct-origin blocking, an exact Workers egress guarantee and an isolated staging data plane.

A Cloudflare-compatible build target and a `server: cloudflare` response header are not sufficient evidence for those controls. Publishing the existing server function with `MILO_OUTBOUND_FETCH_MODE=workers` would therefore create a false security claim.

## Decision

Use a **user-controlled Cloudflare Worker as the complete public-audit execution boundary**.

- Lovable Cloud continues to host the Milo web application.
- Cloudflare routes only the production audit API path, expected as `milogrowth.com/api/public-audit*`, to the Worker.
- The Worker terminates the audit request and does not forward it to Lovable.
- Turnstile verification, trusted client IP derivation, URL normalization, request/fetch/AI limits, cache coordination, outbound page fetch and AI generation all execute inside the Worker boundary.
- The Worker uses the existing service-role-only Supabase RPCs and cache schema after they pass isolated staging verification.
- Public-audit secrets and the Supabase service-role credential exist only in the Worker environment. They are not configured in Lovable.
- AI generation uses a direct paid Gemini API credential scoped to the Worker. The architecture does not assume that Lovable's managed `LOVABLE_API_KEY` can be exported or used outside Lovable.
- The browser calls the same-origin audit API path. Only the Milo production and approved staging origins are accepted.
- The existing Lovable/TanStack public server function is removed from the public flow or left permanently fail-closed without the Worker-only secrets.
- `workers.dev` and public preview URLs are disabled for the production Worker. Staging uses a separately named host and isolated data plane.
- The new architecture does not use `X-Milo-Edge-Auth`; that shared-header bridge existed only for the rejected edge-to-Lovable design.

## Outbound-fetch security contract

The Worker receives no VPC, service, TCP or other private-network bindings. It applies defense in depth:

- HTTP/HTTPS only, default ports only and no embedded credentials;
- block loopback, private, link-local, reserved, multicast, metadata and IPv4-mapped IPv6 literals;
- manual redirect handling with validation on every hop;
- bounded redirects, timeout, response bytes and accepted HTML content types;
- no forwarding of user credentials or sensitive response headers;
- 50 global fetch claims per UTC day before outbound traffic;
- observability without raw IPs, query strings, page HTML, tokens or secrets.

Cloudflare Workers does not expose a resolve-and-pin socket API, so DNS rebinding is recorded as a residual risk rather than described as eliminated. Its impact is constrained by the isolated Worker execution environment, absence of private-network bindings, lexical and redirect controls, and the hard global fetch budget. Staging security review must verify this exact assumption before production approval.

## Rejected alternatives

### Keep the audit inside Lovable

Rejected. Current platform evidence does not prove the required edge/origin controls or exact runtime contract.

### Use a Worker only as a header-injecting proxy to Lovable

Rejected. It preserves an unnecessary shared-secret bridge and leaves a second origin/path that must be proven unreachable.

### Keep the audit deterministic with no server fetch or AI

Safe fallback, but not the selected target. It remains the rollback mode and must stay available until the Worker release is observed successfully.

## Consequences

- Gate 0 topology discovery is complete and the architecture question is resolved.
- Production remains **NO-GO**. This ADR authorises design and implementation only, not DNS, secrets, migrations or deployment.
- The existing PR #36 controls are reusable conceptually, but code must be separated from TanStack/Lovable request assumptions.
- A dedicated Worker package, isolated staging environment, security review and exact production release approval are required.
- The public audit can be disabled independently without taking down Milo.
- The Worker has an independently documented provider boundary; missing or failed Gemini access returns the deterministic fallback rather than reopening the Lovable execution path.

## Exit criteria

This decision is implemented only when issue #39 acceptance criteria pass on an exact release SHA and issue #37 advances through staging evidence to a separate production approval.
