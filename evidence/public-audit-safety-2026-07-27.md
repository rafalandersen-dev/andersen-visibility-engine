# Milo Public Audit Safety — Verification Evidence — 2026-07-27

**Repository:** `rafalandersen-dev/andersen-visibility-engine`
**Issue:** #35
**Merged PR:** #36
**Branch:** `agent/p0-public-audit-safety`
**Base:** `main` at `7ec16c0338a78921d9333593592bd18b74d36b36`
**Merge commit:** `0d163dd32cd807463fc40e6c41fafd1176b94e5f`

## Implemented controls

- Server-authoritative 5-request rolling-hour claim per salted IPv4 /32 or IPv6
  /64 client hash, with bounded stale-event cleanup.
- Fail-closed edge authentication: `cf-connecting-ip` is trusted only with a
  constant-time verified, Cloudflare-injected shared proof.
- Production Turnstile verification before user-site fetch or paid AI.
- Shared fail-closed SSRF/redirect/body/timeout boundary.
- Independent atomic 50/day UTC fetch and paid-AI claims. Failed fetches consume
  only the fetch budget and cannot corrupt the paid-AI usage signal.
- 24-hour URL/language cache plus short generation lease.
- Deterministic fallback on provider failure; limit and duplicate-in-progress
  decisions short-circuit without an outbound fetch.
- Privacy-minimised storage and observability.

## Checks

| Check | Result | Evidence |
|---|---|---|
| Targeted public-audit security tests | PASS | 2 files / 26 tests |
| Targeted TypeScript | PASS | `tsc --noEmit` for the new server boundary and tests |
| Migration execution | PASS | Fresh PGlite PostgreSQL runtime accepted both complete migrations |
| Rolling-hour behaviour | PASS | Claims 1–5 allowed, claim 6 refused, next claim allowed after 1 hour |
| Cache/dedup behaviour | PASS | First claim `claimed`, concurrent duplicate `busy`, completed result `cached`, result expired after TTL |
| Atomic UTC-day ceiling | PASS | Claims 1–50 allowed, claim 51 returned `limit`, next UTC day restarted at 1 |
| Independent fetch ceiling | PASS | Fetch claims 1–50 allowed, claim 51 refused without changing paid-AI usage |
| RLS/table privilege smoke test | PASS | `anon` table read refused |
| Vercel production build/preview | PASS | GitHub Vercel status `success`; preview marked Ready |
| Automatic Claude Code Review | PASS | Functional head workflow 30307898922 completed successfully; no inline findings |
| Dedicated security reviewer | PASS WITH FIXES | Final run 30307906406 confirmed all prior P0/P1/P2 blockers closed and listed no code change required before merge |
| Dedicated verifier | BLOCKED | Run 30307923481 statically passed claim ordering and migration composition, but could not run dependency-backed checks because its checkout had no `node_modules` and its contract forbids installation |

## Commands run in the isolated verification scaffold

```text
npm test
npm run typecheck
node verify-migration.mjs
```

The PGlite check used a fresh in-memory PostgreSQL-compatible runtime and did not
connect to or mutate the production Supabase project.

## Not yet claimed

- The migration has not been applied to the target Supabase project.
- Production Turnstile keys, hostname, IP salt and edge secret have not been
  created or set.
- The six production environment variables and Cloudflare edge injection have
  not been verified.
- Direct-origin blocking and preview isolation/protection have not been verified.
- The custom production domain remains on an older pre-PR-#36 deployment; the merged implementation has not been published.
- Live Cloudflare edge-proof/header and egress behaviour has not been exercised
  from the final production environment.
- The full repository test suite has not yet been recorded by the dedicated
  verifier.
- The verifier's whitespace-only findings were corrected after its read-only
  run.

## Release gate

PR #36 is merged. The implementation is canonical on `main`, but production release remains **NO-GO** under issue #37.

Gate 0 confirmed Lovable Cloud hosting, Cloudflare termination, protected preview and an older custom-domain production deployment. It did not prove the required edge header ownership, direct-origin blocking, exact Workers egress property, correct environment scopes or isolated staging data plane.

Do not publish the merged implementation, apply the two production migrations or configure the new secrets until:

1. the platform contract is proven or a revised public-audit boundary is approved;
2. the staging/verification model is approved;
3. the exact environment passes the required abuse, privacy and cost-boundary tests;
4. the Product Lead approves a precise production release decision.

Implementation merge is complete; release, observation, learning review and outcome closure remain open.
