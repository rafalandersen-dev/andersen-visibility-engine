# Workspace refresh edit preservation — 12 September 2026

Prepared after `c78aed9`; unreleased.

## Defect and correction

Background workspace reload previously replaced the entire client workspace after checking only session identity. Unsaved changes present before the reload or made while it was in flight could be discarded. A delayed reload could also replace state and baseline after a newer save completed, or supersede a more recently requested reload.

Reload now requires a hydrated matching account and a clean persisted diff before fetching. Before applying a response it verifies that the session, request sequence and saved baseline still match, and that there are still no unsaved persisted edits. Only the newest requested reload can apply. Subscription-only display changes are not included in the persisted diff.

Local edits take precedence. A skipped refresh does not automatically retry; a later refresh after saving is required to show newer server state. This is deliberately not a field-level merge or a claim of immediate server-state visibility in a dirty workspace. Existing save conflict handling remains in place.

## Verification scope

Five new mocked cases cover dirty state before refresh and successful refresh after saving, edits during an in-flight read, a completed save during the read, and both completion orders of competing refreshes. Assertions check preserved local values and revisions, unchanged saved baselines, and subsequent save behavior. The focused store suite passes 48 tests in six files; full TypeScript, scoped ESLint and whitespace checks pass.

No actual account, provider, email, production database or deployment operation occurred. Real interactive edit/reload acceptance and the required release review remain open. The full goal and progress estimates remain unchanged.

Final complete regression: 4,816 tests across 327 files passed in 123.41 seconds. Production build passed. Logs: `/tmp/milo-reload-edits-regression.log`, `/tmp/milo-reload-edits-types.log`, `/tmp/milo-reload-edits-build.log`. Optional canvas/polyfill and Node local-storage warnings did not fail the suite; this does not claim native canvas rendering was tested.
