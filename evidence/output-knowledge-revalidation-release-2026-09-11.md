# Output knowledge revalidation release — 11 September 2026

Released through [PR #122](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/122), runtime verified at 06:21:42.778 UTC / 08:21 Stockholm.

## Delivered

Owners can inspect saved assembled content and current knowledge, explicitly acknowledge every fact and record a revalidation bound to the exact deliverable and current private evidence. Publication rechecks actual saved content, context, active history and applicability/expiry; original provenance and separate publication/source approval gates remain intact. Forgotten evidence cannot be waived. Four locales include preview, history and withdrawal. The bounded affected-draft list reconciles present and future holds while preserving history access. History can load independently of unavailable preview content.

## Review and tests

Reviewed commit `53b9151411a4b426812b838c582e803a70a7fccc`. Final code review completed at 06:15:53.956880 UTC with no major issues, comment5630312633. Finding3986371795 was fixed and threadPRRT_kwDOTCO8kM6hW3Kh resolved: knowledge version checks use the original saved asset, while retained source dependencies are independently restored and checked. The regression covers both pre-refresh and final checks.

Linux workflow34568787512 passed 3,083 tests / 227 files on Bun1.3.3 and1.4.0, types, build and frozen locks. Local full pre-fix3,082/227 and final65focused/4files/types/lint/build passed. Initial security review covered b96e20d and completed06:09:02.619679UTC; it is not a security audit of the later fix. Claude runs34568423923 and34568787495 remained in progress at final release verification; no completion or substantive coverage is claimed. Do not rerun them merely to remove that qualification.

## Database

Migration20260911010000_output_knowledge_reviews.sql applied exactly once with SHA-256 `a1f062c17c79e98d2d97f0d00c76ae7294b5c01a23752d6ef5f13cbff0ee0583`. The guarded transaction checked eleven prior exact migration hashes, absent new table/version and no in-flight publication. Local rehearsal verified the packet, repeat refusal and post-verification query. Installed source hash and registry cardinality1 matched.

Verified one private RLS table with no direct anonymous/authenticated/service-role table privileges; five service-only RPCs; two trigger-only functions; four enabled invalidation triggers. History contains no copied facts or output text. Relevant workspace/evidence changes withdraw reviews; separate approval/scheduling metadata alone preserves them. Project/output deletion cleans history. No old migration, timer, queue or approval function was changed. **Do not edit or reapply released SQL.**

The whole fresh baseline matched after migration and again after rollout. Reviews0active/0total; other private/native/registry/discarded-identity counts0; usage11rows/227units; queue101review_required/31published/5failed. The intervening increase from the previous release's10/226 was already present in the fresh pre-release baseline; no cause is inferred. Monthly schedule `0 6 25 * *`, hash `344d3bf5d41ccf75456660906fee446cd263790cff89d9ca4c216cbefe6f26ca`, and weekly `*/5 * * * *`, hash `b0044f76411f69cc92b9ef3e8fdab0e5f99cd8966ff3be0fe3357b3fb13f9664`, remain active and unchanged. Existing approval/queue triggers unchanged.

## Runtime

Normal merge `083d1fa6e8d0a4e6e2e12d28b1c27591830b772d` at06:18:23UTC. Lovable exact commit sync verified before ONE deployment `a2225328-974a-4e83-b94a-3ae901191dce`. Build `1789107584165`, source fingerprint `032810c5a8e762fe4049b960d3fc1f1ea7146db9fef6780ce462531b77e450d4`, algorithm, every component, exact merge revision and clean metadata all match. Early checks saw the old rollout and were preserved; no second deployment was started.

Home GET200, MCP GET200/OPTIONS204, anonymous MCP POST401 and weekly executor POST401 all passed. Database verification after runtime matched the entire immediate post-migration verification, including the new table/functions/triggers/hash and all old counters/schedules.

## Remaining acceptance and scope

This is code/database/runtime/public-boundary verification, not signed-in visual acceptance, a multi-session concurrency demonstration, provider generation, live CMS retention or factual correctness. Full R00–R24/D01–D08 and separate PR2/58/62/Worker35/43 remain. No live provider/source/CMS/Google fetch, funding/generation, external messages/outreach/client publication, credentials/accounts/MFA changes, browser-policy retry, synthetic production records, subagent or new automation. Public paid launch remains NO-GO. The rounded planning estimate remains about55% overall and70% technical implementation; this bounded milestone does not close the larger outstanding workstreams.
