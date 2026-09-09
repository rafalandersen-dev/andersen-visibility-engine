# Restricted AI expense admission

Date: 2026-09-08. Base: PR #97 merge `b49964cc483b6d3b5c9f1a59f43f27248309e634`.

## Problem and implementation

The owner authorized at most one scan, one article and one image within USD5. Funding an ordinary monthly account/global budget would also authorize existing background generation. A restricted budget now requires a preallocated, administrator-issued attempt identity before reserving any money.

`ai_expense_budgets.requires_permit` defaults to false, preserving existing unrestricted admission. If either the global or account budget requires a permit, every request without one is denied. A permit binds an exact request UUID, user UUID, job UUID, UTC month, provider, model, operation and reservation amount, and has an expiry and revocation flag. An existing but mismatched permit is denied even on an unrestricted budget. Expiry is evaluated after acquiring locks.

The existing seven-argument `reserve_ai_expense` RPC and global → account lock order are preserved. The request insertion consumes the one attempt and increases both reservations in the same transaction. Budget absence, pause or exhaustion still refuses admission. The original request row prevents retries after failure, uncertainty, zero-cost settlement and migration reapplication; cost settlement never creates another permit. Permits do not replace bounded transport, customer allowances, content review or publication authorization.

The native provider adapter accepts optional preallocated attempt IDs from trusted server code. Current browser, MCP and scheduler handlers still construct their own identity and do not accept or forward this option. No route for issuing permits or executing a benchmark was added. Anonymous and signed-in users cannot read, mint or modify permits or call the privileged reservation RPC.

## Validation and limits

- 1,982 tests across 139 files passed, including 80 focused ledger/provider/permit cases. The new SQL cases execute the migrations in PGlite and verify three admitted operations, denied background work, both budget scopes, exact identity/model/operation/amount/month binding, revoked/expired permits, retained budget controls, upgrade preservation and direct role privileges.
- Existing expense tests also run after the new migration, covering unknown expense retention, evidenced settlement and overrun pauses. Adapter tests verify no supplier call after permit denial and reuse of the preallocated identity without a second supplier invocation.
- TypeScript, focused lint of every changed TypeScript module, production build and whitespace checks passed. This is synthetic local verification; it does not claim a live supplier result or a multiconnection production concurrency stress test.
- No prices, transport bounds, dependencies, keys, customer data or publication rules changed. The migration itself provisions no budgets and no permits. No paid API call or email was sent.
- Final release reconciliation, recorded 9 September from PR #98: reviewed and merged as `c99a398177b55828e2e8e642a59304fd85421859`; migration applied and verified 8 September; deployment `6836d9f2-38c3-44eb-8163-d6990fe1b3bd`, build `1788901947226`, fingerprint `1045bfb5005a289e1806ea134f76ec45025a1a9bd5a9ba25749b0da18a4bc0ae`. Same live fingerprint rechecked 9 September. Latest recorded counts zero budgets/permits/attempts. A controlled benchmark runner and secure OpenAI configuration still precede funding.

## Provisioning boundary

Do not fund the owner's ordinary budget first. Once a secure OpenAI connection and isolated runner are ready, provision restricted global/account budgets and exactly three bound permits in one administrative transaction, using fresh server-owned request IDs and a short explicit expiry. Preserve the already authorized USD5 aggregate ceiling; do not increase shared workspace limits or issue automatic replacement attempts. Existing production budgets must be inspected before any mutation. A timeout or uncertain supplier outcome stops the benchmark and retains its reservation for independent billing reconciliation.

The current direct-model reserves remain USD0.50 per text attempt and USD0.10 for the image, retained until actual expense is verified. These are admission allocations based on fixed request bounds and documented rate assumptions, not supplier invoices. Reverify the chosen model/rate contract before funding; see `native-provider-expense-2026-09-08.md`.

The latest OpenAI target lookup after the owner's “oki i did it” still returned UNAUTHORIZED / openai_platform_authentication_failed. One question is pending about the visible OpenAI Platform connection status; no further picker launch, key creation or secret write occurred. The temporary Synergy account exception and USD5 authorization remain valid. Stripe remains deferred; the approved operational email test is already consumed. Full R00–R24/D01–D08 and public launch remain incomplete.
