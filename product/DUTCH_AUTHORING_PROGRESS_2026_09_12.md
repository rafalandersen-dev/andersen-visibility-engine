# Dutch interface authoring — 12 September 2026

R20 requires full EU-language coverage. Dutch authoring has begun with 72 of the current 3,768 English interface messages (3,696 remain). This is a partial staged catalog; Dutch is not registered in UI_CATALOGS or the language picker.

## Completed authoring batches

| Batch | Messages | Files |
| --- | ---: | --- |
| Authentication | 42 | src/i18n/staged/nl-auth-screen.ts |
| Shared controls | 30 | src/i18n/staged/nl-shared-ui.ts |

Source reviewed at c0ac84b: auth-screen.ts and shared-ui.ts English entries. The batch registry records source hashes and revision. Copy uses consistent informal Dutch je, werkruimte, wachtwoord and herstellink; placeholders, the eight-character rule and conditional recovery wording are preserved. Monthly-planner positioning remains inherited source copy and needs the same product-positioning review as existing locales.

All thirteen Dutch/catalog tests across two files pass. Checks cover exact namespace keys, reviewed English hashes, nonempty messages, placeholders/numbers/URLs/email preservation, unique ownership, frozen combined catalog and runtime exclusion. Full TypeScript (/tmp/milo-dutch-initial-types.log), scoped lint and whitespace checks passed. No build repeated for unimported staged copy.

Continue with the core shell/onboarding/setup messages, then remaining screen/domain groups using the existing staged catalog grouping. Before activation: complete every message, review fluency and terminology, verify responsive rendered layouts and accessibility, and satisfy the broader interface/content/email/formatting acceptance matrix. Auth text authoring does not prove live signup/recovery, email delivery or account behavior. No runtime activation, provider request, deployment or task handoff occurred. Release holds and the full goal remain unchanged.
