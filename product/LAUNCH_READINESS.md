# Milo Growth — Launch Readiness

**Status:** Canonical gate checklist; no new release GO

**Last updated:** 2026-09-07

**Product Lead:** Rafal Andersen

Unattended paid public launch remains **NO-GO / not verified**. Assisted beta remains supervised with explicit scope and cost limits. July percentages are historical estimates, not current readiness. A merged UI PR or successful Vercel deployment does not close the following gates.

| Gate | Required evidence | Current disposition |
| --- | --- | --- |
| G0 Baseline/release | Current exact-head audit, build identity, migrations/configuration, review and rollback | Main/#63 merge/status checked; wider audit/runtime verification open |
| G1 Public audit | Verified abuse/privacy/provider/cost boundary or verified disabled/deterministic containment | Worker code exists; #35/#43 open; do not copy obsolete “no routes” state |
| G2 Commercial authority | Server entitlements and Stripe checkout/portal/webhook lifecycle with replay/failure/cancel/refund tests | Entitlement code exists; Stripe pending |
| G3 Economics | Bounded paid calls, concurrent reservations, account/global ceilings; typical/high/max cost and viable packages | Fail-open metering found; runtime flag unknown; costs/prices not finalized |
| G4 Content execution | Setup/edit → Studio → manual/review/auto publication; destination parity and recovery | Existing code + selected QA; complete provider/unattended acceptance open |
| G5 Autonomy and teams | Solo/team mode independence, permissions, approvals, pause/cancel, logout/overnight jobs | Planned completion and acceptance |
| G6 Notifications | Missing approval, failed/blocked/manual-overdue, empty week, quota/agent pause; dedupe/recheck/delivery | Helpers exist; complete system pending |
| G7 Search/AI evidence | Direct GSC; ≥3 trustworthy initial AI surfaces, citations/raw responses/method/history; first proof loop | GSC paths exist; observed AI and end-to-end proof pending |
| G8 Preserved premium UX | Every mapped action; responsive/long-text/accessibility/error cases for core modules | #63 selected set merged; remaining UI pending |
| G9 Authority/providers | Backlinks status honestly represented; supplier/outreach acceptance before enabled/promised | Existing intelligence/demo/control code; provider completion pending |
| G10 AI clients/integrations | Claude/ChatGPT regression + all-major app-specific compatibility matrix; no false connection claims | Existing two; expansion pending. Unsupported clients require recorded disposition |
| G11 International/local | All 24 EU languages across defined surfaces; app/content/market distinction; local/global coverage audit | Four UI locales present; expansion open |
| G12 Commercial trust | Actual Stripe/legal/tax/invoicing/refund wording, support, retention/export/deletion/recovery | Identity present; review/payment alignment and operational verification open |
| G13 Product proof | Setup demo, real product recordings and beta outcomes, without unfinished-feature claims | Pending |

## Acceptance before public release

- [ ] Reconcile every R00–R24 scope item to this checklist, with evidence or an explicit owner-approved deferral. Do not silently move agreed launch scope into post-launch months.
- [ ] Record whether log-based Agent Analytics, deeper source analytics and Slack ship in the first public release; these remain in the plan and cannot be advertised before verified. The first three AI surfaces are a floor, not the all-major target ceiling.
- [ ] Complete 3–5 assisted testers and at least one solo-autopilot plus one team-review/mixed journey. Include logout operation, failure/recovery, quota conflict and notification cases.
- [ ] Measure first value, task success, publication reliability, support load, spend and proof coverage. Benchmark practical customer outcomes rather than count competitor logos.
- [ ] Record exact release SHA/tree, migrations, host, configuration presence, named operator and rollback. Use existing approvals where applicable; obtain only genuinely new environment authority required by the release packet.
- [ ] Verify custom-domain deployment and low-volume production smoke after authorized release; keep source/deploy/provider evidence separate.
- [ ] Write back current state, decisions, operations and evidence; ensure a fresh Claude/Codex session can recover the next action.

Historical #46 tests/review remain in [staging evidence](../evidence/public-audit-staging-harness-2026-07-28.md). #63 focused design/workflow evidence remains in [design-qa.md](../design-qa.md). Neither is represented as blanket September public-launch approval.
