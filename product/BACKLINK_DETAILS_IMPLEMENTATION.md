# Individual backlink evidence — R14 continuation

## Current status — 12 September 2026

PR127 deeper continuation is released and verified at `5f0f82e2b34be2c1c81b7b8e580c240b354b056b`, building on PR126. Migration `20260912000000_backlink_detail_pages.sql` was applied once. See [current release evidence](../evidence/backlink-continuation-release-2026-09-12.md). The implementation uses one private table and four service-only wrappers around the released details lifecycle. No released migration was edited.

Each fresh request creates a root page; a continuation accepts only the current displayed website, project, stable request identity and completed parent identity. The database derives every filter and opaque cursor from that parent's immutable evidence, requires settled accounting and the same owner/project/current website, and permits only one child per parent. A private root identity and unique cursor index reject any previously followed token in the entire chain, including multi-step cycles; the check is scoped to that chain. Request replay returns saved identity without another supplier dispatch. Existing global/account quotas and durable expense admission apply to each explicit page; no funding or permit is created.

The existing bounded transport now also normalizes continuation responses. Only the server sees cursor values. Saved history includes page number, previous returned-row count, child request identity and continuation availability. Its count checks account for preceding pages while retaining legacy single-page history support. Neither row totals nor the absence of a next cursor establish a complete or unique backlink inventory.

The English, Polish, Swedish and Danish interface exposes an explicit allowance-consuming next-page action, freezes the attempted identity while its outcome is uncertain, and reads history to recover status. A local integration fixture exercises authentication-derived owner identity, actual SQL/expense admission, the bounded transport with a fake supplier, saved history, final-page counts and replay: two pages create two expense records and exactly two fake supplier requests. Browser and real provider acceptance remain open.

Validation: all 320 focused backlink tests across 20 files, TypeScript and changed-file lint pass. Logs: `/tmp/milo-pages-focused-tests.log`, `/tmp/milo-pages-final-types.log`, `/tmp/milo-pages-final-lint.log`. Final source35164e6 passes 4,035 tests/292 files, TypeScript and production builds in both CI variants; 58 focused correction tests and the full database rehearsal also pass. Overall planning estimate remains approximately 60% / implementation 75%, with real-use acceptance and ongoing monitoring still open.

## Historical implementation checkpoints

The dated entries below describe intermediate states and are superseded by the release record and current status above.

Released explicit collection/history foundation via PR126 on11September2026. See [release evidence](../evidence/backlink-details-release-2026-09-11.md); later historical implementation entries below are superseded by that release record. The request contract covers at most100 representative referring-page links for a bounded92-day interval. Selection is either provider first-seen date or lost-status records whose last-seen date is in the interval. Provider dates and flags are retained separately; actual placement/removal timestamps remain unknown. It is not a complete web-link inventory.

The payload uses the documented domain target syntax with an explicit domain_to filter preserving the logical hostname, including www, and optional genuine subdomains. Echoed request parameters and every returned destination are verified. Dates, chronology, counts, duplicate evidence, URL schemes/credentials, metrics and a256KiB retained-evidence budget are checked; omitted rows and truncated anchors are explicit. No pagination token is exposed yet and no follow-up request is automatic.

Source: [DataForSEO Backlinks Live](https://docs.dataforseo.com/v3/backlinks-backlinks-live/), checked11September2026. Provider acceptance of the exact filters must still be verified under the existing controlled-call boundaries.

Validation:22 fixture tests, TypeScript and changed-file lint pass (`/tmp/milo-details-{tests,types,lint}.log`). Remaining work includes private request/history storage, exact project and displayed-website binding, bounded expense/concurrency admission, accounting recovery, pagination, localized UI, provider acceptance and ongoing monitor configuration. No provider call, purchase, credential, migration or production mutation occurred.


Internal transport is implemented for the fixed Backlinks Live endpoint, with one POST, redirects refused, a15-second deadline,1MiB body and4096-chunk ceilings, strict UTF-8/JSON and full scope normalization. Cancellation aborts transport and cancels a stalled response reader. Provider bodies and credentials are not propagated in errors. Unusable responses remain ambiguous for charging; callers must preserve accounting recovery. Credentials are trimmed and blanks rejected before dispatch. No route or lifecycle currently calls this transport: durable expense and dispatch admission must precede connection.

Validation:35 detail normalization and transport fixture tests pass, including HTTP failures without retries, oversized/malformed bodies, scope mismatch, prior cancellation, stalled-body cancellation and blank credentials. These tests make no provider request.


### Private requests and expense-controlled lifecycle

Unapplied migration20260911180000 adds one private request/history table and five service-only functions. It reuses the released monitoring owner check and persistent global/account request, rate and concurrency buckets. Each request binds the owner, saved website, project, six-field scope and stable request UUID. Reservations last60seconds; dispatch requires more than40seconds remaining and rechecks the website before expense admission. Exactly one provider attempt follows successful admission; uncertain outcomes retain the reservation and never trigger an automatic retry. Immutable successful observations support accounting recovery without a provider call. History returns the latest20 records with lease secrets omitted.

The reservation ceiling is24000+36×requested-row-limit micro-USD (1–100rows), based on [current supplier pricing](https://dataforseo.com/pricing/backlinks/backlinks), checked11September2026. No budget, permit or funding is created. The new lifecycle derives the hostname from the saved website and requires the displayed website to match before reservation. No public endpoint or UI invokes it yet.

Validation:42 local actual-SQL and mocked-lifecycle tests, TypeScript and changed-file lint pass (`/tmp/milo-details-lifecycle-{tests,types,lint}.log`). Tests include cross-owner denial, stable replay, missing/paused/restricted expense refusal, ceiling bounds, shared monitoring quotas, immutable evidence, accounting recovery, uncertain dispatch, and shortened leases. Remaining work includes validated history projection, authenticated endpoints, localized UI, pagination, provider acceptance and ongoing monitoring. Migration remains unapplied; no live provider call or production mutation occurred.


### Authenticated collection and validated history

Three POST server functions now require the existing Supabase authentication middleware and derive the owner from the session: explicit collection, history read and accounting recovery. Input schemas reject owner/target/lease/cost overrides. History projects only public request status and normalized evidence; owner/project, scope, status, counts, timestamps/chronology, destination host, credentials/scheme, duplicates, truncation and retained byte bounds are checked. Actual placement/removal dates remain null. Operational lease fields are stripped. The collection endpoint preserves uncertainty without exposing internal failure details or implying a safe retry.

Validation:24 history/endpoint tests, TypeScript and changed-file lint pass (`/tmp/milo-details-history-{tests,types,lint}.log`). These are schema/registration/handler fixtures, not browser or live authenticated acceptance. No UI yet invokes the endpoints and migration180000 remains unapplied. Next implement localized collection/history UI, then combined review/release and controlled provider acceptance; pagination and ongoing monitoring remain open.


### Localized detail interface

BacklinkDetails is integrated into the existing backlinks page alongside daily monitoring. English, Polish, Swedish and Danish controls provide first-seen or lost-status/last-seen selection,1–100 requested results, dates and subdomain scope. Explicit actions use one stable request ID with automatic mutation retries disabled; opening the view reads saved history only. Current provider availability gates collection. History refresh and accounting recovery remain available independently. Cache and component identity include the signed-in actor, project and displayed website. Read errors hide stale evidence.

The evidence view shows source/destination links, escaped anchor text, provider first/last seen dates, rank, spam score and reported-lost status. Null values remain distinct from zero; retained/returned/total counts and incomplete-result notices are explicit. Actual placement/removal dates are described as unknown. Additional pages are not automatically collected; pagination and ongoing monitoring remain unfinished.

Validation:6 static-render interface tests across four locales, TypeScript, changed-file lint and production build pass (`/tmp/milo-details-ui-{tests,types,lint,build}.log`). An initial test expected a React hydration comment absent from static markup; the assertion now checks rendered rank text. No browser or live provider acceptance is claimed. Migration180000 remains unapplied; combined suite and review are next.


### Explicit bounded result pagination

Each request now includes an offset from0 through20000, using the provider's documented offset pagination contract. The strict scope, immutable replay identity, request echo, lifecycle and SQL reservation all bind this offset. Every page needs a fresh explicit collection request and its own existing expense admission; the requested-row ceiling is unchanged. Counts and further-result detection include the offset, and impossible nonempty page totals are rejected. The four-language interface exposes results to skip and records the offset/limit in history. The live index may change between pages; duplicate-free snapshot coverage is not claimed.

Source: [Backlinks Live request parameters](https://docs.dataforseo.com/v3/backlinks-backlinks-live/), checked11September2026. Search-after tokens for deeper traversal beyond20000 remain unimplemented; the bounded offset feature does not complete arbitrary-depth pagination or ongoing monitoring.

Validation:116 focused detail normalization/history/lifecycle/actual-SQL/endpoint/transport/UI tests, TypeScript and changed-file lint pass (`/tmp/milo-details-pagination-{tests,types,lint}.log`). New regressions cover later-page echo mismatch, total-count consistency, offset limits, stable replay changes and expense ceilings. Full3572 suite/build evidence at33f7aa1 predates pagination. The unapplied180000 migration now requires seven scope fields, including offset; no production migration or provider call occurred.


### Deterministic pagination ordering

Every request sorts by the selected provider timestamp descending, then referring URL ascending and destination URL ascending. The unique retained URL pair breaks timestamp ties without changing the three-field provider sorting limit. The exact sort tuple is also required in the provider request echo. This addresses review3992604363; live-index changes between requests remain possible and explicitly disclosed.

Validation:43 normalization/transport tests, TypeScript and changed-file lint pass (`/tmp/milo-pagination-order-{tests,types,lint}.log`). Full3581tests/265files and build at636244d predate these sort tie-breakers. Current review/build are required; no provider call or production mutation occurred.

### Deep continuation contract foundation — 12 September 2026 (unreleased)

An isolated pure pagination module now preserves every initial request parameter while adding the provider's opaque search-after token. It verifies exact saved scope and echoed token, refuses repeated/non-progressing cursors, bounds token bytes and chain length, and counts returned observations separately from unique backlink inventory. The original offset stays unchanged; continuation can advance beyond it. Missing continuation is not a claim that the web backlink inventory is complete.

Official contract rechecked at https://docs.dataforseo.com/v3/backlinks-backlinks-live/: all other parameters must match the previous request, and each response supplies the next unique token. Tokens are not decoded or reconstructed. This module performs no request and is not connected to production endpoints. Private owner/project/parent-request persistence, expense admission, transport/controller wiring, history and explicit UI continuation remain required before this feature is usable. Published migration180000 is unchanged.

Validation:43 existing-detail and new-pagination tests, TypeScript and changed-file lint pass (`/tmp/milo-pagination-foundation-{tests,types,lint}.log`). No provider request, SQL mutation or deployment occurred. Overall estimate remains approximately55% and implementation70% pending meaningful release/acceptance milestones.

### Review correction — chain-wide token cycles

Finding3994344478 identified that checking only the immediately preceding token allowed A → B → A cycles. The new private root identity, indexed cursor lookup in result persistence and unique per-chain request-token index refuse those cycles before another child can be requested. The existing uncertain-result path retains the expense reservation and exposes no cursor. A separate chain may still use an independently returned matching token. Published migrations remain unchanged.
