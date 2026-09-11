# Backlink monitoring — R14

Status: local evidence foundation, not exposed, released or provider-accepted. Overall delivery remains approximately 55%, implementation approximately 70%. The existing backlink profile/gap implementation does not provide dated new/lost history. This work fills that registered gap without presenting aggregate index counts as verified individual placements.

The new daily-series contract binds the domain, explicit subdomain scope, exact UTC calendar interval and daily grouping. A request covers at most 92 days. The normalized observation retains the provider task ID, provider-reported task cost, collection time, daily backlinks/referring-domain/main-domain gains and losses, and completeness. Missing days are explicit missing records; absent metrics remain null/partial. Provider-reported zeros remain zeros and do not prove that no link existed on the web. Counts are nonnegative safe integers. Duplicate/out-of-range/impossible dates, mismatched task/result scope and inconsistent item counts are rejected. Extra provider fields are not projected.

The contract follows the [DataForSEO daily new/lost timeseries documentation](https://docs.dataforseo.com/v3/backlinks-timeseries_new_lost_summary-live/), checked 11 September 2026. Daily grouping avoids the provider's whole-month/week expansion outside requested boundaries. This endpoint provides aggregate index observations; individual new/lost source and target URLs require a separate link-detail request and independent placement verification remains R15.

Validation: 22 local fixture tests, TypeScript and new-file lint pass. Tests include exact scope, missing versus zero, partial metrics, leap-day coverage, duplicate/out-of-range dates and invalid counts. No transport, account health check, provider/model request, cost or production mutation occurred. Logs `/tmp/milo-backlink-monitor-{focused,types,lint}.log`.

Required next implementation: private owner/project-bound request/history storage; current-account and canonical saved-domain checks; durable bounded account quota and supplier expense reservation; one-time dispatch with uncertain outcomes held rather than retried; bounded fixed-endpoint transport with cost reconciliation; explicit localized owner controls and saved history; dated link-detail evidence; configured-provider acceptance and monitoring authorization. Do not wire this pure normalizer into automatic analysis or a paid call before that request lifecycle exists. These are implementation tasks within the full scope, not new user approval requests. No credentials, provider configuration or sending policy is changed.

## Pay-as-you-go health and bounded pricing — 11 September 2026

DataForSEO's [July pricing update](https://dataforseo.com/update/pricing-update-in-dataforseo-apis) removed monthly Backlinks commitments on 1 July 2026. A null legacy subscription expiry therefore no longer marks an otherwise successful account response with a valid balance as an error. Existing paused, low-balance and malformed/error handling remains. The [current Backlinks prices](https://dataforseo.com/pricing/backlinks/backlinks) and [Backlinks data API description](https://dataforseo.com/backlinks-data-api), verified 11 September, specify $0.024 per request plus $0.000036 per row, including time-series data.

A pure pricing helper validates the monitoring scope and computes an integer micro-USD ceiling from the inclusive daily row bound: 24,036 for one day and 27,312 for 92 days. It records the source and verification date. This does not provision expense budgets or authorize dispatch; pricing must be revalidated before activation.

Validation: 59 focused tests across three files, TypeScript and changed-file lint pass. Logs `/tmp/milo-backlink-paygo-{focused,types,lint}.log`. Official documentation was read; no account health call, paid provider call, credential change or production mutation occurred. Durable request lifecycle and live acceptance remain outstanding as listed above.

## Isolated transport foundation

An internal transport posts one exact daily request to the fixed DataForSEO live timeseries endpoint. Redirects are refused; a15-second cancellation deadline spans headers and streamed body; responses are bounded to1MiB and4096chunks with fatalUTF-8 decoding and exact normalizer scope checks. Cancellation cancels the reader; safe generic errors do not expose credentials or provider bodies. HTTP or invalid-result failures do not establish zero supplier cost. No retries are performed. Successful output retains the provider task and reported cost for future accounting reconciliation.

Validation:12 mocked transport tests, TypeScript and changed-file lint pass (`/tmp/milo-monitor-transport-{tests,types,lint}.log`). No network request occurred. This module has no UI, route, scheduler or automatic-analysis caller; durable request/expense admission must be implemented before any activation.

## Durable owner request and supplier expense lifecycle

Unreleased migration20260911170000 adds two private tables and six functions (the owner helper is internal). Current, non-suspended owner/project checks precede nonwaiting workspace admission. Requests retain the exact saved website, daily scope, stable request ID, immutable result and an expiring private dispatch token. A repeated request returns its existing identity without a lease. One active request is allowed per project; persisted hourly request limits are20/account and200/global. Dispatch limits are2 active/account and4/global,5/minute/account and10/global,20/hour/account and100/global. Counters and in-flight leases survive project/account deletion. History projects20 records without exclusive mutation locks or private lease fields.

The internal server lifecycle derives the exact hostname (including www) from the saved website and accepts only project/request IDs, dates and explicit subdomain scope. A browser-supplied target/owner is rejected. Saved website and scope are rechecked against reservation evidence. Dispatch atomically reserves existing global/account supplier expense using a fixed DataForSEO operation and inclusive-day price bound. Missing, paused, exhausted or restricted budgets cannot dispatch. No budget or permit is created or activated; the existing restricted benchmark permissions remain unavailable to monitoring.

The supplier is invoked once after confirmed dispatch admission. Stale leases, replays and unconfirmed acknowledgements never authorize another call. Valid reported cost is rounded upward to integer micro-USD and reconciled; absent cost retains unknown expense. If reconciliation fails, valid observation evidence is still stored with accounting pending and the original reservation retained. Changed websites/expired dispatched attempts remain unknown, never free or automatically retried. Provider concurrency leases retain their original deadline.

Validation:55 tests across daily normalization, pricing, mocked transport, actual SQL and server orchestration, plus TypeScript and changed-file lint pass. Logs `/tmp/milo-monitor-flow-{tests,types,lint}.log`. SQL tests include duplicate identity, exactly-once dispatch, restricted permit refusal, quotas, deletion persistence, current-account authorization, website changes, expiry, negative/wrong-scope cost evidence and preserved evidence on reconciliation failure. Initial migration CASE syntax and fixture typing issues were caught and corrected locally. No database migration or real provider request occurred.

Still required before exposure/release: owner-facing localized controls and safe error/status presentation, saved-history projection and durable accounting reconciliation recovery, dated individual-link details, final combined validation/review and configured-provider acceptance. No UI, route or scheduler calls this internal lifecycle yet. Generic internal database-call reuse currently has team-specific error copy; the future endpoint must present backlink-specific safe states. Monitoring authorization and existing budget configuration boundaries remain unchanged.

## Saved history and accounting recovery

The unreleased migration now includes a seventh function for owner-bound accounting recovery. It reconciles only immutable saved supplier cost for a successful observation, preserves the original reservation when accounting is unavailable, is idempotent after settlement, and cannot convert unknown provider outcomes into zero-cost settlements. Recovery never invokes the supplier.

Authenticated server endpoints now expose explicit requests, bounded saved history and accounting recovery. Actor identity comes from the verified session; client targets, costs and lease fields are refused. Public history projection checks owner/project identity, exact saved scope, continuous inclusive dates, metric completeness and missing-versus-zero semantics, and omits private request metadata. Request failures return a safe uncertain/unavailable state without internal provider details. No UI or automatic caller has been added yet.

Validation: 39 tests across four files, TypeScript and changed-file lint pass (`/tmp/milo-history-final-{tests,types,lint}.log`). This includes actual SQL recovery with restored budget evidence, duplicate recovery, unknown outcomes, malicious endpoint fields, history isolation and malformed stored evidence. No migration, provider invocation or production mutation occurred. Localized UI, dated link details, combined review and configured-provider acceptance remain outstanding.

## Owner controls and saved daily history

The existing backlinks page now includes explicit daily-count controls and saved request history. The component is keyed by authenticated user, project and saved website; query caching is scoped by user/project and stale history is hidden when the current read fails. Opening the panel reads history only. Collection requires a valid inclusive 1–92 day interval and an explicit form submission. One UUID remains visible for the attempt; retries are disabled and starting another request is a separate user action. Unknown outcomes instruct the owner to inspect history and never imply zero charge.

History shows the exact recorded hostname, subdomain choice, dates, collection status and accounting state. Daily metrics retain null as an em dash and real zero as zero. Only a saved successful observation with pending accounting offers accounting recovery. Recovery uses stored supplier evidence, without collection. Source copy distinguishes index observations from individual placement verification and makes clear that automatic monitoring is not enabled. All controls and status copy are supplied in English, Polish, Swedish and Danish.

Validation: 24 focused tests across server-rendered UI, history projection and authenticated endpoints, TypeScript and changed-file lint pass (`/tmp/milo-monitor-ui-{tests,types,lint}.log`). These are local static-render and mocked endpoint checks, not browser or configured-provider acceptance. No supplier call, budget configuration, credential change or migration occurred. Dated individual-link details, combined branch validation/review, deployment and required real-use/monitoring acceptance remain outstanding.

## Lease budget for successful-result persistence

Collection now requires40seconds remaining before dispatch authorization and30seconds afterward. This reserves the bounded10-second admission call,15-second supplier transport,10-second persistence call and5seconds of processing/round-trip margin. Short remaining leases cannot trigger the supplier. Unknown authorization outcomes retain the existing fail-closed expense behavior.

Validation:22 focused transport/orchestration tests and changed-file lint pass (`/tmp/milo-monitor-lease-tests.log`, `/tmp/milo-monitor-lease-lint.log`), including20/25/29.999/30second post-admission boundaries and a39.999second pre-admission refusal. Combined type/test/build verification follows the merge with the latest team release branch. No supplier request or production mutation occurred.

## Normalize provider configuration before expense admission

The lifecycle trims both provider credential values consistently with the provider health check, then refuses empty values before any context read, reservation or dispatch. The admitted transport receives the normalized values. Three regressions cover each whitespace-only field and surrounding whitespace without logging credentials.

Validation:25 focused orchestration/transport tests, TypeScript and changed-file lint pass (`/tmp/milo-monitor-credential-{tests,types,lint}.log`). Finding3991903020 addressed. No provider call, credential configuration or production mutation occurred.

## Collection controls follow provider availability

The existing provider status now enables monitoring collection only for a configured ready account or low-balance account with a positive reported balance. Loading, errors, missing configuration, paused accounts and zero/unknown low balance disable the fields and submit handler. Saved history and accounting recovery remain accessible. A localized explanation is supplied in English, Polish, Swedish and Danish. This uses the existing status request; no new provider health request is added.

Validation:7 static-render UI tests, TypeScript and changed-file lint pass (`/tmp/milo-monitor-availability-{tests,types,lint}.log`). The new test verifies disabled submission with retained history and no mutation. This is UI availability feedback, not a replacement for server credentials and durable expense admission; current supplier availability can still change after a status read. Finding3991986446 addressed. No live provider request, migration or configuration action occurred.
