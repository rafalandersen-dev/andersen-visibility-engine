# Internal AI expense reservation foundation

Date: 2026-09-07. Scope R09. Owner: Rafal Andersen. Executor: Codex.

## Implemented

Additive `20260907140000_ai_expense_reservations.sql` introduces service-role-only internal monetary budgets and provider requests, with RLS and no client grants. Money is integer millionths of USD. Budgets are explicit per UTC month, globally and per account; the migration creates no funded budgets, prices, subscriptions, or provider calls.

Reservation locks the global budget then the account budget before deciding. Each stable request UUID permits only one execution. Account, job, provider, model and operation are recorded without prompts or response text. Missing/paused/exhausted budgets fail closed. Reconciliation moves known cost into spent, releases only the unused reserved amount, and is idempotent with conflict detection. Failed/unknown requests retain their full reservation; no expiry automatically refunds uncertain supplier work. A measured overrun is recorded honestly and pauses both account and global budgets.

The server wrapper validates reservation confirmation before invoking its callback exactly once. It supplies an abort signal, retains usable output when accounting is unavailable, and leaves the reservation intact. Provider exceptions are not classified as zero cost. No raw supplier errors or content are logged by this wrapper.

## Limits and integration gate

This foundation is not yet called by production text/image functions. It therefore does not claim that every provider expense is currently tracked or monetarily capped. The reviewed migration remains unapplied to production. Activation requires all of:

1. Server-owned, verified per-model cost ceilings; the caller must enforce model, maximum input/output and tool restrictions that justify its reserve. Never accept price, ceiling, account or provider from an untrusted client.
2. Provider usage/request-ID adapters and known-versus-unknown cost evidence, including image generation. Unknown cost remains reserved; no assumed zero. No automatic replay of timed-out callbacks.
3. Explicit budget provisioning and an owner-approved bounded real-provider acceptance run.
4. Real independent-session contention tests for this new ledger (PGlite SQL tests use one serialized connection).
5. Separate customer result-allowance reserve/deliver/refund design; internal expense settlement does not consume or refund a customer's article result.

Calendar month is deliberately an internal cost-safety window. It does not yet implement Stripe billing periods or customer allowance resets.

## Pricing evidence and required owner input

On 2026-09-07, source uses `google/gemini-3-flash-preview` through Lovable for standard text. [Google's published standard pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3-flash-preview) is $0.50 per million text input tokens and $3.00 per million output tokens including thinking. Those are direct provider reference rates, not verified invoiced Lovable cost.

[Lovable's AI documentation](https://docs.lovable.dev/features/ai#usage-and-pricing) says app AI consumes credits and provides per-request model, tokens, credit cost and duration in More → AI. The actual workspace credit conversion, charged usage and any account-specific adjustments were not exposed by the connected tools. Cancellation may still incur usage. No margin or customer package price is inferred from the direct Google tariff.

Concrete dependency: workspace owner can inspect Milo project More → AI and Settings → Plans & credit usage → Usage details → Run credits. Only aggregate/model/token/credit/duration metadata and effective credit pricing are needed; prompts, response bodies, keys and private customer details must not be shared. Browser inspection is currently blocked by the computer-use admin-policy verification failure; connected API lacks these cost-history endpoints.

Proposed first acceptance envelope (not authorized spending): existing owner project, at most one onboarding extraction, one article and one image, no publication/email/orders, global and owner-account ceiling USD 5 total, no top-up or new subscription. Actual reserve per operation must first be justified from verified gateway pricing. This is a bounded test allowance, not a production customer budget or selected package price.

## Other completed release work

PR #66 merged as `41aaf64`; 1,303 tests, TypeScript and production build passed before merge. It adds enforced onboarding usage with metadata/manual fallback and text timeout/no automatic retry. Lovable synchronization/publication of that new merge is tracked separately.

Existing `claim_ai_usage` real-database acceptance: eight concurrent connected SQL requests produced eight distinct PostgreSQL backend IDs; exactly three allowed with cap 3, five refused, final used=3. Only one synthetic non-customer row was created and deleted with an exact user/period/bucket/used match. No paid AI, customer allowance or provider order involved.

## Validation

31 new tests currently pass: actual SQL migration/permissions/amounts/duplicate settlement/unknown expense/overrun/ownership plus server reservation errors, output preservation, one-attempt callback and deadline signaling. Full suite: 1,334 tests across 102 files; TypeScript, production build and focused lint pass. This is not a claim of live monetary-budget enforcement.

## Refreshed foundation validation

Merged current main #74 into the foundation branch without rewriting published history; preserved main CURRENT_STATE over the outdated branch version. Full 1,455 tests across112 files, TypeScript and production build pass. Existing31 ledger cases still pass with notifications and scheduler recovery changes. Production provider wiring, verified rates, funded budgets, monetary migration and independent-session monetary acceptance remain unapplied/unverified. No paid operation was performed.
