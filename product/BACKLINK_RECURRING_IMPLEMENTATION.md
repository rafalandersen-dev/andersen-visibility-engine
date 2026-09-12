# Ongoing backlink monitor — isolated planning foundation

12 September 2026: a pure settings and occurrence planner is implemented independently of the continuation release. It is not called by a route, scheduler or supplier transport. No monitor is created or enabled and no production timer, database or budget is changed.

The owner settings contract has an explicit enable state, daily/weekly UTC cadence, 1–92 complete days of aggregate new/lost observations, subdomain scope and a monthly supplier cap. Enabling requires a cap sufficient for one full bounded request; this check does not provision account/global funds or authorize collection. The current implementation bounds the configurable cap at 100 USD per monitor, with zero permitted only while paused. This is an implementation bound, not a pricing plan or a suggested spend.

Planning takes a server-saved due time, skips missed occurrences without a backlog burst, preserves the original cadence anchor, and returns the most recent due occurrence and the next due time. Date windows exclude the current partial UTC day, including at midnight and leap-day boundaries. Exact saved hostname/subdomain scope and the released daily-series price bound are preserved.

Fourteen pure fixture tests, TypeScript and changed-file lint pass for the foundation. Required next work: private settings/revision/monthly expense and occurrence storage; authenticated owner configuration; atomic due-work claims; current website/account/configuration fences; remaining monitor/account/global budget admission before dispatch; one request identity and immutable history per occurrence; paused/unknown/pending accounting holds; bounded shared-secret executor and localized controls. Existing manual monitoring lifecycle can be factored but cannot be invoked in a way that bypasses per-monitor admission. Real provider and browser acceptance remain open. No full-feature completion credit is claimed.

## Private configuration storage in progress

Unapplied migration20260912010000 currently adds a private owner/project settings table with stable monitor identity, revision checks, exact change replay and preserved due anchor. Owner/account/project/current-website checks precede writes. Settings reject unexpected authority fields, invalid windows/cadence and enabling a cap below one bounded request. Direct table access is revoked even for the service role; only owner-checking configuration functions execute through the server role. No timer or executor consumes the table yet.

Twenty-nine pure/actual-SQL tests and changed-file lint pass. Configuration replay creates no supplier request or expense record, stale edits are refused, and pausing/editing preserves identity and the due anchor. Runtime request/dispatch/period accounting, authenticated UI and real acceptance remain required before release.

## Authenticated configuration and next implementation boundary

Read/save server functions now derive the owner from authentication, validate exact settings and revision, compare the displayed website before writing, and verify the returned owner/project/website/settings/revision. Private mutation identities are stripped. Thirteen configuration service tests, TypeScript and changed-file lint pass; endpoint authentication fixtures are included before the configuration commit. No UI, due-work scan or provider executor is wired yet.

The next implementation should store one immutable occurrence per monitor/due time, with the settings revision, exact website and observation scope, old request identity, supplier billing month, reservation ceiling and confirmed actual cost. Serialize claims with the existing owner workspace lock. Index occurrence spending by monitor/month and count unresolved reservations at their full ceiling; combine that per-monitor check with unchanged account/global supplier admission. Unknown or pending accounting must hold further automatic work. A known-undispatched failure can release only its local ceiling after proving no supplier expense exists. Preserve the due anchor and skip missed periods; edits must not create backlog bursts or reset the monitor spending identity.

Only after durable reservation/dispatch/finish and accounting are implemented should a bounded shared-secret executor, schedule integration and localized owner controls be connected. The existing manual lifecycle can share transport/execution code, but recurring dispatch must pass the additional per-monitor checks. No deployment or live calls are authorized merely by a pure due plan.
