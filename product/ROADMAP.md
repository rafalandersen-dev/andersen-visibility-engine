# Milo Growth — Roadmap

**Status:** Canonical execution plan; delivery and release remain evidence-gated

**Last updated:** 2026-09-09

**Product Lead / Outcome Owner:** Rafal Andersen

Milo is an AI Growth Operator for individuals and businesses: **SEE → DECIDE → DO → PROVE**. Local and international SEO, AI answers and citations, content, authority and measurement belong to the same product. Premium design and reliable execution are requirements throughout.

This plan consolidates the August strategy and September 5–7 launch, redesign, competitor, agent, integration, notification and packaging decisions. It preserves existing capabilities and distinguishes implemented code from verified live behavior. It is not a promise of market leadership or a new production release approval.

## Start here

- [CURRENT_STATE.md](./CURRENT_STATE.md): repository baseline, implementation and open verification.
- [PLAN_REVIEW_2026_09_07.md](./PLAN_REVIEW_2026_09_07.md): full scope register, omissions and conflicts.
- [DECISIONS.md](./DECISIONS.md): accepted decisions versus implementation proposals.
- [STRATEGY_2026_2027.md](./STRATEGY_2026_2027.md): rationale, North Star and post-launch learning.
- [LAUNCH_READINESS.md](./LAUNCH_READINESS.md) and [OPERATIONS.md](./OPERATIONS.md): evidence and operating gates.
- [NOTIFICATIONS_AND_PACKAGING.md](./NOTIFICATIONS_AND_PACKAGING.md): detailed notification and economics specification.
- [Feature preservation map](../docs/premium-redesign/FEATURE_INVENTORY.md): routes, actions and regression contracts.

## Current checkpoint — 9 September

PRs through #98 are merged; live build/fingerprint rechecked. Spending admission, restricted permits and 24 content languages are delivered. The controlled benchmark, full localization and launch acceptance remain open. See [current state](CURRENT_STATE.md) and [weighted progress review](PROGRESS_REVIEW_2026_09_09.md). The checklist below specifies full outcomes; partly delivered compound items remain unchecked.

## Already delivered in code

- [x] PR #63 merged: premium shell, Today cockpit, searchable Plan list with inspector, light calendar, responsive navigation and workflow fixes.
- [x] Project create/edit transitions and omitted language/USP saves fixed in that scope.
- [x] Existing Article Studio, publishing, discovery, backlinks intelligence, reporting, server entitlements and MCP draft/proposal workflows retained.
- [x] September planning decisions consolidated and old contradictions identified.

These checks do not mark the whole redesign, every integration, independent release verification or public launch complete. Claude and ChatGPT MCP are existing connections; extend and revalidate them instead of treating them as missing features.

## Delivery order

Each wave produces bounded outcomes. Independent discovery/design can run alongside another workstream; paid execution depends on cost and authorization controls. Do not turn this plan into one broad feature sprint.

| Order | Outcome | Scope IDs | Exit condition |
| --- | --- | --- | --- |
| 0 — next | Establish current evidence and close planning drift | R00, R24 | Exact implementation assessed; code, deployment, environment and review evidence separated; next packet recoverable |
| 1 | Reliable execution and bounded costs | R04–R06, R09, R21 | Cost controls, background workflow and notifications verified; package scenarios costed; Stripe lifecycle sandbox passes before paid rollout |
| 2 | Complete the premium project/content journey | R01–R03, R18 | Setup → edit → plan → article/images → preview → manual or authorized automatic publication works responsively |
| 3 | Evidence that drives work | R07, R10–R13, R16 | Trustworthy AI observations + direct GSC + one evidence/action/publication/measurement loop; agent executes within scope |
| 4 | Authority, integrations and market coverage | R08, R14–R15, R17–R20 | Backlinks provider work, client compatibility, optional Slack and language/local/global coverage meet registered criteria |
| 5 | Prove launch readiness and release | R21–R24 | Solo/team beta journeys pass, costs/reliability measured, real demos complete, release gate recorded |

Waves overlap where dependencies allow. Cost research, UI design and AI-method discovery can proceed together; external AI jobs cannot bypass budget controls while those controls are being built. Public-audit environment changes retain the separate issue #43 release boundary.

### 0. Baseline before the next feature sprint

- [ ] Complete the exact-head audit of implementation at `34cacf695baee8696582d94559c74880133647ed` or its verified successor. Focused PR #63 checks and July-wide verification have different scope; neither is a fresh full audit of current main.
- [ ] Reconcile actual migrations, runtime build identity and configuration presence with code. Record names/status only. Vercel success does not verify the custom domain.
- [ ] Finish remaining read-only discovery under issue #43; it is already authorized. Prepare the concrete environment package before any required release decision. Do not ask again for read-only permission.
- [ ] Review open PR #58 (authoring expansion), PR #2 (bootstrap blueprint) and PR #62 (design engineering). Carry requirements forward without claiming they are merged or automatically merging them.
- [ ] Select the first bounded cost/reliability implementation packet with acceptance evidence, owner, cost ceiling and rollback.

### 1. Costs, autonomy, notifications and subscriptions

- [ ] Measure research/writing/revisions, images/retries, AI observations, agent tools, crawl/backlink APIs, storage and delivery costs. Model typical, high-use and maximum supported usage; set prices from evidence.
- [ ] Preserve server entitlements; fix metering RPC/no-row fail-open behavior. Reserve/reconcile budgets atomically, bound retries/time/tool calls, enforce account/global ceilings. Keep reading, manual editing and operational alerts available when paid AI pauses.
- [ ] Implement explicit Manual / Review / Autopilot modes, with mixed settings by action/project. Solo/team are a separate axis. Keep version-specific approvals, pause, cancellation, retries and uncertain publication results understandable.
- [ ] Verify background work with the user logged out: duplicate/concurrent jobs, expired CMS credentials, missed slots and late approvals. Check destination state before retrying uncertain publication.
- [ ] Add email + in-app alerts for missing approval, blocked/failed publication, overdue manual action, empty/partly covered next week, quota shortage and paused autopilot. Add grouped weekly digest, timezone/cadence and responsible recipient. Deduplicate and recheck before sending.
- [ ] Build Stripe checkout, portal, webhook replay/order handling and entitlement lifecycle: renewal, upgrade/downgrade, failed payment, cancellation and refunds. Inspect existing subscribers before selecting migration. Sandbox first, live configuration later.
- [ ] Package articles, revisions, images, monitoring scope and agent work in user-facing units. Manual/review/auto are understandable controls, not a multiplication of every plan variant. No unapproved automatic overages or unlimited costly agent work.
- [ ] Align billing periods, quota resets, add-ons and refund rules. A usable generated draft consumes article allowance; a technical failure does not consume the customer's result allowance. Imported MCP text does not consume Milo generation allowance. Already prepared content remains publishable when only generation allowance is exhausted and publishing entitlement is active.

### 2. Premium experience and content quality

- [ ] Finish setup/edit/onboarding: identity, services/products, markets, content language, voice, goals, competitors, Brand Intelligence, cadence, autonomy, integrations and incomplete-setup recovery. Preserve unrelated settings and content during edits.
- [ ] Apply the chosen Today/list+inspector/calendar design across Studio, setup, audits, competitors, authority, backlinks, analytics, reports, connected apps, billing and onboarding. Keep board/archive/bulk/discovery and every mapped action.
- [ ] Verify mobile/tablet/desktop, long translations, overflow, empty/loading/error states, keyboard/focus and reduced motion. Wombat Ops remains a direction in progress, not a completed reference.
- [ ] Finish Studio image/hook/author/source/internal-link/quality flows and canonical preview/export/CMS parity; preserve legacy compatibility, stable image anchors and stale-approval/score handling.
- [ ] Resolve image packaging: “no generated images” can use uploads; truly text-only publication conflicts with the current featured-image requirement and needs an explicit policy before changing that guard.
- [ ] Verify WordPress, Shopify and custom connector media, idempotent updates, scheduling and destination output. Distinguish generated/included/retained/destination-verified; do not assume CMS parity.

### 3. AI Growth Operator with observable results

- [ ] Ship observed AI Visibility v1 on at least three trustworthy initial surfaces. This is a delivery floor, not the final platform-coverage ambition.
- [ ] Store prompt, service/surface/mode, available model version, collection method, market/language, time, raw answer, citations, mentions, competitors and failures. API output is not a measurement of the consumer web app.
- [ ] Cover editable/discovered prompts, intent, cited domains/exact pages, own/competitor/third-party sources, content types, share of voice, trends and evidenced sentiment. Distinguish missing observation from measured zero; show sample counts and comparable denominators.
- [ ] Keep mentions, citations, crawler access, human AI referrals and conversions separate. Profound-style crawler analytics requires server/edge logs and bot verification; a JavaScript referral beacon is insufficient. Log ingestion/attribution are explicit work, not an inferred benefit of an agent.
- [ ] Verify direct GSC OAuth/API and actionable query/page movement; CSV stays fallback. Preserve audits, schema/content consistency, indexability, internal-link safety and analytics; fill verified technical gaps.
- [ ] Complete `evidence → action → draft/change → publication evidence → later measurement`. Report observed changes and limitations, not unsupported causality. Extend existing monthly proof reports and action history.
- [ ] Make the Milo agent use existing tools: inspect evidence, propose a plan, execute permitted steps, verify results and explain blockers. Jobs need resumable status and visible cost/permission bounds across app, Slack and MCP.
- [ ] Explore the proposed “Milo” identity and stylized AI face. Final avatar and any trust improvement require validation; do not imply a fictional human operator or mistake an avatar for capability.

### 4. Authority, distribution and international coverage

- [ ] Finish backlinks intelligence (DataForSEO revalidation, gaps, new/lost monitoring), Linkhouse adapter (private contract; quote/order/status/error/refund acceptance) and controlled outreach (sender, recipient review, suppression, idempotency). Separate supplier expense from subscription margin. No guaranteed placements or own exchange network.
- [ ] Preserve Claude/ChatGPT MCP; finish secure external image ingest, profile/bootstrap proposals, opportunity batches/readiness and pipeline ergonomics. Track open proposals versus implemented tools.
- [ ] Maintain a client matrix: Claude, ChatGPT, Perplexity, Gemini, Copilot, Grok, Mistral/Le Chat; DeepSeek is a candidate. Verify exact app/CLI, transport/auth, plan requirements, supported actions and reconnect/revoke behavior. Provider API access does not prove consumer custom-MCP support. Keep unsupported routes visibly blocked with alternatives; do not silently delete coverage goals.
- [ ] Add optional Slack alerts, summaries, @Milo/DM and authenticated review/action controls over the same permissions. Reuse execution jobs. Slack is planned; public-launch timing remains an open sequencing decision.
- [ ] Separate native integrations, MCP and automation-platform connectors. “3,000 apps” is not a promise of 3,000 tested Milo workflows. Prioritize CMS, measurement and customer work; select connector infrastructure from actual requirements/costs.
- [ ] Expand from four UI locales to all 24 official EU languages: Bulgarian, Croatian, Czech, Danish, Dutch, English, Estonian, Finnish, French, German, Greek, Hungarian, Irish, Italian, Latvian, Lithuanian, Maltese, Polish, Portuguese, Romanian, Slovak, Slovenian, Spanish and Swedish. Update enums, prompts, validation, UI/email/onboarding copy and formatting together. App language, article language and target market are separate.
- [ ] Audit local/global SEO coverage: NAP/entity/location consistency, service/location pages, local citations/reviews/GBP path, indexability, canonical/hreflang/sitemaps and international measurement. Deeper GBP automation, playbooks, ecommerce feeds and broad agency portfolios remain sequenced extensions. Basic team permissions and existing agency reports do not wait for that expansion.

### 5. Launch proof

- [ ] Run solo autopilot and team approval/mixed journeys, including overnight/logout operation, notifications, quota and failed/recovered integrations.
- [ ] Verify tenant isolation, recovery/export/deletion, revocation, support/incident handling and cost alerts. Preserve existing publishing/MCP protections.
- [ ] Update pricing, terms/refunds and operator/payment wording for the actual Stripe arrangement; review tax/invoicing responsibilities and customer policies before paid launch. Existing pages have real identity data but still mention Paddle.
- [ ] Produce a setup demo and record the actual product using suitable owner projects. Mask private data; label sample versus observed results. Do not demonstrate unfinished providers as live.
- [ ] Recheck launch scope against competitor and beta evidence. Record gates as verified / failed / blocked / deliberately deferred with owner decision. Do not substitute arbitrary completion percentages.

## First 12 months after launch

| Period | Outcome to deepen; not a reason to omit the launch foundation |
| --- | --- |
| M1 | Observation reliability, citation/source gaps and digest usefulness |
| M2 | Proof Loop v1 with 7/28/90-day evidence and connector recovery |
| M3 | Better prompt discovery and relevant CMS depth |
| M4 | Activation, lifecycle refinement and retention |
| M5 | Local playbooks and deeper GBP/entity/review capabilities |
| M6 | Authority quality and supplier/outreach improvements |
| M7 | Additional agency portfolios if demand/PMF gate passes |
| M8 | Recommendation learning and further cost optimization |
| M9 | Customer-consented case studies and experiments |
| M10 | Partner distribution and validated integrations |
| M11 | Language/market quality and broader trustworthy AI coverage |
| M12 | Pricing/retention/competition review and year-two decisions |

All EU languages, initial observed AI, essential notifications and cost controls belong to current launch scope; they are not deferred to M11/M1/M4/M8. Basic team use is included; agency portfolio expansion remains conditional.

## Planning rules

- Outcome Owner: Rafal Andersen. Assign executor/verifier per packet; do not assume another chat is doing it.
- Each packet carries scope IDs, evidence, dependencies, cost ceiling, release/rollback and writeback. Previously authorized read-only work needs no repeated permission.
- Preserve feature/data/permission contracts. Unmerged branches and marketing screenshots are not shipped evidence.
- Exact prices, provider contracts, avatar, text-only policy and Slack launch timing remain open decisions in the review register.
- North Star: **Monthly Verified Growth Actions per Active Project (MVGA)**; also track activation, publication reliability, proof coverage, retention and contribution margin.
- No ranking/citation guarantees, fabricated metrics, uncontrolled publication/spend, proprietary global index or backlink exchange. Leadership must be earned through benchmarked task completion, quality, reliability and customer outcomes.
