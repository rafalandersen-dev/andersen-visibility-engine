# P3 weekly workflow — release evidence, 10 September 2026

## Released source and review

PR [#110](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/110) merged normally at 14:52:17 UTC into `70eeafa1f8f12b9cbcb0f8bc4a619df2b1332a89`. Reviewed candidate `4c274bc349768e94f2b8b0bc8d9e8d1e3ade3994`; final Codex review [5620633670](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/110#issuecomment-5620633670) completed 14:51:02 UTC with no major issues. Review bodies and inline threads checked; no unresolved inline findings. Security review completed against earlier candidate `19e16fd`; it is not an exact-final security audit.

Linux run34490911230 passed 2,641 tests /193 files on Bun1.3.3 and1.4.0, types/build/frozen locks. Claude34490912108 succeeded but logged21 permission denials; coverage is limited. Local guarded SQL rehearsal passed; repeated migration and activation were refused. PGlite rehearsal is single-session with stubbed cron and no network.

## Database applied once

All four migrations applied in ONE guarded transaction before code deployment. Stored SQL has one statement-array entry per migration, exact hashes below. These are released migrations: never edit or reapply them.

| Version | SHA256 |
| --- | --- |
| 20260910150000 | `c95517e647de31bd21967127d3540f9d3a44114f638ef053493c0e1e1b0024e0` |
| 20260910170000 | `2a39b80c3dc3fd5f1108aff3284695af984e722fc2d31ed6bb64ba1a5bf64081` |
| 20260910180000 | `5780529e164daab173dea67101a09ac250bc194cb93c474d3cf2da1b13ab3996` |
| 20260910190000 | `ef6fb887771dbdbae08714dc744ff4c87d50504735d676c22b246647aa1e9a62` |

Four private tables have RLS and no direct anon/authenticated/service privileges. All22 inspected functions use security-definer; anon/authenticated execution denied,17 service RPCs allowed,5 trigger-only functions denied service execution. All5 triggers enabled.

Existing queue changed from101pending/31published/5failed to101review_required/31published/5failed. No publication in flight at migration. Dates, identities, assets and attempt counts preserved: schedule payload SHA256 `aa30a4053705fcb6270ae338f1eea884e56475a7173c5c40554fc09c633025e6` unchanged, excluding only status/error/update metadata. Content SHA256 `aa2d297099fc9b3fc57f8579a22bcd45d5ce395827fd16b2903bcd860328fd7b` unchanged excluding only schedule-status/date/error mirrors. Holds require current exact-version approval and explicit resume or cancellation; no automatic date movement.

Weekly timer created disabled, then separately activated only after exact new runtime verification. Schedule `*/5 * * * *`; commandSHA256 `b0044f76411f69cc92b9ef3e8fdab0e5f99cd8966ff3be0fe3357b3fb13f9664`. Existing monthly schedule `0 6 25 * *` and commandSHA256 `344d3bf5d41ccf75456660906fee446cd263790cff89d9ca4c216cbefe6f26ca` unchanged. No project switched or funded. Zero controls/stages/approvals/summaries/archives/receipts/native budgets/permits/requests. Historical usage unchanged10rows/226units.

## Runtime

Existing Lovable project `06b696f6-c02b-468f-b0a0-7ab8af92d6a0` synced exact merged main before one deployment `bb499c8e-5c0b-4ac0-9576-57cacfed1de8`. Custom-domain verification14:54:55UTC, build `1789052034961`, clean revision `70eeafa1f8f12b9cbcb0f8bc4a619df2b1332a89`, fingerprint `7eb3afd78d226f7a0811848d4521536e23908fe6b47c74d8e65e65be40d02a30`; algorithm and every component equal local merged source, modified:false. Home/MCP GET200, MCP OPTIONS204, anonymous MCP and weekly scheduler POST401.

## Behavior and remaining acceptance

Weekly execution reuses fair bounded dispatch, common monthly/weekly lease, refreshed sources, durable once-only research/content/image stages, native result receipts/recovery, owner-pinned choices, scoped source/knowledge provenance, image entitlement preflight, quota/funding checks, immutable-version approval, actual queue admission, cancellation/uncertainty controls and deduplicated in-app summaries. Four-language settings/editor controls expose real states. Legacy direct queue writes require transaction-local exact-version proof; approved retry transitions preserve identity/date/attempts and recheck before publication. Asset/project deletion cancels pending/held reservations. Existing monthly behavior preserved under explicit coordinator selection.

This is code/database/runtime release evidence, not signed-in/provider/visual acceptance. No live generation, funding, source test fetch, email, outreach or client publication was performed. OpenAI setup remains unresolved; browser administrator-policy denial persists; Stripe owner-deferred; paid launch NO-GO. P4/P5 and R00–R24/D01–D08 continue. Project memory exists; AI readiness advice is not observed mentions/citations. Backlinks provider/contract/outreach gates stay separate.

Rollback: guarded `/tmp/milo-p3-deactivate-weekly.sql` stops future weekly dispatch while preserving stages/archives; it does not cancel in-flight operations. Reconcile before any scheduler switch. Do not roll back by repeating earlier migrations or deploying pre-approval code over active queues. Evidence files: `/tmp/milo-p3-{migration-manifest,database-verification,post-activation-verification,runtime-verification}.json`, successor baseline/guard validation and final Linux/Claude logs.
