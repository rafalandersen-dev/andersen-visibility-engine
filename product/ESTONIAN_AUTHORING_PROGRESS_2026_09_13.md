# Estonian interface authoring - 13 September 2026

Estonian is staged only: 855 of the current 3,768 English interface keys across thirteen complete batches. It is excluded from UI_CATALOGS and the language picker. Four UI catalogs remain active; twelve other catalogs are completely authored in staging with acceptance still incomplete.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | 73cfdf8 |
| Shared controls and navigation accessibility labels | 30 | 73cfdf8 |
| Core navigation, onboarding, project setup and workflow states | 202 | c969097 |
| Setup and publishing settings | 24 | 27e9a21 |
| Services and products | 18 | 27e9a21 |
| On-page audit | 29 | 27e9a21 |
| Analytics screen | 36 | afb3a89 |
| Billing screen | 54 | afb3a89 |
| Competitor and AI-readiness evidence screen | 89 | 46938bc |
| Plan screen | 113 | 2cd6e0b |
| Editor screen | 148 | a6a6b23 |
| Public pricing | 40 | 316fc14 |
| Public case studies | 30 | 316fc14 |

The frozen registry assigns each key once. Namespace checks verify exact keys, current composed-English source fingerprints, nonempty values and preserved placeholders, numbers, URLs and email tokens. All 24 Estonian/catalog tests, scoped lint, formatting, whitespace and type checking pass. Type log: /tmp/milo-estonian-public-pricing-types.log. Full-catalog equality will be required when all batches are authored.

Terminology: workspace is "tööruum", a subscription plan is "pakett", the workflow plan is "plaan", and content briefs are "sisu lähteülesanded". Labels use concise singular imperatives; provider/product names and placeholders are preserved.

Public pricing retains billing-country eligibility, separate purchases and paid holds. Case studies retain setup/demo scope, incomplete live acceptance and no verified growth claims. Editor copy preserves image privacy/approval/save requirements, unresolved-link holds, source validation and real-author guidance, and structured-data/rich-result limits. Plan copy preserves work targets versus publication times, sample provenance, skipped batch items, separate discovery acceptance and still-active schedules on unlinked drafts. Competitor copy preserves snapshot/fetch limits and the higher-gap-score direction. Readiness copy retains the opposite score direction and separates estimates, recorded AI answers, referral visits, mentions and citations. Analytics text preserves recorded-event versus visitor/completed-sale distinctions, UTC grouping and bounded history. Billing retains legacy-portal linkage, active/manual-plan eligibility, separate purchases and configuration-dependent features. These source claims still need real-use and commercial acceptance. Setup text keeps approval separate from publication and explains the retired automatic mode. Audit text distinguishes readable-page evidence, supplied-context fallback and separate technical crawling; indicative scores remain assessments. Core text distinguishes a work target date, scheduled publication, sending to the site and confirmed publication. Workspace-load failure keeps saving disabled; partial setup keeps unfinished AI steps explicit. Recovery text preserves conditional eligibility without confirming account existence. Successful sign-in and marketing copy still require implementation and real-use acceptance. No authentication, email, account, credential or provider operation occurred.

Remaining: 2,913 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next: public home using current composed English source. This staged work does not complete R20 or change release gates.
