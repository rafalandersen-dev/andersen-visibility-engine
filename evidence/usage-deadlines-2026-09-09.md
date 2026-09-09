# Quota lookup deadlines — 9 September 2026

Base: PR #101 merge `806636237f4f7ae89baef090759de92da6e4d3ec`. Implemented and locally verified; review/release pending.

Entitlement/owner reads, atomic usage claims and remaining-usage reads now have a ten-second deadline per lookup. An unconfirmed timeout raises the existing safe usage-unavailable error. Late entitlement answers cannot claim quota; a late quota confirmation cannot start text/image generation after the caller has already been refused. The image entitlement gate has the same bounded wait. Enforcement and beta record-only modes both require confirmed admission.

This bounds caller waiting; it does not assert that an in-flight database operation was cancelled. An uncertain late claim may have committed and is not automatically refunded. Existing caps, monthly counters, owner ceilings and monetary admission remain unchanged. Delivered-result customer allowances/refunds remain a separate required outcome.

Validation: 2,082 tests / 143 files passed, including eight new deadline cases and the real text/image cores after late confirmations in enforced and record-only modes. The affected usage/scheduler selection passed 96/96 before the final full run. TypeScript, production build, focused lint and whitespace checks passed. No database migration, paid AI call, email or customer publication is needed for this packet.

The packet also records verified PR #101 migration/release evidence and removes superseded pending states from the current roadmap. Browser visual acceptance and live OpenAI generation remain open.
