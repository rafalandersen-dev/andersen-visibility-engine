# Knowledge impact visibility during reload

ProjectKnowledgePanel already rejects out-of-order responses with its request counter and mounted-state guard. However, its sourceImpact value remains saved while loading or after a failed refresh, and the old impact section was still rendered. This could retain a no-issues result or remount review controls from an older impact response beside the loading/error message.

The impact section now renders only when loading and failure are both false. A fresh successful load still renders affected drafts, history review controls and the no-issues message as appropriate. This changes presentation only; existing server eligibility and mutation checks remain authoritative.

Five focused panel/inspection tests pass. The new three state cases render the real panel with retained impact data, testing both empty and affected results under success, pending and failure. Hook state is supplied by the fixture, so these tests prove conditional rendering rather than network timing or a live browser lifecycle. The first test run failed because the fixture owner ID was not a UUID; the fixture was corrected. Scoped lint, whitespace and full TypeScript pass; type log: /tmp/milo-knowledge-impact-visibility-types.log.

No backend call, real review, generation, publication or deployment occurred. Full real-user acceptance and release holds remain open.
