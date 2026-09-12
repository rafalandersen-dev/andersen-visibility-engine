# Dutch interface authoring — 12 September 2026

R20 requires full EU-language coverage. Dutch authoring has begun with 855 of the current 3,768 English interface messages (2,913 remain). This is a partial staged catalog; Dutch is not registered in UI_CATALOGS or the language picker.

## Completed authoring batches

| Batch | Messages | Files |
| --- | ---: | --- |
| Core navigation, onboarding and setup | 202 | src/i18n/staged/nl-core.ts |
| Publishing setup screen | 24 | src/i18n/staged/nl-setup-screen.ts |
| Services screen | 18 | src/i18n/staged/nl-services-screen.ts |
| On-page review screen | 29 | src/i18n/staged/nl-audit-screen.ts |
| Analytics screen | 36 | src/i18n/staged/nl-analytics-screen.ts |
| Billing screen | 54 | src/i18n/staged/nl-billing-screen.ts |
| Evidence screens | 89 | src/i18n/staged/nl-evidence-screen.ts |
| Plan screen | 113 | src/i18n/staged/nl-plan-screen.ts |
| Editor screen | 148 | src/i18n/staged/nl-editor-screen.ts |
| Public pricing | 40 | src/i18n/staged/nl-public-pricing.ts |
| Public case studies | 30 | src/i18n/staged/nl-public-studies.ts |
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


## Analytics/billing screen follow-up

At 770590a, authored all 90 messages in analyticsScreen (36) and billingScreen (54). Analytics distinguishes recorded views from unique visitors, click rates from completed outcomes, and limited event history from all-time results; 50 000 uses space grouping without changing the source limit. Billing preserves plan counts, version labels, the configured-evaluation qualification and billing@milogrowth.com. Existing feature/package and legacy Paddle copy still requires commercial/lifecycle review before activation; no pricing, account, subscription or transport operation was performed.

All nineteen Dutch/catalog tests pass, plus full TypeScript (/tmp/milo-dutch-analytics-billing-types.log), scoped lint and whitespace checks. Total staged coverage is 435; 3,333 messages remain. Evidence screens are next. Runtime activation, fluency/rendered review and full acceptance remain open.


## Evidence-screen follow-up

At fb56499, authored all 89 evidenceScreen messages. Higher competitor scores remain larger estimated gaps, while higher readiness scores indicate better estimated readiness. Retrieved evidence, failed retrieval, one-time analysis, readiness estimates, recorded answers and AI referral visits remain distinct. Brand names, placeholders and numeric limits are preserved.

All twenty Dutch/catalog tests pass, plus full TypeScript (/tmp/milo-dutch-evidence-types.log), scoped lint and whitespace checks. Total staged coverage is 524; 3,244 messages remain. Plan and editor screens are next. No language activation or provider operation occurred; fluent/rendered and real-use acceptance remain open.


## Plan-screen follow-up

At 9099f42, authored all 113 planScreen messages. Work targets remain distinct from publication schedules; accepted suggestions do not themselves generate or publish content. Sample-data labels, partial batch counts, source provenance and the warning about active schedules on orphaned drafts are preserved. Stored lifecycle values and server authority are untouched.

All twenty-one Dutch/catalog tests pass, plus full TypeScript (/tmp/milo-dutch-plan-types.log), scoped lint and whitespace checks. Total staged coverage is 637; 3,131 messages remain. Editor screens are next. No runtime activation or scheduling operation occurred; terminology/fluency/rendered and real-use acceptance remain open.


## Editor-screen follow-up

At 388747e, authored all 148 editorScreen messages. Copy preserves save/unsaved state, image approval/public-URL guidance, reference validation, unresolved-link publication blocks, schema delivery limitations, and the distinction between draft delivery and live publication. Placeholder paths/anchors/claims, metadata limits and the 5 MB limit are retained. Source assertions about author non-invention, recommendation versus hard-block behavior, image privacy and CMS schema handling require behavior review before activation; translation does not certify them.

All twenty-two Dutch/catalog tests pass, plus full TypeScript (/tmp/milo-dutch-editor-types.log), scoped lint and whitespace checks. Total staged coverage is 785; 2,983 messages remain. Public home/pricing/studies groups are next. No runtime activation, upload, provider or publication operation occurred; fluent/rendered and real-use acceptance remain open.


## Public pricing and case-study follow-up

At c4fc095, authored all 70 messages in publicPricing and publicStudies. Pricing preserves paid activation and marketplace holds, supplier acceptance, plan limitations and the distinction between display region and billing eligibility. Case studies preserve internal/demo status and incomplete live acceptance; no growth, traffic, ranking or revenue outcomes are introduced. Existing package and prepared-tracking assertions remain source claims requiring real-use verification before release.

All twenty-four Dutch/catalog tests pass, plus full TypeScript (/tmp/milo-dutch-public-commercial-types.log), scoped lint and whitespace checks. Total staged coverage is 855; 2,913 messages remain. Public home and beta guidance are next. Dutch remains excluded from runtime; fluent/rendered and full real-use acceptance remain open.
