# Milo Growth — current status

Updated: 9 September 2026. Owner: Rafal Andersen. Phase: private beta / launch foundations. Public paid launch: **NO-GO / acceptance incomplete**.

This is the current operational entry point. Read [progress review](PROGRESS_REVIEW_2026_09_09.md) for the remaining-work estimate and task inventory, [roadmap](ROADMAP.md) for delivery order, and [scope register](PLAN_REVIEW_2026_09_07.md) for R00–R24 and D01–D08. Older dated reports are history, not instructions to repeat completed work.

## Verified baseline

- Remote main checked 9 September: `c99a398177b55828e2e8e642a59304fd85421859`, merge of PR #98. PR #98 is MERGED. PRs #2, #58 and #62 remain open documentation/design proposals.
- Live version endpoint rechecked 9 September: build `1788901947226`; full fingerprint `1045bfb5005a289e1806ea134f76ec45025a1a9bd5a9ba25749b0da18a4bc0ae`, matching the prior release evidence. Runtime revision/modified are null, so the host does not supply a Git revision.
- Recorded deployment: `6836d9f2-38c3-44eb-8163-d6990fe1b3bd`. Source/component equivalence and home/MCP smoke were verified in the 8 September release. Today's check confirms the same build/fingerprint; it is not a fresh authenticated workflow test.
- Recorded validation for #98: 1,982 tests / 139 files, TypeScript, production build and lint of changed sources passed. Tests use synthetic suppliers; no paid AI benchmark is implied. No code tests rerun for this documentation review.
- Migration `20260908210000_restricted_ai_expense_permits.sql` was applied and verified 8 September. Latest recorded production counts: zero budgets, zero permits, zero attempts. These counts were not re-read today.

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

The implementation task **Kontynuuj plan Milo Growth** (`01a07ba1-c8b6-7582-9ff0-275d64224671`) is idle at this review, not executing in the background. Its next outcome is the controlled one-scan, one-article, one-image benchmark. The review task **Review project progress** consolidates records and archives duplicate status tasks; it does not start a second implementation stream.

1. Resolve the recorded OpenAI Platform reauthentication problem and finish secure key selection/save/configuration. Latest check on 8 September still returned UNAUTHORIZED after a previously successful reconnect. No key creation or installation is confirmed. Do not infer today's connection state without a fresh diagnostic when implementation resumes.
2. Finish the server-only benchmark runner. It must use the same core functions and preallocated permit identities; normal browser/MCP/scheduler input must not accept them. Distinguish scan metadata fallback from an actual AI result.
3. Recheck current budget state and model/rate contract, provision restricted global/account budgets plus exactly three permits within the already authorized USD5 total, run once, and reconcile actual usage. Errors/uncertain results retain reservations and do not authorize another attempt. Do not fund an ordinary owner budget that background jobs could spend.
4. Continue delivered-result allowances, team notifications/recovery, Stripe sandbox lifecycle, real AI observations/proof loop, remaining product/integration/localization work and beta/demo evidence in roadmap order.

The owner approved temporary use of the existing OpenAI account after reporting its email changed to Synergy. Exact Synergy address is unverified. This is an accepted exception: company-email migration is no longer a prerequisite. The new-key and USD5 authorizations persist; latest recorded benchmark usage is **0 calls / USD0**. Do not repeat the email change/test or ask again for these same authorizations. Never request secrets in chat.

## Material unresolved scope

Real observed AI answers on at least three trustworthy surfaces; citations/source/competitor analytics; server-log bot analytics; evidence → action → publication → later measurement; direct GSC and local/global coverage acceptance; complete growth agent and resumable execution; team permissions; premium screens; safe image ingest and CMS fidelity; backlinks supplier/Linkhouse acceptance; AI-client compatibility; optional Slack timing; 24-language customer surfaces; pricing, Stripe and policies; independent beta, support/recovery and actual setup/product videos.

Open decisions D01–D08 remain tracked. A changed email, a language dropdown or a passing synthetic test does not close those outcomes. Public-audit Worker/account/staging work under #35/#43 retains its separate release boundary; native OpenAI migration does not imply a Worker provider change.

## Recovery and evidence

- Product repo: `rafalandersen-dev/andersen-visibility-engine`.
- Lovable project: `06b696f6-c02b-468f-b0a0-7ab8af92d6a0`; workspace `oC4kAHCUIYuuomG2Hwnl`; database `fguokeheqoqunadhdbsz`.
- Latest implementation worktree: `/Users/rafi/Projects/milo-growth-restricted-expense-20260908`, branch `codex/milo-restricted-expense-20260908`, clean at #98 when inspected. Documentation work uses a separate review worktree.
- [PR #98 final evidence](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/98), [permit evidence](../evidence/restricted-ai-expense-permits-2026-09-08.md), [benchmark preflight](../evidence/owner-ai-benchmark-2026-09-08.md), [account inventory](ACCOUNT_OWNERSHIP.md).
- Previous cumulative current-state text is retained at [historical snapshot](../evidence/current-state-history-through-2026-09-08.md). Its pre-release pending states are superseded here.
