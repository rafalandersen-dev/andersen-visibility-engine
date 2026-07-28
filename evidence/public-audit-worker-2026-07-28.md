# Dedicated Public Audit Worker — Implementation Evidence — 2026-07-28

**Issue:** #39
**Architecture:** `docs/adr/ADR-0001-public-audit-boundary.md`
**Branch:** `agent/public-audit-worker`; merged through PR #41 at `cfeff9f`
**Authority:** implementation only; no environment mutation

## Architecture-to-code mapping

| Requirement                                     | Implementation                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| Dedicated terminating Worker                    | `workers/public-audit/src/index.ts`                                                |
| Strict HTTP, host, origin and body boundary     | `createWorker().fetch`                                                             |
| Trusted Cloudflare IP and salted client key     | `normalizedClientIp` + `sha256`                                                    |
| Turnstile action/hostname binding               | `verifyTurnstile`                                                                  |
| Atomic request/fetch/AI/cache operations        | service-role REST RPC calls                                                        |
| Bounded user-site fetch                         | `workers/public-audit/src/safe-fetch.ts`                                           |
| Prompt-injection boundary and normalized output | `auditPrompt` + shared `normalizePublicAudit`                                      |
| Provider fallback                               | shared `deterministicFallbackAudit`                                                |
| Privacy-minimised logs                          | final `request_complete` event                                                     |
| Typed browser transport                         | `src/lib/public-audit-client.ts`                                                   |
| Old Lovable paid path removed                   | public export removed from `src/lib/ai.functions.ts`; former safety bridge deleted |
| Production Worker config                        | `workers_dev=false`, `preview_urls=false`, no private bindings                     |

## Changed boundary inventory

- new independent Worker package under `workers/public-audit/`;
- new typed public-audit HTTP client and tests;
- public audit page switched from TanStack server function to HTTP client;
- old public TanStack handler and edge-secret safety bridge removed;
- canonical safety, product and operating documents updated.

No real secret, route, DNS setting, database connection, migration, Worker
deployment or production credential was used.

## Verification

| Check                                       | Result                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Worker unit/integration/adversarial tests   | PASS — 2 files / 36 tests                                                                          |
| Worker TypeScript                           | PASS                                                                                               |
| Worker production dry-run                   | PASS — verifier rerun: 31.68 KiB upload, 9.26 KiB gzip, no bindings                                 |
| Full Milo test suite                        | PASS — 89 files / 1163 tests                                                                       |
| Milo production build                       | PASS                                                                                               |
| Changed-file ESLint                         | PASS except pre-existing `src/lib/ai.functions.ts:374 no-control-regex`, outside this diff         |
| `git diff --check`                          | PASS                                                                                               |
| Migration file integrity                    | PASS — current files match the previously isolated verified copies by SHA-256                      |
| Fresh PGlite migration/runtime verification | PASS — 5/6 rolling claims, 50/51 fetch, 50/51 AI, lease/cache/expiry, UTC rollover and anon denial |

The first Worker dry-run attempt was blocked by the local sandbox's unwritable
Wrangler log directory and an auto-generated parent Nitro deploy config. The
same exact source passed with an explicit Worker config and a writable temporary
Wrangler config directory. This did not require authentication or deployment.

## Residual risks and non-claims

- DNS rebinding is constrained but not eliminated because Workers does not
  expose resolve-and-pin sockets.
- AI gateway compatibility is statically implemented and mocked in tests; it
  still requires isolated staging verification with a non-production
  credential.
- The two database migrations are not applied to any connected environment.
- Turnstile replay, exact production hostname binding and Cloudflare route
  behaviour require isolated live staging evidence.
- No staging or production Worker, DNS route, secret or environment value
  exists as a result of this branch.

## Release state

Implementation, exact-tree verification and code-only merge are complete.
Production remains **NO-GO** under issue #37. The next action is to define and
separately approve isolated staging, not to deploy directly to production.
