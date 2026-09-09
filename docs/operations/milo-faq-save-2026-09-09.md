# Milo FAQ persistence repair — 9 September 2026

Production reproduction: Andersen UK asset l1558844, Structure FAQ first answer. Edited answer was visible in local form; no Unsaved indication appeared. Save restored the old 2–5% conversion-rate answer. Main reviewed article body/meta and existing publication identity were preserved. Auxiliary FAQ cleanup remains pending until a live save/reload passes.

Claude bounded implementation in codex/milo-faq-save-20260909, base 9b2d26b74654ad6cd5e05876ddf1c0f72623a8fa; scope check passed, exactly three source/test files. Codex independently reviewed full diff. FAQ now participates in dirty detection and save/AI-flush merge through a shared form-owned field list; FAQ changes mark an existing score stale. Current stored publication/scheduling metadata remains authoritative.

Validation: 26/26 editor-form tests PASS, TypeScript noEmit PASS, production build PASS, diff whitespace check PASS. Initial type check with reused older dependencies failed because PGlite was missing; clean npm ci from the unchanged lockfile resolved it, followed by successful checks. No package or lockfile changes. Tests cover question/answer edits, removal, unchanged state, merging other form fields and preservation of current stored publication/scheduling fields over stale local state.

Authority: existing website cleanup and Claude implementation delegation. No email, new content publication, secret/account changes or deployment performed in this milestone. Code ready for PR; production FAQ repair is NOT yet verified. Next: review/merge, verify deployment contains this exact change, then repeat the real FAQ edit/save/reload and complete auxiliary fields for 12 sources.
