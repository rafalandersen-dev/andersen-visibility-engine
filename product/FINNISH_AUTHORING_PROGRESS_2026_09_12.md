# Finnish interface authoring — 12 September 2026

Finnish is staged only: 3,227 of the current 3,768 English interface keys, across twenty-six complete batches. It is not registered in UI_CATALOGS or the language picker. Active UI remains EN/PL/SV/DA; the fully authored FR/DE/ES/IT/PT/NL catalogs retain their separate acceptance status.

| Batch | Keys | English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | 4fbdd66 |
| Shared controls and navigation accessibility labels | 30 | 4fbdd66 |
| Core shell, onboarding, setup, market/language and pipeline | 202 | 1647171 |
| Setup screen | 24 | 5ddcfdb |
| Services screen | 18 | 5ddcfdb |
| Audit screen | 29 | 5ddcfdb |
| Analytics screen | 36 | 7e386ca |
| Billing screen | 54 | 7e386ca |
| Evidence screen | 89 | 0797a5a |
| Plan screen | 113 | 176dab6 |
| Editor screen | 148 | 6ee37f2 |
| Public pricing | 40 | e1e8bf7 |
| Public case studies | 30 | e1e8bf7 |
| Public home | 100 | 561f60c |
| Beta screen | 88 | 6e07fe2 |
| Beta guidance | 125 | c2ac48a |
| Public beta | 100 | 0f8777e |
| Configuration | 220 | 5cb0696 |
| Collaboration | 248 | 30760ec |
| Knowledge | 242 | 3f67ff1 |
| Technical SEO | 238 | 84f2043 |
| Measurements and reports | 204 | 9dc100e |
| Outreach | 158 | 9e77223 |
| Growth | 201 | 056d33e |
| Commerce | 192 | 41eef0c |
| Backlinks | 256 | 8ed85cd |

Source material was reviewed against the current composed English values for each registered batch; tests compare the composed English catalog and its SHA-256 fingerprint, exact namespace key coverage, nonempty translations, placeholders, numbers, URLs and email tokens. The combined Finnish catalog is frozen with unique key ownership. Tests also confirm runtime exclusion.

Terminology: työtila (workspace), projekti (project), salasana (password), palautuslinkki (reset link), sivupalkki (sidebar), arkistoi (archive). Use direct, concise Finnish UI instructions. Preserve conditional password-recovery wording and source placeholders. Do not translate product/provider names as ordinary words.

Validation: 38 Finnish/catalog tests pass; TypeScript, scoped lint and whitespace pass. These mechanical checks do not constitute fluent-language or rendered accessibility acceptance. Source claims about monthly planning and successful sign-in after password update retain their existing implementation/acceptance boundaries.

Remaining: 541 English keys, fluent review, consistent terminology across the rest of the product, rendered mobile/desktop and accessibility checks, and approved activation. Next authoring batch covers evidence, using current composed English values rather than historical raw base strings. R20 still requires all 24 EU languages across its registered surfaces; this initial batch does not satisfy it.

Core review notes: ajastettu (scheduled), lähetetty sivustolle (sent to site), julkaistu (published), tarkista (review), vahvista (confirm). The Visibility navigation entry is Näkyvyys. Partial onboarding completion remains distinct from success. Inherited monthly-positioning, initial generation and setup-quality claims still require implementation/product acceptance; translation does not verify them.

Setup/services/audit review: hyväksyminen (approval) remains distinct from publication; API endpoints and the shared secret mechanism preserve source meaning. Audit copy distinguishes retrieved homepage text from a business-context-only fallback and preserves the separate technical crawl. Source-specific storage/security and actual provider behavior remain acceptance obligations, not facts established by translation.

Analytics/billing review: recorded views are not unique visitors, tracked clicks are not completed sales/bookings, and the 50 000-event / 60-day history limits remain explicit. Existing Paddle portal and billing-support source text is translated without establishing payment-provider configuration or changing the owner-deferred Stripe boundary. Package features, limits and access-end claims still require the registered commercial acceptance.

Evidence-screen review: competitor snapshots are not ongoing monitoring; failed retrieval supplies no competitor evidence. Readiness scores and source suitability remain estimates, separate from observed answer mentions/citations/rankings. AI referral traffic remains distinct from answer evidence. Provider names and variable placeholders are preserved.

Plan-screen review: työn tavoitepäivä (work target) remains separate from julkaisuaika (publication time). Accepting discovery suggestions does not create content or schedule publication. Unlinked drafts can retain active schedules; archive/restore actions and partial batch counts preserve their source meaning.

Editor-screen review: sending, publication and last-attempt timestamps remain distinct. The image upload limit, private-until-approval wording, controlled-origin restriction and explicit draft-save reminder preserve the English source. Source URL reachability is distinct from factual support, and verified status cannot be selected manually. Real-person consent and non-invention claims, image privacy and connector behavior retain their implementation/acceptance obligations. The health/finance/legal author recommendation remains non-blocking; CMS removal of structured data and search-engine discretion remain explicit.

Public pricing/case-study review: displayed regional pricing is distinct from billing-country eligibility; paid subscriptions, add-on activation and marketplace purchases remain on hold. Backlinks and individual publisher placements remain separate purchases. Synergy, Andersen and SI examples preserve their setup/internal/demo status and explicitly incomplete live publication/measurement acceptance. Translation supplies no new evidence for outcomes or package/provider readiness.

Public-home review: Visibility is Näkyvyys, consistent with navigation; missing measurement data is not presented as zero activity. Saved connection settings do not establish publication success, and billing portal access remains conditional on an existing connection. Case studies use Käyttöesimerkit to include internal/demo examples. Inherited monthly-planning, analytics integration, autonomy and AI-answer tracking claims still require their full implementation/live acceptance; translated marketing copy does not establish them.

Beta-screen review: this namespace is the owner-only sales/validation playbook, rather than a customer setup checklist. Discovery here means tarvekartoitus (sales discovery), distinct from product ideahaku. Interface language, outreach-template language and unchanged CSV field/value semantics remain separate. Translating outreach labels does not send messages or establish participant recruitment, payment readiness or real-use acceptance.

Beta-guidance review: 20–30-prospect validation and scorecard counts remain targets, not completed results. New audits, generation, outreach and publication retain source authorization boundaries; copying templates does not send messages. Stripe migration/owner setup and payment lifecycle acceptance remain open. Readiness is distinct from rankings and AI citations; demo material is distinct from verified real use. An initial text-encoding failure created no translation file; the complete file was subsequently written and the expanded suite passed.

Public-beta review: one-time versus optional monthly pricing, currency amounts, pilot scope and paid-launch hold retain their English meaning. Demo data is not growth evidence; missing Search Console data is not zero activity. The existing EN/PL/SV/DA page-coverage statement is preserved while Finnish is staged and must be reconciled with approved activation. Human-review and limited-availability marketing claims retain source acceptance obligations. Long-line text-writing attempts failed before creating the file; multiline authoring succeeded and the expanded 28-test suite passed afterward.

Configuration review: read-only, proposal and write permissions remain separate; proposal approval does not grant publishing/deletion/settings/billing authority. Shopify draft/approval/publication states and optional product-read permissions retain their source meaning. Coverage statements remain owner/source supplied, not verified listings, reviews, hreflang or rankings; connector receipts do not prove live coverage. The 2 000-character limit and supplied example domain are preserved. Source claims about secret storage, immediate revocation, brand safety and client setup instructions retain their implementation and current-provider acceptance obligations. No connection test, token creation or credential operation occurred.

Collaboration review: historical records and saved outputs do not prove active work, live publication or causation. Shared preparation attempts are not guaranteed finished articles; email-provider acceptance is not delivery confirmation. Creating invitations is separate from emailing them or granting access. Approval-policy changes, exact-version review, edit conflicts and uncertain saves preserve source meaning. Notification assignment requires recipient consent, and email-language changes do not enable delivery. These translations do not resolve the pending owner role-policy decision or establish live team/email acceptance.

Knowledge review: knowledge revalidation is separate from exact-content/destination publication approval and resuming a held schedule. Weekly reservations, saved drafts and real queue entries remain distinct, including nonexistent local times and uncertain recovery. Accepted source-reported facts are not independent verification; missing observations are not confirmed catalog removals. Extraction limits, owner-setting precedence, source revocation and irreversible forgetting retain their source semantics. No source refresh, generation, approval or data deletion occurred.

Technical review: ownership expiry, robots permissions, bounded crawl/sitemap coverage and saved evidence retain their source limits. Sitemap declarations are not indexing proof. Google index evidence is distinct from live-page testing or requesting indexing; refreshing history does not repeat provider requests. CrUX real-user evidence stays separate from PageSpeed laboratory measurements, including page/origin scope, unknown metrics and uncertain outcomes. No DNS mutation, crawl, Google inspection or performance-provider request occurred.

Measurements review: report sending acceptance is distinct from delivery, and saved publication results do not recheck live pages. AI referral visits are distinct from citations and bot signals. Search Console imports preserve declared source/property, date windows, partial table scope, unknown metrics and no-causality limits. Numeric checking now recognizes the English day suffix (30d) alongside Finnish spaced units (30 pv), with a regression that rejects a changed period. Source privacy, conversion labels, live-link status and provider setup claims still require their implementation/live acceptance. No tracking installation, import, Google operation or report email occurred.

Outreach review: exact recipient/content confirmation and each follow-up remain separate approvals. Provider acceptance does not establish delivery, reply or placement; interrupted/unknown reservations stay held, and refreshing never retries. Editable draft labels do not establish a service-recorded send. Hook review preserves unsupported-claim warnings and the non-blocking health/finance/legal recommendation; image placement remains separate from visual approval. No draft generation, outreach send or provider action occurred.

Growth review: Authority Builder ideas remain suggestions without backlink/ranking guarantees. Public audit is homepage-based readiness, not observed live ranking. Proposal approval immediately applies eligible changes while duplicates/limits can reduce created counts; setup completion remains unchanged and Claude cannot self-approve. Manual live labels, privacy claims and no-change error statements retain their implementation acceptance obligations. No audit, generation or proposal application occurred.

Commerce review: test checkout, manual beta/comped activation and real payment confirmation remain distinct. Billing-country eligibility is independent of public language/region. Connection tests do not guarantee publication permissions; checklist completion does not establish paid self-service readiness. Owner-supplied CSV does not establish OAuth status. Stripe replacement and real payment lifecycle checks remain open, as do provider/site acceptance and legal-page review. No checkout, activation, payment or connection operation occurred.

Backlinks review: provider-index samples and first/last-seen dates do not establish complete coverage or actual placement/removal dates. Demo marketplace requests remain separate from exact-total paid orders; uncertain outcomes prohibit retries until reconciled. Monitoring uses UTC windows and explicit supplier caps, while pausing does not cancel already admitted spend. Numeric costs and limits are preserved. Source policy, live-link verification and provider-readiness claims retain their real-use acceptance obligations. No provider collection, network listing, purchase or monitoring activation occurred.
