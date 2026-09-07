# Operational email digests — gated delivery packet

September 7, 2026. Continuation of R05/R06 after merged inbox PR #69 (`2738d14495e26e31dba1282764f2ad3eda95607d`). This packet is not full R06 acceptance.

## Implemented behavior

- Account notification page includes explicit opt-in/out and the latest 20 delivery states in EN/PL/SV/DA. Delivery defaults off behind the server `OPERATIONAL_EMAIL_ENABLED=true` gate. Opt-in cannot be enabled through the server action until the release gate is on; opt-out remains available.
- A fresh, revision-matched server scan may atomically enqueue one aggregate per account per hour, at most 50 new incidents. Unique incident membership prevents repeat scans/retries from producing duplicate emails. Read/resolved incidents are not converted to send events. Remaining eligible incidents can enter later bounded batches.
- A claimed digest gets an expiring unique lease. A fresh account scan and confirmed account recipient/suppression/unsubscribe checks precede a final SQL state check. Resolved, moved, read or opted-out work is removed immediately before transport. No browser-supplied email address or third-party recipient is accepted.
- Only the current verified auth email is used. Used unsubscribe tokens block sending; token races re-read the persisted winner. Tokens and addresses are never included in job logs or responses. HTML escapes task text and links only to the authenticated notifications page, where the inbox links to the proper task. Opening a link does not mutate approvals/publication.
- Existing Lovable email transport receives a stable per-digest idempotency key. A successful API acceptance is labeled **accepted by provider**, not delivered to the inbox. A 25-second local wait bounds each provider attempt; the underlying request may still complete after that deadline and is treated as uncertain.
- Only failures before transport retry (15-minute backoff, three attempts). Expired pre-transport leases can be reclaimed, but stale tokens cannot act. A process crash during transport, timeout, provider error/negative response or unavailable reconciliation never causes a blind resend. Those outcomes remain `unknown` or become `unknown` at lease expiry. No provider idempotency-retention duration is assumed.
- Sweep drains at most two messages; private runner authorization is required even when enabled. An AI counter failure does not affect this route. Email queue failures preserve a usable in-app inbox. All new tables have RLS and service-only writes; account-scoped settings/history are readable only by their owner. Authenticated history reads expose no lease token.

## Verification

Full suite: 1,385 tests across 107 files; TypeScript, production build, focused ESLint and diff checks pass. The 46 added cases cover SQL dedupe/limits/revisions/leases/crash handling/roles, bounded worker behavior, recipient verification and suppression/token races, localized escaping, and private-route/gate integration. Tests use synthetic recipients and a mocked transport; **no real email was sent**.

Protected UI, keyboard/mobile acceptance and owner delivery acceptance remain unverified. Browser policy verification blocked the connected UI; no screenshot is offered as proof.

## Release boundary and remaining work

The additive `20260907170000_operational_email_outbox.sql` migration is not yet applied at packet creation. Apply before deploying the application. Keep `OPERATIONAL_EMAIL_ENABLED` absent/false until verified sender/transport configuration and a specifically approved single owner-email acceptance test. No broad customer-email activation, flag change, credential creation or provider reconfiguration is authorized by this evidence document.

This packet implements owner-account summaries of the four existing incident kinds. It does not complete assigned team approvers, escalation tiers, budget/paused-autopilot/general blocker events, configurable daily schedules, provider delivery/bounce webhooks, or operator reconciliation of unknown sends. Each original incident appears once; opt-out cancellation does not replay old incidents on opt-in. Current source is user-keyed; team routing needs authoritative membership.

Rollback: disable only the email gate, preserving the in-app cron and all rows. Pending or unknown sends must not be deleted or relabeled accepted; do not reset idempotency or manually retry an uncertain delivery without provider evidence.

## Completed previous packet

PR #69 merged after its automated review and preview passed. Lovable source matched the merge before deployment `f6936938-a888-494a-89ce-53113f9d3ffe`; `milogrowth.com/api/app-version` then returned new build `1788784740863`. Private notification POST returned 401 without authorization.

The notification migration is applied, with recipient RLS and service-only sync verified. A real PostgreSQL synthetic sync/stale-revision test was entirely rolled back and confirmed absent. The 15-minute in-app cron `operational-notifications` is job 150; no existing job was overwritten. A private background request from the database (`net` request 14400) returned 200, scanned 5 accounts, failed 0, stale 0, without browser login, AI calls, email or publication.
