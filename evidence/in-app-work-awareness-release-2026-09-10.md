# In-app work awareness release — 10 September 2026

PR #115 merged normally at `643140e205c3e77ea3255066d5806b985d09ee21`, 18:25:26 UTC. Final reviewed candidate `c9262cc6cc8a274cc708e2be11db146cbebfe2c5`: Codex no-major-issues comment5623455452, completed18:25:05UTC. Review bodies and all three inline threads were inspected; all findings are fixed and resolved:

- Active approval rows are filtered before the database limit, with an exact complete result count.
- The nested weekly reader checks its exact full queue count before deriving readiness, preserving whole-month legacy reservations and cancellations.
- Every scheduler mode validates saved time zones; cached malformed zones/dates cannot crash the display.

Linux34513905396 passes **2,820 tests / 208 files** on Bun1.3.3 and1.4.0, TypeScript, production builds and frozen dependency locks. Local full suite, types/build/lint also pass. Logs: `/tmp/milo-awareness-final-linux-c9262cc.log` and `/tmp/milo-awareness-zone-fix-*`. Initial security review completed18:05:12UTC on c52192f; it is not an exact-final security audit.

Final Claude34513905364 remains in progress at18:28UTC; it is not a branch-required check and is not counted as completed audit evidence. Intermediate e56fc21 Claude34513303304 completedSUCCESS18:27:03UTC with14permissiondenials; intermediate621aa93 Claude34512522062 completedSUCCESS18:17:09UTC with14denials; initialc52192f Claude34511826476 completedSUCCESS18:11:10UTC with12denials. Logs were inspected without reruns. Workflow success does not establish substantive review coverage.

Lovable synced the exact merged commit before a **single deployment**, `92116e19-16cf-4d0a-b939-ff6346b3eba2`. Production verified at **18:28:30.498UTC**, build `1789064807923`, revision `643140e205c3e77ea3255066d5806b985d09ee21`, fingerprint `f3568cd0a99701839f490edabd25052af22b05fe6d9f95974a5601877572becf`. Every source component matches clean merged source. HomeGET200, MCPGET200/OPTIONS204, anonymousMCPPOST401 and weeklyschedulerPOST401 pass. `/tmp/milo-awareness-runtime-verification.json`; first rollout checks saw the previous build, and no second deployment was started.

**No migration, timer activation or sweep was performed.** Read-only production inspection at18:27UTC confirmed queue101review_required/31published/5failed, monthly scheduler active at `0 6 25 * *`, and weekly preparation active at `*/5 * * * *`, unchanged from the prior release. All previously released migrations remain untouched.

Notifications now contains a real authenticated, selected-project in-app feed: exact saved-version approval checks, held-versus-resume state, expired-date guidance, current/next local weekly slot records, explicit historical summary timestamps, paused/disabled distinctions, cancellation/uncertainty, action links, bounded pagination and four locales. It never persists operational notifications or enters either email outbox selector. Existing inbox/outbox remains separate. See [usage and limits](../docs/IN-APP-WORK-AWARENESS.md).

The shared weekly reader retains its existing1,000-row history bound and fails visibly if exceeded; it never represents truncated records as a complete plan. No new team membership, recipient assignment or delivery acceptance is claimed. Static rendering and HTTP checks are not signed-in browser acceptance. No provider generation, funding, source/vendor fetch, email test/outreach, client publication, account/MFA changes, synthetic production records or browser-policy retry occurred. Public paid launch remains NO-GO; fullR06 and R00–R24/D01–D08 remain open.

Next code-evidenced independent work: repair Search Console measurement integrity in existing CSV/API/UI/proof flows, preserving the working OAuth plumbing. `/tmp/milo-after-awareness-plan.md` identifies missing-to-zero values, mixed-dimension totals and path-only cross-hostname attribution. No live Google reconnect/sync or provider calls are authorized by that work.
