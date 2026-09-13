# Hungarian interface authoring - 13 September 2026

Hungarian is staged only: 524 of the current 3,768 English interface keys across nine complete batches. It is excluded from UI_CATALOGS and the language picker. Four UI catalogs remain active; fourteen other catalogs are completely authored in staging with acceptance still incomplete.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | 78911a7 |
| Shared controls and navigation accessibility labels | 30 | 78911a7 |
| Core navigation, onboarding, project setup and workflow states | 202 | 78911a7 |
| Setup and publishing settings | 24 | 9f42e68 |
| Services and products | 18 | 9f42e68 |
| On-page audit | 29 | 9f42e68 |
| Analytics screen | 36 | 9f42e68 |
| Billing screen | 54 | 9f42e68 |
| Competitor and AI-readiness evidence screen | 89 | 31bab65 |

The frozen registry assigns each key once. Namespace checks verify exact keys, current composed-English source fingerprints, nonempty values and preserved placeholders, numbers, URLs and email tokens. All 20 Hungarian/catalog tests, scoped lint, formatting, whitespace and type checking pass. Type log: /tmp/milo-hungarian-evidence-screen-types.log. Full-catalog equality will be required when all batches are authored.

Terminology: workspace is "munkaterület", project is "projekt", workflow plan is "terv", content brief is "tartalmi brief", draft is "vázlat", and authority is "tekintély". Buttons generally use action nouns; helper instructions address one user informally. Provider/product names and placeholders are preserved. Provider and plan names are introduced without requiring Hungarian suffixes; provider/plan/step interpolation was checked in auth.tsx and app.onboarding.tsx.

Competitor copy preserves snapshot/fetch limits and the higher-gap-score direction. Readiness copy retains the opposite score direction and separates estimates, recorded AI answers, referral visits, mentions and citations. Business/location interpolation was checked in both page sources. Setup text keeps approval separate from publication and explains the retired automatic mode. Audit text distinguishes readable-page evidence, supplied-context fallback and separate technical crawling; scores remain indicative assessments. Business/location interpolation was checked in the page source. Analytics preserves recorded-event versus unique-visitor/completed-sale distinctions, UTC grouping and bounded history. Billing retains legacy-portal linkage, active/manual-plan eligibility, separate purchases and configuration-dependent features. These source claims still require real-use and commercial acceptance. Recovery text preserves conditional eligibility without confirming account existence. Core text distinguishes a work target date, scheduled publication, sending to the site and confirmed publication. Workspace-load failure keeps saving disabled; partial setup keeps unfinished AI steps explicit. Successful sign-in and marketing copy still require implementation and real-use acceptance. No authentication, email, account, credential or provider operation occurred.

Remaining: 3,244 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next: Plan screen using current composed English source. This staged work does not complete R20 or change release gates.
