# Bulgarian interface authoring — 13 September 2026

Bulgarian is staged only: 855 of the current 3,768 English interface keys across thirteen complete batches. It is excluded from UI_CATALOGS and the language picker. Four UI catalogs remain active; eleven other catalogs are completely authored in staging with acceptance still incomplete.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | 7a9ab2d |
| Shared controls and navigation accessibility labels | 30 | 7a9ab2d |
| Core navigation, onboarding, setup and workflow | 202 | 57f1c83 |
| Setup screen | 24 | 07d0f22 |
| Services screen | 18 | 07d0f22 |
| Audit screen | 29 | 07d0f22 |
| Analytics screen | 36 | 9ff877a |
| Billing screen | 54 | 9ff877a |
| Competitor and AI-readiness evidence screen | 89 | 7d62eb3 |
| Plan screen | 113 | b330d65 |
| Editor screen | 148 | eda0235 |
| Public pricing | 40 | 7e16ed1 |
| Public case studies | 30 | 7e16ed1 |

The frozen registry assigns each key once. Namespace checks verify exact keys, current composed-English source fingerprints, nonempty values and preserved placeholders, numbers, URLs and email tokens. All 24 Bulgarian/catalog tests, scoped lint, formatting, whitespace and type checking pass. Type log: /tmp/milo-bulgarian-pricing-studies-types.log. Full-catalog equality will be required when all batches are authored.

Terminology: работно пространство (workspace), акаунт (account), проект (project), парола (password), възстановяване на парола (password reset), странична лента (sidebar), запис (network listing), задания за съдържание (content briefs). Use polite plural explanations and concise imperative action labels; preserve provider/product names and placeholders.

Recovery text preserves conditional eligibility without confirming account existence. Successful sign-in and marketing copy still require implementation and real-use acceptance. No authentication, email, account, credential or provider operation occurred.

Core copy preserves interface/content-language distinctions, saved setup versus unfinished generation, draft review, target dates, scheduled publication, sent-to-site and published states. No setup, generation, schedule or publication operation occurred.

Setup copy preserves approval/publication separation, previously approved draft uncertainty and configured destination/secret handling. Service controls retain named-item parameters. Audit copy distinguishes readable homepage text from business-context fallback; scores remain assessments rather than rankings, measured performance or a whole-site crawl. No settings, credential, audit, provider or publication action occurred.

Analytics copy preserves recorded events versus unique visitors, click rate versus completed conversions, the 50,000-event/60-day bound and publication-history limits. Billing retains linked legacy-portal conditions, manually granted plan eligibility, separate backlink purchase approval and configured-feature limits. No portal, payment, tracking or provider operation occurred.

Evidence-screen copy preserves snapshot versus ongoing-monitoring limits, failed retrieval as no competitor evidence, opposite gap/readiness score directions, and the separation of readiness estimates, recorded answers and AI referrals. Prompt terminology is distinguished from questions; possible gaps remain suggestions. No competitor retrieval, model request, analysis or opportunity creation occurred.

Plan copy distinguishes work targets from publication times, suggestion acceptance from content creation/scheduling, sample rows from project evidence, skipped batch items and unlinked drafts with still-active publication schedules. Board/List/Calendar terminology is established for subsequent workflow copy. No generation, sample removal, scheduling, archive or restoration action occurred.

Editor copy preserves image privacy until approval, controlled-origin and alt-text requirements, explicit draft saving, unresolved-link blocks, source validation status, real-author consent and structured-data delivery/search-engine limits. No upload, image generation, approval, source validation or publication action occurred.

Public pricing retains region versus billing eligibility, separate placement purchases, paid activation holds and no outcome guarantees. Case studies retain implementation/demo/internal-example scope, incomplete live destination/publication/measurement acceptance and no verified growth claims. No checkout, activation, purchase, provider request or publication occurred.

Remaining: 2,913 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next: public home using current composed English source. This staged work does not complete R20 or change release gates.
