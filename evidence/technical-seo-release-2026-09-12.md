# Technical SEO release — 12 September 2026

The technical SEO crawler, immutable finding capture, Google indexed-version inspection and separate field/lab performance workflows are released. Production verification completed at **2026-09-11T23:50:11.127Z** (12 September in Stockholm). Required signed-in, multi-session, real crawl and live-provider acceptance remain open.

## Source and review

- PR: https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/124
- Reviewed source: `b7e3a2efac285da5f46edf1eaf04cf0c43e7f9dc`.
- Normal merge: `674ed192a9ea359ee94dff9fb26028d3b1f6c5ab`, merged at23:48:17UTC11September.
- Final code review: https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/124#issuecomment-5641886244 — no major issues.
- Final security review: https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/124#issuecomment-5641906237 — no security issues.
- All review threads were resolved before release; the last100 query confirmed no earlier page.
- Current-source CI34658718809 passed all **3,972 tests across290files**, type checks, frozen locks and production builds on both Bun1.3.3 and1.4.0. Changed-file lint and152 focused local tests also passed. Full local3,955 tests/build at09f89c6 are historical, not the final-source CI evidence.

## Released behavior

Crawls require current saved project scope and DNS ownership proof. They reserve shared/account/target capacity before cancellable DNS, promote the same run-bound lease once to a validated public address, and pin HTTP/TLS connections to that address. Redirect policy refusals retain evidence without contacting a refused destination. Ownership TXT checks use their own atomic global lease. Google inspection reserves global/account capacity before token refresh and retains it through completion, timeout and deletion. Optional Google performance requests have separate field/lab scope and durable quotas.

Incomplete robots, page and sitemap representations cannot supply crawl permission or discovered links. The native transport retains Content-Range. Known HTTP errors survive unreadable bodies, while meta-derived noindex requires complete page evidence; independent response-header directives remain reviewable. SQL capture eligibility and immutable snapshot selection use the same evidence rules. Captured opportunities append under the existing workspace serialization and retain bounded evidence. UI copy covers English, Polish, Swedish and Danish.

## Database and deployment

Six migrations were applied **once**:20260911110000,120000,130000,140000,150000,160000. All24 released prerequisite hashes matched before application, including collaboration and both backlink migrations. The guarded transaction refused missing/drifting prerequisites, active publishing, a changed workspace batch function or repeated application in local rehearsal. No previously released migration was reapplied.

The production catalog exactly matches the local rehearsal: **13 private tables,31functions,124columns and78constraints**, six registry statement hashes, function definitions/configuration/permissions, table RLS/permissions and counts. The only initial technical row is the fixed ownership-DNS capacity singleton; request/evidence tables remain empty. Post-rollout catalog verification also matched every field.

Hosting synchronization to the exact merge was verified before one deployment:

- Deployment: `ecdd4601-6378-4fbe-ad52-548316a07804`.
- Build: `1789170571470`.
- Runtime revision: `674ed192a9ea359ee94dff9fb26028d3b1f6c5ab`.
- Source fingerprint: `3eb63df4b7cf90ea0ac5c932ed39394d742f62d30d43fd35d11322a409ac5857`.
- Runtime source identity, clean metadata and every component match the clean merged checkout exactly.
- Root GET200; MCP GET200/OPTIONS204; unauthenticated MCP, weekly executor and notification POSTs401.

Fresh pre/post comparisons are unchanged for prior content/usage/queue/timers, collaboration, notifications, daily backlink monitoring and backlink details. Workspace735rows/5owners/revision sum400; operational notifications8/scans5; email preference/outbox/items0; suppressed emails2/unsubscribe tokens2. No provider/model/DNS/customer/CMS request, credential/budget change, email or synthetic production record was used for acceptance.

## Audit artifacts and remaining acceptance

Local artifacts: `/tmp/milo-technical-production-migration-result.json`, `/tmp/milo-technical-production-post-verification.json`, `/tmp/milo-technical-production-deploy-result.json`, `/tmp/milo-technical-runtime-verification.json`, `/tmp/milo-technical-pre-release-final-{prior,team,notifications,monitor,details}.json`, `/tmp/milo-technical-post-release-{prior,team,notifications,monitor,details,technical}.json`, `/tmp/milo-technical-final-guard.log`, `/tmp/milo-technical-ci-34658718809.log` and `/tmp/milo-tech-final-review-threads.json`.

Do not repeat the migration or deployment to recover evidence. Signed-in, real domain/crawl, Google/provider and concurrent-use acceptance remain unverified. Deeper backlink continuation is a separate unfinished branch, and ongoing monitoring plus the rest of R00–R24/D01–D08 remain open. Public paid launch remainsNO-GO. See the12September progress assessment for milestone-based estimates.
