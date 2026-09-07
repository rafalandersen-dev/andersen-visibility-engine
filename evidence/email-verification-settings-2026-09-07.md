# Explain operational email verification before opt-in

#87 verifies the current account address before digest delivery, including the administrative-email-change case where a previous confirmation timestamp remains. The settings screen still showed only global transport readiness and allowed an opt-in that would later defer at recipient preflight.

A shared read-only Auth check now reports verified, unverified or unavailable. The settings response returns only this status, never the address or identity payload; delivery reuses the same check before suppression and unsubscribe-token work. Missing or malformed evidence still cannot authorize a recipient. Settings reads do not create unsubscribe tokens or call an email transport.

Enabling summaries requires global activation and a fresh verified-address check immediately before the existing caller-scoped preference RPC. A changed address since the earlier settings read is rejected. Disabling summaries remains available even if transport is off or Auth verification cannot be read. The request schema rejects injected recipient/account fields. Existing delivery-time checks remain necessary because opt-in does not freeze later account state.

The PL/EN/SV/DA settings panel explains unverified versus temporarily unavailable status, offers a fresh check and keeps the off action available. Administrative changes without a confirmation link point to support rather than inventing an already-completed verification. This packet does not implement a new verification transport, send a link, change an account or enable preferences in production. The existing owner-approved manual test remains unsent pending Safari coordination.

Thirteen added cases cover read-only address status, unavailable Auth, authenticated settings access, response minimization, opt-in after an address change, both failure states, the global activation gate, always-available opt-out and rejected client overrides. All54 focused recipient/delivery/settings cases pass. Full-suite, types, production-build and focused-lint results are recorded with the PR. No database migration.
