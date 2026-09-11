# Individual backlink evidence — R14 continuation

Local foundation, not released or connected to a provider caller. The request contract covers at most100 representative referring-page links for a bounded92-day interval. Selection is either provider first-seen date or lost-status records whose last-seen date is in the interval. Provider dates and flags are retained separately; actual placement/removal timestamps remain unknown. It is not a complete web-link inventory.

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
