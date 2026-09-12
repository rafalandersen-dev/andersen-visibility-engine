# European Portuguese interface authoring — 12 September 2026

Started on candidate source `8f057b2`. Portuguese remains excluded from the runtime catalog and language picker. This is partial translation authoring, not delivered Portuguese UI support.

## Coverage

785 of 3,768 current English messages are authored across eleven of the existing 28 catalog groupings: core (202), authentication (42), shared controls (30), setup screen (24), services screen (18), audit screen (29), analytics screen (36), billing screen (54), evidence screen (89), Plan screen (113) and editor screen (148). Coverage includes app shell/navigation, onboarding, project setup labels, language/market labels, goals, pipeline statuses, sign-in/signup/password recovery, dialogs and navigation controls. The remaining 2,983 messages are not authored. The four active interface languages remain English, Polish, Swedish and Danish; French, German, Spanish and Italian remain separately staged.

European Portuguese terminology includes guardar, ficheiro where applicable, faturação, subscrição, definições and terminar sessão. Interface and content-language labels remain distinct. The latest load-error correction is included. Placeholders and fixed numbers are preserved. Existing English source claims such as onboarding foundation completion and pipeline live-state meanings still require their recorded behavioral review; translation does not independently verify them.

## Checks and acceptance

The registry records source `8f057b2` and the reviewed core source fingerprint. Tests require exact key coverage for the declared namespaces, nonempty text, matching placeholders/numbers/URLs, source-change detection, unique key ownership and exclusion from runtime registration. The partial registry explicitly has fewer keys than English; full-catalog parity must replace that partial assertion once authoring is complete.

35 focused tests across three files pass after the Plan/editor addition. New files pass scoped ESLint and whitespace checks. No fluent-speaker, rendered-screen, accessibility or actual locale acceptance is claimed. Next authoring groups are public home, pricing and case studies, followed by the remaining screen/workflow groups. Do not enable Portuguese before full coverage, reviewed source claims and required quality acceptance.

No external translation/model provider, account, email, production database or deployment operation occurred. Release review holds, full R00–R24/D01–D08 scope and reported overall/implementation estimates remain unchanged.

Full TypeScript and production build passed. Logs: `/tmp/milo-portuguese-core-types.log`, `/tmp/milo-portuguese-core-build.log`.

Authentication/shared-controls follow-up uses source `a95a276` and separate reviewed fingerprints. It preserves conditional account-recovery wording, password-length values and provider/plan/count placeholders. Existing 24-language email delivery and the independent email selector are unchanged. Scoped lint and whitespace checks pass; these staged-only additions are not imported by the application.

The follow-up also passes full TypeScript (`/tmp/milo-portuguese-auth-types.log`). The production build was not repeated for these isolated staged catalogs; the build result above belongs to the initial core batch.

Setup/services/audit follow-up uses source `30eef6d` with individual reviewed fingerprints. It preserves approval versus publication, secrets configured at the destination, one-page/context scope, unread-page fallback, and indicative scores versus technical measurements. All 71 added messages pass source/key/parameter checks, scoped lint and whitespace validation. They remain excluded from runtime.

Full TypeScript passes for this follow-up (`/tmp/milo-portuguese-setup-types.log`). Production build was not repeated for these isolated staging files; prior build evidence remains tied to the initial core batch.

Analytics/billing/evidence follow-up adds 179 messages using source `2d9acd2` with individual reviewed fingerprints. Copy preserves recorded events versus visitors, clicks versus completed sales/bookings, limited event windows, estimates versus measured rankings, failed-fetch uncertainty, legacy billing portal conditions, separate publisher purchase approval and configured/on-demand feature conditions. Portuguese uses “50 000” for the source 50,000-event limit. Email-address preservation is now checked alongside URLs and placeholders. Full TypeScript and scoped lint pass; no production build rerun for isolated staging files (`/tmp/milo-portuguese-evidence-types.log`).

Plan/editor follow-up adds 261 messages using source `13cb098` and separate reviewed fingerprints. It retains work-target/publication distinctions, sample labels, draft/opportunity linkage, orphan-schedule warnings, required link resolution, controlled image origins and approval-to-public-URL semantics, schema limitations, source validation states, and separate content language. All 35 focused checks, scoped lint and whitespace checks pass. Translation is not independent verification of all underlying source claims, including author guarantees; the staged activation review remains required.

Full TypeScript passes (`/tmp/milo-portuguese-plan-editor-types.log`). The production build was not repeated for these isolated staging files; prior build evidence remains tied to the core batch. No live provider, account, publication or deployment action occurred.
