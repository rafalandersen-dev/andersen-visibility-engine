# Milo Growth — current status

Updated: 9 September 2026. Owner: Rafal Andersen. Phase: private beta / launch foundations. Public paid launch: **NO-GO / acceptance incomplete**.

This is the current operational entry point. Read [progress review](PROGRESS_REVIEW_2026_09_09.md) for the earlier, now historical estimate and task inventory, [roadmap](ROADMAP.md) for delivery order, and [scope register](PLAN_REVIEW_2026_09_07.md) for R00–R24 and D01–D08. Older dated reports are history, not instructions to repeat completed work.

## Recorded baseline and latest repository check

- Remote main: `17372b78d65ada90a418a336f4473bc125626b41`, normal merge of recovery PR #107. PR #106 specialist/weekly plan and #105 FAQ fixes are included.
- Runtime verified 9 September at 19:26 UTC: deployment `f9fbd9dc-f391-4494-a5f8-b00b359e65f8`, build `1788981897171`, fingerprint `abb0ea3a5308a3817e36a522c185d790e8440ff4c3e3871d808e7ecafe33161c`. Exact clean revision and every component match the custom domain. Home/MCP GET 200, OPTIONS 204, anonymous POST 401.
- Recovery validation: 2,321 tests / 158 files, types/build/focused lint passed. Exact-head review 34393404657 succeeded, with seven permission denials limiting coverage. Three earlier Codex findings are fixed and resolved.
- Recovery migration `20260909160000_generation_result_recovery.sql` applied once; stored hash and RLS/RPC/write permissions verified. #103/#104/#101/#98 migrations remain installed. Do not repeat any of them.
- Zero new archive/receipt rows, native expense budgets, permits or requests; existing usage 10 rows / 226 units. No live provider test, funding, email or client content publication.
- [Recovery release evidence](../evidence/generation-result-recovery-work-in-progress-2026-09-09.md) records exact hashes and remaining authenticated/browser acceptance limits. HTTP/runtime checks do not replace those journeys.

## Delivered work to preserve

| Area | Delivered evidence | Still open |
| --- | --- | --- |
| Workspace and premium foundation | Today, Plan list/inspector/calendar, responsive shell, setup/edit fixes, existing Studio and reporting retained | Remaining modules, full responsive/accessibility and journey acceptance |
| Deployment and safety | Deployment mismatch fixed; fail-closed metering, bounded input/output/time, concurrency and recovery protections | Wider security/operational acceptance, complete unattended recovery |
| Account and email | Milo owner is rafi@anderseninnovations.com; 10 owner projects and role preserved; delivered/opened test and administrative verification recorded | Fresh login acceptance; full team notification delivery. Approved test email is consumed |
| Publishing | One scheduled Butelki Wodorowe article verified on 8 September at 09:00 Stockholm in both databases and public destination | Historical content-review failure and Andersen UK destination errors; WP/Shopify/custom parity |
| Direct OpenAI (#95) | Native text/image generation no longer uses or falls back to Lovable AI | Secure key setup and actual provider generation not verified |
| Monetary admission (#96/#98) | Native calls reserve account/global funds; unknown costs retain reserves; restricted budgets and one-attempt permits deployed | Funding the isolated test, real costs/reconciliation and complete delivered-result acceptance |
| Result allowances (#104) | Atomic quota receipts return units after confirmed technical failures; provider expense/permits remain separate | Durable output recovery/download and complete customer-delivery acceptance |
| Controlled owner test (#101) | Durable scan/article/image stages, exact one-attempt identities, retained private output and owner-only controls deployed | Secure key configuration, provisioning, actual generation, cost/quality and visual acceptance |
| Languages (#97) | All 24 EU content-language choices and authoring plumbing; language sync and title slugs fixed | UI remains four locales; full UI/email/report/legal translations and language quality acceptance |
| MCP and notifications | Scoped draft/profile/batch/image import, bounded ingress, renewed private previews, inbox/outbox and scheduler recovery foundations | Actual client image transfers, CMS fidelity, team recipients and complete delivery acceptance |
| Stripe (#80) | Isolated sandbox checkout/receipt foundations and migration | Configured sandbox, real lifecycle acceptance and commercial rollout; owner deferred setup |

## Current work and blockers

P0 recovery code/database/runtime release is complete under PR #107; authenticated lost-response/recovery/download and visual acceptance remain blocked by the recorded browser-policy denial. Independent P1 implementation has started in `/Users/rafi/Projects/milo-growth-project-knowledge-20260909` on `codex/milo-project-knowledge-20260909`. Its scoped source/record selection contract has 17 focused tests passing; proposed versioned private storage has 9 database tests passing. It is groundwork, not a released brand-upload or learning UI. The P1 migration is unapplied.

The owner has now asked to incorporate specialist agents with faces, optional brand-guidelines upload, isolated project learning and pre-week business refresh/preparation with final freshness checks. These are accepted direction and specified work, not delivered features. [AGENT_WEEKLY_PLAN_2026_09_09.md](AGENT_WEEKLY_PLAN_2026_09_09.md) defines P0–P5, dependencies and acceptance; the wider R00–R24/D01–D08 scope remains intact.

1. **P0 acceptance remaining:** retain the verified #107 release. Complete real signed-in recovery/download and responsive acceptance when browser access is legitimately available; do not retry the unchanged denied path or repeat migration/deployment/provider attempts.
2. **P1/P2:** extend Brand Intelligence into sourced project knowledge, optional brand-document/website/skip onboarding, shared text/visual context, explicit corrections and business/catalog refresh. Independent implementation continues while provider access is blocked.
3. **P3–P5:** weekly specialist preparation and final checks, full truthful team/faces and scoped lessons, then measured outcome/workflow improvements. Preserve Manual/Review/Autopilot authority and migrate the monthly generator without duplicate slots or generation.
4. **Provider prerequisite:** the last OpenAI Platform check returned UNAUTHORIZED / openai_platform_authentication_failed; the owner clarified no reconnect/key setup was performed. Finish secure account/project selection, local key save and server configuration when authentication is actually resolved. Do not retry unchanged authentication or request secrets in chat.
5. **Controlled test:** recheck budgets/model/rates, provision restricted global/account budgets and exactly three permits within the existing USD5 total, execute once and reconcile. Unknown outcomes retain reservations; no repeat paid attempt or ordinary funded budget is authorized.
6. Continue team notifications/recovery, Stripe configured sandbox lifecycle, observed AI/GSC/proof, remaining premium/integration/localization and beta/demo evidence. Stripe setup remains owner-deferred; no live rollout or pricing decision is implied by the plan update.

The owner approved temporary use of the existing OpenAI account after reporting its email changed to Synergy. Exact Synergy address is unverified. This is an accepted exception: company-email migration is no longer a prerequisite. The new-key and USD5 authorizations persist; latest recorded benchmark usage is **0 calls / USD0**. Do not repeat the email change/test or ask again for these same authorizations. Never request secrets in chat.

## Material unresolved scope

Real observed AI answers on at least three trustworthy surfaces; citations/source/competitor analytics; server-log bot analytics; evidence → action → publication → later measurement; direct GSC and local/global coverage acceptance; specialist growth team, optional brand upload, project knowledge/lessons, weekly business refresh/preparation and resumable execution; team permissions; premium screens; live image-transfer and CMS fidelity acceptance; backlinks supplier/Linkhouse acceptance; AI-client compatibility; optional Slack timing; 24-language customer surfaces; pricing, Stripe and policies; independent beta, support/recovery and actual setup/product videos.

Open decisions D01–D08 remain tracked. A changed email, a language dropdown or a passing synthetic test does not close those outcomes. Public-audit Worker/account/staging work under #35/#43 retains its separate release boundary; native OpenAI migration does not imply a Worker provider change.

## Recovery and evidence

- Product repo: `rafalandersen-dev/andersen-visibility-engine`.
- Lovable project: `06b696f6-c02b-468f-b0a0-7ab8af92d6a0`; workspace `oC4kAHCUIYuuomG2Hwnl`; database `fguokeheqoqunadhdbsz`.
- P1 implementation worktree: `/Users/rafi/Projects/milo-growth-project-knowledge-20260909`, branch `codex/milo-project-knowledge-20260909`, based on merged #107. The sourced-knowledge, private-storage and document-parser foundation is WIP, not released. See [P1 checkpoint](../evidence/project-knowledge-work-in-progress-2026-09-09.md).
- P0 worktree: `/Users/rafi/Projects/milo-growth-generation-result-recovery-20260909`, branch `codex/milo-generation-result-recovery-20260909`; runtime release is main `17372b7`, followed only by release-evidence commit `7a0182c` on its branch. Retain as audit; do not repeat release or migration.
- Earlier portable P0 checkpoint `5d1320c` is historical and superseded by merged PR #107. The plan worktree/PR #106 are complete.
- [PR #101 release evidence](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/101), [permit evidence](../evidence/restricted-ai-expense-permits-2026-09-08.md), [benchmark preflight](../evidence/owner-ai-benchmark-2026-09-08.md), [account inventory](ACCOUNT_OWNERSHIP.md).
- Previous cumulative current-state text is retained at [historical snapshot](../evidence/current-state-history-through-2026-09-08.md). Its pre-release pending states are superseded here.
