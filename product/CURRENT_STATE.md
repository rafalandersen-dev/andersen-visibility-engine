# Milo Growth — current status

Updated: 9 September 2026. Owner: Rafal Andersen. Phase: private beta / launch foundations. Public paid launch: **NO-GO / acceptance incomplete**.

This is the current operational entry point. Read [progress review](PROGRESS_REVIEW_2026_09_09.md) for the remaining-work estimate and task inventory, [roadmap](ROADMAP.md) for delivery order, and [scope register](PLAN_REVIEW_2026_09_07.md) for R00–R24 and D01–D08. Older dated reports are history, not instructions to repeat completed work.

## Verified baseline

- Remote main: `9b2d26b74654ad6cd5e05876ddf1c0f72623a8fa`, normal merge of PR #104 on 9 September. PRs through #104 are merged; #2, #58 and #62 remain open documentation/design proposals.
- PR #104 deployment: `1bb89306-cf0b-401e-bdb8-47e7968ca217`; public build `1788956633294`; full fingerprint `21b86a318dc2154f741579e4fd70587fe2787177b8676ed9470542a097e09489`. Full/every component match clean merged source; runtime reports the exact merge and `modified: false`. Verified 12:34 UTC on 9 September.
- Home/MCP GET 200; MCP OPTIONS 204, anonymous MCP POST 401. An initial HTTP check timed out; the subsequent comparison/smoke succeeded. No authenticated client transfer or visual acceptance is claimed.
- #104 verification: 2,212 tests / 151 files, types/build/focused lint passed. Review 34349698388 succeeded (`is_error: false`), without inline findings. The workflow reported five permission denials, limiting review completeness.
- Migration `20260909150000_generation_usage_receipts.sql` is applied once from the reviewed head. RLS/service RPC permissions, lack of direct receipt mutation and zero new receipts were verified. Original usage remains 10 rows / 226 units. Do not repeat it. #103 image receipts, #101 controlled runner and #98 restricted permits remain installed.
- Latest read-only cost preflight: zero expense budgets, permits and native requests. No live benchmark calls or financial funding.

## Delivered work to preserve

| Area | Delivered evidence | Still open |
| --- | --- | --- |
| Workspace and premium foundation | Today, Plan list/inspector/calendar, responsive shell, setup/edit fixes, existing Studio and reporting retained | Remaining modules, full responsive/accessibility and journey acceptance |
| Deployment and safety | Deployment mismatch fixed; fail-closed metering, bounded input/output/time, concurrency and recovery protections | Wider security/operational acceptance, complete unattended recovery |
| Account and email | Milo owner is rafi@anderseninnovations.com; 10 owner projects and role preserved; delivered/opened test and administrative verification recorded | Fresh login acceptance; full team notification delivery. Approved test email is consumed |
| Publishing | One scheduled Butelki Wodorowe article verified on 8 September at 09:00 Stockholm in both databases and public destination | Historical content-review failure and Andersen UK destination errors; WP/Shopify/custom parity |
| Direct OpenAI (#95) | Native text/image generation no longer uses or falls back to Lovable AI | Secure key setup and actual provider generation not verified |
| Monetary admission and quota (#96/#98/#104) | Native money reserves and restricted permits; technical generation failures return a confirmed quota unit without erasing supplier expense | Isolated live test/cost reconciliation, durable result recovery, full delivered-result packaging |
| Controlled owner test (#101) | Durable scan/article/image stages, exact one-attempt identities, retained private output and owner-only controls deployed | Secure key configuration, provisioning, actual generation, cost/quality and visual acceptance |
| Languages (#97) | All 24 EU content-language choices and authoring plumbing; language sync and title slugs fixed | UI remains four locales; full UI/email/report/legal translations and language quality acceptance |
| MCP and notifications | Scoped draft/profile/batch/image import, bounded ingress, renewed private previews, inbox/outbox and scheduler recovery foundations | Actual client image transfers, CMS fidelity, team recipients and complete delivery acceptance |
| Stripe (#80) | Isolated sandbox checkout/receipt foundations and migration | Configured sandbox, real lifecycle acceptance and commercial rollout; owner deferred setup |

## Current work and blockers

The implementation task **Kontynuuj plan Milo Growth** (`01a07ba1-c8b6-7582-9ff0-275d64224671`) continues the full plan. Private MCP image import/preview renewal (#103) and technical generation-quota refunds (#104) are released. See [quota evidence](../evidence/generation-usage-receipts-2026-09-09.md). The next packet implements durable private generated-output retention and recovery. The working tree contains an initial bounded result contract and PostgreSQL retention/discard functions, with 43 targeted tests, types and focused lint passing. They are not connected to live generation or UI yet; no PR, migration or release exists for this next packet. See [recovery work in progress](../evidence/generation-result-recovery-work-in-progress-2026-09-09.md) for the exact next integration work. No duplicate implementation stream is active.

1. Resolve the recorded OpenAI Platform reauthentication problem and finish secure key selection/save/configuration. A fresh check on 9 September returned UNAUTHORIZED / openai_platform_authentication_failed. The owner clarified that no reconnection or key creation had been performed; do not treat the earlier “done” as setup confirmation. No key creation or installation is confirmed. Continue independent implementation without repeatedly retrying unchanged authentication.
2. Implement and verify durable result recovery and customer delivery acceptance. Generation-quota receipts are released. MCP image import is released; visual approval and live-client transfer acceptance remain open. Preserve the installed runner and zero-funded state. Do not confuse its screen or synthetic results with a completed live benchmark.
3. Recheck current budget state and model/rate contract, provision restricted global/account budgets plus exactly three permits within the already authorized USD5 total, run once, and reconcile actual usage. Errors/uncertain results retain reservations and do not authorize another attempt. Do not fund an ordinary owner budget that background jobs could spend.
4. Continue delivered-result allowances, team notifications/recovery, Stripe sandbox lifecycle, real AI observations/proof loop, remaining product/integration/localization work and beta/demo evidence in roadmap order.

The owner approved temporary use of the existing OpenAI account after reporting its email changed to Synergy. Exact Synergy address is unverified. This is an accepted exception: company-email migration is no longer a prerequisite. The new-key and USD5 authorizations persist; latest recorded benchmark usage is **0 calls / USD0**. Do not repeat the email change/test or ask again for these same authorizations. Never request secrets in chat.

## Material unresolved scope

Real observed AI answers on at least three trustworthy surfaces; citations/source/competitor analytics; server-log bot analytics; evidence → action → publication → later measurement; direct GSC and local/global coverage acceptance; complete growth agent and resumable execution; team permissions; premium screens; safe image ingest and CMS fidelity; backlinks supplier/Linkhouse acceptance; AI-client compatibility; optional Slack timing; 24-language customer surfaces; pricing, Stripe and policies; independent beta, support/recovery and actual setup/product videos.

Open decisions D01–D08 remain tracked. A changed email, a language dropdown or a passing synthetic test does not close those outcomes. Public-audit Worker/account/staging work under #35/#43 retains its separate release boundary; native OpenAI migration does not imply a Worker provider change.

## Recovery and evidence

- Product repo: `rafalandersen-dev/andersen-visibility-engine`.
- Lovable project: `06b696f6-c02b-468f-b0a0-7ab8af92d6a0`; workspace `oC4kAHCUIYuuomG2Hwnl`; database `fguokeheqoqunadhdbsz`.
- Current implementation worktree: `/Users/rafi/Projects/milo-growth-generation-result-recovery-20260909`, branch `codex/milo-generation-result-recovery-20260909`, based on #104. Uncommitted recovery contract/migration/tests are in progress; do not discard them or claim the feature is delivered. The usage-receipt worktree is clean at the #104 merge; earlier worktrees are preserved.
- [PR #101 release evidence](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/101), [permit evidence](../evidence/restricted-ai-expense-permits-2026-09-08.md), [benchmark preflight](../evidence/owner-ai-benchmark-2026-09-08.md), [account inventory](ACCOUNT_OWNERSHIP.md).
- Previous cumulative current-state text is retained at [historical snapshot](../evidence/current-state-history-through-2026-09-08.md). Its pre-release pending states are superseded here.
