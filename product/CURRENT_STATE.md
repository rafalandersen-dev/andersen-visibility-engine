# Milo Growth — current status

Updated: 9 September 2026. Owner: Rafal Andersen. Phase: private beta / launch foundations. Public paid launch: **NO-GO / acceptance incomplete**.

This is the current operational entry point. Read [progress review](PROGRESS_REVIEW_2026_09_09.md) for the earlier, now historical estimate and task inventory, [roadmap](ROADMAP.md) for delivery order, and [scope register](PLAN_REVIEW_2026_09_07.md) for R00–R24 and D01–D08. Older dated reports are history, not instructions to repeat completed work.

## Recorded baseline and latest repository check

- Remote main inspected for this plan: `064a6d8b7233f86b29e19f097ac0e63bd283d253`, normal merge of PR #105 (FAQ save/dirty-state fix). Its production deployment/save-reload acceptance was not checked in this planning update. Do not infer runtime equality from the repository SHA.
- Last runtime verification recorded by this task: #104 merge `9b2d26b74654ad6cd5e05876ddf1c0f72623a8fa`, deployment `1bb89306-cf0b-401e-bdb8-47e7968ca217`, public build `1788956633294`, full fingerprint `21b86a318dc2154f741579e4fd70587fe2787177b8676ed9470542a097e09489`. Full/component fingerprints and exact clean runtime revision verified 12:34 UTC on 9 September. This is prior release evidence, not a fresh runtime check.
- #104 verification: 2,212 tests / 151 files, types/build/focused lint passed. Review 34349698388 succeeded with no inline findings; five permission denials limit its completeness. Home/MCP GET 200, OPTIONS 204, anonymous POST 401 after an initial HTTP timeout. These are HTTP checks, not authenticated UI/client acceptance.
- Migrations `20260909140000_preserve_mcp_image_receipts.sql` (#103) and `20260909150000_generation_usage_receipts.sql` (#104) were applied once. Do not repeat them. #101 controlled-runner and #98 restricted-permit migrations remain installed. Proposed `20260909160000_generation_result_recovery.sql` is not applied.
- #104 preflight recorded zero native expense budgets, permits and requests; existing usage 10 rows / 226 units unchanged, new generation receipt registry empty. No live benchmark/funding was performed. Recheck before future funded execution.
- See [generation quota release evidence](../evidence/generation-usage-receipts-2026-09-09.md), [image import evidence](../evidence/mcp-image-import-2026-09-09.md), and [FAQ fix record](../docs/operations/milo-faq-save-2026-09-09.md). Historical test counts establish their stated scope only.

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

The fresh implementation task continues P0 in the original working tree. PR #106 is merged at `c314c32607cf6c80a8a6a22bde6e42155156c700`; #105 FAQ fixes are reconciled into recovery. The prior uncommitted recovery work is preserved in `4eb7b40`, with normal main reconciliation in `09067e8`. Private archive/RPCs, authenticated recovery/download, shared generation integration, Recent generations UI and late-browser-save protection are implemented. Full local validation passes (2,321 tests / 158 files, types, build and focused lint). Recovery review, migration and runtime verification remain pending; signed-in visual acceptance remains blocked by the recorded browser-policy denial. See [current recovery evidence](../evidence/generation-result-recovery-work-in-progress-2026-09-09.md).

The owner has now asked to incorporate specialist agents with faces, optional brand-guidelines upload, isolated project learning and pre-week business refresh/preparation with final freshness checks. These are accepted direction and specified work, not delivered features. [AGENT_WEEKLY_PLAN_2026_09_09.md](AGENT_WEEKLY_PLAN_2026_09_09.md) defines P0–P5, dependencies and acceptance; the wider R00–R24/D01–D08 scope remains intact.

1. **P0 next:** complete recovery review, migration and runtime verification after the successful local validation. Preserve owner edits, retained results, receipt identities and zero-funded benchmark state. Current main and #105 are reconciled; recovery is tracked in [PR #107](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/107).
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
- Current implementation worktree: `/Users/rafi/Projects/milo-growth-generation-result-recovery-20260909`, branch `codex/milo-generation-result-recovery-20260909`, base #104 `9b2d26b74654ad6cd5e05876ddf1c0f72623a8fa`, with uncommitted code and unapplied migration. Preserve it. #105 belongs to the separate merged FAQ fix.
- Portable recovery snapshot: [`codex/milo-recovery-checkpoint-20260909`](https://github.com/rafalandersen-dev/andersen-visibility-engine/tree/5d1320cbc4d5ba1399a4c277eae2c274908b9f12), commit `5d1320cbc4d5ba1399a4c277eae2c274908b9f12`. The remote ref preserves unfinished code for fresh-clone recovery; it is not reviewed for release, merged or deployed. Use its `product/RECOVERY_CHECKPOINT_2026_09_09.md`. Continue only in the original active worktree unless explicitly transferring implementation.
- Plan update worktree: `/Users/rafi/Projects/milo-growth-agent-weekly-plan-20260909`, branch `codex/milo-agent-weekly-plan-20260909`, based on #105. This documentation packet does not contain the unfinished recovery code or change runtime scheduling.
- [PR #101 release evidence](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/101), [permit evidence](../evidence/restricted-ai-expense-permits-2026-09-08.md), [benchmark preflight](../evidence/owner-ai-benchmark-2026-09-08.md), [account inventory](ACCOUNT_OWNERSHIP.md).
- Previous cumulative current-state text is retained at [historical snapshot](../evidence/current-state-history-through-2026-09-08.md). Its pre-release pending states are superseded here.
