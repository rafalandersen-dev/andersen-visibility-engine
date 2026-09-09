# Milo Growth — current status

Updated: 9 September 2026. Owner: Rafal Andersen. Phase: private beta / launch foundations. Public paid launch: **NO-GO / acceptance incomplete**.

This is the current operational entry point. Read [progress review](PROGRESS_REVIEW_2026_09_09.md) for the remaining-work estimate and task inventory, [roadmap](ROADMAP.md) for delivery order, and [scope register](PLAN_REVIEW_2026_09_07.md) for R00–R24 and D01–D08. Older dated reports are history, not instructions to repeat completed work.

## Verified baseline

- Remote main: `1699bc8b384726cd501da7492b4212b499f06f77`, merge of PR #102 on 9 September. PRs through #102 are merged; #2, #58 and #62 remain open documentation/design proposals.
- PR #102 deployment: `83462c20-45f2-4e69-8fd9-25e1cb62faec`; public build `1788951348074`; full fingerprint `eaff25e83e2526d6f060394c4107b771b0ab3cee4f8d98ccc650f7a78c765e41`. Full/every component match clean merged source; runtime reports the exact merge revision and `modified: false`.
- Home/owner-test GET 200; MCP GET 200, OPTIONS 204, anonymous MCP POST 401. The anonymous owner-test page is the SPA shell; no authenticated or visual acceptance is claimed.
- #102 verification: final full suite 2,082 tests / 143 files, eight new deadline cases, TypeScript, production build, focused lint and whitespace checks passed. Review run 34342110521 succeeded with no new inline findings.
- Migration `20260909120000_owner_ai_benchmark_runs.sql` is applied; do not repeat it. Registry RLS/service permissions verified. After installation: zero runs, budgets, permits and native provider attempts. The restricted financial migration from #98 remains applied.

## Delivered work to preserve

| Area | Delivered evidence | Still open |
| --- | --- | --- |
| Workspace and premium foundation | Today, Plan list/inspector/calendar, responsive shell, setup/edit fixes, existing Studio and reporting retained | Remaining modules, full responsive/accessibility and journey acceptance |
| Deployment and safety | Deployment mismatch fixed; fail-closed metering, bounded input/output/time, concurrency and recovery protections | Wider security/operational acceptance, complete unattended recovery |
| Account and email | Milo owner is rafi@anderseninnovations.com; 10 owner projects and role preserved; delivered/opened test and administrative verification recorded | Fresh login acceptance; full team notification delivery. Approved test email is consumed |
| Publishing | One scheduled Butelki Wodorowe article verified on 8 September at 09:00 Stockholm in both databases and public destination | Historical content-review failure and Andersen UK destination errors; WP/Shopify/custom parity |
| Direct OpenAI (#95) | Native text/image generation no longer uses or falls back to Lovable AI | Secure key setup and actual provider generation not verified |
| Monetary admission (#96/#98) | Native calls reserve account/global funds; unknown costs retain reserves; restricted budgets and one-attempt permits deployed | Funding the isolated test, real costs/reconciliation and customer result allowances |
| Controlled owner test (#101) | Durable scan/article/image stages, exact one-attempt identities, retained private output and owner-only controls deployed | Secure key configuration, provisioning, actual generation, cost/quality and visual acceptance |
| Languages (#97) | All 24 EU content-language choices and authoring plumbing; language sync and title slugs fixed | UI remains four locales; full UI/email/report/legal translations and language quality acceptance |
| MCP and notifications | Scoped draft/profile/batch work, ingress limits, inbox/outbox and scheduler recovery foundations | Live client matrix, secure external image ingest, team recipients and complete delivery acceptance |
| Stripe (#80) | Isolated sandbox checkout/receipt foundations and migration | Configured sandbox, real lifecycle acceptance and commercial rollout; owner deferred setup |

## Current work and blockers

The implementation task **Kontynuuj plan Milo Growth** (`01a07ba1-c8b6-7582-9ff0-275d64224671`) continues the full plan. PR #100's bounded homepage reads and trusted attempt inputs and PR #101's controlled runner are deployed. See [homepage prerequisites](../evidence/homepage-benchmark-prerequisites-2026-09-09.md) and [controlled runner evidence](../evidence/owner-controlled-runner-2026-09-09.md). PR #102 bounds entitlement and quota waits to ten seconds per lookup and is now released. The next packet adds private, scoped MCP image import from supplied files; 2,135 tests/146 files, types/build and focused lint passed, with pre-existing registry lint debt documented. Review, receipt migration and release are pending. See [image import evidence](../evidence/mcp-image-import-2026-09-09.md). No duplicate implementation stream is active.

1. Resolve the recorded OpenAI Platform reauthentication problem and finish secure key selection/save/configuration. A fresh check on 9 September returned UNAUTHORIZED / openai_platform_authentication_failed. The owner clarified that no reconnection or key creation had been performed; do not treat the earlier “done” as setup confirmation. No key creation or installation is confirmed. Continue independent implementation without repeatedly retrying unchanged authentication.
2. Complete review/migration/release of private MCP image import, then finish preview/approval and client acceptance. Preserve the installed runner and zero-funded state. Do not confuse its screen or synthetic results with a completed live benchmark.
3. Recheck current budget state and model/rate contract, provision restricted global/account budgets plus exactly three permits within the already authorized USD5 total, run once, and reconcile actual usage. Errors/uncertain results retain reservations and do not authorize another attempt. Do not fund an ordinary owner budget that background jobs could spend.
4. Continue delivered-result allowances, team notifications/recovery, Stripe sandbox lifecycle, real AI observations/proof loop, remaining product/integration/localization work and beta/demo evidence in roadmap order.

The owner approved temporary use of the existing OpenAI account after reporting its email changed to Synergy. Exact Synergy address is unverified. This is an accepted exception: company-email migration is no longer a prerequisite. The new-key and USD5 authorizations persist; latest recorded benchmark usage is **0 calls / USD0**. Do not repeat the email change/test or ask again for these same authorizations. Never request secrets in chat.

## Material unresolved scope

Real observed AI answers on at least three trustworthy surfaces; citations/source/competitor analytics; server-log bot analytics; evidence → action → publication → later measurement; direct GSC and local/global coverage acceptance; complete growth agent and resumable execution; team permissions; premium screens; safe image ingest and CMS fidelity; backlinks supplier/Linkhouse acceptance; AI-client compatibility; optional Slack timing; 24-language customer surfaces; pricing, Stripe and policies; independent beta, support/recovery and actual setup/product videos.

Open decisions D01–D08 remain tracked. A changed email, a language dropdown or a passing synthetic test does not close those outcomes. Public-audit Worker/account/staging work under #35/#43 retains its separate release boundary; native OpenAI migration does not imply a Worker provider change.

## Recovery and evidence

- Product repo: `rafalandersen-dev/andersen-visibility-engine`.
- Lovable project: `06b696f6-c02b-468f-b0a0-7ab8af92d6a0`; workspace `oC4kAHCUIYuuomG2Hwnl`; database `fguokeheqoqunadhdbsz`.
- Current implementation worktree: `/Users/rafi/Projects/milo-growth-mcp-image-upload-20260909`, branch `codex/milo-mcp-image-upload-20260909`, based on #102. The previous quota worktree is clean at the #102 merge; earlier worktrees are preserved.
- [PR #101 release evidence](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/101), [permit evidence](../evidence/restricted-ai-expense-permits-2026-09-08.md), [benchmark preflight](../evidence/owner-ai-benchmark-2026-09-08.md), [account inventory](ACCOUNT_OWNERSHIP.md).
- Previous cumulative current-state text is retained at [historical snapshot](../evidence/current-state-history-through-2026-09-08.md). Its pre-release pending states are superseded here.
