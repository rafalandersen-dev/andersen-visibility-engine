# Milo Growth — Decisions

> Current implementation and release status: [CURRENT_STATE.md](CURRENT_STATE.md), reconciled 9 September 2026. This document retains its decision/specification role; dated proposals do not establish delivery.

**Status:** Canonical decision log

**Last updated:** 2026-09-14

**Product Lead:** Rafal Andersen

## 2026-09-14 (later) — Seat pricing approved; paid chat monitoring undecided; review items started

Owner answers in the second Claude continuation session, to the three questions in `CLAUDE_CONTINUATION_PROGRESS_2026_09_13.md` Milestone 104:

1. **Seat pricing model approved (D01 input, "yes").** The proposal in `SEAT_PRICING_RESEARCH_2026_09_14.md` section 3 is accepted as the target model: seats bundled per plan (Starter 2, Growth 3, Pro 5, Agency 10 working seats, owner included), free bounded viewer seats (2 / 5 / 10 / 50), extra working seats at €15 / €15 / €12 / €10 per month with the recorded market scaling, pooled per-account AI usage, reviewers counting as working seats, and blocking new invitations at the limit with an upgrade or add-seat path rather than automatic billing. Competitor figures were verified on official pricing pages on 14 September (Peec AI from secondary sources). Still required before any customer-facing change: measured cost per active seat, seat metering and enforcement in invitations, Stripe quantity-based seat items (Stripe setup remains owner-deferred), and pricing/terms copy in every active language.
2. **Backlink monitoring from chat ("no idea").** No decision. It stays unbuilt; chat may not start paid supplier monitoring. Quota-only checks (Google inspection, PageSpeed, crawl) with per-request consent remain as built. Re-ask when Stripe and spending caps exist.
3. **Review items ("let's do this").** Route-tree regeneration, a local security review of the candidate migrations, endpoints and PR135, and the staged-catalog review begin in the Claude worktree. The local security review does not replace the repository's required Codex security review, and fluent human review of the staged catalogs remains outstanding.
4. **Who may consent to site checks in chat (owner confirmed, "viewers cant consent ok").** The local security review found that the 14 September "current project members may consent" wording let a free viewer seat commit the owner's Search Console, PageSpeed and crawl quota. Decision: only the owner, editors and reviewers (the paid working seats) may consent; viewers may not. The candidate consent migration and the chat home enforce this.
5. **Free Preview seats (owner confirmed, "free preview default ok").** Free Preview keeps the owner as the only working seat plus one free viewer seat. Paid plans keep the approved bundles.

## 2026-09-14 — Team evidence access, seat-based team pricing, trust wording and Romanian register

Owner answers in the Claude continuation session:

1. **Team access (D07, partial).** Project collaborators may use Milo's saved-evidence tools in chat: technical checks, AI answer/log evidence and backlink monitoring. The owning business account pays for this access. Knowledge, weekly preparation, saved audit and draft generation were not changed and stay owner-only until decided. Paid or quota-using chat actions remain unbuilt; when built, they charge the owning account and need explicit per-request consent.
2. **Pricing direction (D01 input).** Team pricing should scale with the number of people who have access. No price, seat limit or metering is set by this decision; entitlement, seat metering and Stripe work remain required.
3. **Trust page.** The reconciled `/trust` language statement (active interface languages derived from the registry; content in all 24 EU languages; quality review continuing during the beta) is approved, subject to normal release review.
4. **Romanian register.** Romanian sign-in and password-reset emails use the same formal register as the Romanian interface and operational emails, matching each other language's internal consistency.

## 2026-09-13 — Primary conversational workspace for solo users and agencies

Owner-confirmed requirement: Milo must provide a chat interface that makes work easier for an individual or agency. The user gives a task to Milo Growth Lead; Milo analyzes it and assigns the appropriate specialist, who can take over the conversation in the same chat. The owner explicitly confirmed this interaction after the SEO-specialist example. This is required product behavior, not merely an optional team-card display or invisible background delegation.

Keep one continuous conversation with visible speaker identity/role and a concise handoff. Preserve relevant task history and authorized project context across specialist replies; Milo coordinates multi-specialist tasks and remains accountable for completion. The existing team view, tools, knowledge, approvals and durable execution are foundations to reuse. Specialist names such as “Mark” remain examples under D05.

Derived acceptance criteria: a solo user can request an SEO task, receive a real specialist response and review its results in the same conversation; an agency can identify the active client/project and work within its access without information leaking between clients; multi-specialist work retains context and presents actionable results; missing tools/data, running work and failures are truthful; handoff cannot expand publication, messaging, purchase or budget authority. Actual tool dispatch and persisted/resumable conversations must be verified, not simulated through persona messages. Existing detailed screens remain available for inspection and editing.

This clarifies R01/R02/R04/R07/R08 and solo/team acceptance. The complete chat interface and specialist conversational handoff are not verified as implemented or released. Add them explicitly to the remaining implementation assessment; do not represent team cards as completion. Reassess the historical 60% delivery / 75% technical estimate in the next full scope review rather than assigning arbitrary credit or silently excluding this requirement.

Sequence remains: finish Hungarian and final checks here, then include this requirement prominently in the user-requested single-successor handoff and overall optimization/prioritization review. No new task or goal transfer is performed by this decision update.

## 2026-09-09 — Specialist team, project learning and weekly preparation

The owner accepted multiple specialists with faces, learning each project’s brand/business/niche and improving its blogs, optional brand-guidelines upload at setup, and preparation before the coming week after checking website/catalog changes. Recheck relevant prices, products and offers before each publication. Native content/images use direct OpenAI; no Lovable AI-credit dependency.

The [specialist/knowledge/weekly specification](AGENT_WEEKLY_PLAN_2026_09_09.md) is the implementation specification. Extend existing Brand Intelligence and keep project knowledge isolated, sourced, versioned and reversible. Preserve Manual/Review/Autopilot permissions; changed text needs the appropriate version-bound authority. Learning improves context and evaluated workflows, not an agent’s own spending/publication permissions. Weekly preparation and monthly package allowances are separate.

Owner follow-up: include a dedicated **Backlinks & Authority specialist** when implementing R14/R15. It uses project brand/niche knowledge to research relevant opportunities, monitor new/lost links, prepare outreach/placement proposals and verify results. Provider/contract readiness, explicit outreach/purchase authority and expense limits remain prerequisites. This role joins the team without making backlink work mandatory for every article or changing the immediate P0–P3 sequence.

Working role labels, final faces/names, first document formats and configurable Friday preparation example are design proposals. Exact package maintenance allowances/prices remain D01; visual identity remains D05. No perpetual-accuracy, ranking or citation guarantee. No additional provider budget, external message or publication is authorized by recording this plan. Finish durable result recovery first, then knowledge, refresh, weekly coordination, team/lessons and measured outcomes. All R00–R24/D01–D08 commitments remain.

## 2026-09-08 — Isolate the already authorized benchmark

The owner's USD5 approval covers exactly one scan, one article and one image. Implementation therefore adds optional restricted account/global budgets and one-attempt permits bound to identity, job, model, operation, amount, month and expiry. Ordinary background requests cannot use a restricted budget. This does not provision money, change the approved ceiling, authorize repeat attempts or configure package prices. Secure key setup, a controlled runner and independent expense reconciliation remain required; see [permit evidence](../evidence/restricted-ai-expense-permits-2026-09-08.md).

PR #97 content-language support is merged; its dashboard fallback review finding was corrected. This delivers 24 content choices and authoring contracts, while full interface/email/legal translation and real multilingual quality remain open. The latest owner reconnect confirmation still produced UNAUTHORIZED from OpenAI Platform; the temporary Synergy-account exception remains accepted, not re-questioned.

## 2026-09-08 — Owner benchmark allowance and publication access

Rafal explicitly approved **USD 5 total** for one real scan, one article and one image. This supersedes the earlier unapproved proposal. No automatic retry, additional paid run, top-up, subscription, email or client publication is included. Execution still requires bounded provider calls and cost evidence; zero benchmark calls have run at this record. Stripe setup is owner-deferred until after coffee, not rejected or complete. See [benchmark preflight](../evidence/owner-ai-benchmark-2026-09-08.md).

The owner's WordPress/Lovable hint led to the exact Butelki destination in the existing **Si Longevity** workspace. Current collaborator access permits the required database reads; no new Supabase account/access is needed for this inspection. WordPress handles ecommerce; Milo articles use the separate Lovable/Supabase content path. One existing unattended publication on 2026-09-08 was verified across the Milo queue, destination snapshot and public page. The July draft remains blocked by content readiness and human-review requirements. See [destination evidence](../evidence/publication-topology-2026-09-08.md).

## 2026-07-27 — Public-audit guardrails

**Status:** Approved

**Decision authority / Outcome Owner:** Rafal Andersen

**Evidence:** issue #35

### Decision

The public AI Visibility Audit safety envelope uses:

- 5 audit claims per salted IP identity per rolling hour;
- 50 outbound fetch claims per UTC day globally;
- 50 paid-AI claims per UTC day globally;
- 24-hour result cache;
- bot proof before fetch or AI;
- guarded outbound fetch and deterministic fallback.

### Reason

The unauthenticated audit must not become an uncontrolled AI-cost or server-side-fetch surface.

### Consequences

The limits are product guardrails. Changing them requires a new Product Lead decision. Implementation does not authorise production release.

## 2026-07-28 — Merge PR #36

**Status:** Approved and completed

**Decision authority / Outcome Owner:** Rafal Andersen

**Evidence:** PR #36, merge commit `0d163dd32cd807463fc40e6c41fafd1176b94e5f`, issue #35

### Decision

Merge the verified implementation by squash to `main`.

### Reason

Targeted tests, TypeScript, isolated migration execution, Vercel build, automatic review and dedicated security review supported merge. The independent verifier recorded its dependency limitation explicitly.

### Consequences

Implementation is canonical on `main`. Production migrations, secrets, edge configuration and publishing remain separately gated.

## 2026-07-28 — Production release remains NO-GO

**Status:** Approved operating position

**Decision authority / Outcome Owner:** Rafal Andersen

**Evidence:** issue #37 Gate 0

### Decision

Do not publish the merged public-audit implementation, apply its two production migrations or configure its secrets until the runtime and trust-boundary contract is proven.

### Reason

Lovable Cloud is the hosting platform and Cloudflare terminates public traffic, but current evidence does not prove:

- server-owned stripping and injection of `X-Milo-Edge-Auth`;
- direct-origin blocking;
- the exact Workers egress property assumed by the implementation;
- a separate non-production data plane;
- all required environment scopes.

### Alternatives

1. Prove the necessary Lovable controls.
2. Move the public-audit boundary to a user-controlled Cloudflare Worker or verified egress proxy.
3. Keep the public audit deterministic/no-AI without user-controlled server fetch.

### Review trigger

Review when hard platform evidence exists or a revised architecture is ready for approval.

## 2026-07-28 — Public audit moves to a dedicated Cloudflare Worker

**Status:** Accepted

**Decision authority / Outcome Owner:** Rafal Andersen

**Evidence:** issue #37 Gate 0, ADR-0001, issue #39

### Decision

Keep the Milo web application on Lovable Cloud, but move the complete public-audit execution boundary to a user-controlled Cloudflare Worker on the `milogrowth.com/api/public-audit*` route.

The Worker owns Turnstile, trusted client IP derivation, request/fetch/AI limits, Supabase RPC/cache access, outbound fetch and AI generation. It does not proxy the audit operation to Lovable. Public-audit secrets remain Worker-only, and the old Lovable server function stays fail-closed or is removed from the public flow.

### Reason

Official platform evidence does not prove the edge header ownership, direct-origin blocking or exact runtime guarantee required by the merged Lovable-hosted design. A Worker-owned endpoint removes the shared-header bridge and gives Milo a separately deployable, observable and reversible trust boundary.

### Consequences

Gate 0 architecture selection is complete. Production remains NO-GO until the Worker is implemented, verified against an isolated staging data plane, independently reviewed and approved for an exact production release. DNS, secrets, migrations and deployment require later explicit approvals.

## 2026-07-28 — Worker AI provider is direct paid Gemini

**Status:** Accepted and merged

**Decision authority / Outcome Owner:** Rafal Andersen

**Evidence:** issue #43 discovery checkpoint, issue #44, PR #45, merge commit `696cb73b8ae68af86bcf6f75c8c73b9a1fc7855a`

### Decision

Replace the Worker's assumed Lovable AI-gateway credential with the direct
native Gemini API behind a Worker-only `GEMINI_API_KEY`, keeping the
deterministic fallback, the approved limits and the 50/day atomic paid-AI
ceiling unchanged.

### Reason

Lovable documents `LOVABLE_API_KEY` as platform-managed and does not document
exporting it to an external Cloudflare Worker. Depending on it from the
dedicated Worker was an unsupported security assumption. Google's paid Gemini
API is directly supported, and paid-service prompts/responses are not used to
improve Google's products under the cited terms.

### Consequences

The provider boundary is code-complete on `main` with regression tests that
prevent Lovable gateway credentials or endpoints from returning to the Worker.
No Gemini key or billing configuration was created or enabled by this outcome;
account-level state remains unverified pending issue #43 discovery. Credential
creation and paid-service activation require a separate approval under
issue #43.

## 2026-07-28 — Cloudflare-hosted minimal staging harness, code-only

**Status:** Accepted and merged; environment mutation remains NO-GO

**Decision authority / Outcome Owner:** Rafal Andersen

**Evidence:** issue #43 staging recommendation, PR #46, merge commit `80375249dfcf9e371d82ebf7c28f2983fc4ab047`

### Decision

Use a Cloudflare-hosted minimal staging harness served by the public-audit
Worker itself for the first isolated security verification, instead of a paid
Vercel custom environment. Merge only the fail-closed, disabled-by-default
code: a separately named `milo-public-audit-staging` Wrangler environment with
empty committed configuration, `workers_dev=false`, `preview_urls=false` and
enablement hard-limited to `staging.milogrowth.com`.

### Reason

The harness model keeps the first staging pass near USD 0 platform cost while
preserving the exact reviewed `POST /api/public-audit` code path. Fail-closed
configuration guarantees the production hostname cannot serve the harness even
through operator error.

### Consequences

Code-only staging work is complete at `8037524`. The active gate is
account-level read-only discovery of Cloudflare, Supabase and Google Cloud
state under issue #43, followed by one bounded, separately approved staging
mutation package. No route, custom domain, secret, widget, key, project,
migration or deployment exists as a result of the merge.

## 2026-08-20 — Milo category, differentiation and 12-month roadmap focus

**Status:** Accepted strategic direction

**Decision authority / Outcome Owner:** Rafal Andersen

**Evidence:** `product/STRATEGY_2026_2027.md`; August 2026 competitive/market research

### Decision

Position Milo as an **AI Growth Operator for small businesses**, not as another
all-purpose SEO suite.

The canonical product loop is:

> **SEE → DECIDE → DO → PROVE**

The core product promise is:

> **See where your business is losing visibility in Google and AI. Fix what matters. Prove what changed.**

Live AI Visibility is promoted to **P0 market table stakes**. Milo's durable
differentiation must come from turning evidence into a prioritised action,
preparing or safely executing the work, and showing observed results later.

### Reason

The market is converging rapidly:

- SeoVision already combines audit, live AI visibility, content, publishing,
  backlinks, rank tracking and MCP under an autopilot positioning;
- Writesonic is moving toward track → prioritise → act → measure;
- Semrush is combining classic SEO and AI visibility;
- Ahrefs is expanding Brand Radar API/MCP access and moving toward more agentic
  marketing workflows, reducing the strategic value of “we have an AI agent”
  or “we track AI visibility” as standalone differentiators;
- specialist trackers such as Peec, Otterly, Profound and Surfer make pure AI
  visibility analytics increasingly commoditised.

Milo cannot rationally win by recreating the largest keyword index, backlink
index, crawler or generic SEO feature catalogue. It can win a narrower category
by making growth decisions and execution dramatically simpler for SMBs.

### Consequences

1. The roadmap is organised around completing the smallest end-to-end
   `SEE → DECIDE → DO → PROVE` loop, not feature parity.
2. Pre-launch P0 includes secure public audit, server-authoritative commercial
   controls, hard AI-cost limits, Live AI Visibility v1, direct GSC sync,
   action-first Dashboard, safe Claude/MCP execution and Proof Loop v0.
3. The North Star becomes **Monthly Verified Growth Actions per Active Project
   (MVGA)** rather than content volume, prompt count or a single opaque score.
4. Competitor changes enter planning only when they validate a customer problem,
   strengthen the core loop or are supported by broader customer/market evidence.
5. Milo will not intentionally build a proprietary backlink exchange, a global
   keyword/backlink index, uncontrolled autopublishing or high-volume content
   production as core differentiation.
6. Agency complexity is gated behind SMB product-market fit or explicit demand
   evidence.
7. Public launch remains a gate, not a date promise. Security, methodology,
   data quality, retention evidence and unit economics may delay launch.

### Review trigger

Review this strategy after the first meaningful paid cohorts, or earlier if
customer evidence demonstrates that the selected ICP, live-AI methodology or
core action/proof loop is materially wrong.


## 2026-09-06/07 — Premium rebuild and complete launch scope

**Status:** User-selected direction; selected implementation merged, remaining work planned

**Decision authority / Outcome Owner:** Rafal Andersen

**Evidence:** September user decisions, PR #63, preservation map and `PLAN_REVIEW_2026_09_07.md`

### Decisions

1. Preserve and improve every existing capability. The chosen visual combination is Today cockpit + list/right inspector + light calendar, with premium restrained styling inspired by current Apple product craft. Wombat Ops remains work in progress.
2. PR #63 is merged at `34cacf695baee8696582d94559c74880133647ed`; selected UI/workflow fixes are code-complete, not completion of the entire product or proof of the custom-domain release.
3. Serve individuals and companies. Autonomy is independently configurable: Manual, Review, Autopilot and mixed by project/action. Do not assign modes solely by segment.
4. Add real observed AI answers/citations and evidence-to-action execution. Keep crawler activity, human referrals, conversions and readiness advice separate. Complete backlinks intelligence/provider/outreach work and project setup/edit.
5. Preserve existing Claude and ChatGPT MCP; extend compatibility to other major AI clients with exact-client evidence. Optional Slack belongs in the plan over the shared agent/job/permission model.
6. Stripe replaces Paddle. All EU languages, successful setup demo and recordings of real product flows remain launch requirements. Existing features are not rebuilt from outdated “missing” labels.

### Agent identity and sequencing proposals

The agent is a product direction; “Milo” with a stylized, visibly AI face is the current recommendation. Final face/name treatment and increased user trust are not validated facts. Slack's precise public-launch timing, initial measurement surfaces and truly text-only publication policy remain explicit decisions to resolve from prepared evidence.

## 2026-09-07 — Operational communication and sustainable packages

**Status:** Direction accepted by user; specification written; implementation/prices pending

**Evidence:** User accepted the notification/economics proposal; `NOTIFICATIONS_AND_PACKAGING.md`

- Email and in-app communication cover missing approvals, blocked/failed publication, manual overdue work, empty upcoming schedule, quota shortage and stopped autopilot. Slack is optional. Group, deduplicate and recheck notifications; avoid sending resolved alerts.
- Cadence is user-selected and timezone-aware. Subscription capacity is not a publishing obligation; eight articles is not always two per week.
- Sell understandable articles, revisions, images, monitoring and agent work, while measuring provider cost internally. No unbounded AI or hidden automatic overages.
- Measure costs alongside product delivery, before setting prices. Protect account/global budgets and fix metering infrastructure failures that currently allow paid calls.
- Specification recommendation: charge the article allowance on a usable generated draft, not only on publication; technical failures do not consume the customer's result unit; imported external MCP text consumes no Milo text-generation allowance. Exact allowances, prices and exceptions remain to be finalized.
- Distinguish “without AI-generated images” from truly image-free publication before changing the Studio featured-image guard.

## 2026-09-07 — Canonical plan reconciliation and evidence discipline

**Status:** Documentation update requested by Product Lead; no new feature/environment release

**Evidence:** User requested a review of all decisions/plans and an updated overall action plan.

`ROADMAP.md` is the current execution order, `STRATEGY_2026_2027.md` supplies strategic rationale, and `CURRENT_STATE.md` separates merged source, historical verification and runtime unknowns. The R00–R24 register preserves omissions and dependencies. Old July P0–P3 IDs remain technical cross-references, not today's prioritization.

The next technical outcome is the exact-head/environment-evidence packet, followed by bounded cost/reliability work. Read-only issue #43 discovery is already authorized; do not repeatedly request that approval. This documentation does not close #43, merge unrelated PRs, set prices, send messages or authorize a new Worker environment release.


## 2026-09-08 — Remove Lovable AI generation

**Authority:** Rafal Andersen, explicit instruction in the current Milo task.

- Native article/text and image generation must use direct providers, preferably OpenAI. Lovable AI credits are not an accepted generation dependency or fallback. Existing Lovable hosting, database, authentication and email are separate costs and services.
- Implement direct OpenAI text and images; evaluate quality and actual cost before claiming savings or setting customer prices. Initial engineering choice: GPT-5.6 Terra, low reasoning effort, standard tier; GPT Image2 dated snapshot, one1536x1024 medium-quality WebP. These are bounded initial settings, not owner-approved package prices.
- USD5 total remains authorized for one scan, one article, one image. It has not been spent. The broad Lovable-workspace two-credit cap proposal is withdrawn; no shared limit or automatic top-up change.
- A new OpenAI key is authorized. Finish secure account/project selection and local destination confirmation. The later explicit owner exception permits the existing OpenAI account email; company-email migration is not a setup prerequisite. Personal / Default project labels alone are not evidence of the mailbox. No key values belong in documents or chat.
- Direct Gemini in the separate public-audit Worker already bypasses Lovable. Its release constraints remain separate. Existing externally authored MCP text still does not invoke Milo's native text generator.

## 2026-09-08 — Existing OpenAI account exception and conservative budget admission

The owner explicitly instructed proceeding with the current OpenAI account email. Record this exception rather than creating a duplicate account or delaying setup for email migration. The API connection has been reauthenticated; secure picker/local destination confirmation remains incomplete.

Native generation now has a prepared account/global reserve gate. Retain full reservations while actual cost is unverified; do not call token estimates invoices or provider attempts customer result allowances. USD5 is still limited to the isolated one-scan/article/image benchmark. It does not permit unrestricted background use of a newly funded monthly owner budget. See evidence/native-provider-expense-2026-09-08.md.

## 2026-09-08 — Synergy account exception and EU article languages

The owner reports changing the current OpenAI account to a Synergy email and accepts it temporarily for Milo. This updates the existing-account exception; exact address unverified. It does not change Milo's owner email or every vendor account. A new connector authentication error must be resolved through the already-requested secure reconnect, without requesting secrets in chat.

R20 content-language support is implemented from one 24-language EU registry, separate from the four current application UI dictionaries and billing/market settings. Explicit language edits synchronize the two historical content-language fields. New Greek/Bulgarian/Maltese titles receive basic readable Latin slugs; stored URLs are retained. This is partial R20 delivery, not full UI/email/legal localization or proof of multilingual generation quality.
