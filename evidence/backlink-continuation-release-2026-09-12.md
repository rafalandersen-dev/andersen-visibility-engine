# Backlink continuation release — 12 September 2026

Explicit continuation of individual backlink evidence is released through [PR127](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/127). Users can request another page beyond the original 20,000-result offset boundary while preserving the original website and filters. Every page consumes its own configured supplier allowance; opening or refreshing history makes no supplier request.

## Reviewed source and validation

- Reviewed source: `35164e6cc7ef8c5b226a19dbcf15c3e7c17d8dae`.
- Normal merge: `5f0f82e2b34be2c1c81b7b8e580c240b354b056b`, merged at **2026-09-12T00:23:04Z**.
- [Final code review](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/127#issuecomment-5642114027) found no major issues. [Final security review](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/127#issuecomment-5642126554) found no security issues. Both identify the reviewed source above. All review threads were resolved, with the last 100 audited and no earlier page.
- [Current CI](https://github.com/rafalandersen-dev/andersen-visibility-engine/actions/runs/34660986399) passes **4,035 tests in 292 files**, TypeScript, frozen dependency checks and production builds on both Bun 1.3.3 and 1.4.0.
- Local correction checks pass 58 focused tests and changed-file lint. Earlier integrated checks passed 320 backlink tests before the final cycle correction. The local SQL/transport integration fixture collects two pages, creates exactly two expense records and makes exactly two fake supplier requests; replay makes no additional request.

## Behavior and limits

Each page is bound to the authenticated owner, project, current saved website and completed parent request. The database derives every filter and private continuation token from immutable parent evidence and requires settled parent accounting. A unique child relationship prevents duplicate continuation requests. Existing account/global quotas and durable expense admission apply separately to every page, and uncertain results do not trigger automatic supplier retries.

Review finding 3994344478 identified multi-step token cycles. A private root identity, checked SHA-256 cursor fingerprint and unique per-chain index now prevent A → B → A cycles and longer repetition before another child can be requested. Fixed-size fingerprints support the full 8,192-byte token bound. Independent chains retain independent token scope.

English, Polish, Swedish and Danish controls explain allowance use, existing child requests and the 10,000-page cap. Tokens and lease fields are omitted from public responses and history. Row counts describe observations and may contain repeated links across pages; they do not establish a unique or complete web-link inventory. Actual placement/removal dates remain unknown.

## Database and live verification

Migration `20260912000000` was applied **once** after a successful local guarded rehearsal. The guard checks 30 released migration hashes, existing expense/monitor/details functions and permit permissions, and refuses missing prerequisites, drift, active publishing and repeated application. No released migration was edited or reapplied.

Production matches all expected catalog fields: one private table, four service-only functions, 10 columns, 8 constraints and 3 indexes, including permissions, exact function definitions, migration hash and an empty initial page table.

| Release identity | Verified value |
| --- | --- |
| Deployment | `1d34bc6a-2502-48f2-b0f9-539d6f24e6ef` |
| Verified at | `2026-09-12T00:24:38.725Z` |
| Build | `1789172638429` |
| Runtime Git revision | `5f0f82e2b34be2c1c81b7b8e580c240b354b056b` |
| Source fingerprint | `bb9f8b4b26d17d577b96f5c7eaaa74a7dd119a2573c95adf6a55c767cb47401d` |

Exact hosting source was confirmed before the single deployment. Runtime revision, clean source metadata, fingerprint and every source component match the merged checkout.

All six checks pass: root GET 200; MCP GET 200 and OPTIONS 204; unauthenticated MCP POST, weekly scheduler POST and notification sweep POST each 401. Fresh post-release comparisons confirm all prior content/usage/queue/timer, collaboration, notification, daily backlink, individual backlink and technical SEO baselines are unchanged. The new page catalog also matches the rehearsal after deployment.

## Evidence and remaining acceptance

Local verification records: `/tmp/milo-pages-production-migration-result.json`, `/tmp/milo-pages-production-post-verification.json`, `/tmp/milo-pages-runtime-verification.json`, `/tmp/milo-pages-post-release-*.json`, `/tmp/milo-cycle-guard.log` and `/tmp/milo-pages-ci-34660986399.log`.

No real provider, model, Google, customer website, email or CMS call, funding/permit/credential change, production sample record or recurring-monitor activation occurred. Tests use local SQL and a fake supplier. Real signed-in/browser and supplier acceptance, ongoing monitoring and wider R14/R15 delivery remain open. The overall planning estimate remains approximately **60% overall / 75% implementation**; paid launch remains NO-GO.
