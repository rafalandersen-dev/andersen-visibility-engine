# Public audit language preference — 12 September 2026

R01/R02/R20 follow-up after reviewing the roadmap at candidate 1652d50. The free audit route detected navigator.language directly during render and ignored the saved public/device language preference used by home/auth. This could change language across navigation and differ between server and initial browser rendering.

The page now uses the shared useAuthLanguage hook: consistent English initial rendering, saved preference after hydration, and the shared four-language selector. The selector is disabled while an audit request is running. Existing audit result language mapping remains tied to the chosen language at request start. Header tagline, Home and Get started now use existing catalog keys, and the website field has an accessible translated name. No new language was enabled and no catalog source changed.

All 33 focused public-audit client/boundary and catalog checks pass, plus full TypeScript, build, scoped lint and whitespace checks. Logs: /tmp/milo-public-audit-locale-types.log and /tmp/milo-public-audit-locale-build.log. These checks do not constitute browser/keyboard or live audit acceptance.

Remaining route work includes English bot-protection/service errors, provider-returned text, static metadata and full responsive/linguistic review. A prior result retains its original generated language if the interface changes later. No audit/provider request, bot configuration or deployment occurred. Release gates remain open.
