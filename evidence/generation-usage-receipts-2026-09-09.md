# Generation quota receipts — 9 September 2026

R09 implementation packet after #103. Review, migration and deployment are pending. No paid call, funding, email, client publication or historical refund occurred.

## Behavior

Previously, a failed article/image request could consume monthly generation quota despite producing no result. `generateContentCore`, its authenticated wrapper, the older `generateContentAssetFn`, and `generateArticleImageCore` now reserve one unit with a server-owned receipt before provider work. A local prompt error, missing provider configuration, budget refusal, provider/parse failure or image validation/storage error triggers one bounded receipt settlement returning that unit. Empty content output is rejected; Milo no longer fabricates a generic placeholder and counts it as a generated draft.

Successful normalized text, or an image staged privately, retains its one unit. A successful result is returned even if confirmation of its completion marker is unavailable: quota remains reserved and the valid output is not discarded. A failure with unconfirmed settlement keeps its original error and logs only receipt ID/outcome; no refund is promised. No provider retry is performed.

This is **server-side technical-failure accounting**, not complete delivered-result allowance. Browser transport failure, a client-side workspace save failure, process death and long-stalled work still need durable output/recovery and explicit reconciliation. `completed` means this server operation produced its result, not owner approval, publication or durable browser delivery. No new package counts, prices, add-ons, billing periods or historical refund policy are selected. D01 remains open.

## Atomicity, identity and ownership

Migration `20260909150000_generation_usage_receipts.sql` adds `ai_generation_usage_receipts` and two service-only RPCs. It uses the existing `claim_ai_usage` counter transaction: same caps, server entitlements, owner multiplier and enforcement/record-only behavior; old monthly usage is preserved. Only content/image generation uses the new receipts; imported MCP text/images and other usage buckets retain their current behavior.

Receipt identity binds user, original UTC month, bucket, operation, one unit, cap and optional trusted native expense identity. The application supplies a native identity on every path, including legacy generation. Benchmark-preallocated identities remain unchanged. Browser input cannot choose receipt/expense identity or owner. UUID admission serializes duplicate claims. A replay, even of a released or completed receipt, cannot start another provider call. Conflicting identity is refused.

Settlement locks the receipt before conditionally changing the original counter. It releases at most once, preserves other users/months/buckets and does not permit reversal of completed/released/denied states. Missing/corrupt counters fail rather than manufacture a refund. Anonymous/authenticated database roles cannot read, claim or settle receipts. The service role uses RPCs and can inspect receipts, but cannot mutate their table directly.

Quota lookup and settlement each retain a ten-second bound. Unknown quota admission never starts generation and is not blindly refunded; the database could still commit late. A hung operation is not automatically classified as a technical failure. Unknown settlement may also commit later. Operators must inspect the correlated receipt before any manual action.

## Supplier expense remains separate

Quota receipts and native money requests share a server-minted attempt identity. Returning a customer's unit does not delete, refund or relax a native money reservation or restricted test permit. Tests exercise the real native budget adapter with mocked HTTP: a provider error keeps unknown expense, and a paid response later rejected as unusable also keeps its unknown expense while returning the generation unit. This packet does not authorize a new attempt after the owner's three-attempt test permit has been used.

## Verification and release

- Full suite: **2,212 tests / 151 files passed** (+53 cases over #103); TypeScript, production build, focused lint and whitespace checks passed. Existing unrelated formatting/regex debt in `ai.functions.ts` remains; only changed generation blocks were formatted.
- PGlite loads the actual original quota migration, fail-closed replacement and new receipt migration. Cases cover old/new shared caps, zero/record-only limits, identity drift, replay, duplicate settlement, terminal-state reversal, owner/month/bucket boundaries, malformed arguments, integer overflow, corrupt counters and service-only access.
- Server integration covers text/image/legacy wrappers, validation/storage failures, empty output, trusted benchmark identities, browser injection, absent/unconfirmed/replayed claims, failed/late settlement and preserved usable output. Previous quota-timeout tests remain passing.
- PGlite serializes one connection. Actual multi-session PostgreSQL contention and authenticated/live UI acceptance remain unverified. Browser automation's recorded administrator-policy failure remains a boundary.
- Production read-only preflight: receipt table absent; 10 existing `ai_usage` rows totaling 226 units; zero native expense budgets, permits and requests. No counter reset or historical replay/refund.

After review, apply the exact reviewed migration once in a transaction before deploying its application revision. Verify table RLS, RPC grants, lack of direct write grants, unchanged prior usage and empty new receipt registry. Wait for hosting to select the normal merge revision, deploy and compare full/component source fingerprints with the clean merged tree. Do not equate Vercel status with the custom-domain release.

Rollback is an application rollback to #103 while retaining receipts and counters for audit. Do not drop the registry, reset usage, or refund reserved receipts just because they are old: some may have produced valid output or have late database commits. Historical charges cannot be reconstructed reliably from the old aggregate counter alone.

## Release verified — 9 September, 12:34 UTC

This release writeback supersedes the pending procedure above. It was recovered from the implementation worktree during the later documentation reconciliation; no migration or deployment was repeated.

Normal merge `9b2d26b74654ad6cd5e05876ddf1c0f72623a8fa` includes reviewed head `63f28754e1a9834cbf5f455e23621f5d4b965942`. Review 34349698388 succeeded (`is_error: false`) with no inline findings; five reported permission denials limit review completeness. Deployment `1bb89306-cf0b-401e-bdb8-47e7968ca217`, build `1788956633294`, full fingerprint `21b86a318dc2154f741579e4fd70587fe2787177b8676ed9470542a097e09489` and every component match clean source. Runtime reports the exact merge and `modified: false`.

The exact reviewed migration `20260909150000_generation_usage_receipts.sql` was applied once in a transaction. RLS is active; service RPCs/read are allowed, service direct writes and browser roles are denied. New registry has zero receipts; original usage remains 10 rows / 226 units; budgets/permits/native requests are all zero. Do not reapply. Home/MCP GET 200, OPTIONS 204, anonymous POST 401. First HTTP check timed out; subsequent verification passed. No live AI/provider, authenticated UI, funding, email or publication was performed.
