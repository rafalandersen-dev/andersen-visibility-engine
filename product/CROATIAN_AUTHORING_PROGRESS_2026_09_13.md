# Croatian interface authoring — 13 September 2026

Croatian is staged only: 72 of the current 3,768 English interface keys across two complete batches. It is excluded from UI_CATALOGS and the language picker. Active UI remains EN/PL/SV/DA; FR/DE/ES/IT/PT/NL/FI/CS/SK/SL retain complete staged authoring and incomplete acceptance status.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | b450bc5 |
| Shared controls and navigation accessibility labels | 30 | b450bc5 |

The frozen staged registry assigns each key once. Namespace checks verify exact keys, current composed-English source fingerprints, nonempty values and preserved placeholders, numbers, URLs and email tokens. All 13 Croatian/catalog tests, scoped lint, whitespace and type checking pass. Changed code formatted. Type log: /tmp/milo-croatian-auth-types.log.

Terminology: radni prostor (workspace), projekt, lozinka (password), ponovno postavljanje lozinke (password reset), bočna traka (sidebar), unos (network listing), paket (subscription plan), plan (workflow plan), smjernice za sadržaj (content brief), poveznica (link). Use polite plural explanatory instructions and concise action labels. Preserve provider/product names and placeholders.

Recovery text retains conditional eligibility without confirming account existence. Marketing and successful sign-in claims retain their implementation and real-use acceptance obligations. No authentication, email, account, credential or provider operation occurred.

Remaining: 3,696 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next batch: core using the current composed English source. This staged work does not complete R20 or change release gates.
