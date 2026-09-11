# Saved output revalidation — work in progress

The current local change adds authenticated inspection from the affected-draft list in Project Setup. It reads saved owner text, its publication version, durable original knowledge references and current source/record values. The view is temporary, dated, escaped text and cleared on project knowledge reload. It does not retrieve source documents or images, reconstruct forgotten data, approve publication, clear holds or modify provenance.

The reader rejects absent/wrong-project assets before knowledge reads, checks private owner scope, bounds results and refuses a workspace change during loading. Knowledge itself may change after inspection; this is explicitly a dated read, never an authorization token. Existing publication checks still re-read current knowledge.

Remaining implementation for this milestone:

- A durable, service-owned review record bound to exact output/publication version and exact reviewed knowledge state; owner-selected review dispositions must be explicit.
- Show the complete deliverable and relevant current evidence used for the review, including visuals and applicable owner overrides, before accepting any action.
- Recompute state server-side and compare atomically against workspace and knowledge revisions at write time. Recheck at publication, expiry, withdrawal, source replacement, image reuse/removal and content changes.
- Never use a generic approval or silently substitute newer knowledge into old output. Forgotten or unavailable evidence cannot be waived through this workflow.
- Retain bounded history and explicit withdrawal, with private permissions and project deletion cleanup. Do not create a paid regeneration or weaken website-source checks, exact publication approval, timers or spend controls.
- Exercise real server/UI boundaries and SQL race/forget/reuse fixtures; finish review and the standard release gates before deployment. Migration `20260911010000_output_knowledge_reviews.sql` is now drafted but UNAPPLIED. It must pass complete integration/review/release gates before use.

Local validation so far: 28 tests in the inspection and existing publication suites passed. TypeScript, focused lint and production build also passed. Signed-in visual acceptance and final durable revalidation are not complete. Overall delivery remains approximately 55%; no completion credit assigned to this unfinished milestone.


## Durable storage progress

The unapplied migration adds one private metadata-only history table and four service RPCs: an atomic context reader, version/context-bound save, explicit withdrawal and bounded history read. Context covers current knowledge, owner brand overrides and retained output references. SQL compares the context hash and locked workspace revision before saving; identical acknowledgements are idempotent, but withdrawn or replaced review IDs cannot be replayed. A trigger withdraws active reviews after saved output or project edits, including edit-then-revert. Foreign keys remove history on project/output deletion. No facts or output text are retained in the history table.

The local inspection now uses the atomic context reader and marks replacement evidence eligible only when every original reference has a currently selected accepted record for that output medium. Forgotten, unavailable, expired, revoked, disputed or incompatible evidence is not eligible. This is eligibility for a future explicit action, not an approval grant. The writer is not yet wired to an authenticated action, and the publication guard does not yet consume reviews. Complete those paths, full deliverable/evidence display, history/withdrawal UI, expiry and authority fixtures before release.

Database fixtures cover owner isolation, permissions, private metadata, acknowledgement replay, workspace/context changes, brand changes, forgotten evidence, replacement history, output movement, deletion and edit-then-revert. These use PGlite and do not establish multi-session production concurrency or signed-in acceptance.

Latest validation: 32 server tests and 10 database tests passed, plus TypeScript and focused lint. One combined run hit the database setup timeout; the isolated database rerun passed. No production migration, deployment or provider call.
