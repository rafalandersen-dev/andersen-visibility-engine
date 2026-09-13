# Hungarian interface authoring - 13 September 2026

Hungarian is staged only: 274 of the current 3,768 English interface keys across three complete batches. It is excluded from UI_CATALOGS and the language picker. Four UI catalogs remain active; fourteen other catalogs are completely authored in staging with acceptance still incomplete.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | 78911a7 |
| Shared controls and navigation accessibility labels | 30 | 78911a7 |
| Core navigation, onboarding, project setup and workflow states | 202 | 78911a7 |

The frozen registry assigns each key once. Namespace checks verify exact keys, current composed-English source fingerprints, nonempty values and preserved placeholders, numbers, URLs and email tokens. All 14 Hungarian/catalog tests, scoped lint, formatting, whitespace and type checking pass. Type log: /tmp/milo-hungarian-core-types.log. Full-catalog equality will be required when all batches are authored.

Terminology: workspace is "munkaterület", project is "projekt", workflow plan is "terv", content brief is "tartalmi brief", draft is "vázlat", and authority is "tekintély". Buttons generally use action nouns; helper instructions address one user informally. Provider/product names and placeholders are preserved. Provider and plan names are introduced without requiring Hungarian suffixes; provider/plan/step interpolation was checked in auth.tsx and app.onboarding.tsx.

Recovery text preserves conditional eligibility without confirming account existence. Core text distinguishes a work target date, scheduled publication, sending to the site and confirmed publication. Workspace-load failure keeps saving disabled; partial setup keeps unfinished AI steps explicit. Successful sign-in and marketing copy still require implementation and real-use acceptance. No authentication, email, account, credential or provider operation occurred.

Remaining: 3,494 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next: setup, services, audit, analytics and billing screens using current composed English source. This staged work does not complete R20 or change release gates.
