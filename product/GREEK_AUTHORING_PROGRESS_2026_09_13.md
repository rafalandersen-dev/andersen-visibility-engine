# Greek interface authoring - 13 September 2026

Greek is staged only: 274 of the current 3,768 English interface keys across three complete batches. It is excluded from UI_CATALOGS and the language picker. Four UI catalogs remain active; thirteen other catalogs are completely authored in staging with acceptance still incomplete.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | 73e6880 |
| Shared controls and navigation accessibility labels | 30 | 73e6880 |
| Core navigation, onboarding, project setup and workflow states | 202 | 73e6880 |

The frozen registry assigns each key once. Namespace checks verify exact keys, current composed-English source fingerprints, nonempty values and preserved placeholders, numbers, URLs and email tokens. All 14 Greek/catalog tests, scoped lint, formatting, whitespace and type checking pass. Type log: /tmp/milo-greek-core-types.log. Full-catalog equality will be required when all batches are authored.

Terminology: workspace is "χώρος εργασίας", the workflow plan is "πλάνο", content briefs are "οδηγίες σύνταξης περιεχομένου", drafts are "προσχέδια", and authority is "κύρος". Buttons generally use action nouns; helper instructions address one user. Provider/product names and placeholders are preserved.

Recovery text preserves conditional eligibility without confirming account existence. Core text distinguishes a work target date, scheduled publication, sending to the site and confirmed publication. Workspace-load failure keeps saving disabled; partial setup keeps unfinished AI steps explicit. Successful sign-in and marketing copy still require implementation and real-use acceptance. No authentication, email, account, credential or provider operation occurred.

Remaining: 3,494 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next: setup, services and audit screens using current composed English source. This staged work does not complete R20 or change release gates.
