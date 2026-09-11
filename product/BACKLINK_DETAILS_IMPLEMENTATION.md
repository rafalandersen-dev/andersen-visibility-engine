# Individual backlink evidence — R14 continuation

Local foundation, not released or connected to a provider caller. The request contract covers at most100 representative referring-page links for a bounded92-day interval. Selection is either provider first-seen date or lost-status records whose last-seen date is in the interval. Provider dates and flags are retained separately; actual placement/removal timestamps remain unknown. It is not a complete web-link inventory.

The payload uses the documented domain target syntax with an explicit domain_to filter preserving the logical hostname, including www, and optional genuine subdomains. Echoed request parameters and every returned destination are verified. Dates, chronology, counts, duplicate evidence, URL schemes/credentials, metrics and a256KiB retained-evidence budget are checked; omitted rows and truncated anchors are explicit. No pagination token is exposed yet and no follow-up request is automatic.

Source: [DataForSEO Backlinks Live](https://docs.dataforseo.com/v3/backlinks-backlinks-live/), checked11September2026. Provider acceptance of the exact filters must still be verified under the existing controlled-call boundaries.

Validation:22 fixture tests, TypeScript and changed-file lint pass (`/tmp/milo-details-{tests,types,lint}.log`). Remaining work includes private request/history storage, exact project and displayed-website binding, bounded expense/concurrency admission, accounting recovery, pagination, localized UI, provider acceptance and ongoing monitor configuration. No provider call, purchase, credential, migration or production mutation occurred.


Internal transport is implemented for the fixed Backlinks Live endpoint, with one POST, redirects refused, a15-second deadline,1MiB body and4096-chunk ceilings, strict UTF-8/JSON and full scope normalization. Cancellation aborts transport and cancels a stalled response reader. Provider bodies and credentials are not propagated in errors. Unusable responses remain ambiguous for charging; callers must preserve accounting recovery. Credentials are trimmed and blanks rejected before dispatch. No route or lifecycle currently calls this transport: durable expense and dispatch admission must precede connection.

Validation:35 detail normalization and transport fixture tests pass, including HTTP failures without retries, oversized/malformed bodies, scope mismatch, prior cancellation, stalled-body cancellation and blank credentials. These tests make no provider request.
