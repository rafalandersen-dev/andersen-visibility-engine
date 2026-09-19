# Publication inspection revision consistency — 12 September 2026

Reviewed candidate 86108ec. The client query key already contains account, project, asset and queue identity. Server inspection validated the owned workspace before querying the scheduled row, but computed draftChanged from that earlier snapshot even if the owner edited or removed the workspace while the query was pending.

Inspection now re-reads the workspace after the queue response and requires its revision to match. A changed/missing workspace returns the existing inspection-unavailable error, allowing a fresh user-requested inspection instead of displaying an outdated draft comparison. This is a bounded consistency check, not a transaction or a guarantee against edits after the final read. It adds one workspace read per successful queue lookup; an unrelated workspace revision change also requires refresh.

Two new cases reproduced the previous stale result and now pass. All 38 inspection tests pass, including scope isolation, malformed queue data, queue-state changes, source-review hints and draft-change comparisons. Full TypeScript (/tmp/milo-inspection-revision-types.log), scoped lint and whitespace checks passed. No full-suite/build repeat for this bounded read-path change.

No external provider/database/deployment operation occurred. Browser/live acceptance, release holds and the full R00–R24/D01–D08 goal remain open.
