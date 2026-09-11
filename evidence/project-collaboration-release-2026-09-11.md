# Project collaboration release — 11 September 2026

PR123 was normally merged as `af38493f727b4b3ff0b8e61cc12cbb785c84c377`. Reviewed source head: `847d6bb4b707e10a251551fdb084321e207449de`. Exact-head Codex code and security reviews found no remaining issues (comments5638435940 and5638460174); all100 review threads were resolved. Both frozen-lock CI versions passed. Claude workflow completed but reported83 permission denials; it is not counted as substantive review evidence.

The ten migrations below were applied once through a single guarded transaction. Twelve prior registry hashes, the original claim and approval-trigger definition hashes, absent new tables/queue columns and no active publication were checked before application. The release rehearsal refused busy, repeated and definition-drift execution. Production verification matched the expected14 tables, restricted function definitions/permissions, migration hashes, columns and triggers. The one fixture difference was the preexisting active-asset index including review_required, correctly retained from migration20260910180000 lines193–195. All new team tables were empty.

- `20260911020000_project_team_reads.sql` — SHA256 `003be8ffd687a7a7867367ccdebd5d12b00a6067db9f902fefb0cd61bdaa4d60`
- `20260911030000_project_team_membership.sql` — SHA256 `cfc1d3a0416a030a9d1e47326e6ecabd283241ce30bdb16876448982cd706ae2`
- `20260911040000_project_team_comments.sql` — SHA256 `5036cc9ad53bee12f08227ddc912855d0dc26ee835adaa3cf1ca9be9c673170c`
- `20260911050000_project_team_edits.sql` — SHA256 `2ff7bc132a885ab612ca82c22fd3f1b63b36eca7de1a682d5717a6be7803002a`
- `20260911060000_project_team_approval_policy.sql` — SHA256 `6549c085e698dfe30e033e13d07ba0334f465a5f930c47a584b559ed0dd58ced`
- `20260911070000_project_team_review_context.sql` — SHA256 `8adb8532cfcb4752fcf96edeb95a99175b3460d61fdf5fe6910f1de5b8b98a0f`
- `20260911080000_project_team_notification_recipients.sql` — SHA256 `67a8762befa8dd919ceaf9533cec3efb5b2a9ecde74165db17b3fef0435a8d1e`
- `20260911090000_project_team_notification_outbox.sql` — SHA256 `014e797055105d14039e02e7ac8edd9aa58a64c5b3bfd7e4a993496f81bf4578`
- `20260911100000_project_team_invitation_delivery.sql` — SHA256 `a7dd9a50a0a46811d5c7060c91fd680c231ab343f45deddf0ad3ffd17ab45531`
- `20260911105000_scheduled_publish_fairness.sql` — SHA256 `04084813cff073245987743bb5ca3af81bc07660080585c6993d4a877bfef669`

Deployment `bb91c56c-b3b8-4c78-a41e-e16cc2605255` was submitted after hosting sync matched the merge. Verified at `2026-09-11T17:56:10.597Z`: build `1789149259961`, exact clean revision `af38493f727b4b3ff0b8e61cc12cbb785c84c377`, fingerprint `8350efddbf4edc1d34299b4b73ced2ff473802eb2d4add67e8b7e001fb23bb0e`. Root and MCP discovery returned200, MCP OPTIONS204; unauthenticated MCP, weekly runner and notification sweep POSTs returned401. These probes did not authorize work.

The previous release's baseline matched exactly before migration and after rollout:5 failed/31 published/101 review-held schedules,11 usage rows/227 units, and unchanged prior evidence/knowledge counts and timer evidence. Additional pre-release checks retained735 workspace entities,5 owners, revision sum400,8 notifications,5 scans,0 email preferences/outbox/items,2 suppressed addresses and2 unsubscribe tokens. No provider request, email delivery, credential configuration or synthetic production record was created.

Both invitation and notification email release gates remain disabled; D07 is unanswered. Signed-in owner/collaborator journeys, actual concurrent use, email acceptance and other registered scope remain unverified. Technical release does not establish paid-launch readiness. Overall planning estimate remains approximately55%, implementation70%.

Local audit artifacts: `/tmp/milo-team-production-migration-result.json`, `/tmp/milo-team-production-post-verification.json`, `/tmp/milo-team-production-deploy-result.json`, `/tmp/milo-team-runtime-verification.json`, `/tmp/milo-team-production-post-runtime-baseline.json`, and `/tmp/milo-team-release-fresh-baseline-{0,1,2,3}.json`. Do not rerun the applied packet or deploy the same release merely to recover evidence.
