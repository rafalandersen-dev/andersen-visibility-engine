# Branded authentication email admission

Prepared after 13ee5a8 on codex/milo-report-branding-authority-20260912; per-source/per-action revision on codex/milo-continuation-review-20260919 after 5e9baf. Unreleased; paid NO-GO and existing release/provider/account boundaries persist. Addresses the application-level request-admission portion of R23/R24; not full authentication abuse or live acceptance.

## PR136 finding 4053416794 — shared global bucket exhaustion (fixed)

The prior admission used a single `auth_email_global_hour` "all" bucket (120/hour) shared across every request. Because each recipient minute/hour counter is per-recipient, a spread of distinct nonexistent recipients bypassed the recipient rules, and roughly 121 unique recipients in an hour exhausted the shared global cap — an attacker-controlled, universal rejection that blocked signup **and** recovery for everyone. The all-users bucket is removed.

## Per-source, per-action admission

Admission now runs after input/configuration checks and before generateLink in both handlers. Source/action counters are checked **before** the shared recipient counters, in two rule families:

- **Source counters — per source AND per action (checked first)**: a bounded private-beta policy of three per fixed UTC minute and twenty per fixed UTC hour, keyed by (action, source). Signup pressure from a source cannot drain that source's recovery capacity, and a distinct source cannot consume another source's allowance. There is no all-users bucket to exhaust.
- **Recipient counters — shared across both actions**: one request per normalized recipient per fixed UTC minute and six per fixed UTC hour. Switching between signup and recovery grants no additional recipient allowance.

Ordering matters. A source already over its own quota is rejected before any recipient counter is created or incremented, so it cannot mint recipient rows for a spread of fresh names, and it cannot spend a known recipient's minute/hour allowance to lock that recipient out. The tradeoff of checking source first is that every attempt — including one whose recipient counter would otherwise have denied it — now consumes the source's minute/hour budget before the recipient counter is consulted; a repeated request for a single already-limited recipient therefore spends the source budget rather than being stopped at the recipient counter. That cost is bounded (3/min, 20/hr per source) and self-inflicted, and it is the smaller risk than letting an over-quota source poison arbitrary recipients' shared counters.

Attempts consume counters, including attempts that later fail; these are request limits, not billable usage or delivered-email counts. Fixed-window boundaries still allow adjacent-window bursts. Thresholds are initial and require operational review before launch.

## Source identity from the server runtime

The source is the trusted-edge client IP resolved at the handler boundary with `getRequestIP({ xForwardedFor: false })` from `@tanstack/react-start/server`. That resolver returns `event.req.context.clientAddress || req.ip` and never reads `x-forwarded-for`; the built Nitro Cloudflare adapter's `augmentReq` sets `req.ip` from the trusted edge `cf-connecting-ip` under `runtime.name = "cloudflare"`. Cloudflare documents `cf-connecting-ip` as the header carrying the original visitor IP to the origin ([CF HTTP headers reference](https://developers.cloudflare.com/fundamentals/reference/http-headers/)); the edge sets it, unlike a client-forgeable `x-forwarded-for`. The value is never taken from an input field or a raw forwarded header, so a client-supplied `x-forwarded-for` is ignored.

A missing or unparseable source fails closed (generic "temporarily unavailable") before any RPC or administrative call — there is no universal "unknown" bucket. Sources are validated with `node:net` `isIP` (available under workerd `nodejs_compat`) and canonicalized so equivalent IPv6 notations collapse to one key; IPv6 is grouped by its /64 network prefix so privacy-extension interface-identifier rotation inside a subnet cannot mint fresh allowances, and IPv4-mapped IPv6 is scoped by the embedded IPv4. No raw address is logged or stored; only HMAC digests reach the counter table.

## Storage, keys and diagnostics

Reuses the service-role-only `bump_rate_limit` RPC from migration 20260708190000_oauth_rate_limits.sql (atomic insert/on-conflict increment; existing 24h cleanup covers all windows, which are at most one hour). No new migration, grant or cleanup job is required. All recipient and source counter keys are HMAC-SHA256 values keyed by the existing server service-role secret with bucket/action-specific input; raw addresses, recipients and secrets are not stored. Normalization is trim/lowercase for recipients; mailbox aliases remain separate. Rotating the server key resets the effective counter identity. RPC response errors, rejections, missing/malformed counts, malformed action and unavailable key material stop the operation with fixed generic messages.

## Scope and limitations

This is a bounded correction, not complete abuse protection:

- Distributed abuse from many independent sources is still **not** stopped; per-source quotas only bound a single source.
- Shared-NAT or CGNAT clients share one source budget, so a busy egress IP can be throttled collectively.
- Fixed windows admit adjacent-window bursts.
- Correct source attribution depends on a trusted-edge deployment supplying `cf-connecting-ip`; off that edge the source is absent and admission fails closed.
- No external CAPTCHA/proof-of-work is added here, and this does not replace native Supabase auth controls or solve all distributed abuse.

## Verification

Tests cover: source/action isolation and shared recipient keys (source keys are now the first RPCs, recipient keys the last); many varied recipients from one source denied at the per-source quota while another source and the recovery action stay usable; an over-quota source rejected before any shared recipient counter is created or incremented — fresh recipient names leave the recipient rows byte-for-byte unchanged, a different source can then still request one of those names, and the exhausted source keeps its separate recovery quota; the per-source hourly quota across separate minute windows; canonicalization and /64 grouping (equivalent notation and rotated interface identifiers collapse, IPv4-mapped equals its IPv4) with no raw address stored; missing/malformed source and unknown action refused before any counter call; missing key material, malformed counts, sanitized RPC errors, inclusive limits and early stopping; and both real handlers supplying the runtime source and action with a spoofed input `x-forwarded-for` ignored (handler mocks now cover the `@tanstack/react-start/server` import). The focused admission/account-retention/presentation suites and the full unit suite were executed for this revision; command results and counts are recorded in `evidence/continuation-integration-review-2026-09-19.md`. Every counter, transport and edge resolver in those tests is a synthetic in-memory or mocked fixture: no live counter mutation, authentication, email, credential operation or deployment was performed. Before release, verify the RPC and its grants on the target, confirm the edge supplies `cf-connecting-ip`, and exercise the stated limits in an isolated authorized environment.
