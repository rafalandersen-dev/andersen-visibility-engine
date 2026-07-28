# Public Audit Worker Safety Contract

**Status:** Implementation candidate for issue #39. Production and staging remain
NO-GO until separately approved under issue #37.

## Boundary

`workers/public-audit/` is the complete execution boundary for the unauthenticated
audit. Lovable hosts the UI, but does not receive or execute the audit request.
The browser uses `src/lib/public-audit-client.ts`; the former public TanStack
server function and its shared-edge-secret bridge have been removed.

The Worker accepts only:

- `POST /api/public-audit`;
- exact `application/json`;
- an 8 KiB bounded body with only `url`, `language` and `botProof`;
- a configured host and exact same-origin request;
- a valid Cloudflare client IP and Turnstile proof bound to the
  `public_audit` action and configured hostname.

No permissive CORS or credentialed cross-origin response is emitted.

## Approved limits

- 5 claims per salted IPv4 /32 or IPv6 /64 identity per rolling hour.
- 50 user-controlled outbound fetch claims per UTC day.
- 50 paid-AI claims per UTC day.
- 24-hour cache by query-free normalized URL and language.

All claims are atomic Supabase RPCs. Cache hits consume neither fetch nor AI
claims. The fetch claim happens before outbound traffic; the AI claim happens
only after a successful HTML fetch.

## Worker-only configuration

Secret values must never be committed, logged or configured in Lovable.

| Name                           | Scope                                                    |
| ------------------------------ | -------------------------------------------------------- |
| `SUPABASE_URL`                 | Worker only                                              |
| `SUPABASE_SERVICE_ROLE_KEY`    | Worker secret only                                       |
| `PUBLIC_AUDIT_IP_SALT`         | Worker secret only; at least 24 characters               |
| `TURNSTILE_SECRET_KEY`         | Worker secret only                                       |
| `LOVABLE_API_KEY`              | Worker secret only                                       |
| `PUBLIC_AUDIT_ALLOWED_HOSTS`   | Worker non-secret comma-separated allowlist              |
| `PUBLIC_AUDIT_ALLOWED_ORIGINS` | Worker non-secret comma-separated exact-origin allowlist |
| `PUBLIC_AUDIT_AI_MODEL`        | Optional Worker non-secret model override                |
| `VITE_PUBLIC_AUDIT_API_URL`    | Public UI endpoint; same-origin path is the default      |
| `VITE_TURNSTILE_SITE_KEY`      | Public UI site key                                       |

`PUBLIC_AUDIT_EDGE_SECRET`, `X-Milo-Edge-Auth` and
`MILO_OUTBOUND_FETCH_MODE=workers` inside Lovable are not part of the selected
architecture.

The committed production config has `workers_dev=false`, `preview_urls=false`
and no service, VPC, Hyperdrive, TCP or private-network binding.

## Outbound fetch

The Worker:

- permits HTTP/HTTPS on default ports only, without userinfo;
- blocks literal loopback, private, link-local, reserved, multicast, metadata
  and IPv4-mapped IPv6 targets, including URL-parser-normalised encodings;
- validates every manual redirect;
- permits only HTML/XHTML;
- caps redirects, time and bytes;
- forwards no browser cookies, authorization or platform credentials;
- never returns fetched HTML or target headers to the browser.

Cloudflare Workers does not provide resolve-and-pin sockets. DNS rebinding is a
recorded residual risk, constrained by the isolated Worker, absence of private
bindings, redirect/literal checks and the 50/day global fetch ceiling.

## Data and observability

Supabase receives only salted client hashes, counters, cache keys and completed
audit JSON. Raw IP, query strings, page HTML, Turnstile tokens and secrets are
not stored.

Structured logs contain only:

- event type;
- result class;
- duration;
- first 12 characters of the salted client key.

Public errors are bounded and contain no provider, database or network detail.
AI failure returns the conservative deterministic result; cache-write failure
does not expand the atomic paid-AI ceiling.

## Database

The Worker reuses the additive, service-role-only migrations:

1. `20260727220000_public_audit_safety.sql`;
2. `20260727223000_public_audit_fetch_budget.sql`.

They remain unapplied to staging and production. Fresh PGlite verification must
pass before any environment approval.

## Release gate

Implementation and tests do not authorize deployment. Before production:

1. establish an isolated staging hostname and data plane;
2. apply and verify both migrations there;
3. create scoped Worker secrets and Turnstile configuration;
4. deploy only the exact reviewed SHA with public preview URLs disabled;
5. repeat abuse, privacy, concurrency, provider-failure and rollback tests;
6. obtain independent security review and verifier results;
7. prepare the exact production route, configuration-presence matrix and
   rollback plan;
8. obtain explicit Product Lead approval under issue #37.
