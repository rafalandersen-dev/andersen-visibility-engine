# Dutch interface authoring — 12 September 2026

R20 requires full EU-language coverage. Dutch authoring has begun with 345 of the current 3,768 English interface messages (3,423 remain). This is a partial staged catalog; Dutch is not registered in UI_CATALOGS or the language picker.

## Completed authoring batches

| Batch | Messages | Files |
| --- | ---: | --- |
| Core navigation, onboarding and setup | 202 | src/i18n/staged/nl-core.ts |
| Publishing setup screen | 24 | src/i18n/staged/nl-setup-screen.ts |
| Services screen | 18 | src/i18n/staged/nl-services-screen.ts |
| On-page review screen | 29 | src/i18n/staged/nl-audit-screen.ts |
| Authentication | 42 | src/i18n/staged/nl-auth-screen.ts |
| Shared controls | 30 | src/i18n/staged/nl-shared-ui.ts |

Source reviewed at c0ac84b: auth-screen.ts and shared-ui.ts English entries. The batch registry records source hashes and revision. Copy uses consistent informal Dutch je, werkruimte, wachtwoord and herstellink; placeholders, the eight-character rule and conditional recovery wording are preserved. Monthly-planner positioning remains inherited source copy and needs the same product-positioning review as existing locales.

All thirteen Dutch/catalog tests across two files pass. Checks cover exact namespace keys, reviewed English hashes, nonempty messages, placeholders/numbers/URLs/email preservation, unique ownership, frozen combined catalog and runtime exclusion. Full TypeScript (/tmp/milo-dutch-initial-types.log), scoped lint and whitespace checks passed. No build repeated for unimported staged copy.

Continue with the remaining screen/domain groups using the existing staged catalog grouping. Before activation: complete every message, review fluency and terminology, verify responsive rendered layouts and accessibility, and satisfy the broader interface/content/email/formatting acceptance matrix. Auth text authoring does not prove live signup/recovery, email delivery or account behavior. No runtime activation, provider request, deployment or task handoff occurred. Release holds and the full goal remain unchanged.


## Core batch follow-up

At 86460e1, authored all 202 messages in common/nav/appShell/shell/onboarding/setup/lang/market/goal/pipeline from the composed current English catalog. Planned, queued, scheduled, sent and published remain distinct. Workspace loading guidance preserves disabled saving and offline recovery. Existing source claims about monthly planning and automatic onboarding foundation/draft generation are preserved for source fidelity but require behavior review before activation; translating them does not verify those outcomes.

All fourteen Dutch/catalog tests pass, including the reviewed core source hash and total 274-key ownership. Full TypeScript (/tmp/milo-dutch-core-types.log), scoped lint and whitespace checks pass. No runtime activation or build required for staged-only copy. Fluent/rendered, end-to-end and release acceptance remain open.


## Setup/services/audit screen follow-up

At a712c08, authored 71 messages across three complete screen namespaces. Publishing copy distinguishes approval from publication, preserves retired approval-trigger behavior and explains configured secrets without containing any actual secret. Audit copy distinguishes homepage/context assessments from observed rankings, technical crawling and measured performance. The literal URL schemes, placeholders and five-finding limit are preserved.

All seventeen Dutch/catalog tests pass, including current source fingerprints and total 345-key ownership. Full TypeScript (/tmp/milo-dutch-screens-types.log), scoped lint and whitespace checks pass. Staged only; remaining copy, fluent/rendered review and real-use acceptance remain open. Continue with analytics, billing and evidence screen groups.
