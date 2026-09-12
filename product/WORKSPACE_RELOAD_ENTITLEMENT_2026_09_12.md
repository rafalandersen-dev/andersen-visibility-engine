# Workspace reload preserves entitlement display — 12 September 2026

Prepared after `9ea6307`; unreleased.

Workspace reconstruction intentionally discards subscription values from workspace records because only the separate entitlement service is authoritative. Initial hydration follows reconstruction with an entitlement refresh, but a background reload did not. Consequently, a successful content reload cleared the displayed paid subscription until a later entitlement request restored it.

An eligible background reload now retains the current subscription display mirror while replacing workspace data. It reads that mirror when the response is applied, so a newer entitlement downgrade received during the workspace fetch remains in effect. Workspace subscription fields remain ignored. Initial hydration, account/session isolation and server entitlement enforcement are unchanged. Preserving the last verified display does not claim a fresh billing-provider check on each content reload.

Two mocked regressions verify preserved paid display alongside refreshed content and an in-flight authoritative downgrade despite a stale paid value in the workspace response. All 50 store tests across six files and 38 billing/report-interface tests across six files pass. Full TypeScript, scoped ESLint and whitespace checks pass. The earlier 4,816-test full suite belongs to `9ea6307`; it was not rerun for this focused display-state correction.

No actual account, subscription, billing-provider, payment, database or deployment operation occurred. The release review hold, commercial lifecycle acceptance and real multi-account UI acceptance remain open. Full scope and progress estimates remain unchanged.

Production build passed. Type/build logs: `/tmp/milo-reload-entitlement-types.log` and `/tmp/milo-reload-entitlement-build.log`.
