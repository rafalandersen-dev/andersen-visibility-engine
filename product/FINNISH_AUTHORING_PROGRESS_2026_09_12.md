# Finnish interface authoring — 12 September 2026

Finnish is staged only: 955 of the current 3,768 English interface keys, across fourteen complete batches. It is not registered in UI_CATALOGS or the language picker. Active UI remains EN/PL/SV/DA; the fully authored FR/DE/ES/IT/PT/NL catalogs retain their separate acceptance status.

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

Source material was reviewed against the current composed English values for each registered batch; tests compare the composed English catalog and its SHA-256 fingerprint, exact namespace key coverage, nonempty translations, placeholders, numbers, URLs and email tokens. The combined Finnish catalog is frozen with unique key ownership. Tests also confirm runtime exclusion.

Terminology: työtila (workspace), projekti (project), salasana (password), palautuslinkki (reset link), sivupalkki (sidebar), arkistoi (archive). Use direct, concise Finnish UI instructions. Preserve conditional password-recovery wording and source placeholders. Do not translate product/provider names as ordinary words.

Validation: 25 Finnish/catalog tests pass; TypeScript, scoped lint and whitespace pass. These mechanical checks do not constitute fluent-language or rendered accessibility acceptance. Source claims about monthly planning and successful sign-in after password update retain their existing implementation/acceptance boundaries.

Remaining: 2,813 English keys, fluent review, consistent terminology across the rest of the product, rendered mobile/desktop and accessibility checks, and approved activation. Next authoring batches cover the beta screen and guidance, using current composed English values rather than historical raw base strings. R20 still requires all 24 EU languages across its registered surfaces; this initial batch does not satisfy it.

Core review notes: ajastettu (scheduled), lähetetty sivustolle (sent to site), julkaistu (published), tarkista (review), vahvista (confirm). The Visibility navigation entry is Näkyvyys. Partial onboarding completion remains distinct from success. Inherited monthly-positioning, initial generation and setup-quality claims still require implementation/product acceptance; translation does not verify them.

Setup/services/audit review: hyväksyminen (approval) remains distinct from publication; API endpoints and the shared secret mechanism preserve source meaning. Audit copy distinguishes retrieved homepage text from a business-context-only fallback and preserves the separate technical crawl. Source-specific storage/security and actual provider behavior remain acceptance obligations, not facts established by translation.

Analytics/billing review: recorded views are not unique visitors, tracked clicks are not completed sales/bookings, and the 50 000-event / 60-day history limits remain explicit. Existing Paddle portal and billing-support source text is translated without establishing payment-provider configuration or changing the owner-deferred Stripe boundary. Package features, limits and access-end claims still require the registered commercial acceptance.

Evidence-screen review: competitor snapshots are not ongoing monitoring; failed retrieval supplies no competitor evidence. Readiness scores and source suitability remain estimates, separate from observed answer mentions/citations/rankings. AI referral traffic remains distinct from answer evidence. Provider names and variable placeholders are preserved.

Plan-screen review: työn tavoitepäivä (work target) remains separate from julkaisuaika (publication time). Accepting discovery suggestions does not create content or schedule publication. Unlinked drafts can retain active schedules; archive/restore actions and partial batch counts preserve their source meaning.

Editor-screen review: sending, publication and last-attempt timestamps remain distinct. The image upload limit, private-until-approval wording, controlled-origin restriction and explicit draft-save reminder preserve the English source. Source URL reachability is distinct from factual support, and verified status cannot be selected manually. Real-person consent and non-invention claims, image privacy and connector behavior retain their implementation/acceptance obligations. The health/finance/legal author recommendation remains non-blocking; CMS removal of structured data and search-engine discretion remain explicit.

Public pricing/case-study review: displayed regional pricing is distinct from billing-country eligibility; paid subscriptions, add-on activation and marketplace purchases remain on hold. Backlinks and individual publisher placements remain separate purchases. Synergy, Andersen and SI examples preserve their setup/internal/demo status and explicitly incomplete live publication/measurement acceptance. Translation supplies no new evidence for outcomes or package/provider readiness.

Public-home review: Visibility is Näkyvyys, consistent with navigation; missing measurement data is not presented as zero activity. Saved connection settings do not establish publication success, and billing portal access remains conditional on an existing connection. Case studies use Käyttöesimerkit to include internal/demo examples. Inherited monthly-planning, analytics integration, autonomy and AI-answer tracking claims still require their full implementation/live acceptance; translated marketing copy does not establish them.
