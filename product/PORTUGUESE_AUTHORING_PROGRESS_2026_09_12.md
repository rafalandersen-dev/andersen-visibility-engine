# European Portuguese interface authoring — 12 September 2026

Started on candidate source `8f057b2`. Portuguese remains excluded from the runtime catalog and language picker. This is partial translation authoring, not delivered Portuguese UI support.

## Coverage

2,216 of 3,768 current English messages are authored across twenty-one of the existing 28 catalog groupings: core (202), authentication (42), shared controls (30), setup screen (24), services screen (18), audit screen (29), analytics screen (36), billing screen (54), evidence screen (89), Plan screen (113), editor screen (148), public home (100), public pricing (40), public studies (30), beta controls (88), beta guidance (125), public beta (100), configuration (220), collaboration (248), knowledge (242) and technical guidance (238). Coverage includes app shell/navigation, onboarding, project setup labels, language/market labels, goals, pipeline statuses, sign-in/signup/password recovery, dialogs and navigation controls. The remaining 1,552 messages are not authored. The four active interface languages remain English, Polish, Swedish and Danish; French, German, Spanish and Italian remain separately staged.

European Portuguese terminology includes guardar, ficheiro where applicable, faturação, subscrição, definições and terminar sessão. Interface and content-language labels remain distinct. The latest load-error correction is included. Placeholders and fixed numbers are preserved. Existing English source claims such as onboarding foundation completion and pipeline live-state meanings still require their recorded behavioral review; translation does not independently verify them.

## Checks and acceptance

The registry records source `8f057b2` and the reviewed core source fingerprint. Tests require exact key coverage for the declared namespaces, nonempty text, matching placeholders/numbers/URLs, source-change detection, unique key ownership and exclusion from runtime registration. The partial registry explicitly has fewer keys than English; full-catalog parity must replace that partial assertion once authoring is complete.

45 focused tests across three files pass after the technical addition. New files pass scoped ESLint and whitespace checks. No fluent-speaker, rendered-screen, accessibility or actual locale acceptance is claimed. Next authoring covers measurements, followed by the remaining content, growth, evidence and workflow groups. Do not enable Portuguese before full coverage, reviewed source claims and required quality acceptance.

No external translation/model provider, account, email, production database or deployment operation occurred. Release review holds, full R00–R24/D01–D08 scope and reported overall/implementation estimates remain unchanged.

Full TypeScript and production build passed. Logs: `/tmp/milo-portuguese-core-types.log`, `/tmp/milo-portuguese-core-build.log`.

Authentication/shared-controls follow-up uses source `a95a276` and separate reviewed fingerprints. It preserves conditional account-recovery wording, password-length values and provider/plan/count placeholders. Existing 24-language email delivery and the independent email selector are unchanged. Scoped lint and whitespace checks pass; these staged-only additions are not imported by the application.

The follow-up also passes full TypeScript (`/tmp/milo-portuguese-auth-types.log`). The production build was not repeated for these isolated staged catalogs; the build result above belongs to the initial core batch.

Setup/services/audit follow-up uses source `30eef6d` with individual reviewed fingerprints. It preserves approval versus publication, secrets configured at the destination, one-page/context scope, unread-page fallback, and indicative scores versus technical measurements. All 71 added messages pass source/key/parameter checks, scoped lint and whitespace validation. They remain excluded from runtime.

Full TypeScript passes for this follow-up (`/tmp/milo-portuguese-setup-types.log`). Production build was not repeated for these isolated staging files; prior build evidence remains tied to the initial core batch.

Analytics/billing/evidence follow-up adds 179 messages using source `2d9acd2` with individual reviewed fingerprints. Copy preserves recorded events versus visitors, clicks versus completed sales/bookings, limited event windows, estimates versus measured rankings, failed-fetch uncertainty, legacy billing portal conditions, separate publisher purchase approval and configured/on-demand feature conditions. Portuguese uses “50 000” for the source 50,000-event limit. Email-address preservation is now checked alongside URLs and placeholders. Full TypeScript and scoped lint pass; no production build rerun for isolated staging files (`/tmp/milo-portuguese-evidence-types.log`).

Plan/editor follow-up adds 261 messages using source `13cb098` and separate reviewed fingerprints. It retains work-target/publication distinctions, sample labels, draft/opportunity linkage, orphan-schedule warnings, required link resolution, controlled image origins and approval-to-public-URL semantics, schema limitations, source validation states, and separate content language. All 35 focused checks, scoped lint and whitespace checks pass. Translation is not independent verification of all underlying source claims, including author guarantees; the staged activation review remains required.

Full TypeScript passes (`/tmp/milo-portuguese-plan-editor-types.log`). The production build was not repeated for these isolated staging files; prior build evidence remains tied to the core batch. No live provider, account, publication or deployment action occurred.

Public-page follow-up adds 170 messages using source `eaaa8d4` and individual reviewed fingerprints. It preserves payment/supplier holds, plan-count placeholders, independent billing-market eligibility, no guaranteed rankings/traffic/revenue/citations, and unverified case-study outcomes. The English home-page AI tracking, broad retention and related product claims remain flagged for source review before activation; this translation does not verify them. All 38 focused checks, scoped lint and whitespace checks pass.

Full TypeScript passes (`/tmp/milo-portuguese-public-types.log`). No production build rerun for isolated staging files. No publishing, billing, account or provider operation occurred.

Beta follow-up adds 313 messages using source `1c5978d` and individual reviewed fingerprints. Owner-only scope, independently selected outreach languages, original CSV fields, proposed targets/pricing, authorization requirements and paid-launch holds remain explicit. The public beta language-coverage sentence still lists the four active languages accurately; it must be reviewed if activation changes that coverage. No outreach template, CSV data, price configuration or runtime route was changed. All 41 focused checks, scoped lint and whitespace checks pass.

Full TypeScript passes (`/tmp/milo-portuguese-beta-types.log`). No production build rerun for these isolated staging files; no actual account, contact, payment, provider or deployment operation occurred.

Configuration follow-up adds 220 messages using source `8446b55` and a reviewed fingerprint. It preserves WordPress/Shopify credential handling guidance, approval versus publishing, optional catalog permissions, separate MCP read/write/propose scopes, token revocation, supplied-claim uncertainty and exact-URL coverage linkage. The 2,000-character source limit is formatted “2 000” in Portuguese. Existing absolute brand/credential/connector source claims still require activation review; translation does not independently verify those contracts or current vendor setup instructions. All 42 focused checks, scoped lint and whitespace checks pass.

Full TypeScript passes (`/tmp/milo-portuguese-configuration-types.log`). No production build rerun for isolated staging files. No account, credential, provider, publication or deployment operation occurred.

Collaboration follow-up adds 248 messages using source `94b72ee` and a reviewed fingerprint. It preserves project roles, invitation expiry and separate email sending, approval policies and exact-version review, historical recovery records versus verified destinations, shared preparation attempts versus completed articles, and independent email language/consent settings. All 43 focused checks, scoped lint and whitespace checks pass.

Full TypeScript passes (`/tmp/milo-portuguese-collaboration-types.log`). No production build rerun for isolated staging files. Portuguese remains excluded from runtime; no live invitation, email, publication, provider or deployment operation occurred.

Knowledge follow-up adds 242 messages using source `bf3dd15` and a reviewed fingerprint. It preserves source-reported facts versus independent verification, exact-version knowledge review versus publication approval, forgotten evidence limits, source expiry and conflict holds, owner-field precedence, document extraction limits, weekly recovery semantics and actual queue entries versus saved drafts. Fixed limits remain unchanged, with 2,000 characters formatted as “2 000”. All 44 focused checks, full TypeScript (`/tmp/milo-portuguese-knowledge-types.log`), scoped lint and whitespace checks pass.

No production build rerun for isolated staging files. No live source retrieval, document upload, generation, approval, publication or deployment occurred. This translation does not independently validate the underlying source contracts; fluent-speaker, rendered-screen and real-use acceptance remain open.

Technical follow-up adds 238 messages using source `c008772` and a reviewed fingerprint. Copy preserves DNS ownership expiry, crawl/sitemap boundaries and partial evidence, unchanged observations after opportunity edits, saved Google index evidence versus live inspection, unknown outcomes without automatic retries, and field measurements versus laboratory performance. Numeric limits and units are retained; 2,000 URLs is formatted “2 000”. All 45 focused checks, full TypeScript (`/tmp/milo-portuguese-technical-types.log`), scoped lint and whitespace checks pass.

No production build rerun for isolated staging files. No DNS change, crawl, Google request, performance-provider call or deployment occurred. The translation does not independently verify implementation or current vendor behavior; fluent/rendered acceptance and release gates remain.
