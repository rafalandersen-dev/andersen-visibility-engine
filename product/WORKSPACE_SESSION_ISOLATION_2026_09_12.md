# Workspace read session isolation — 12 September 2026

Prepared on the candidate branch after `b7c4bc9`; unreleased.

## Defect and correction

`hydrateForUser` reset the visible store before reading, but did not verify that its request still belonged to the current session before applying the response. A delayed success could restore a previous account after sign-out or overwrite the next account's workspace. A delayed failure could replace a newer successful load with the previous account's error shell. Legacy reads and backfill completions had the same client-state race.

The store now advances a lifecycle counter on hydration attempts and reset. Hydration checks both the counter and account before processing every asynchronous response and before handling an error. Starting hydration clears the old diff baseline. Obsolete legacy reads cannot start a backfill; already-issued requests are not cancelled, but their responses cannot replace current state.

Reload responses now also check the counter, covering sign-out and sign-in to the same account. Entitlement refresh captures the same account/lifecycle identity before its dynamic import and server read; obsolete success or failure cannot replace the current account's displayed subscription. An entitlement refresh without an active store account returns immediately. Current-account failures retain the existing Free Preview fallback. Server entitlement authority is unchanged.

## Verification

Ten new mocked regressions cover old-account hydration success, returned error and rejection; sign-out; competing same-account hydration; delayed legacy read and backfill; reload across same-account sign-in; and obsolete entitlement success/rejection. The cross-account hydration tests also verify that an unchanged subsequent save makes no batch request, proving the saved baseline was not replaced by the stale response.

- Focused store suite: 38 tests across six files passed.
- Complete local suite: 4,806 tests across 327 files passed in 56.11 seconds.
- Full TypeScript check, production build, scoped ESLint and whitespace checks passed.

Test and build logs: `/tmp/milo-session-isolation-regression.log`, `/tmp/milo-session-isolation-types.log`, `/tmp/milo-session-isolation-lint.log`, `/tmp/milo-session-isolation-build.log`.

This is deterministic local evidence for asynchronous read isolation, not real multi-account browser acceptance or an audit of every outstanding save/write path. No account, email, provider, production database, release or deployment operation was performed. Existing security-review/release holds and required real-use acceptance remain. The overall scope and progress estimates are unchanged.
