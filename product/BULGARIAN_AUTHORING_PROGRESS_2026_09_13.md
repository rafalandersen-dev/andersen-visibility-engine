# Bulgarian interface authoring — 13 September 2026

Bulgarian is staged only: 274 of the current 3,768 English interface keys across three complete batches. It is excluded from UI_CATALOGS and the language picker. Four UI catalogs remain active; eleven other catalogs are completely authored in staging with acceptance still incomplete.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | 7a9ab2d |
| Shared controls and navigation accessibility labels | 30 | 7a9ab2d |
| Core navigation, onboarding, setup and workflow | 202 | 57f1c83 |

The frozen registry assigns each key once. Namespace checks verify exact keys, current composed-English source fingerprints, nonempty values and preserved placeholders, numbers, URLs and email tokens. All 14 Bulgarian/catalog tests, scoped lint, formatting, whitespace and type checking pass. Type log: /tmp/milo-bulgarian-core-types.log. Full-catalog equality will be required when all batches are authored.

Terminology: работно пространство (workspace), акаунт (account), проект (project), парола (password), възстановяване на парола (password reset), странична лента (sidebar), запис (network listing), задания за съдържание (content briefs). Use polite plural explanations and concise imperative action labels; preserve provider/product names and placeholders.

Recovery text preserves conditional eligibility without confirming account existence. Successful sign-in and marketing copy still require implementation and real-use acceptance. No authentication, email, account, credential or provider operation occurred.

Core copy preserves interface/content-language distinctions, saved setup versus unfinished generation, draft review, target dates, scheduled publication, sent-to-site and published states. No setup, generation, schedule or publication operation occurred.

Remaining: 3,494 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next: setup, services and audit screens using current composed English source. This staged work does not complete R20 or change release gates.
