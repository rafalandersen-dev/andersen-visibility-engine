# Slovak interface authoring — 12 September 2026

Slovak is staged only: 345 of the current 3,768 English interface keys, across six complete batches. It is excluded from UI_CATALOGS and the language picker. Active UI remains EN/PL/SV/DA; FR/DE/ES/IT/PT/NL/FI/CS retain separate staged acceptance status.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | e72328d |
| Shared controls and navigation accessibility labels | 30 | e72328d |
| Core navigation, onboarding, setup and pipeline | 202 | 4ad3d13 |
| Setup screen | 24 | 24ddc69 |
| Services screen | 18 | 24ddc69 |
| Audit screen | 29 | 24ddc69 |

The staged registry has unique key ownership and a frozen combined catalog. Namespace tests verify exact keys, nonempty values, current English source fingerprints and preserved placeholders, numbers, URLs and email tokens. All 17 Slovak/catalog tests, scoped lint, whitespace and type checking pass. Type log: /tmp/milo-slovak-setup-types.log.

Terminology: pracovný priestor (workspace), projekt, heslo (password), obnovenie hesla (password recovery), bočný panel (sidebar), archivovať (archive). Prefer formal-plural instructions and infinitive actions. Program denotes a subscription plan; workflow plans use plán. Network listing is zápis. Preserve provider/product names and placeholders.

Recovery text preserves conditional eligibility and does not confirm that an account exists. Source claims about monthly planning and successful sign-in after password update retain implementation/acceptance obligations; translation does not prove them. No email, authentication, password, account or provider operation occurred.

Remaining: 3,423 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next complete batches: analytics and billing screens using current composed English. This staged work does not complete R20 or alter release gates.

Core copy preserves interface versus content language, work target dates versus publication times, sent drafts versus published pages, and partial-generation recovery. Navigation uses Plán, Obsah, Viditeľnosť, Nastavenia and Analytika; publication scheduling is Čas zverejnenia nastavený. No generation, scheduling or publication occurred. Current source fingerprints are checked against composed English.

Setup/services/audit copy preserves approval versus publication, removed automatic-on-approval behavior, configured draft versus live endpoints, and homepage-read versus supplied-context evidence. Audit scores remain indicative assessments rather than measured rankings or technical performance; technical crawling is separate. No secret, endpoint, provider, crawl or publication operation occurred.
