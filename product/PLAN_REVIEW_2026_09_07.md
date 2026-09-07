# Milo Growth — scope reconciliation, 7 September 2026

**Purpose:** preserve all commitments, correct outdated state and define the next plan.

**Outcome Owner:** Rafal Andersen. **Implementation baseline inspected:** `34cacf695baee8696582d94559c74880133647ed`.

**Scope of this review:** conversation/decision recovery, repository plans, selected source contracts, GitHub PR/issue state and the named Nimt/Profound references. This is not an independent full security audit, provider test, account inspection or production verification.

## Evidence and status vocabulary

- **Merged / present in code:** implementation exists; live acceptance may still be open.
- **Partial:** preserve the existing workflow and finish specified gaps.
- **Planned:** accepted direction; implementation unverified or not built.
- **Proposal / open decision:** do not present as an approved final design or delivery promise.
- **Blocked / verify:** dependency or evidence is missing, not a reason to silently drop scope.

Current execution order is in [ROADMAP.md](./ROADMAP.md). Route-level preservation remains in [FEATURE_INVENTORY.md](../docs/premium-redesign/FEATURE_INVENTORY.md). Existing July technical contracts remain useful, but their old status/priority labels are not current progress evidence.

## Full scope register

| ID | Workstream / retained commitment | Current assessment | Completion evidence |
| --- | --- | --- | --- |
| R00 | Exact implementation, deployment and plan baseline | Main/PR #63 verified; wider exact-head audit pending | Commit, tests/review scope, runtime build identity and environment facts recorded separately; fresh-session pickup works |
| R01 | Premium Today, Plan list/inspector, calendar and responsive shell | Merged in #63; selected QA recorded | Preserve search/board/archive/bulk/discovery; finish outstanding cross-device/locale cases and production verification |
| R02 | Remaining premium UI | Partial; Studio grid fixed, full modules not complete | Studio/setup/audits/competitors/authority/links/analytics/reports/billing/onboarding meet common design and mapped action checks |
| R03 | Project setup, later edit, Brand Intelligence and catalog | Existing; route/language/USP fixes merged; bootstrap proposal remains | URL-first setup, complete profile/market/voice/goals/services/competitors, safe field ownership, edit/save/reload and incomplete-state recovery |
| R04 | Solo and companies, Manual/Review/Autopilot/mixed | Direction accepted; existing controls retained | Independent account/team and autonomy choices; project roles, approver assignment, version-bound permission and pause controls |
| R05 | Reliable scheduled generation and publication | Existing scheduler/publishing code; unattended E2E open | Logged-out run, timezones/DST, dedupe, cancel/reschedule, stale approval, bounded retry, uncertain result recovery and destination verification |
| R06 | Clean operational notifications | Email transport and in-app risk helpers exist; complete system planned | Approval/blocked/failed/manual-overdue/empty-week/low-quota/paused-agent alerts, digest, dedupe/recheck, delivery history and assigned recipients |
| R07 | Milo agent that completes growth work | Existing tools; orchestrator and identity planned | Evidence → plan → permitted tool execution → check → report; resumable jobs, project boundaries and bounded spend. Avatar tested separately |
| R08 | Existing Claude/ChatGPT MCP and wider AI-client access | Claude/ChatGPT existing per owner; scoped draft tools merged #59 | Revalidate read/write/propose/revoke; app-specific compatibility matrix for Perplexity/Gemini/Copilot/Grok/Mistral; no generic unsupported logos |
| R09 | Unit economics, limits and understandable packages | Server entitlements exist; meter can fail open; final prices unset | Atomic account/global budget controls; real cost model; clear article/revision/image/monitoring/agent allowances and failure/refund policy |
| R10 | Real observed AI visibility and citations | Current readiness advice is not observed tracking | ≥3 initial trustworthy surfaces, raw answer/citation evidence, history, method/market/language/mode and missing-vs-zero semantics |
| R11 | Nimt-style analytical depth | Requirements recovered from screenshots; not claimed built | Mentions/citations, model/service/mode filters, prompt intent, sentiment, share of voice, cited pages/domains, source ownership/content types and actionable gaps |
| R12 | Profound-style Agent Analytics | Explicit gap beyond referral beacon | Server/edge log ingestion, verified/unknown bot identity, page/time/status analysis; crawler requests kept separate from answers/referrals/conversions |
| R13 | Google/technical SEO and GSC | Multiple existing capabilities; verify scope before rebuilding | Direct GSC OAuth/API; query/page changes; indexability/status/robots/canonical/hreflang/sitemap/schema/link checks; crawler depth/CWV/URL inspection mapped to evidence |
| R14 | Backlinks intelligence and ongoing monitoring | DataForSEO code and historical smoke; current provider activation unverified | Cost-bounded authorized provider acceptance; referring domains/gaps, new/lost links, quality evidence and actions in Plan |
| R15 | Linkhouse marketplace and outreach completion | Demo orders and controlled send code exist; private supplier contract missing | Quote/order/status/error/refund integration; sender/suppression/recipient review verified; no unreviewed send or guaranteed placement |
| R16 | Proof Loop, analytics and reporting | Analytics/monthly reports exist; complete action-proof chain open | Evidence/action/asset/URL linkage, deployment check, before/after windows; GA4/conversion/revenue extensions where justified; no causal overclaim |
| R17 | Local and global growth | Coverage audit required; retain full ambition | Local entity/NAP/location/service pages/citations/reviews/GBP path and international targeting; deeper vertical playbooks sequenced explicitly |
| R18 | Articles, visuals and connector fidelity | Studio/quality/links/media existing; completion and live parity open | Canonical preview/export/publish; approved hooks/images/alt/authors/sources; revisions, anchors, legacy behavior, WP/Shopify/custom media evidence |
| R19 | Slack and broader integrations | Planned optional channel; launch timing open | Shared job/permission engine, @Milo/DM/summaries/actions, project mapping, revoke/error handling; catalog breadth distinguished from tested actions |
| R20 | All EU languages | Four UI locales exist: PL/EN/SV/DA | 24-language domain/prompt/UI/email/formatting support, coverage matrix and locale QA; separate app/content/market axes |
| R21 | Stripe, commercial lifecycle and public policy alignment | Paddle code remains; Stripe required, not implemented | Sandbox/live evidence separately; checkout/portal/webhooks/entitlements/tax/invoices/cancellation/refund; existing subscriber check; accurate terms/pricing |
| R22 | Successful onboarding demo and real product videos | Required; not completed by screenshots | Setup tutorial and recorded solo/team end-to-end flows using suitable owner projects; mask data and distinguish sample/observed content |
| R23 | Beta, support, reliability and launch evidence | Private beta baseline; unattended paid launch not verified | 3–5 assisted testers plus solo/team unattended journeys; acceptance, quality, support load, costs, incidents and recovery evidence |
| R24 | Public audit containment and continuing release discipline | #35/#43 open; later route commits exist beyond July evidence | Current config/presence and exact-head assessment; isolated abuse/privacy/provider/cost checks or verified deterministic/disabled containment; bounded release decision |

## Conflicts and omissions corrected

| Previous text or easy-to-miss assumption | Reconciliation |
| --- | --- |
| July `CURRENT_STATE` says latest main is #46 and entitlements are client-writable | Main is #63 merge. `entitlements.server.ts` exists and metering resolves its authoritative plan. This old vulnerability description is obsolete; production migration/enforcement still needs evidence |
| July legal section says seller identity is placeholder | `legal.ts` now contains identity and contact data. Terms/refunds still mention Paddle; Stripe policy alignment and review remain open |
| “Metering is off” stated as current fact | Source uses `AI_METERING_ENFORCED`; runtime value not inspected. Concrete source defect is fail-open RPC/no-row behavior |
| “Worker not deployed / no routes” copied from July | Current Wrangler has production routes and later boundary commits. Runtime deployment/account state is unknown from this review; do not infer absence or success |
| Roadmap specifies Paddle | Stripe is the accepted replacement after Paddle rejection; include public copy, receipts/portal and subscriber migration, not just checkout |
| AI monitor still labelled P3 / ≥2 engines | September launch priority uses ≥3 trustworthy initial surfaces. All-major coverage remains a staged objective with methodology evidence |
| Languages at M11, digests at M4, costs at M8 | First-release language coverage, essential notifications and hard costs are current requirements; later months deepen them |
| Claude-only or new ChatGPT MCP project | Claude and ChatGPT already exist. Preserve them; complete authoring and other-client compatibility gaps |
| Agent mentioned but treated as chat/avatar | Real executor needs shared tools/jobs, permission/cost limits and verification. Proposed name/face is a distinct design decision |
| Solo implies autopilot; company implies manual | Both segments can choose manual/review/auto and mix permissions per project/action; team permissions are not the deferred agency expansion |
| “No images” plan vs required featured image | Distinguish no AI image generation from no image at all; retain existing publish checks until a text-only policy is chosen |
| 8 articles/month implies 2 every week | 2 fixed weekdays can yield 9–10 slots; cadence is a user choice, not an obligation inferred from quota |
| Any future article means next week is covered | Evaluate each intended slot and distinguish missing draft, missing approval and actually queued content; respect pause/seasonality |
| Alert subsystem reduced to send-email helper | Needs logged-out server events, dedupe, stale-state recheck, responsible recipient and delivery failure recovery. Email GET links must never approve/publish |
| Tokens/credits used as the commercial product | Public units describe useful work; internal provider cost and user allowances stay separate. Imported external text is not Milo generation |
| Backlinks treated as one unfinished module | Separate existing intelligence, ongoing monitoring, supplier adapter and controlled outreach; each has different costs/dependencies |
| “3,000 apps” means native/full action coverage | Catalog reach does not prove tested workflows. Native integrations, external AI→Milo MCP and Milo→tools connectors are separate |
| Read-only issue #43 approval requested again | Issue body and prior user approval already authorize read-only discovery. Concrete environment mutation remains a separate bounded step |
| Open PRs disappear from the plan | #58 authoring, #2 bootstrap and #62 design remain explicitly tracked; #59 draft implementation is already in main |

## Open decisions and dependencies — keep visible

- [ ] **D01:** exact package counts/prices, included revisions/images/monitoring/agent work, add-on rules and target margin after cost measurement. No new prices configured by this plan.
- [ ] **D02:** whether truly text-only new articles are supported, and how visual readiness/approval changes. Uploaded images remain distinct from generated ones.
- [ ] **D03:** initial observed-AI services/modes, data supplier, comparable methodology, spend ceiling and later coverage sequence. Do not conflate this with MCP client support.
- [ ] **D04:** Linkhouse private API contract/sandbox and controlled DataForSEO/outreach acceptance. Do not simulate production success.
- [ ] **D05:** final Milo avatar/name treatment and voice. “Milo” + stylized AI face is the current recommendation, not a finished asset.
- [ ] **D06:** Slack timing relative to public launch and the first supported workflow; broader integration provider based on demand and cost.
- [ ] **D07:** final role/approval matrix for teams and exceptions requiring review even under autopilot. Existing external MCP publication scope stays unissued until a separately designed permission change.
- [ ] **D08:** verify actual existing paying/manual subscriptions, environment state and release operations before Stripe migration or paid rollout.

Owner for these decisions is Rafal Andersen. Implementation research should prepare concrete alternatives/evidence before asking him to decide. This register does not pause already-authorized read-only or documentation work.

## Competitive reference reconciliation

The user's 15 Nimt screenshots were reviewed in the preceding analysis. They show marketing/demo interfaces, not independent functional acceptance. The August strategy also retains SeoVision, Soro, BabyLoveGrowth, Writesonic, Semrush/Ahrefs and specialist benchmarks as relevant monitoring context; their current products/prices were not all re-researched in this reconciliation.

On 7 September, [Nimt's official site](https://www.nimt.ai/) describes an AI agent, app/Slack, MCP, answer/citation tracking and a large integration catalog. Its displayed web-search modes must not be collapsed into model names or described as a web-app measurement method without evidence. Having an agent alone is not Milo differentiation. No evidence here establishes which embedded connector supplier Nimt uses.

[Profound Agent Analytics](https://www.tryprofound.com/features/agent-analytics) describes server-log-based bot analytics, crawler verification, traffic attribution and page-level analysis. For Milo this motivates R12; crawler access alone is not proof that a brand was mentioned or a URL cited in an answer.

The useful competitive test is customer task completion, evidence quality, reliability, total effort and economics across solo and team journeys. “Best on the market” remains an ambition to prove, not a checked acceptance item. AI readiness, GEO/AEO labels or a large logo catalog do not establish it.

## Review evidence and limits

- `git fetch origin` confirmed main at `34cacf695baee8696582d94559c74880133647ed`; source branch based on that commit.
- GitHub confirmed [PR #63](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/63) merged, with a successful Vercel status on its merge commit. Custom-domain build was not independently checked here.
- [PR #62](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/62), [PR #58](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/58), [PR #2](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/2), [issue #43](https://github.com/rafalandersen-dev/andersen-visibility-engine/issues/43) and [issue #35](https://github.com/rafalandersen-dev/andersen-visibility-engine/issues/35) remain open at review time.
- Inspected all canonical `product/` plans, preservation map, notifications/economics specification and relevant July roadmap/traceability/Studio/backlinks/MCP contracts. Checked current entitlement/metering/legal/Worker configuration source against stale documentation.
- Prior #63 evidence: 190 focused tests, TypeScript/build, responsive browser checks; see [design-qa.md](../design-qa.md). This review does not claim to rerun these or replace an independent exact-head audit.
- No application code, prices, secrets, migrations, external publications, email sends or deployment settings were changed by this documentation reconciliation.
