# Slovenian interface authoring — 12 September 2026

Slovenian is staged only: 72 of the current 3,768 English interface keys across two complete batches. It is excluded from UI_CATALOGS and the language picker. Active UI remains EN/PL/SV/DA; FR/DE/ES/IT/PT/NL/FI/CS/SK retain separate complete staged authoring and incomplete acceptance status.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | 5f7faa9 |
| Shared controls and navigation accessibility labels | 30 | 5f7faa9 |

The frozen staged registry assigns every key once. Namespace tests verify exact keys, nonempty values, current composed-English source fingerprints and preserved placeholders, numbers, URLs and email tokens. All 13 Slovenian/catalog tests, scoped lint, whitespace and type checking pass. Type log: /tmp/milo-slovenian-auth-types.log.

Terminology: delovni prostor (workspace), projekt, geslo (password), ponastavitev gesla (password reset), stranska vrstica (sidebar), vpis (network listing), paket (subscription plan), načrt (workflow plan), vsebinska izhodišča (content brief). Use polite plural explanatory instructions and concise action labels. Preserve provider/product names and placeholders.

Recovery text retains conditional eligibility without confirming account existence. Marketing and successful sign-in source claims retain their implementation and real-use acceptance obligations. No authentication, email, account, credential or provider action occurred.

Remaining: 3,696 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next batch: core using current composed English. This staged work does not complete R20 or change release gates.
