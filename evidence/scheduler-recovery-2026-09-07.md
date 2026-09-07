# Scheduler ownership and incremental recovery

September 7, 2026. R05 safety packet on verified main `a79545bcabe9f8a6f18a2f502dfc43d4c201359e`; this does not complete unattended paid-autopilot acceptance.

## Changes

Previously the monthly runner accumulated all generated articles in memory, then wrote the whole batch. If the process stopped during a later provider call, earlier useful output could be lost. Overlapping monthly invocations also had no durable project owner.

Each prepared article is now saved before starting the next generation. For automatic publication, its real queue row follows the durable article; the UI mirror follows the queue. Failed queue insertion leaves a saved unarmed draft. A failed save stops further paid calls. Partial failures preserve confirmed generated/armed/held counts in the report. Workspace mutation callbacks remain pure and retry-safe.

A service-only PostgreSQL lease serializes monthly preparation for each account/project and records the intended month. Acquisition and confirmation fail closed; ownership is checked before new Discover and article-generation calls. Normal confirmed completion releases the lease. Stale tokens cannot act after release/reacquisition.

The 15-minute lease is a safety bound, not permission for automatic takeover. An expired active run becomes unknown, rejects another invocation, and cannot start further AI calls. A surviving original process can save the output already in flight and confirm completion with its original token; a different process cannot assume that an interrupted provider call was free or never happened. Abnormal save/ownership/completion failures retain the lease for recovery review.

## Validation and limits

Final full suite: 1,414 tests across 109 files. TypeScript, production build, focused ESLint and diff checks pass. The 21 added cases cover real-SQL lease/role/expiry behavior, strict RPC confirmations, incremental save interruption, queue order, failed saves and truthful partial reports. No live generation, Discover, email or publication is invoked by these tests.

This serializes the monthly scheduler, not every manual app/MCP operation. The existing usage guard still controls those callers; monetary provider budgets remain draft PR #67. It does not settle provider cost when a process dies before persisting its current output. Automatic continuation/recovery UI, structured budget/blocker notifications, full task-ledger accounting and live overnight acceptance remain open. Existing target/quota and month-slot retry arithmetic also require a separate recovery review; do not label it proven by this packet.

The new lease migration must be applied before application deployment. Expired/unknown ownership is deliberately visible as a recovery error from the private runner, not a success or automatic retry. Do not delete/reset unknown leases blindly. First inspect the matching account/project/planned period, persisted outputs, queue rows and provider outcome; reconcile before explicitly allowing a new run. No lease token or provider secret belongs in chat/logs.

Rollback must not re-enable overlapping paid generation by dropping the lease table or bypassing its checks. Preserve all saved output, queue state and ownership records; pause the monthly trigger if reverting to an older runner is necessary. This change does not alter the existing monthly trigger schedule or unrelated publish/in-app-notification jobs.

## Verified releases carried forward

- #70 merged `1a4c3d5ab83b75948eb4c356ee58b4a9e11c810a`, synchronized in Lovable before deployment `90c2a741-8752-49f2-9310-f13d3f60939d`; domain build `1788785868741`. Email tables are migrated; real SQL acceptance was rolled back and left zero opted-in accounts/queued messages. No real email has been sent.
- #71 merged `a79545bcabe9f8a6f18a2f502dfc43d4c201359e`, verified with 1,393 tests, TypeScript/build and clean local identity. Lovable matched before deployment `006df855-c6e6-456a-8404-bcd93570f84a`. Domain returns build `1788786255918`, **that exact revision**, `modified=false`, and fingerprint `2128c8090e97e7dc405b1813d2c391efca3cbf3a82062cf08c173e47dab1e48b`, matching the verified checkout.
- Production in-app cron continues every 15 minutes. Its 13:00 UTC heartbeat was verified after #70; email opt-ins and queued digests remained zero. Source identity is now verifiable directly; protected user journeys and configuration remain separate acceptance.
