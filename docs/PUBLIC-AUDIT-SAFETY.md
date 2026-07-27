# Public Audit Safety Envelope

**Status:** Code/config contract for issue #35. Production release remains blocked
until the migration and all required environment variables are verified in the
target environment.

## Approved beta limits

- 5 submissions per privacy-preserving client/IP hash per rolling hour.
- 50 paid public-audit AI generations per UTC day.
- 24-hour result cache keyed by normalized URL plus output language.

The values are server constants. The browser cannot raise or bypass them.

## Required production configuration

Set these in the server/Workers environment:

| Variable | Requirement |
|---|---|
| `MILO_OUTBOUND_FETCH_MODE` | `workers` for the approved Cloudflare Workers deployment, or `egress-proxy` only when a separately verified proxy pins and filters resolved destinations |
| `PUBLIC_AUDIT_IP_SALT` | Secret random value of at least 24 characters, used only to hash client IPs before storage |
| `PUBLIC_AUDIT_EDGE_SECRET` | Secret random value of at least 24 characters; Cloudflare removes any incoming `X-Milo-Edge-Auth` and injects this value before forwarding to the origin |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret; server-only |
| `PUBLIC_AUDIT_ALLOWED_HOSTNAME` | Exact production hostname expected in successful Turnstile verification |
| `VITE_TURNSTILE_SITE_KEY` | Public Turnstile site key used by the audit page |

The endpoint is fail-closed by default. `PUBLIC_AUDIT_RUNTIME=local` is the only
opt-out for local/test execution; only in that explicit mode may
`PUBLIC_AUDIT_BOT_BYPASS=true` skip Turnstile. `NODE_ENV` never relaxes a
security check.

Do not commit any real key or salt. Do not deploy until the target environment
contains all six values, Cloudflare injects the matching edge proof, direct
origin access is blocked, and preview deployments are protected or isolated
from production Supabase.

## Database migration

Apply:

`supabase/migrations/20260727220000_public_audit_safety.sql`

It adds:

- service-role-only rolling-window request events;
- an atomic global UTC-day counter;
- a result cache with a short processing lease to deduplicate concurrent AI
  generation.

No raw IP, URL, query string, page HTML or Turnstile token is stored.
IPv4 clients are keyed by /32 and IPv6 clients by /64. Each claim also performs
a bounded global cleanup of stale request events.

## Outbound-fetch boundary

The endpoint uses the shared `safeFetch` path:

- HTTP(S) only and no embedded credentials;
- blocks loopback, private, link-local, reserved, multicast, metadata and
  IPv4-mapped IPv6 literals;
- manually revalidates every redirect target;
- caps redirects, timeout and streamed body bytes;
- accepts only HTML/XHTML.

Cloudflare Workers does not expose a trustworthy resolve-and-pin socket API.
Therefore lexical hostname validation is not presented as DNS-rebinding
protection. The blocking mitigation is the existing fail-closed deployment
invariant: outbound fetches run only in the approved Workers egress environment
or behind a separately verified egress proxy. Any unset or unknown mode refuses
the fetch.

## Release verification

Before production:

1. apply the migration in the target Supabase project;
2. configure Turnstile for the exact production hostname and `public_audit`
   action;
3. set the six required environment variables and edge header injection;
4. block direct origin access and protect or isolate preview deployments;
5. verify a spoofed `cf-connecting-ip` without the edge proof is rejected;
6. verify missing/invalid Turnstile tokens cannot trigger a user-site fetch;
7. verify five rolling-hour claims pass and the sixth is refused;
8. verify global claim 50 passes and claim 51 short-circuits before any user-site
   fetch or paid AI call;
9. verify a duplicate URL/language returns the cached result without another AI
   claim;
10. run the full test suite, TypeScript, build, security review and independent
   verifier;
11. obtain Product Lead release approval.
