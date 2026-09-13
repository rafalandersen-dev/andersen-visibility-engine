# Estonian interface authoring - 13 September 2026

Estonian is staged only: 72 of the current 3,768 English interface keys across two complete batches. It is excluded from UI_CATALOGS and the language picker. Four UI catalogs remain active; twelve other catalogs are completely authored in staging with acceptance still incomplete.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | 73cfdf8 |
| Shared controls and navigation accessibility labels | 30 | 73cfdf8 |

The frozen registry assigns each key once. Namespace checks verify exact keys, current composed-English source fingerprints, nonempty values and preserved placeholders, numbers, URLs and email tokens. All 13 Estonian/catalog tests, scoped lint, formatting, whitespace and type checking pass. Type log: /tmp/milo-estonian-auth-types.log. Full-catalog equality will be required when all batches are authored.

Terminology: workspaces use the Estonian term for a workspace, subscription plans use package terminology, and content briefs use content-assignment terminology. Labels use concise singular imperatives; provider/product names and placeholders are preserved.

Recovery text preserves conditional eligibility without confirming account existence. Successful sign-in and marketing copy still require implementation and real-use acceptance. No authentication, email, account, credential or provider operation occurred.

Remaining: 3,696 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next: core using current composed English source. This staged work does not complete R20 or change release gates.
