# Milo Growth — current status

Updated: 10 September 2026. Owner: Rafal Andersen. Phase: private beta / launch foundations. Public paid launch: **NO-GO / acceptance incomplete**.

This is the current operational entry point. Read [progress review](PROGRESS_REVIEW_2026_09_09.md) for the earlier, now historical estimate and task inventory, [roadmap](ROADMAP.md) for delivery order, and [scope register](PLAN_REVIEW_2026_09_07.md) for R00–R24 and D01–D08. Older dated reports are history, not instructions to repeat completed work.

## Recorded baseline and latest repository check

- Remote main: `72fb1fddf69fc7dbbf660d76cb7211ad8f154c3b`, normal merge of P4 specialist workspace PR #111. P0–P3 and all prior fixes are preserved.
- P4 released15:53:58UTC: deployment `b037331d-dcce-402e-a902-7e01abbf28ec`, build `1789055540776`, fingerprint `36b9fc4e5e344fe963fca42539117277e7ec076c77c9b8c7728757a528ae5043`. Exact clean merged source and public/auth boundaries verified. Optional truthful team view, original AI portraits and explicit scoped editorial lessons; no migration/timer change. Final review found no major issues; Linux2,648tests/194files on both versions. [Release evidence](../evidence/specialist-team-release-2026-09-10.md).
- P3 released14:54:55UTC: deployment `bb499c8e-5c0b-4ac0-9576-57cacfed1de8`, build `1789052034961`, fingerprint `7eb3afd78d226f7a0811848d4521536e23908fe6b47c74d8e65e65be40d02a30`. Exact clean merged source verified. Four migrations applied once and weekly timer activated after runtime verification.101 existing schedules held for explicit approval; dates/content/attempts preserved; no projects switched or funded. [Release evidence](../evidence/weekly-workflow-release-2026-09-10.md). Never reapply P0–P3 migrations.
- P2 released and verified at 11:40:53 UTC: deployment `f42f3511-4152-4ea1-bdbc-b4d9d00a305e`, build `1789040357738`, fingerprint `9b43c0cd05a5d1e3c69971c0807dd0f8c6bf9828ab4c37f84fd362240ee0ba83`. Exact clean merge and every component match production. P2 migration applied once with SHA256 `4b5f81b01dde27d97a29994b4404f42c327d824ea834b348b8a46c544e651a50`; do not reapply P0/P1/P2. See [P2 release evidence](../evidence/source-refresh-release-review-2026-09-10.md).
- P1 runtime verified 10 September at 09:09 UTC: deployment `d71e1ffb-4b24-484c-a593-452eec6d79f1`, build `1789031231514`, fingerprint `5c156a2c14aa171a8ac909d9505b6e6023f5ca6c416cf077ef9fdff1b278937f`. Exact clean merged revision and every component match the custom domain. Home/MCP GET 200, OPTIONS 204, anonymous POST 401.
- P1 migration `20260909200000_project_knowledge.sql` applied once transactionally; stored SHA-256 `27034fbe105b72bbe70ab354f2914798d3dc2f07149e0a13a5c1b382f4537a65` matches reviewed source. Five tables/RLS, ten functions, service-only permissions and deletion trigger verified. **Do not reapply P0/P1 migrations.**
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

P1 is technically released under PR #108: private original documents, scoped source/record review/history, source-derived canonical brand fields with owner overrides, account-scoped onboarding resume and four-locale controls. Final Linux Bun 1.3.3/1.4.0 checks pass **2,418 tests / 169 files**, TypeScript and production builds. Independent final Codex code review of `ebd61fe` found no major issues after the hostname fix; security review completed on `8da4cbc`. Claude workflow success is not substantive review evidence: final log reports 31 permission denials and no output. See the [P1 release packet](../evidence/project-knowledge-release-review-2026-09-10.md). Signed-in/browser acceptance remains unverified. P4/P5 and R00–R24/D01–D08 remain active; P2/P3 releases are recorded above.

## Current work and blockers

P0–P3 code/database/runtime releases are complete. P3 includes the working weekly executor, explicit coordinator/monthly cutover, durable stages and retained outputs, exact-version approval/queue admission, cancellation and uncertain-work recovery, and deduplicated in-app summaries. Final Linux suite passes2,641 tests/193files on both Bunversions, types/build/frozenlocks; final Codex code review found no major issues. All four P3 migrations applied once; weekly dispatch activated after exact runtime verification. Existing schedules are review holds, not automatically approved or moved. Signed-in/browser/provider acceptance remains pending under existing restrictions. P4 specialist view and scoped lessons are technically released as recorded above. P5 immutable outcome linkage and fixed workflow comparisons are implemented in PR112 under review; its new migration is unapplied. Real destination/measurement/provider and signed-in acceptance remain pending.

The owner has now asked to incorporate specialist agents with faces, optional brand-guidelines upload, isolated project learning and pre-week business refresh/preparation with final freshness checks. P1–P3 now implement the knowledge/refresh/weekly foundations; full specialist breadth/faces and measured outcome learning remain in progress. [AGENT_WEEKLY_PLAN_2026_09_09.md](AGENT_WEEKLY_PLAN_2026_09_09.md) defines P0–P5, dependencies and acceptance; the wider R00–R24/D01–D08 scope remains intact.

1. **P0 acceptance remaining:** retain the verified #107 release. Complete real signed-in recovery/download and responsive acceptance when browser access is legitimately available; do not retry the unchanged denied path or repeat migration/deployment/provider attempts.
2. **P2 acceptance:** preserve the released source/catalog refresh and dependency protections. Real authenticated catalog/source and signed-in journey acceptance remain distinct from the verified code/database/runtime release.
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
- P1 release task worktree: `/Users/rafi/.codex/worktrees/3ba7/milo-growth-generation-result-recovery-20260909`, branch `codex/milo-p1-release-p2-20260910`. Released merge `b1abcf3`; retain predecessor worktrees as audits. P2 continuation is in the branch/checkpoint named above. See [P1 release evidence](../evidence/project-knowledge-release-review-2026-09-10.md).
- P0 worktree: `/Users/rafi/Projects/milo-growth-generation-result-recovery-20260909`, branch `codex/milo-generation-result-recovery-20260909`; runtime release is main `17372b7`, followed only by release-evidence commit `7a0182c` on its branch. Retain as audit; do not repeat release or migration.
- Earlier portable P0 checkpoint `5d1320c` is historical and superseded by merged PR #107. The plan worktree/PR #106 are complete.
- [PR #101 release evidence](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/101), [permit evidence](../evidence/restricted-ai-expense-permits-2026-09-08.md), [benchmark preflight](../evidence/owner-ai-benchmark-2026-09-08.md), [account inventory](ACCOUNT_OWNERSHIP.md).
- Previous cumulative current-state text is retained at [historical snapshot](../evidence/current-state-history-through-2026-09-08.md). Its pre-release pending states are superseded here.
