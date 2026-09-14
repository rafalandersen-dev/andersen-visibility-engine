# Workspace save session isolation — 12 September 2026

Prepared after `d165705`; unreleased. This extends the read-isolation correction to queued saves and write acknowledgements.

## Problem and behavior

The serialized save queue previously chose the account only when a queued request began executing. After a session change, an old queued request could therefore save the new account's current edits. An in-flight write also guarded its baseline update with only the user ID, so an acknowledgement received after sign-out/sign-in to the same account could replace the new session's baseline and revision. An obsolete not-migrated response could initiate a legacy backfill or retry.

Each explicit save now captures the account and lifecycle counter when requested. It checks that identity before starting and after batch writes, backfill and retries, plus before displaying an asynchronously loaded conflict toast. An obsolete request rejects with a generic session-changed error. It cannot advance the current saved baseline, revision or fallback sequence. The serialized queue remains usable after rejection; a newly requested save persists the current account normally.

Already-issued server writes are not cancelled or rolled back by this client guard. Server authorization remains required. This correction does not claim to resolve every same-session local-edit/reload conflict or to have verified real multi-account browser behavior.

## Evidence

Five new mocked cases cover queued saves after switching accounts, same-account sign-in before an old acknowledgement, obsolete not-migrated responses, and both created/non-created delayed backfill responses. The tests verify absence of unintended requests, preservation of state and diff baseline, and successful subsequent fresh saves.

- Focused store suite: 43 tests / six files passed.
- Complete local suite: 4,811 tests / 327 files passed in 54.68 seconds.
- Full TypeScript check, production build, scoped ESLint and whitespace checks passed.

Logs: `/tmp/milo-save-session-regression.log`, `/tmp/milo-save-session-types.log`, `/tmp/milo-save-session-build.log`. No live account, provider, database, email or deployment operation occurred. Required release review and real-use acceptance remain open. Full scope and progress estimates remain unchanged.
