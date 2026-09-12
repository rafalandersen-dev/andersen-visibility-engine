# Project Setup localization — 12 September 2026

Status: prepared and locally validated, unreleased alongside the On-page Review and Services & Products batches. Required review remains pending while the known security-review quota is exhausted. No new PR, migration or deployment has been requested for this branch.

The screen adds 24 messages across English, Polish, Swedish and Danish, plus matching staged French. Together the three batches add 71 messages. Each current catalog and staged French contains 3,123 keys; French has 18 authoring batches and remains outside the runtime and language picker.

Required-field and URL validation messages reuse the translated field labels while retaining the existing checks and values. Primary and additional languages explicitly describe content languages. Publishing destination and mode controls translate labels while retaining the original stored values. The copy explains separate approval/publication actions, the distinct custom draft and live endpoints, saving feedback and the retired automatic publishing mode. New-secret wording describes server saving and request-header delivery without making a broader assertion about historical credential storage.

Project writes, credential handling and save ordering, publishing authority, endpoint selection and schedules are unchanged. No credentials were entered, connection tested, article published or provider called. Source inspection confirms custom draft delivery uses publishEndpoint and live publication requires livePublishEndpoint. The existing retired-mode condition remains in place.

Validation: 114 focused checks across 12 files, full TypeScript, changed-file lint with zero diagnostics and production build pass. Logs: `/tmp/milo-ui-setup-{focused,types,lint,build}.log`. The static inventory `/tmp/milo-ui-setup-embedded-inventory.json` retains six direct candidates: URL examples and the Milo name. Conditional controls were reviewed separately. Route metadata, backend error messages, supplied content and actual fluent/signed-in acceptance remain outside this evidence. Required final-head reviews and both-runtime CI still precede release.

Overall progress remains approximately 60%, implementation approximately 75% (weighted 58.25% and 73.5%). These prepared dictionaries do not establish R20 completion or paid-launch readiness.
