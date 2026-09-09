# Milo Growth — current status

Updated: 9 September 2026. Owner: Rafal Andersen. Phase: private beta / launch foundations. Public paid launch: **NO-GO / acceptance incomplete**.

This is the current operational entry point. Read [progress review](PROGRESS_REVIEW_2026_09_09.md) for the remaining-work estimate and task inventory, [roadmap](ROADMAP.md) for delivery order, and [scope register](PLAN_REVIEW_2026_09_07.md) for R00–R24 and D01–D08. Older dated reports are history, not instructions to repeat completed work.

## Verified baseline

- Remote main: `849df9ff05ee406f4254079e81a0d93de16c16ed`, merge of PR #100 on 9 September. PRs #98–#100 are merged. PRs #2, #58 and #62 remain open documentation/design proposals.
- PR #100 deployment: `621f0738-ac7c-43d8-bd85-b0dcc074731b`; public build `1788948225765`; full fingerprint `ec6aaf00ba8e77f95ac6a4e5a94ef167ee98489e0046af026e7d8b01f8bf4714`. Full and all component fingerprints match clean merged source. Runtime revision/modified remain null; the deployed runtime version is not reported.
- Home/MCP GET 200, OPTIONS 204, anonymous MCP POST 401. These are public smoke checks, not authenticated generation or visual acceptance.
- #100 verification: full suite 2,031 tests / 140 files before the final empty-profile guard; final affected suites 55/55, TypeScript, build, focused lint and whitespace checks passed. Direct public homepage reads passed under Bun 1.3.3 (the recorded hosting builder version), Bun 1.4.0 and Node 26.5.0. Review run 34337173059 succeeded with no inline findings.
- Migration `20260908210000_restricted_ai_expense_permits.sql` remains the latest applied financial migration. Latest recorded production counts: zero budgets, permits and attempts (8 September; not re-read during #100 release).

## Delivered work to preserve

| Area | Delivered evidence | Still open |
| --- | --- | --- |
| Workspace and premium foundation | Today, Plan list/inspector/calendar, responsive shell, setup/edit fixes, existing Studio and reporting retained | Remaining modules, full responsive/accessibility and journey acceptance |
| Deployment and safety | Deployment mismatch fixed; fail-closed metering, bounded input/output/time, concurrency and recovery protections | Wider security/operational acceptance, complete unattended recovery |
| Account and email | Milo owner is rafi@anderseninnovations.com; 10 owner projects and role preserved; delivered/opened test and administrative verification recorded | Fresh login acceptance; full team notification delivery. Approved test email is consumed |
| Publishing | One scheduled Butelki Wodorowe article verified on 8 September at 09:00 Stockholm in both databases and public destination | Historical content-review failure and Andersen UK destination errors; WP/Shopify/custom parity |
| Direct OpenAI (#95) | Native text/image generation no longer uses or falls back to Lovable AI | Secure key setup and actual provider generation not verified |
| Monetary admission (#96/#98) | Native calls reserve account/global funds; unknown costs retain reserves; restricted budgets and one-attempt permits deployed | Controlled runner, funding the isolated test, real costs/reconciliation and customer result allowances |
| Languages (#97) | All 24 EU content-language choices and authoring plumbing; language sync and title slugs fixed | UI remains four locales; full UI/email/report/legal translations and language quality acceptance |
| MCP and notifications | Scoped draft/profile/batch work, ingress limits, inbox/outbox and scheduler recovery foundations | Live client matrix, secure external image ingest, team recipients and complete delivery acceptance |
| Stripe (#80) | Isolated sandbox checkout/receipt foundations and migration | Configured sandbox, real lifecycle acceptance and commercial rollout; owner deferred setup |

## Current work and blockers

The implementation task **Kontynuuj plan Milo Growth** (`01a07ba1-c8b6-7582-9ff0-275d64224671`) resumed on 9 September. It is preparing the controlled one-scan, one-article, one-image benchmark. PR #100 is deployed: it replaces unbounded homepage reads with pinned public-address transport, including Bun 1.3.3 compatibility, and adds trusted attempt inputs to the three existing cores. See [homepage/benchmark prerequisite evidence](../evidence/homepage-benchmark-prerequisites-2026-09-09.md). The durable runner, owner test screen and new migration are implemented and locally verified in the next review packet; they are not yet deployed or provisioned. See [controlled runner evidence](../evidence/owner-controlled-runner-2026-09-09.md). The separate progress review is complete; no duplicate implementation stream is active.

1. Resolve the recorded OpenAI Platform reauthentication problem and finish secure key selection/save/configuration. A fresh check on 9 September returned UNAUTHORIZED / openai_platform_authentication_failed. The owner clarified that no reconnection or key creation had been performed; do not treat the earlier “done” as setup confirmation. No key creation or installation is confirmed. Continue independent implementation without repeatedly retrying unchanged authentication.
2. Finish review/release of the controlled runner packet and verify its service-only database permissions. Its installation must create zero plans, permits, budgets or scheduled work. Do not confuse the test screen or synthetic results with a completed live benchmark.
3. Recheck current budget state and model/rate contract, provision restricted global/account budgets plus exactly three permits within the already authorized USD5 total, run once, and reconcile actual usage. Errors/uncertain results retain reservations and do not authorize another attempt. Do not fund an ordinary owner budget that background jobs could spend.
4. Continue delivered-result allowances, team notifications/recovery, Stripe sandbox lifecycle, real AI observations/proof loop, remaining product/integration/localization work and beta/demo evidence in roadmap order.

The owner approved temporary use of the existing OpenAI account after reporting its email changed to Synergy. Exact Synergy address is unverified. This is an accepted exception: company-email migration is no longer a prerequisite. The new-key and USD5 authorizations persist; latest recorded benchmark usage is **0 calls / USD0**. Do not repeat the email change/test or ask again for these same authorizations. Never request secrets in chat.

## Material unresolved scope

Real observed AI answers on at least three trustworthy surfaces; citations/source/competitor analytics; server-log bot analytics; evidence → action → publication → later measurement; direct GSC and local/global coverage acceptance; complete growth agent and resumable execution; team permissions; premium screens; safe image ingest and CMS fidelity; backlinks supplier/Linkhouse acceptance; AI-client compatibility; optional Slack timing; 24-language customer surfaces; pricing, Stripe and policies; independent beta, support/recovery and actual setup/product videos.

Open decisions D01–D08 remain tracked. A changed email, a language dropdown or a passing synthetic test does not close those outcomes. Public-audit Worker/account/staging work under #35/#43 retains its separate release boundary; native OpenAI migration does not imply a Worker provider change.

## Recovery and evidence

- Product repo: `rafalandersen-dev/andersen-visibility-engine`.
- Lovable project: `06b696f6-c02b-468f-b0a0-7ab8af92d6a0`; workspace `oC4kAHCUIYuuomG2Hwnl`; database `fguokeheqoqunadhdbsz`.
- Current implementation worktree: `/Users/rafi/Projects/milo-growth-controlled-runner-20260909`, branch `codex/milo-controlled-runner-20260909`, based on #100. The previous homepage worktree is clean at the #100 merge; earlier worktrees are preserved.
- [PR #100 release evidence](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/100), [permit evidence](../evidence/restricted-ai-expense-permits-2026-09-08.md), [benchmark preflight](../evidence/owner-ai-benchmark-2026-09-08.md), [account inventory](ACCOUNT_OWNERSHIP.md).
- Previous cumulative current-state text is retained at [historical snapshot](../evidence/current-state-history-through-2026-09-08.md). Its pre-release pending states are superseded here.
