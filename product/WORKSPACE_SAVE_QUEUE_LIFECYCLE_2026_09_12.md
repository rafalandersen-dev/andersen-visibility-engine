# Workspace save queue lifecycle — 12 September 2026

Prepared after `16db651`; unreleased.

The module-wide save promise chain survived sign-out and account hydration. Even with stale-request guards, an unfinished old-account network request could prevent the next session's save from starting until that old request settled.

Reset and new hydration now start a fresh save chain. Queued and in-flight old requests retain their captured lifecycle checks, so they cannot write the new account's edits, start stale fallback operations or apply old acknowledgements. The current session keeps the existing serialized save behavior. This change does not cancel an already-issued server write or add a network timeout.

Two new mocked regressions hold an old save open, queue another old save, switch sessions, and verify the new account's write starts and completes before the old response is released. Both explicit reset/sign-in and direct account-switch paths pass; later old responses reject without affecting the new state or revision. All 52 store tests across six files pass. Scoped lint and whitespace checks pass.

No real account, database, provider, email or deployment operation occurred. Real session-transition acceptance and the release/security-review hold remain open. The full R00–R24/D01–D08 scope and reported progress estimates are unchanged.

Full TypeScript check and production build passed (`/tmp/milo-save-queue-types.log`, `/tmp/milo-save-queue-build.log`). The complete suite was not rerun for this queue-lifecycle change; the prior full-suite result is tied to its recorded commit.
