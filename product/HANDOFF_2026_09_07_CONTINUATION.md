# Milo Growth — continuous execution handoff

Updated 2026-09-07, approximately 15:24 UTC. This replaces accumulated historical snapshots; Git preserves their audit trail. Current Codex task: `01a07ba1-c8b6-7582-9ff0-275d64224671`, saved MILO GROWTH project `g-p-6a732f6015948191999fb9beb8f7bc81`. **No successor task exists.**

## Mandate and boundaries

Continue the entire R00–R24 / D01–D08 plan to 100%, starting with deployment discrepancies. Preserve `ROADMAP.md`, `PLAN_REVIEW_2026_09_07.md`, `NOTIFICATIONS_AND_PACKAGING.md` and the feature inventory. Never substitute a PR/test count for full launch acceptance. Communicate in Polish. Do not spawn subagents without authorization or rewrite pushed Git history. The saved project mirror's `sources/` directory is read-only; original user checkout remains untouched.

Company owner/admin address: rafi@anderseninnovations.com. No secrets, credentials or private checkout/recovery links in chat, logs or repositories. No real AI benchmark, customer CMS publication, supplier order, purchase or real email has been executed. No production provider flags/keys/rates were changed. Preserve customer counters, content, queue, unknown leases and existing assets.

## First priority: current deployment discrepancy

Main after #81: `c314f1e6c02ce432299624931e7d17701e2bc61f`. Lovable project `06b696f6-c02b-468f-b0a0-7ab8af92d6a0`, workspace `oC4kAHCUIYuuomG2Hwnl`. Its get_project revision synchronized with #81 before deployment `0d3a7ef2-3f5e-4686-a636-e8b08d329779`.

The domain `https://milogrowth.com/api/app-version` serves build `1788792945297`, fingerprint `9b8cd1dcd8425a92ebffae0a9b409e4abf83f635d6f17188e7018c1e8f52bcdc`, revision/modified null. Expected #81 fingerprint `62fcea9d40a1d393fc0bf76f6bc3e3aad856a3b521207d21a4b72557e2c0c1c7`. All component hashes match except bun.lock (expected `72bde580748abd181efe339d5c7254a503d907eaf8f5f98afaa94a5cb5a2a584`, actual `9f86dba81935bf64347aff84c7d7dcac4f5586a9aad7cb693f76b96b4fbe0db1`). Lovable read_file returns committed lock, not the build-time version.

PR #83 corrects the discovered npm/Bun graph drift. Earlier security PR #68 updated npm only; Bun omitted pinned PGlite and retained other resolved versions. Local frozen install failed. Exact platform transformation/hash was not reproduced; do not claim it or retroactively explain #72. #83 regenerates Bun from unchanged npm lock, preserves dependency declarations and existing release-age constraints, enables frozen install and adds Linux CI. Both audits report zero, 1553 tests/119 files plus types/build pass locally and Linux CI passes. Review passed; merged as `20de90517833d101226fd288310e2768601798b0`. Lovable synchronized it and publication `2d3ba0af-2629-4463-a437-17d97f48b354` was requested. Domain confirmation is pending; expected fingerprint `db54b4eee170d02673bfcab68e596a3dd4ed1bedb480a5138789b645c5390fd0`. Worktree `/Users/rafi/Projects/milo-growth-bun-lock`, branch `codex/milo-bun-lock-reconciliation-20260907`; inspect current head/review before merging.

After review: merge without rewriting history, wait for Lovable exact merge SHA, publish, compare full fingerprint AND every component against clean checkout. Do not exclude locks or fabricate missing Git metadata. Only then roll out #82. Previous exact #80 production was build1788792201941 / fingerprint164d820c32bc6477e3d4b30ecb3de8420aa0d97c660584716b2a9fce2c23c0b0; this is historical, not current.

## Next prepared packet: PR #82

Worktree `/Users/rafi/Projects/milo-growth-mcp-draft-state`, branch `codex/milo-mcp-draft-state-20260907`. Earlier feature head d665b94 was reviewed successfully; final branch now includes main #83 and this state/evidence refresh. Check review of the latest pushed head before merging. Combined #83 validation: 1577 tests/120 files, types/build. No migration.

External updates now require actual editable Draft with existing project and no known approval, publication binding/attempt or pending/uncertain schedule mirror. Substantive edits invalidate old quality/assembly/readiness; notes-only or identical edits preserve them. Create retries return actual existing status. No client publication scope is enabled. This is a workspace-state boundary, not proof of authoritative CMS/queue concurrency. Complete review against final combined tree and deploy after #83 reconciliation. No signed image upload tool is implemented yet.

## Completed work to preserve

PRs #63–#81 are merged (including #67). Exact hashes and detailed scope are in their PRs and `evidence/` records.

- #63 premium Today/list/inspector/calendar improvements; #64 canonical full scope reconciliation.
- #65 fail-closed metering and atomic first claim. Eight independent real PostgreSQL sessions admitted 3 and denied 5 at cap 3; fixture removed.
- #66 bounded onboarding extraction, zero automatic text retries, 60-second timeout, metadata/manual fallback.
- #67 inactive monetary reserve/reconcile ledger. Migration applied, isolated eight-session cap300/reserve100 test admitted3/denied5; unknown retention, settlement/replay and overrun pauses verified. Isolated schema removed. Production budgets0/requests0; no real provider wiring/funding/rates.
- #69 operational inbox and private 15-minute cron job150; #70 gated opt-in email outbox; #75 interrupted scheduler alerts. Existing cron must not be duplicated. Last observed sweep14:45UTC: scanned5/failed0/stale0. No email sent; last observed outbox0, opt-ins0.
- #71 release identity; #74 per-component diagnostics. Earlier transient discrepancy remains unproven.
- #72 scheduler lease and incremental durable results; eight independent sessions admitted1/denied7, fixture removed. #73 resume slots/remaining quota/queue-read safety. No monthly runner invoked.
- #76 read-only project completeness; #77 project isolation and retry/reference boundaries; #78 atomic bounded topic batches; #79 owner-reviewed Brand Intelligence leaf proposals. All published before #81 discrepancy. No direct fill-empty or external-image feature is implied.
- #80 isolated Stripe test checkout and signed metadata-only receipt journal. No entitlement mutation, portal/live billing lifecycle or actual Stripe exchange accepted. Migration applied, receipts0; empty unsigned webhook POST returned503 Not configured. No account/key/flag/price changed. Runbook: `docs/billing/STRIPE_SANDBOX_ACCEPTANCE.md`.
- #81 image storage boundary. Migration applied: both buckets 5MiB JPEG/PNG/WebP, restrictive public mutations for anon/authenticated, service_role bypass verified. Both existing objects (one per bucket, 367112 bytes each) retained. This is not signed-image ingestion completion.

Applied AND registered migrations (prefix20260907): `110000`, `140000`, `150000`, `170000`, `190000`, `200000`, `210000`, `220000`. **Do not reapply or repeat fixtures/cron.** No temporary SQL fixtures remain. Application tests use mocked providers; distinguish them from real provider acceptance.

## User-only dependencies — questions already pending

1. USD5 TOTAL for one real scan/article/image owner test: not approved. No spend, orders, publication or email included.
2. Actual Lovable per-request model/tokens/credit cost and effective credit conversion: unavailable; owner access to AI/Plans usage needed. Do not invent cost ceilings or prices.
3. One test email to company address was approved conditionally on confirmed account and sender. Exact company auth account count was0. Clarification (migrate account address versus explicitly permit transport-only test) remains unanswered. No email sent; do not treat the existing approval as removal of its condition.
4. Existing Stripe company-administered account and sandbox access: status question pending. Do not ask for keys in chat; eventual secrets belong in Lovable Cloud Secrets. No new account/price/flag created.
5. Local successor creation failed because the saved project is a ChatGPT project. Explicit cloud successor choice remains unanswered. Continue this task; do not claim background handoff.

## Other open acceptance and implementation

The protected Lovable UI was rejected by computer-use policy earlier. Do not bypass that restriction. Protected desktop/mobile/keyboard journeys and real owner/client workflow acceptance remain open; public API reads/builds do not replace them.

Continue remaining external authoring: approved scope is `origin/claude-authoring-scope:docs/CLAUDE-AUTHORING-CONNECTOR-SCOPE.md`, both URL relay and signed bytes, private proposed images, owner review. Existing `safe-fetch.ts` is text-oriented and actual DNS-safe egress configuration is unverified; do not pretend it safely streams binary. Signed uploads need bounded intent/expiry/size, byte/hash revalidation, stable idempotent private attachment, no token logs or approval reuse, and bounded orphan handling. Storage migration alone does not implement this. Existing content scope is already advertised; publication scope remains unissued. Fill-empty profile ownership, end-to-end connector compatibility and write quotas remain part of scope.

Broader work remains: operator recovery/job ledger, low-quota/budget/team notifications, active cost accounting and delivered-result allowances; real observed AI evidence (at least3 trustworthy surfaces), full premium modules/agent/integrations, all24 EU languages (only4 exist), Stripe lifecycle and policy/pricing decisions, supplier contracts, demos/videos, beta support and launch acceptance. Never claim full100% from partial foundations.

Infrastructure discovery: GoDaddy DNS; staging.milogrowth.com NXDOMAIN; no named Workers/Turnstile in inspected Cloudflare account; no Milo domain in Vercel andersen-hq. Cloudflare account uses personal rafal.andersen@gmail.com (ownership exception); no new company resources under it. See `evidence/public-audit-account-discovery-2026-09-07.md`. Isolated staging remains unverified. No infrastructure/account/DNS mutation was performed.

All older worktrees under `/Users/rafi/Projects/milo-growth-*` are retained audit checkouts, not live agents. Shared dependency-safety/node_modules is used by symlinked worktrees; Bun reconciliation worktree has its own physical dependency installation. Do not delete shared dependencies. No active preview server or subagent exists.
