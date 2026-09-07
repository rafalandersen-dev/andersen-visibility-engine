# Milo Growth — continue after release reconciliation

Date: 2026-09-07. Supersedes the runtime status in HANDOFF_2026_09_07.md; preserves its full-plan mandate. Predecessor Codex task: `01a07ba1-c8b6-7582-9ff0-275d64224671` (Kontynuuj plan Milo Growth). Same saved MILO GROWTH project: `g-p-6a732f6015948191999fb9beb8f7bc81`.

## Mandate and handoff boundary

The user requests continuous execution of the entire Milo plan to 100%, starting with deployment drift, then successive stages. Do not stop after one PR or planning. Company AGENTS explicitly permits automatic successor tasks in the same saved project at clean milestones for productivity/context reliability. The release discrepancy, metering rollout and onboarding patch are now completed milestones; continue into monetary accounting and durable notifications without repeating them. This handoff does not authorize subagent delegation, new spending, customer messages or public-audit infrastructure mutation.

Read product/ROADMAP.md, PLAN_REVIEW_2026_09_07.md, NOTIFICATIONS_AND_PACKAGING.md and the preservation map. Full R00–R24 and D01–D08 remain in scope, including real observed AI, 24 EU languages, Stripe, agent, all integrations, premium journeys, real beta/demos and later proof windows. Never declare these complete based only on unit tests. Current user updates are in Polish, preferably checked/unchecked facts.

## Repository and local checkouts

Repository: `rafalandersen-dev/andersen-visibility-engine`.

1. `/Users/rafi/Projects/milo-growth-delivery` — existing isolated worktree, branch `codex/milo-expense-ledger-20260907`, PR #67. Runtime foundation commit `14e99df5d24d0f88f9010a25a910a59d43d25ca7`, canonical state commit `69b176adbd65a93a3cf61d090ef791ac04c33aa8`, this documentation is appended on top. Inspect actual HEAD. node_modules installed. Main predecessor application merge is `41aaf64be9ebb6a6d0f5c37b581acc168990ed6c`.
2. `/Users/rafi/Projects/milo-growth-dependency-safety` — independent worktree, branch `codex/milo-dependency-safety-20260907`, PR #68, commit `6d337de` (read full actual SHA). Lockfile security fixes only, node_modules installed.
3. Original user checkout `/Users/rafi/Documents/Codex/2026-07-15/napisz-zwi-z-y-dokument-handoff/andersen-visibility-engine` was left unchanged at its old main; do not overwrite it.

Both working checkouts are clean after commits/pushes; verify again. This saved ChatGPT project mirror is not the application repo; sources/ is read-only. Continue with the above existing worktrees for continuity. GitHub CLI fetch/push/PR ready/merge all worked. Never rewrite published history; Lovable sync depends on it.

## Completed; do not redo

- PR #64 merged `807c478dac567add213dafc993a72a7253817ea5`: canonical full plan.
- PR #65 merged `34c9093548e369f8960279aff61924c34f55aad6`: fail-closed metering and server-owned enforced scheduler quota.
- Connected Lovable project `06b696f6-c02b-468f-b0a0-7ab8af92d6a0`, workspace `oC4kAHCUIYuuomG2Hwnl`, enabled Supabase. API account has owner role. Administrative account email itself was not verified; company default remains rafi@anderseninnovations.com.
- `milo-growth.lovable.app/api/app-version` redirects to `milogrowth.com/api/app-version`. Old published build `1787472935217` was August 23 although editor/Git/Vercel were September. DNS A was `185.158.133.1`. Lovable editor sync and publish are separate.
- Actual DB had the old first-claim cap-bypassing SQL. Applied exact `20260907110000_ai_usage_fail_closed.sql` and inserted its migration registry row in one transaction through connected query_database. Counters preserved.
- Real PostgreSQL checks: zero cap denied; two-unit cap2 allowed; next denied; grants anon/authenticated denied, service_role allowed. Synthetic transaction rolled back.
- Additional contention test: eight concurrent query_database calls, eight distinct backend PIDs, cap3 admitted exactly three and refused five. Single synthetic non-customer row deleted with exact UUID/period/bucket/used match; deletion returned one. No customer quota used.
- Actual ai_usage, entitlements, project_publish_secrets tables have RLS enabled. Entitlements aggregate showed one agency/manualComped. This does not prove absence of subscriptions outside DB. Migration registry alone was stale (July30) despite newer objects, so inspect actual schema/functions.
- Verified Lovable latest SHA #65 before deploying. Deployment request `fda80b8a-a428-40f9-b016-e6afbf33d56c`; domain subsequently returned fresh build `1788781144340` (11:39:04.340 UTC).
- PR #66 merged `41aaf64be9ebb6a6d0f5c37b581acc168990ed6c`: onboarding extraction now claims existing aiCredits with enforcement; preserves site metadata/manual setup on quota/meter/provider failure. Text SDK maxRetries=0, timeout=60s. No new quota price or key. All 1,303 tests/100 files, TypeScript/build pass; five new tests.
- Verified Lovable latest SHA #66, deployed request `bf8918f0-5c05-4003-b852-82f08886f285`; domain now returns `1788781754158` (11:49:14.158 UTC). No old August build.
- Public endpoint currently exposes build time only, not source SHA; source revision + publication + new domain build are verified separately. Add a reproducible source/release identity improvement if needed for exact runtime acceptance.

## Open code ready to continue

**PR #67, draft:** atomic internal expense foundation. Service-role-only tables/RPCs, USD millionths, account+global monthly budgets, global-then-account locking, stable request dedupe, cost reconciliation, unknown expense held, measured overruns pause both scopes. Wrapper refuses missing/invalid reservation before callback, no retries, preserves output if reconciliation fails. 31 new tests; full 1,334 tests/102 files, TypeScript/build/focused lint pass. CI/Vercel succeeded on canonical-state update; handoff doc push will generate a new head.

IMPORTANT: #67 has NO production provider call-site wiring, NO funded budgets or price configuration, and the new `20260907140000_ai_expense_reservations.sql` is NOT applied to production. Do not claim live monetary enforcement. Need verified maximum-cost policies and input/output/tool bounds, actual usage/request-ID adapters, independent-session ledger tests, explicit budget provisioning and separate delivered-result allowances. See evidence/expense-reservations-2026-09-07.md.

**PR #68, open:** compatible dependency resolutions fix seven high-severity registry findings. Only package-lock + evidence, 14 entries updated, no package.json ranges. New registry audit: zero findings; 1,303 tests, TypeScript/build pass. Review live checks before merge; then sync and publish Lovable at the verified resulting SHA, confirm new domain build. This branch excludes #67. Do not apply its migration as part of #68.

## Pending user input — no answer/approval yet

Two async questions were asked in predecessor. Check its newer messages for a response; elapsed time is not approval.

1. Proposed first real-provider test envelope: at most one onboarding scan, one article and one image on the owner's project, USD 5 TOTAL maximum globally and for owner, no publication/email/orders, no top-up/new subscription. Only after rates and guards are verified. NOT authorized yet; no paid calls performed.
2. Need actual Lovable gateway cost metadata from Milo More → AI (model/input+output tokens/credit cost) and Settings → Plans & credit usage → Usage details → Run credits (effective credit conversion). Only nonsecret metadata, never prompts/customer content/keys. Connected APIs lack this activity endpoint. Computer-use browser policy verification failed; do not bypass it. Ask owner for these values or use a newly available legitimate connector.

Source default text model is google/gemini-3-flash-preview. Google standard direct rate read September7: USD0.50/M input, USD3.00/M output including thinking. These are NOT verified invoiced Lovable rates. Lovable docs confirm credit-based billing, per-request summaries and possible charges for canceled requests. Links in expense evidence. No provider switch selected.

## Immediate useful work while budget metadata is blocked

1. Finish review/merge/release of #68 after checks, preserving #67 worktree. Complete a clean writeback.
2. Continue R05/R06 durable notifications and logged-out reliability. Inspect existing email route/queue and calendar risk helpers before rebuilding. Existing `sendTransactionalEmail` needs JWT; scheduler `sendSummaryEmail` directly calls Resend, takes configured summaryEmail, lacks durable outbox/dedupe/status handling and swallows failures. Do not run real customer sends. Implement explicit recheck/dedupe/preferences/recipient ownership/delivery evidence using existing transport where appropriate; team/approver mapping still needs current source review. Existing code is a starting point, not the complete notification centre.
3. Continue R09 adapters and delivered-result allowances with synthetic providers while waiting for price/budget input. No automatic refund of unknown supplier costs, no unbounded retries.
4. Proceed through other roadmap waves as dependencies allow; do not stop simply because cost metadata is missing. All 24 EU languages, UI/setup/Studio, observed AI/GSC/proof, MCP integrations, authority/Linkhouse, Stripe and launch journeys are still required.

## Boundaries and unresolved evidence

- Issue #43 applies to the isolated public-audit environment. Read-only discovery authorized; no staging/production Worker/DNS/Turnstile/AI-secret mutation approved by this work. General app metering/Lovable release was performed under the user's continuation scope; do not misread #43 as stopping all independent app work.
- No paid supplier test, customer email, content publication, order, key creation, secret value/flag change or new account/subscription performed.
- Runtime AI_METERING_ENFORCED, provider keys/settings and protected authenticated live journeys remain unknown. Browser tools were blocked before UI navigation by admin-policy verification. Do not work around browser security controls.
- PR #58 authoring spec, #2 bootstrap blueprint, #62 design-engineering instructions remain open. #62 body explicitly requests human approval before merge. Read applicable current AGENTS; unmerged skill instructions are not automatically active.
- Original openai-platform-api-key skill was read because of optional OpenAI image provider; no key inspected/created/reused and no OpenAI request made. Existing selected text provider is Lovable; avoid imposing unrelated credential setup on provider-independent ledger/notification work. Follow applicable current skills and standing user authorization.
- Do not archive/rename predecessor. Once successor accepts this handoff, predecessor stops implementation to avoid duplicate work. Report real acceptance and a direct task card, never invisible background work without a running successor.
