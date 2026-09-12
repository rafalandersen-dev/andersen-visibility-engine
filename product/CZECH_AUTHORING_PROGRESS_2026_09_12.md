# Czech interface authoring — 12 September 2026

Czech is staged only: 72 of the current 3,768 English interface keys, across two complete namespaces. It is excluded from UI_CATALOGS and the language picker. Active UI remains EN/PL/SV/DA; FR/DE/ES/IT/PT/NL/FI retain their separate staged acceptance status.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | 78cd575 |
| Shared controls and navigation accessibility labels | 30 | 78cd575 |

The staged registry has unique key ownership and a frozen combined catalog. Namespace tests verify exact keys, nonempty values, current English source fingerprints and preserved placeholders, numbers, URLs and email tokens. All 13 Czech/catalog tests, scoped lint and whitespace pass. Type checking passes (log: /tmp/milo-czech-auth-shared-types.log).

Terminology: pracovní prostor (workspace), projekt, heslo (password), obnovení hesla (password recovery), postranní panel (sidebar), archivovat (archive). Prefer direct formal-plural instructions; use schválit for approval, potvrdit for confirmation, ověřit for verification and zkontrolovat for review. Product/provider names and placeholders remain intact.

Recovery text preserves conditional account eligibility and does not confirm that an account exists. Source claims about monthly planning and successful sign-in after password update retain their implementation/acceptance obligations; translation does not prove them. No email, authentication, password or provider operation occurred.

Remaining: 3,696 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next complete batch: core shell/onboarding, using current composed English. This initial Czech batch does not complete R20 or alter release gates.
