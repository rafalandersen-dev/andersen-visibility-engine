# Greek interface authoring - 13 September 2026

Greek is staged only: 955 of the current 3,768 English interface keys across fourteen complete batches. It is excluded from UI_CATALOGS and the language picker. Four UI catalogs remain active; thirteen other catalogs are completely authored in staging with acceptance still incomplete.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | 73e6880 |
| Shared controls and navigation accessibility labels | 30 | 73e6880 |
| Core navigation, onboarding, project setup and workflow states | 202 | 73e6880 |
| Setup and publishing settings | 24 | 57b6fe5 |
| Services and products | 18 | 57b6fe5 |
| On-page audit | 29 | 57b6fe5 |
| Analytics screen | 36 | 57b6fe5 |
| Billing screen | 54 | 57b6fe5 |
| Competitor and AI-readiness evidence screen | 89 | 51a2a9f |
| Plan screen | 113 | 2880b96 |
| Editor screen | 148 | 47bc368 |
| Public pricing | 40 | 1435f84 |
| Public case studies | 30 | 1435f84 |
| Public home | 100 | 4a844ff |

The frozen registry assigns each key once. Namespace checks verify exact keys, current composed-English source fingerprints, nonempty values and preserved placeholders, numbers, URLs and email tokens. All 25 Greek/catalog tests, scoped lint, formatting, whitespace and type checking pass. Type log: /tmp/milo-greek-public-home-types.log. Full-catalog equality will be required when all batches are authored.

Terminology: workspace is "χώρος εργασίας", the workflow plan is "πλάνο", content briefs are "οδηγίες σύνταξης περιεχομένου", drafts are "προσχέδια", and authority is "κύρος". Buttons generally use action nouns; helper instructions address one user. Provider/product names and placeholders are preserved.

Home copy preserves missing-data versus zero-activity distinctions, version-specific scoring, separate acceptance and publication, connection-evidence limits and billing holds. The three hero fragments were checked against their joined rendering in src/routes/index.tsx. Before activation, reconcile the English home FAQ stage name Captured (translated Καταγεγραμμένα) against the Plan page pipeline.stage.idea label (Greek Ιδέα); exact source parity does not resolve this product terminology mismatch. Public pricing preserves region versus billing eligibility, subscription/add-on/purchase holds, separate placement charges and non-guaranteed outcomes. Case studies retain setup/demo provenance and incomplete live destination, publication and measurement acceptance. Editor copy preserves sending versus public publication, controlled image origins, private-upload approval, unresolved-link holds, validation-owned source status, real-author consent and schema delivery limits. The author recommendation remains non-blocking. Plan copy preserves work targets versus publication times, sample provenance, skipped batch items, separate discovery acceptance and still-active schedules on unlinked drafts. Competitor copy preserves snapshot/fetch limits and the higher-gap-score direction. Readiness copy retains the opposite score direction and separates estimates, recorded AI answers, referral visits, mentions and citations. Business/location interpolation was checked in both page sources. Setup text keeps approval separate from publication and explains the retired automatic mode. Audit text distinguishes readable-page evidence, supplied-context fallback and separate technical crawling; scores remain indicative assessments. Business/location interpolation was checked in the page source. Analytics text preserves recorded-event versus visitor/completed-sale distinctions, UTC grouping and bounded history. Billing retains legacy-portal linkage, active/manual-plan eligibility, separate purchases and configuration-dependent features. These source claims still need real-use and commercial acceptance. Recovery text preserves conditional eligibility without confirming account existence. Core text distinguishes a work target date, scheduled publication, sending to the site and confirmed publication. Workspace-load failure keeps saving disabled; partial setup keeps unfinished AI steps explicit. Successful sign-in and marketing copy still require implementation and real-use acceptance. No authentication, email, account, credential or provider operation occurred.

Remaining: 2,813 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next: beta screen using current composed English source. This staged work does not complete R20 or change release gates.
