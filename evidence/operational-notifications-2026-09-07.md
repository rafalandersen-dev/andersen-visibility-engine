# Operational notifications — first working inbox

Date: 2026-09-07. R05/R06 first inbox packet; not the complete notification/email programme. Baseline main `1111824e845118202b7309b62a2057edbf2e42ae` includes merged dependency safety PR #68.

## Behavior

- New authenticated Notifications screen, reachable from the existing shell after Home. Lists all owned project alerts, unread state, project-local deadline/time zone and links to the current article or selected Plan item. Copy covers all four current UI locales, with dates in the selected UI locale.
- Server generates approval-due (within 24h), failed-publication, manual-overdue and next-week cadence-gap events. Date-only manual deadlines end at 23:59 in the project zone. Legacy discarded/archived/published work is excluded. A failed publication is not mislabeled as an unattempted manual task.
- Coverage means each project-local cadence slot actually has a ready item in the authoritative scheduled_publishes queue. A future draft/client queue mirror alone does not cover a slot. Disabled/unconfigured schedules produce no cadence alert; quota does not invent a weekly commitment. Month boundaries and project separation are tested.
- Durable per-recipient event keys deduplicate repeated scans. Resolved/moved alerts become inactive; read state survives identical rescans. Source revision and scan-time checks reject stale updates. Unavailable/malformed/oversized source snapshots retain the prior inbox and display that the latest check did not complete.
- Server-only sweep selects at most 20 accounts, records attempts so failing accounts cannot starve later accounts, and reports bounded counts through existing heartbeat telemetry. It uses the existing private publish_cron_secret, never a browser session. No new secret is created by this change.
- Tables have RLS, service-only writes and recipient-only reads. A signed-in read-marker RPC only marks that recipient's own row. Project/account deletion cascades to its notifications.

## Deliberate remaining scope

This is an in-app inbox and logged-out sweep endpoint, not an email delivery outbox. No transport call, new customer email, digest, budget-shortage/paused-autopilot alert, general publishing-blocker event, preference/approver UI or new team recipient model is implemented here. Current source is user-keyed; extending to assigned team approvers requires authoritative membership checks. No third-party recipient email is accepted by this inbox.

The migration adds no cron schedule. After application acceptance the operator can register a bounded 15-minute sweep using the existing publish-runner secret inside PostgreSQL; never print that secret. No real AI or publication is needed to generate the in-app alerts. Alert copy does not include raw CMS/provider error responses.

## Verification

36 focused regression cases: 14 event/locale conditions, 11 real SQL/role/cleanup/reconciliation cases, seven server snapshot cases and four private-route authorization cases. Final full suite: 1,339 tests across 104 files passed. TypeScript, production build, focused ESLint and diff checks passed.

Browser-based protected/mobile/keyboard acceptance remains unverified because computer-use policy verification blocked browser access in this session. No screenshot is presented as proof of a tested UI. Build/type checks are not a replacement for those journeys.

## Rollout and rollback

1. Apply `20260907150000_operational_notifications.sql` to the verified Milo database, preserving existing workspace entities and data. It requires the existing workspace_meta, workspace_entities and auth.users schema; the production composite workspace_entities primary key was inspected.
2. Merge/deploy the reviewed application revision through the existing Lovable project only after migration. Verify synchronization SHA and new custom-domain build.
3. Verify private sweep route refuses unauthenticated requests. Register the optional 15-minute job only after that route exists, using the existing credential in-database. Observe counts and heartbeat; never invoke a publishing route as a notification test.
4. Complete owner-authenticated UI, mark-read, deadline changes and logged-out sweep acceptance without sending email. If that access is unavailable, report the limitation and continue independent R06/R09 work.

Rollback: unschedule only the new notification sweep (if registered) and restore a known application release. Keep the additive tables/history; no customer data cleanup or counter reset. No publishing, AI-meter or audit-Worker configuration is changed by rollback.

## Release reconciliation update

PR #68 merged `1111824e845118202b7309b62a2057edbf2e42ae`. Lovable latest SHA verified before deployment `c577b49e-0e83-4107-b3aa-e3b5d1275557`; domain subsequently returned build `1788782759137` (2026-09-07). Lockfile audit: zero reported vulnerabilities; 1,303 tests/type/build passed on that dependency release.

A requested automatic same-project successor was not created: create_thread rejects local tasks targeting a ChatGPT project and requires explicit cloud selection. Work continues in the original task. Pending user questions about cloud continuation, the USD5 test envelope and actual Lovable pricing remain unanswered; no approval is inferred.

Production migration applied and recorded atomically on September 7. All three tables have RLS; authenticated users can select only inbox rows and cannot insert. Scan state remains service-only. Repeated CMS failures preserve one incident key across retry counts.

## Deployed acceptance

PR #69 merged `2738d14495e26e31dba1282764f2ad3eda95607d`; exact Lovable synchronization verified before deployment `f6936938-a888-494a-89ce-53113f9d3ffe`. Main-domain build `1788784740863` verified, private POST returns 401 without authorization. PostgreSQL synthetic sync/revision test passed and rolled back; fixture absence verified. Cron job 150 runs every 15 minutes. Real private background request 14400 returned 200 with five successful account scans, zero failures and zero stale sources. No AI, email or publication occurred. Protected UI acceptance remains open.
