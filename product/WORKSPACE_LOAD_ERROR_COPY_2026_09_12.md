# Workspace load-error accuracy — 12 September 2026

Prepared after `b8d12bc`; unreleased.

The shared load-error body stated that data was safe and identified a backend connection failure. The hydration catch also handles other read/backfill/processing failures and does not establish data integrity, so neither assertion was justified by this error screen.

The body now asks the user to retry, suggests reconnecting only if offline, and explains that saving is disabled until the workspace loads. This matches the `hydrated: false` failure state and save guards. Retry behavior is unchanged.

The correction covers English, Polish, Swedish and Danish runtime catalogs and staged French, German, Spanish and Italian. Only `shell.loadError.body` changes; keys, placeholders, runtime language availability and content/email language settings are unchanged. The composed English core source was verified against its prior fingerprint before editing, and German/Spanish/Italian core fingerprints were updated for this reviewed source change only. The French staging checks do not use that fingerprint mechanism.

All 185 catalog and workspace persistence checks across 13 files pass, including staged key/placeholder/source consistency and hydration failure behavior. No new tests were added for the wording change. Fluent-user and rendered error-screen acceptance remain open. No account, provider, database or deployment operation occurred; full scope, progress estimates and release holds remain unchanged.

Full TypeScript and production build pass. Logs: `/tmp/milo-load-error-copy-types.log`, `/tmp/milo-load-error-copy-build.log`. Whitespace validation passes; unrelated dictionary formatting was preserved.
