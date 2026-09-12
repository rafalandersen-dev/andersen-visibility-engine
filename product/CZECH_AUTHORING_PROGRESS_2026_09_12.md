# Czech interface authoring — 12 September 2026

Czech is staged only: 345 of the current 3,768 English interface keys, across six complete batches. It is excluded from UI_CATALOGS and the language picker. Active UI remains EN/PL/SV/DA; FR/DE/ES/IT/PT/NL/FI retain their separate staged acceptance status.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | 78cd575 |
| Shared controls and navigation accessibility labels | 30 | 78cd575 |
| Core shell, onboarding, setup, languages, markets and pipeline | 202 | f01c604 |
| Setup screen | 24 | 2028903 |
| Services screen | 18 | 2028903 |
| Audit screen | 29 | 2028903 |

The staged registry has unique key ownership and a frozen combined catalog. Namespace tests verify exact keys, nonempty values, current English source fingerprints and preserved placeholders, numbers, URLs and email tokens. All 17 Czech/catalog tests, scoped lint and whitespace pass. Current batch type checking passes (log: /tmp/milo-czech-setup-services-audit-types.log).

Terminology: pracovní prostor (workspace), projekt, heslo (password), obnovení hesla (password recovery), postranní panel (sidebar), archivovat (archive). Prefer direct formal-plural instructions; use schválit for approval, potvrdit for confirmation, ověřit for verification and zkontrolovat for review. Product/provider names and placeholders remain intact.

Recovery text preserves conditional account eligibility and does not confirm that an account exists. Source claims about monthly planning and successful sign-in after password update retain their implementation/acceptance obligations; translation does not prove them. No email, authentication, password or provider operation occurred.

Remaining: 3,423 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next complete batches: analytics and billing screens, using current composed English. This initial Czech batch does not complete R20 or alter release gates.

Core review: Plán, Obsah, Viditelnost and Nastavení label the main navigation areas. Work target dates remain distinct from publication times; Naplánováno denotes planned work, while Čas zveřejnění nastaven denotes a publication schedule. Odesláno na web does not mean Zveřejněno. Partial setup success remains separate from completion, and application language, content language and market stay separate settings. Inherited generation/setup claims are translated without proving live behavior. No onboarding, generation, schedule or billing operation occurred.

Setup/services/audit review: approval marks readiness but requires a separate publication action or schedule. Endpoint and shared-secret instructions preserve source behavior without establishing live connector/security acceptance. Audit text distinguishes retrieved homepage evidence from a business-context-only fallback; scores are assessments rather than measured rankings or technical metrics. Technical crawling is a separate action. No settings save, catalog change, audit or provider request occurred.
