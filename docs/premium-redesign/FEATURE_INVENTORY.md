# Milo Growth — preservation map, 6 September 2026

September 7 execution plan: [product/ROADMAP.md](../../product/ROADMAP.md). Full scope and open decisions: [PLAN_REVIEW_2026_09_07.md](../../product/PLAN_REVIEW_2026_09_07.md). PR #63 is merged; this preservation map remains the regression contract, not blanket live verification.

Baseline: `main` at `0d4057d1e35a1727c04b133958b537c80df849c8`. The July redesign branch is NOT the base: it predates important product and security work. This inventory records source capabilities and the production screens observed in the accompanying audit, not a claim that every provider has been revalidated live.

User-selected design: Today cockpit + list with inspector + light calendar; common ink sidebar, Inter typography, blue actions, readable status labels. Wombat Ops is still in progress, not a finished implementation to copy. No workspace schema migration or wholesale data rewrite is part of this change.

## Route and capability coverage

All paths below are under `/app`. Existing routes remain available; aliases continue to redirect.

| Routes | Navigation | Capabilities that must remain | Current verification / remaining work |
|---|---|---|---|
| `/` | Today | Upcoming publications, publish-risk alerts, next actions, discovered suggestions, pending MCP proposals, setup checklist, activity, content/analytics links | Cockpit rebuilt; shared pipeline counts replace legacy approved=complete |
| `/plan`, `/calendar`, `/opportunities` | Plan | List, board, day/week/month calendar, search, discover/accept/dismiss/undo, manual opportunity, statuses, bulk selection, archive/restore, soft delete, orphans, stacked assets, targets versus real publishing queue | Default list; readable board tracks; scrollable calendar; existing queue confirmation reused |
| `/editor` | Content | Linked drafts, Article Studio, hook, body, visuals, sources, author, internal links, assembled preview/export, quality evaluation and stale score, delete confirmation | Broken two-column grid fixed; remaining studio design is a subsequent module |
| `/ai-evaluation` | Content | Provider evaluation runs and quality history | Route and permission checks retained |
| `/audit` | Plan | Site/on-page audit, recommendations and conversion to work | Retained, needs full premium module pass |
| `/competitors` | Plan | Competitor analysis, recommendations to Plan | Retained, needs full premium module pass |
| `/authority` | Plan | Authority analysis, sources, suggestions, tracking | Retained, needs full premium module pass |
| `/ai-visibility` | Plan | AI readiness analysis/recommendations | Estimates are NOT observed AI citations; real monitoring remains a separate workstream |
| `/actions` | Plan | Review/approve/reject scoped connector proposals, pending badge | Retained; no auto-approval added |
| `/backlinks` | Links | DataForSEO summary, referring domains, competitor gaps, AI white-hat recommendations, deduplicated creation in Plan | Existing implementation; live provider revalidation pending |
| `/link-marketplace` | Links | Filtered inventory, signed expiring quotes, price/target review, idempotent order records, in-review status, sponsored-link disclosures | Demo adapter exists; production mapping is blocked pending private Linkhouse API contract. Ordering remains fail-closed |
| `/outreach` | Links | Draft + follow-ups, exact recipient/body review, unsubscribe/suppression, rate limits and deduplication | Controlled Resend send path exists; sender-domain/provider revalidation pending. No messages sent in this redesign |
| `/analytics` | Visibility | Visits, tracked actions, referral sources, AI referrals, page reporting, trends | Synthetic conversion/page sparklines removed; other data semantics need broader review |
| `/report` | Visibility | Monthly proof report, printable output, agency branding | Retained |
| `/setup` | Settings | Create/edit project, all identity/market/language/voice/goal fields, Brand Intelligence, autoscheduler, CMS connectors, credentials, publishing mode, AI apps | New/edit route transition and omitted language/USP fields fixed; section-owned patch contract retained |
| `/services` | Settings | Service/product catalog used by generation | Retained |
| `/connect` | Settings | Connected-app management AND OAuth request consent with scoped read/write/propose access, expiry, denial, revocation | Direct navigation now opens app management; real `req` consent preserved |
| `/billing` | Settings | Server entitlements, subscription state, project limits and owner exemption | Current Paddle code retained for compatibility. User requires Stripe migration; not falsely presented as implemented |
| `/launch-checklist`, `/beta-validation`, `/beta-notes` | Settings / existing direct links | Launch checks, owner-only validation, beta notes | Retained; owner gate unchanged |
| `/onboarding` | First-run flow | Business/site/markets/goals/services/publishing setup, incomplete-project guard | Retained; DEV screenshot fixture cannot bypass production guard |

Public marketing, pricing, authentication, password reset, legal/trust, region pages, public free audit and API routes remain in place.

## Cross-cutting contracts — regression gates

- Workspace persistence, active project and user isolation, revision conflict handling, retries and hydration-failure state. Browser QA exposed a stale selector closure in `useStore`: a project change/hydration could leave Plan empty. Snapshot caching now tracks state AND selector identity, retaining shallow-equal result identity; regression tests cover the exact transition.
- Source-of-truth pipeline precedence: armed before newer drafts; a target date is not a queue entry; overdue pending work requires fixing; deleted/archived opportunities do not silently cancel armed assets.
- Publishing is still server-authorized and gated: draft/live mode, approval, content readiness, source/image/author checks, WordPress/Shopify/custom capabilities, cancellation and idempotent update-in-place. No publication runs in preview.
- Article Studio preserves canonical assembled output, asset versioning, stale quality score, internal-link safety and rewrite-to-existing-URL guard.
- MCP: OAuth scopes, user/project binding, idempotent draft create/update from the latest main, pending-action approval, token revocation. No widened permissions.
- Credentials remain encrypted/server-side; server entitlements, public-audit isolation and security headers remain unchanged.
- Existing four UI locales (PL/EN/SV/DA) receive new cockpit/plan copy. All EU language support remains explicit backlog; do not describe four as all EU languages.

## Work still required for the complete product ambition

| Workstream | Concrete completion condition |
|---|---|
| Backlinks production | Verify DataForSEO against an authorized test workspace; obtain/map Linkhouse private contract; provider sandbox + quote/order/error/refund acceptance; validate Resend sender and suppression behavior with approved recipients |
| Observed AI citations / agent analytics | Distinguish crawler requests, AI referral sessions, observed answer citations and conversion attribution; retain prompt/model/locale/time/evidence; reliable bot identity/log ingestion; coverage and sampling disclosed |
| SEO/local/international | Compare existing coverage against technical crawl/indexability, GSC, local profiles/citations, location pages, language/market targeting and reporting; build gaps from evidence |
| Stripe | Migration design, products/prices/tax/subscriptions/webhooks/entitlements, idempotency and existing subscriber migration plan; sandbox acceptance before live transition |
| All EU languages | Expand domain enums, prompts, validation, UI dictionaries, date/number formats and locale regression checks together |
| Remaining UI modules | Apply shared premium patterns to studio, setup sections, backlinks, analytics, audits, reporting, billing and onboarding; verify each existing action against this map |
| Manual/autopilot and MCP | Make next action and actual execution state explicit; keep permission/review gates; assess latest authoring work before adding new capabilities |
| Demo/video/onboarding | Record the verified completed flows, distinguish sample versus measured results; do not market unfinished provider integrations as live |

## Release rule

This branch is a reviewable implementation of the selected workspace set and confirmed defects, not completion of the entire competitive roadmap. No claim of market leadership is justified until measurement quality, coverage, reliability and customer task completion are validated. Merge and deployment remain separate actions.
