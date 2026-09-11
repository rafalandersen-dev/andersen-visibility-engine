# Saved output revalidation — work in progress

The current local change adds authenticated inspection from the affected-draft list in Project Setup. It reads saved owner text, its publication version, durable original knowledge references and current source/record values. The view is temporary, dated, escaped text and cleared on project knowledge reload. It does not retrieve source documents or images, reconstruct forgotten data, approve publication, clear holds or modify provenance.

The reader rejects absent/wrong-project assets before knowledge reads, checks private owner scope, bounds results and refuses a workspace change during loading. Knowledge itself may change after inspection; this is explicitly a dated read, never an authorization token. Existing publication checks still re-read current knowledge.

Remaining implementation for this milestone:

- A durable, service-owned review record bound to exact output/publication version and exact reviewed knowledge state; owner-selected review dispositions must be explicit.
- Show the complete deliverable and relevant current evidence used for the review, including visuals and applicable owner overrides, before accepting any action.
- Recompute state server-side and compare atomically against workspace and knowledge revisions at write time. Recheck at publication, expiry, withdrawal, source replacement, image reuse/removal and content changes.
- Never use a generic approval or silently substitute newer knowledge into old output. Forgotten or unavailable evidence cannot be waived through this workflow.
- Retain bounded history and explicit withdrawal, with private permissions and project deletion cleanup. Do not create a paid regeneration or weaken website-source checks, exact publication approval, timers or spend controls.
- Exercise real server/UI boundaries and SQL race/forget/reuse fixtures; finish review and the standard release gates before deployment. No migration has been written/applied for this milestone.

Local validation so far: 28 tests in the inspection and existing publication suites passed. TypeScript, focused lint and production build also passed. Signed-in visual acceptance and final durable revalidation are not complete. Overall delivery remains approximately 55%; no completion credit assigned to this unfinished milestone.
