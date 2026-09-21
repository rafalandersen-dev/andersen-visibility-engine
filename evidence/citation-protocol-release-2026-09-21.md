# Citation protocol production release — 21 September 2026

PR146 reviewed head 1c8f8282a3ffe35eb0a2b3bbd9f944ed8d63822a merged normally as 3b2fe91c9ccd592fda6ef365e0100d669005f78c at05:15:59UTC. Reviewed tree and merged tree have no difference. Codex code/security reviews clean; Claude CI, lock consistency and preview checks passed. Local229 focused /6393 full tests, types, scoped lint and build passed; repository-wide lint limitation remains.

Applied migration20260920190000 once in a guarded transaction with its journal entry. Journal SHA2568b7dc3c637a3dd250dccdb04e695e9c32596fd8ef2a4aa63244b65b866fd9899 matches approved source. /tmp/milo-p2-guarded-apply-20260921.sql is now APPLIED: NEVER replay. The old20260920 script remains stale.

Lovable synced merge3b2fe91c before single deployment e2fd3a55-c552-446d-94aa-1a9cf58b7190. Public https://milogrowth.com/api/app-version reports build1789967836857, revision3b2fe91c, fingerprint0287f1edf78fa9dcf65ff64d53e7dc497d0afa3bd47013fc61c459cebdf0ce19. All source component hashes match /tmp/milo-p2-approved-identity-20260921.json. Runtime response preserved /tmp/milo-p2-live-version-20260921.json.

Production DB checks: all three protocol tables have RLS and no direct SELECT for anon/authenticated/service_role. Five public RPCs reject anon/authenticated privileges; service_role can execute. Pure citation_ctx_run/citation_ts_ms helpers reject anon/authenticated but are callable by service_role; no claim that all internal functions are revoked from service. Owner-scoped read_citation_protocol for existing synergy project succeeds with panels0, brandRuns0, answers array. An initial read using a conversation ID in the project argument correctly failed knowledge_project_unavailable; no write occurred. Unauthenticated POST /api/milo/run returns401.

No consumer measurement, panel approval, provider call, publishing replay or paid data purchase. Owner pilot approval still pending. This is storage/backend release verification, not full UI, four-week real-use acceptance or concurrency proof. P3 remains separate and unapplied. USD50/month and manual free-account AI grants remain required.
