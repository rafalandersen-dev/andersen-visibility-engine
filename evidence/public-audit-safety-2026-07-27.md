# Milo Public Audit Safety — Verification Evidence — 2026-07-27

**Repository:** `rafalandersen-dev/andersen-visibility-engine`  
**Issue:** #35  
**Draft PR:** #36  
**Branch:** `agent/p0-public-audit-safety`  
**Base:** `main` at `7ec16c0338a78921d9333593592bd18b74d36b36`

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
| Automatic Claude Code Review | PASS | Workflow run 30306194012 completed successfully; no inline findings |
| Dedicated security reviewer | PASS WITH FIXES | Re-review run 30307366919 confirmed all prior P0/P1 blockers closed. Its new P2 finding—failed fetches consuming AI slots—was then remediated with an independent atomic fetch counter; final review pending |
| Dedicated verifier | PENDING | To run after security review and any fixes |

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
- No production deploy or public release has been performed.
- Live Cloudflare edge-proof/header and egress behaviour has not been exercised
  from the final production environment.
- The full repository test suite has not yet been recorded by the dedicated
  verifier.

## Release gate

PR #36 must remain draft and unmerged until:

1. the dedicated security reviewer returns PASS or every blocker is fixed;
2. the dedicated verifier records TypeScript, targeted tests, full tests and
   build evidence;
3. the migration/configuration checklist in
   `docs/PUBLIC-AUDIT-SAFETY.md` is executed in the target environment;
4. the Product Lead makes a separate merge/release decision.
