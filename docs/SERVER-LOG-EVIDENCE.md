# Owner-supplied server and edge log evidence

R12 now has an independent project-scoped evidence intake in **Analytics**. It preserves the existing browser beacon, human referrals, GSC and answer evidence as separate signals. This path does not fetch logs, connect a vendor, verify bots or establish complete crawler coverage. Public paid launch remains NO-GO; full R12 and R00–R24/D01–D08 acceptance remain open.

## Prepare, preview and save

1. Select the intended client project in Analytics. Download the blank log template. Populate it from an authorized, locally prepared export of actual server or edge requests. The blank fields are deliberate; no production examples or fabricated captures are supplied.
2. Declare a nonsecret source label, edge/origin layer, collection method/version, hostname and time window (start inclusive, end exclusive, explicit timezone, at most31days). Mark completeness `complete`, `partial` or `unknown`. Every declaration remains unverified, even `complete`.
3. Include only public page paths that you have checked for personal data and secrets. Set `publicPathsConfirmed:true` after checking. No query strings, fragments, percent encoding, email-like paths, URLs in paths, traversal or arbitrary request fields are accepted. Public slugs support letters and numbers in the Unicode Basic Multilingual Plane, including current UI languages; supplementary characters and whitespace are refused consistently with storage length limits. Paths and labels are supplied text: structural validation cannot prove a path is public or detect every secret embedded in a slug. Do not include sensitive paths or labels.
4. Each row contains exactly `time`, `page`, integer HTTP `status`(100–599), HTTP `method` and `userAgent`. Do not paste raw access logs. IPs, cookies, headers, request bodies, request identifiers and verification flags are not import fields; extra fields reject the entire file. An invalid row rejects the entire import. The file is read locally; arbitrary UA text is reduced to a fixed recognized claim or `unknown` before the safe document can be uploaded. The original UA/file is never stored or exported.
5. Review the complete safe JSON preview before clicking **Save private evidence**. Nothing is written merely by selecting a file. Save binds to the authenticated owner and selected saved project. A failed/ambiguous save is never automatically retried; refresh history to reconcile first.

Input limits are500kB per file,500rows,1,024characters per supplied UA,240characters per public path,80characters per source/method label. Safe documents are preflighted at180kB UTF-8 JSON, with a200kB PostgreSQL JSON storage ceiling. Complete history is capped at50imports per project; bounded reads/exports return all imports, not a partial-page aggregate. Remove or export old records when needed.

The declared hostname identifies the supplied log stream; it is not DNS-resolved or compared as proof of ownership. Separate hosts/subdomains may belong to a project. No URL is fetched or turned into an automatic link. The import and preview are evidence data, never executable instructions.

## Claims, dedupe and analysis

`ua-token-claim-v1` recognizes only one bounded, case-insensitive token among GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Perplexity-User, Googlebot and bingbot. Unknown, no match or conflicting matches produce `unknown`. This is a versioned token dictionary, not an exhaustive or current provider registry. Client-supplied claim labels are inherently untrusted; the authenticated server revalidates the allowlist and canonical safe data. There is no IP/DNS/provider identity verification and no UI control to self-attest a verified identity.

Times normalize to UTC. Within an import, rows with the same instant, page, method, status and claim collapse; order is canonical. Safe-input hashes deduplicate identical imports within owner/project scope, regardless of original UA wording or duplicate-row counters. Two real requests with identical safe fields cannot be distinguished. Counts therefore describe **supplied unique evidence rows**, never verified traffic or unique visitors. Modified labels or provenance can create another independent supplied import; this is not proof of distinct real-world observations.

Each import has its own page, UTC-day, status, method and claimed-agent counts for the selected UTC date range. Imports are never pooled, even if sources/windows match; edge and origin can record the same request, and overlapping exports can duplicate evidence. `complete` indicates only owner-declared completeness when the selected interval is entirely within that import's declared window. Missing, partial and outside-window coverage remains unknown. Zero rows, including a declared complete empty import, never establishes measured zero crawler traffic. Requests do not prove that an AI system generated an answer, mentioned a brand, cited a page, sent a human referral or caused a conversion.

## History, corrections and erasure

Imports are immutable. **Add correction** selects a saved original; download the template with that `supersedesId`, fill with the replacement's actual complete safe evidence, preview and save. Only one immediate replacement is allowed; correct the latest correction for another revision. Originals remain inspectable/exportable but have no active summary, even when their replacement is outside the selected filter. Foreign project/owner correction targets are refused.

**Export full safe history** exports every stored safe document, provenance, hash, timestamp and correction link; it is an archive, not the single-import input format. **Remove** asks for an explicit permanent deletion and removes dependent correction chains. Deleting the saved owning project cascades to all its log evidence. No client records are pooled or copied into workspace learning.

One private RLS table `project_log_evidence` has no direct anon/authenticated/service data grants. Three service-only RPCs assert saved project ownership; the existing account lock serializes capacity, dedupe and correction writes. Unique constraints and scoped foreign keys enforce identity/correction relationships and deletion. Read, import and removal server functions require authentication and guard owner changes. The new migration is separate from all released P0–P5/answer migrations.

## Remaining acceptance

Automated vendor log intake, independently verified bot identity, representative real log coverage, ongoing collection and actual signed-in browser acceptance remain open. Structural checks/static rendering are not signed-in acceptance. No production logs, synthetic production records, provider/model requests, funding, vendor setup, email, client publication, browser-policy retries, new automation or timers are introduced. Stripe remains owner-deferred; other releases and Worker35/43 retain their separate boundaries.
