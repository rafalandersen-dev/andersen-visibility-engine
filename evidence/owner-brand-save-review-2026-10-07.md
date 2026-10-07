# Owner Brand Intelligence save — independent review, 7 October 2026

The candidate on base `543b24d` is accepted for repository review. It fixes the owner editor's silent loss of changes when a profile has more than ten offers or a relative CTA. Production is unchanged; the original Lovable Git connection remains unavailable.

Claude authored implementation, regression tests and the product document in the existing authorized session. Codex independently reviewed correctness, data preservation, session/project isolation, proposal boundaries and locale parity. Review found and resolved failed-save self-conflicts, comma-list corruption, metadata loss and restoration after an unconfirmed row deletion. No unresolved actionable finding remains in the reviewed change. Codex's only documentation integration is this review record and the product document's status/link update.

## Evidence

- Author's final targeted run: 1,151 tests across 48 files, including owner/form/store, source-proposal, MCP profile-fill, pending-actions, workspace-save and all i18n suites. TypeScript, changed-source ESLint, formatting and production build passed.
- Independent final core review: 135 tests across six suites passed. Exact previous failure probes now restore offers, links and rules with their original metadata through the actual save helper. Injected metadata is still refused and competing values stay intact.
- Independent final form/store delta: 14 new CI tests passed, plus explicit probes showing that remembered authority cannot cross a project, same-user session epoch, or stale caller baseline. The prior 35 form/store tests and browser evidence apply to unchanged editor/dependency code.
- Independent TypeScript and production build passed after the final correction. Only the build's own generated route ordering was restored; dependency manifests, proposal schema, general store and MCP/pending-action implementation files are unchanged.
- Independently operated the actual editor and store against an isolated in-page fake backend: mixed changes on 19 offers, relative CTA preservation, deleting to one comma-containing entry, metadata retention and reload; rejected save followed by corrected retry; response lost after commit followed by explicit revert, unrelated save and reload. The final restoration delta is tested through the real store and does not change the mounted editor.
- Locale review verifies exactly seven added messages across four runtime and twenty staged catalogs, updated configuration fingerprints and exact catalog sizes. No language activation or assertion weakening.

## Limits and release

This is local evidence using a fake persistence backend, not a production write or database concurrency test. Conflict detection covers the hydrated client state; whole project rows retain the existing database write semantics. Failed attempts left uncorrected can later be persisted by a workspace save. Newly typed single comma-separated lines keep the documented parsing convention. Staged translations still require fluent review before activation.

The existing Lovable project must be restored to its original repository and its source reconciled before publication. Do not create a replacement repository or publish stale Lovable source. Apply prepared business-profile corrections only after verifying the deployed revision and a real owner-save readback. No provider calls, budget changes, migrations, content publication or schedule changes were part of this code repair.
