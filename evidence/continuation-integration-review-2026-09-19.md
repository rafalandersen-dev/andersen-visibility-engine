# Continuation integration review — 19 September 2026

Goal remains the full R00–R24 / D01–D08 implementation, release and required real-use acceptance. The preceding goal turn made concrete progress: PR140/141 recovered live native generation/scoring, complete article retention and four Butelki Wodorowe publications. It did not complete the wider goal.

Current candidate worktree: /tmp/milo-continuation-review-20260919, branch codex/milo-continuation-review-20260919. Claude PR136 head 3d4a033659cd460ee79f45d27eba5a4c991c5e54 was integrated with verified main 209c335ffd511e817652d1678d2211a786d1981e in local merge e1418976. The sole conflict retained conversation signal/beforeDispatch authority checks alongside the released complete-body correction. No pushed history rewritten.

Initial integrated suite: 5908 pass, one failure in the candidate migration inventory assumption. Claude's correction explicitly separates the two already-installed 19Sep expense migrations from the eight unapplied chat/team migrations; the combined real SQL chain and all permission assertions pass in focused testing. The manual_budget_required expense refusal now produces failed/budget_unavailable rather than an unknown paid execution. Focused 28 tests initially passed; after the payer correction the same two files pass all 30 tests.

Read-only production verification: migration journal contains both 19Sep expense versions and none of the eight candidate versions. milo_conversations, milo_conversation_dispatch_control and count_project_team_seats are absent. No candidate migration or production deployment performed.

Independent review corrections:

- Model routing/replies now charge the validated owning account, consistent with the later recorded 14Sep owner decision on pooled company-funded team access. Actor-private reads, claims, tools and last-moment membership checks remain actor-scoped. Regression tests cover different actor/owner, membership revocation before another paid call and model text attempting to name a different payer. The earlier actor-pays specification is explicitly marked superseded.
- Six non-AI server integrations now share manual redirect refusal with native AI. The helper preserves injected fetch, rejects every redirect status plus opaque/redirected responses, cancels the body and never follows Location. Existing endpoints, deadlines, stream bounds, accounting and single-attempt behavior remain unchanged. Browser-only redirect:error remains valid and untouched.

D03 has a later owner-approved specification on PR137 (9a3e564): Citation Intelligence v1 native Google/Bing evidence plus one manual consumer surface and reviewed improvements/re-test supersedes the earlier three-surface v1 floor. That stacked source and its real-export/human-review dependencies are not yet integrated or accepted as delivered. PR138's old default-budget proposal is superseded by released PR140 and the explicit manual-free/USD50 decision; do not replay its migration.

Hold: PR136 still requires exact final-head Codex security review, full supported-runtime CI, migration baseline/transaction verification, controlled deployment and signed-in real-use acceptance. Staged translations are not activated or fluent-user accepted. Stripe remains owner-deferred; public paid launch NO-GO. No new communications, provider requests, team invitations, credentials, timers, purchases, or production mutations in this continuation review.

Independent workerd probe before transport correction: all six actual transports failed before outbound dispatch (zero requests), including synthetic success responses. Harness uses Miniflare/workerd with outboundService fixtures only, no real supplier or credential. Before log: /tmp/milo-integrations-workerd-before.log. Harness: /tmp/milo-worker-probe-20260919/integrations-run.mjs.

After shared manual-redirect refusal: all six actual transports accept valid synthetic responses (one request each); all six refuse a 302 with one request each; no Location replay. Shopify fixture was corrected to include required endCursor:null, not an application change. Machine-readable before/after: continuation-provider-workerd-2026-09-19.json. This proves runtime transport compatibility, not real supplier credentials/data acceptance.

Final local validation: 5,918 tests / 372 files passed in 51.66 seconds. Production build passed. Final tsc --noEmit and changed-source ESLint / changed-file Prettier checks passed. The final test-only mock parameter typing correction was followed by 35 focused tests / 2 files passing; no runtime source changed after the full suite, production build or workerd probe. No candidate SQL, dispatch activation or production deployment was performed.
