# Milo Growth — Launch Readiness

**Status:** Canonical gate checklist; no new release GO

**Last updated:** 2026-09-12 (release-baseline clarification; gate requirements unchanged)

**Product Lead:** Rafal Andersen

Unattended paid public launch remains **NO-GO / not verified**. Assisted beta remains supervised with explicit scope and cost limits. July percentages are historical estimates, not current readiness. A merged UI PR or successful deployment does not close the following gates.

The G1–G13 dispositions below are historical assessments recorded on 9 September, not a fresh inventory of missing implementation. Later work is recorded in [current state](CURRENT_STATE.md) and the [12 September progress review](PROGRESS_REVIEW_2026_09_12.md). Read those records before rebuilding or declaring a feature absent. The required evidence and unchecked acceptance items remain binding; this clarification grants no acceptance credit.

| Gate | Required evidence | Recorded disposition (G1–G13: 9 September) |
| --- | --- | --- |
| G0 Baseline/release | Current exact-head audit, build identity, migrations/configuration, review and rollback | 12 September recorded baseline: PR134 merge `68bed8fba311e75fe39e1ae3b59ed6558669bc39`, deployment `cb151ad5-8d4c-43c7-8fcb-964eb123d8f2`, exact clean runtime verified at05:52:23.452UTC, seven public/auth checks and ten unchanged baselines. [Release evidence](../evidence/ui-evidence-release-2026-09-12.md). No migration; do not repeat deployment. This dated evidence does not replace fresh review/runtime/baselines for another release |
| G1 Public audit | Verified abuse/privacy/provider/cost boundary or verified disabled/deterministic containment | Worker code exists; #35/#43 open; do not copy obsolete “no routes” state |
| G2 Commercial authority | Server entitlements and Stripe checkout/portal/webhook lifecycle with replay/failure/cancel/refund tests | Server entitlements and #80 sandbox foundations exist; configured Stripe lifecycle acceptance pending |
| G3 Economics | Bounded paid calls, concurrent reservations, account/global ceilings; typical/high/max cost and viable packages | Fail-closed metering and native monetary/permit admission deployed; controlled runner and #104 quota receipts delivered; durable result recovery, real benchmark/costs and prices unfinished |
| G4 Content execution | Brand upload/website/skip setup → project knowledge → weekly preparation → final freshness/approval → publication; destination parity and recovery | Existing code + selected QA; new knowledge/weekly specification and complete provider/unattended acceptance open |
| G5 Autonomy and teams | Solo/team mode independence, permissions, approvals, pause/cancel, logout/overnight jobs | Planned completion and acceptance |
| G6 Notifications | Missing approval, failed/blocked/manual-overdue, empty week, quota/agent pause; dedupe/recheck/delivery | Inbox/outbox and background sweep deployed; owner test delivered; team/full delivery acceptance pending |
| G7 Search/AI evidence | Direct GSC; ≥3 trustworthy initial AI surfaces, citations/raw responses/method/history; first proof loop | GSC paths exist; observed AI and end-to-end proof pending |
| G8 Preserved premium UX | Every mapped action; responsive/long-text/accessibility/error cases for core modules | #63 selected set merged; remaining UI pending |
| G9 Authority/providers | Dedicated Backlinks & Authority specialist: sourced project-fit opportunities, dated monitoring, authorized outreach/orders, independent placement verification and bounded expense | Existing intelligence/demo/control code; specialist and provider/contract acceptance pending |
| G10 AI clients/integrations | Claude/ChatGPT regression + all-major app-specific compatibility matrix; no false connection claims | Existing two; expansion pending. Unsupported clients require recorded disposition |
| G11 International/local | All 24 EU languages across defined surfaces; app/content/market distinction; local/global coverage audit | 24 EU content-language plumbing deployed; four UI locales; wider translations and quality acceptance open |
| G12 Commercial trust | Actual Stripe/legal/tax/invoicing/refund wording, support, retention/export/deletion/recovery | Identity present; review/payment alignment and operational verification open |
| G13 Product proof | Setup demo, real product recordings and beta outcomes, without unfinished-feature claims | Pending |

## Agent, knowledge and weekly-work acceptance

The [specialist/knowledge/weekly specification](AGENT_WEEKLY_PLAN_2026_09_09.md) is part of G3–G8, G11–G13: verify project isolation and revocation, traceable brand extraction, editorial lessons, business-source freshness, single scheduler ownership, version-specific approvals/holds, cost-bounded specialist work and truthful team states. Demonstrate two next-week slots plus an intervening price/offer change, source outage, duplicate job, quota shortfall and paused project. Validate across representative niches/languages with owner editing effort and cost per accepted output. No new agent/learning capability is accepted by this documentation update.

## Acceptance before public release

- [ ] Reconcile every R00–R24 scope item to this checklist, with evidence or an explicit owner-approved deferral. Do not silently move agreed launch scope into post-launch months.
- [ ] Record whether log-based Agent Analytics, deeper source analytics and Slack ship in the first public release; these remain in the plan and cannot be advertised before verified. The first three AI surfaces are a floor, not the all-major target ceiling.
- [ ] Complete 3–5 assisted testers and at least one solo-autopilot plus one team-review/mixed journey. Include logout operation, failure/recovery, quota conflict and notification cases.
- [ ] Measure first value, task success, publication reliability, support load, spend and proof coverage. Benchmark practical customer outcomes rather than count competitor logos.
- [ ] Record exact release SHA/tree, migrations, host, configuration presence, named operator and rollback. Use existing approvals where applicable; obtain only genuinely new environment authority required by the release packet.
- [ ] Verify custom-domain deployment and low-volume production smoke after authorized release; keep source/deploy/provider evidence separate.
- [ ] Write back current state, decisions, operations and evidence; ensure a fresh Claude/Codex session can recover the next action.

Historical #46 tests/review remain in [staging evidence](../evidence/public-audit-staging-harness-2026-07-28.md). #63 focused design/workflow evidence remains in [design-qa.md](../design-qa.md). Neither is represented as blanket September public-launch approval.

D07 retains its full [scope-register definition](PLAN_REVIEW_2026_09_07.md): final team role/approval matrix and exceptions requiring review under autopilot, with external MCP publication scope still unissued. An email-language or delivery-setting decision alone cannot close D07. Likewise local language/browser smoke is partial G8/G11 evidence and cannot close G13 or the required recorded solo/team and assisted-tester journeys.

## Pending candidate migration — knowledge review eligibility

`20260912040000_knowledge_review_batch_time.sql` is committed candidate work, **not applied or approved for production**. It replaces only `read_output_knowledge_review_batch`; it does not change tables, response fields or stored review history. It excludes future-dated and withdrawn entries from the active-review result while preserving history visibility and service-role-only execution.

Before an authorized rollout, verify the target migration ledger and function definitions against the candidate. The local database test applies the project-knowledge, source-refresh, output-knowledge-integrity and output-knowledge-review prerequisites before this migration. That isolated dependency-chain test does not establish compatibility with an uninspected production database or verify all pending migrations as one production rollout. Include this migration in the exact release packet after its prerequisites; do not apply it alone to a target missing them.

Acceptance must confirm both individual publication checks and the batch impact view: eligible current review, withdrawn review, future-dated review, preserved history, project isolation and restricted RPC privileges. The response shape remains compatible with the previous app. An app rollback therefore need not remove the stricter database filter; reverting that filter would reopen the eligibility gap and requires a separately reviewed corrective plan. No automatic rollback or new release permission follows from this note.
