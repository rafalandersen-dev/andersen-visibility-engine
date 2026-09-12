# European Portuguese interface authoring — 12 September 2026

Started on candidate source `8f057b2`. Portuguese remains excluded from the runtime catalog and language picker. This is partial translation authoring, not delivered Portuguese UI support.

## Coverage

274 of 3,768 current English messages are authored across three of the existing 28 catalog groupings: core (202), authentication (42), and shared controls (30). Coverage includes app shell/navigation, onboarding, project setup labels, language/market labels, goals, pipeline statuses, sign-in/signup/password recovery, dialogs and navigation controls. The remaining 3,494 messages are not authored. The four active interface languages remain English, Polish, Swedish and Danish; French, German, Spanish and Italian remain separately staged.

European Portuguese terminology includes guardar, ficheiro where applicable, faturação, subscrição, definições and terminar sessão. Interface and content-language labels remain distinct. The latest load-error correction is included. Placeholders and fixed numbers are preserved. Existing English source claims such as onboarding foundation completion and pipeline live-state meanings still require their recorded behavioral review; translation does not independently verify them.

## Checks and acceptance

The registry records source `8f057b2` and the reviewed core source fingerprint. Tests require exact key coverage for the declared namespaces, nonempty text, matching placeholders/numbers/URLs, source-change detection, unique key ownership and exclusion from runtime registration. The partial registry explicitly has fewer keys than English; full-catalog parity must replace that partial assertion once authoring is complete.

27 focused tests across three files pass after the authentication/shared-controls addition. New files pass scoped ESLint and whitespace checks. No fluent-speaker, rendered-screen, accessibility or actual locale acceptance is claimed. Next authoring groups are the setup, services and audit screens, followed by the remaining screen/workflow groups. Do not enable Portuguese before full coverage, reviewed source claims and required quality acceptance.

No external translation/model provider, account, email, production database or deployment operation occurred. Release review holds, full R00–R24/D01–D08 scope and reported overall/implementation estimates remain unchanged.

Full TypeScript and production build passed. Logs: `/tmp/milo-portuguese-core-types.log`, `/tmp/milo-portuguese-core-build.log`.

Authentication/shared-controls follow-up uses source `a95a276` and separate reviewed fingerprints. It preserves conditional account-recovery wording, password-length values and provider/plan/count placeholders. Existing 24-language email delivery and the independent email selector are unchanged. Scoped lint and whitespace checks pass; these staged-only additions are not imported by the application.

The follow-up also passes full TypeScript (`/tmp/milo-portuguese-auth-types.log`). The production build was not repeated for these isolated staged catalogs; the build result above belongs to the initial core batch.
