# On-page Review localization — 12 September 2026

Status: prepared and locally validated, unreleased. Security-review quota is exhausted on PR135, so no additional review request is issued for this UI batch yet. No migration or deployment has been performed.

The page adds29 messages in English, Polish, Swedish and Danish, plus matching staged French. It reuses released intent, content-type, priority and action labels from the Plan/readiness catalogs. The current candidate has3,081 keys in each current dictionary and staged French, across16 French authoring batches. French remains outside the runtime and picker.

The no-project and configured views consistently use On-page Review. The page distinguishes this homepage/business-input assessment from its separate technical crawl, indexing, performance and location panels. The actual readable-page versus business-input-only condition remains `audit.fetchedWebsite`; supplied notes, summaries and recommendations are preserved. Score direction is explained without calling the scores measured technical results. Fallback messages, grouped category labels, severity, estimates and opportunity actions use the selected language. The bulk button describes the existing maximum of five unconverted high/medium-priority findings, and the completion toast preserves the returned count.

No input value, URL, provider call, saved category, score calculation, conversion rule, publishing permission or schedule changes. The example URL and the SEO abbreviation remain literal. Route metadata, shared service errors, supplied/generated content and actual fluent/signed-in acceptance remain outside this extraction.

Validation:161 focused localization/source/public-fetch/homepage checks across11files, full TypeScript, zero-diagnostic changed-file lint and production build pass. Logs `/tmp/milo-ui-audit-{focused,types,lint,build}.log`. Static source triage `/tmp/milo-ui-audit-embedded-inventory.json` finds only the example URL and SEO abbreviation in this route. This inventory is not exhaustive UI or real-use acceptance. Final exact-head review and both-runtime CI remain required before release.

PR134 and earlier releases are already complete; do not repeat their deployment. PR135 competitor source binding remains unmerged because the security-review service reported its usage limit (comment5644046082), despite clean code review and passing CI. Do not retry an unchanged quota condition or treat it as approval.

Overall60% / implementation75% estimates (weighted58.25% /73.5%) remain unchanged. Full R20 languages, selective loading, reports/policies, actual quality acceptance and the wider full-goal dependencies remain open. Paid launch remains NO-GO.
