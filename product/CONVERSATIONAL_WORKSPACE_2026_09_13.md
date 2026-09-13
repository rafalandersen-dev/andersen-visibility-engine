# Milo conversational workspace — implementation and full-scope sequence

Baseline: `457d7cd36620c61838df12e9732d83514d823cc5`, fetched from `codex/milo-report-branding-authority-20260912`. Implementation branch: `codex/milo-conversational-workspace-20260913`. This record describes candidate work, not production acceptance.

## Ownership and authority

The successor `01a09a18-d8cc-72d1-a996-b367b940fc4e` prepared the handoff without implementation. On 13 September the owner then instructed “jedziesz, zgoda na wszystko, jak cos warto push to production, do it, we dont have to wait”. This is the instruction to start here and authorization to deploy ready changes. The full R00–R24/D01–D08 goal is now active here, without a token budget. The predecessor was observed idle and notified that the successor is the sole executor; this is not a tool-verified assertion that its goal is paused. Do not resume duplicate implementation there or create routine successor tasks.

The new authorization removes the need to seek another generic deployment approval. It does not establish a passing security review, working credentials, completed customer acceptance, a provider contract, a final commercial/role policy or an unlimited spending ceiling. Do not rewrite published history, retry denied access unchanged, expose secrets or send external messages without explicit scope. Prepare and verify a concrete release packet before deployment. PR135 is still open at `3ce139cceefa90f71e9a42a7d92549ad557122ea`; read-only GitHub inspection on 13 September found the same usage-limit security-review comment and completed code review, with no later security review. No review-consuming retry occurred.

Local credential-presence inspection found no `OPENAI_API_KEY` in this worktree or process; it says nothing about production configuration. Earlier authorization for the existing OpenAI/Synergy account and secure key setup is preserved. Do not create another account or treat the historic one-scan/article/image $5 allowance as chat funding. Native calls must pass the existing account/global monetary admission, usage and provider configuration checks. No live provider request is needed to implement and verify local boundaries.

## Findings from source inspection

* There is no chat/conversation route, conversation persistence or generic conversational executor in the inspected source and migrations. Searches for conversation IDs/history, `useChat` and `streamText` found no implementation. `app.specialists.tsx` is a project team/status page; it reads weekly evidence and knowledge and links to other screens. It is not conversational delegation.
* `specialist-team.ts` defines nine roles, but durable stage evidence covers research/content/image. Existing weekly execution, retained results and cancellation should be reused for those actions.
* `ai-provider-expense.server.ts` already provides single-attempt native generation with monetary reserves and supplied attempt/job IDs. `ai-text-bounds.server.ts` bounds bytes, tokens and elapsed time and disables automatic retries. Conversation orchestration must reuse these controls, with additional usage admission; persona instructions are never authority.
* Authenticated functions derive the actor from verified claims. Team reads authorize current owner/project/member under a database lock and deliberately project safe fields. An owner workspace can contain legacy publishing secrets, integration settings and private knowledge: do not serialize or feed the full workspace into chat, and do not convert a collaborator into the owner when invoking tools.
* Several useful functions, including weekly preparation and project knowledge, are owner-scoped. A collaborator cannot call them by substituting the owner's ID. Start from existing safe shared-project/draft projections; add each broader capability only with its own authorization and test evidence.
* Existing team request admission bounds heavy reads. Persisted chat also needs independent write/active-turn limits, exact request identity, late-result checks, cancellation and visible uncertainty. A refreshed browser must read retained work rather than dispatch a model again.

## Implementation order and exit evidence

1. **Durable conversation and tenant boundaries (R01/R04/R07/R08).** Actor-private conversations within an immutable owner/project scope, ordered turns/events, current membership checks on every entry, bounded pagination/input/storage, one active turn, request deduplication, claim identity, cancellation and honest recovery after an interrupted attempt. Verify actual SQL, including two owners with the same project ID, revoked/suspended members, replay and late results. Migration remains unapplied until release verification.
2. **Real specialist orchestration (R07/R09/R16).** Persist the user's task; Milo selects specialists within a fixed capability registry; the server dispatches actual authorized tools, stores evidence and specialist responses in that same conversation. Charge the authenticated initiating account unless an explicit delegated spending policy exists. Separate recommendations, tool receipts, waiting approvals and actual execution. Preserve durable operation identities across uncertainty; never replay an unknown paid operation.
3. **Primary conversational UI (R01/R02/R04/R07).** Prominent chat entry, own/shared project selection, persistent history, named roles/portraits, visible handoff and client, running/failure/cancel states, useful editor/result links. Keep detailed screens available. Verify keyboard/mobile/long copy, rapid project switches, reload, revoked access and multiple tabs with real components and local fixtures; then signed-in acceptance.
4. **Execution breadth and approval continuity (R03/R05/R06/R08/R14/R15/R18/R19).** Connect generation/recovery, safe content edits, weekly preparation, knowledge, technical SEO, evidence/reporting and authority progressively through existing guards. Carry exact content/version approvals; do not let chat auto-publish, contact recipients, purchase placements or change client permissions. Determine D07 policy with concrete choices rather than inventing authority. Add MCP/Slack sharing through the same executor as their supported scope is established.
5. **Integrated verification and release (R00/R24).** Diagnose the inherited membership timing concern without weakening its assertions/timeouts. Full suite then build sequentially, using two test workers. Obtain current required security review, verify migration prerequisites/target ledger and exact release/runtime identity, preserve rollback, then deploy under the owner's current authorization. Keep failed and isolated-pass evidence distinct.

## Remaining full-plan work — preserve alongside chat

| Scope | Next completion evidence |
| --- | --- |
| R00/R24 | Fresh candidate audit, review, target migration ledger, runtime identity, public-audit containment and rollback |
| R01–R03 | Complete chat and remaining premium/setup/brand journeys across devices; preserve existing delivered knowledge/refresh foundations |
| R04–R06 | D07 role/approval choices; real solo and team/mixed flows; logged-out weekly work, notifications, failure/uncertain recovery |
| R07–R09 | Actual specialist tools, MCP regression, secure provider setup, measured chat/generation costs, bounded usage and packages |
| R10–R12 | At least three trustworthy observed-AI surfaces and methodology; source/citation analytics; verified versus unknown server-log bot evidence |
| R13/R16/R17 | Actual Google/technical/local/global acceptance and content→publication→later measurement; existing released features must not be rebuilt from old roadmap statuses |
| R14/R15 | Supplier/private contract, ongoing monitoring and independently verified placements; explicit outreach/order scope and measured expense |
| R18 | Actual generated text/images, reference fidelity and WordPress/Shopify/custom destination parity and retained output |
| R19 | Concrete D06 Slack timing/first workflow and exact consumer-client compatibility matrix |
| R20 | Write GA/LV/LT/MT/RO; reconcile source claims before staged-language activation; fluent/full-page/mobile/accessibility acceptance for all 24 |
| R21 | D01/D08 package/subscriber evidence, configured Stripe sandbox lifecycle, policy/tax/refund alignment before paid launch |
| R22/R23 | Real setup/product recordings, 3–5 assisted testers, one solo and one team/mixed journey, support/recovery, quality and spend evidence |

D01–D08 remain visible in the scope register; broad execution authorization does not answer those product decisions. Stripe's earlier deferral is not evidence of configuration. Public paid launch remains unverified until the required acceptance is real.

## Inherited verification

Hungarian: 3,768/3,768 keys, 40 catalog tests, types/lint and nine local browser groups pass; inactive. Four active plus fifteen staged complete catalogs; GA/LV/LT/MT/RO remain unauthored. Full suite: 5,251 pass and one 5-second timeout in the large-history membership case. Entire affected file subsequently passed 91/91 without edits; build passed. The full run is not green. Last recorded production is PR134 `68bed8fba311e75fe39e1ae3b59ed6558669bc39`, deployment `cb151ad5-8d4c-43c7-8fcb-964eb123d8f2`; candidate migration `20260912040000` is unapplied.

## First implementation checkpoint — durable storage

Candidate migration `20260913120000_milo_conversations.sql` and `milo-conversation{,.server}.ts` implement actor-private conversations within an immutable owner/project, ordered turns/events, exact request replay, single active turn, service-owned claim identity, a three-minute execution lease, cancellation, bounded reads and current-account/membership validation. Expired running work reads as unknown and cannot be claimed again. A new user turn can proceed after expiry without repeating that old operation. Current membership revision is required before claiming or retaining an execution result, including after remove/regrant. Cancellation stops further accepted work; it does not prove that a provider request already in progress was cancelled or free.

The browser-facing schemas accept the user task and selected project, not a supplied actor, role, tool evidence or execution token. Claim/advance helpers are private server modules and have no public endpoint. SQL tables have RLS and no direct access even for service_role; only the named service RPCs have execute grants. A lightweight access helper repeats the released team-account and membership checks under the same workspace lock ordering. Ordinary server requests share existing actor/owner request admission. Project deletion cascades into conversation data.

Storage bounds: 8,000 UTF-8 bytes per user task; 10 new turns/minute and 60/hour across an actor's projects; 200 conversations per actor; 500 turns per conversation; 24 events and at most 120,000 stored event bytes per turn; pages of 20 turns and 50 conversations. Limits refuse additions without deleting history. Conversation export/deletion UI, long-history summarization, provider execution, background dispatch and the actual chat UI are still to implement. Do not claim this foundation is the complete chat or enable a nonfunctional entry point.

Final focused check: 54 tests across four files pass, including 23 actual-SQL conversation cases, nine server boundary cases and the existing shared-project/admission regression files. Log: `/tmp/milo-chat-storage-focused-final.log`. Earlier first 20 SQL and combined 51-test checkpoints also passed. Server test refinement now exercises claim-response validation with a valid turn target rather than failing early on unrelated fields. Final TypeScript, changed-file lint, formatting and whitespace checks pass; logs `/tmp/milo-chat-storage-types-complete.log` and `/tmp/milo-chat-storage-lint-final.log`. These local, single-session SQL tests do not establish production migration compatibility or real concurrent/signed-in/provider acceptance. The inherited 5,251-pass/one-timeout full run remains unresolved; no full-suite green claim follows.

This storage checkpoint is superseded by the executor checkpoint below. Both candidate migrations remain unapplied. No provider request, review-consuming retry, external message, payment, production database write or deployment occurred in the storage checkpoint.

## Second implementation checkpoint — actual specialist execution

Five authenticated POST functions now send, read, list, cancel and resume persisted conversation turns. The authenticated actor comes from verified session context. Submission saves the task before the executor acquires its durable claim; a duplicate running, terminal or unknown request only returns recorded state. Resuming cannot replace the original task, project, actor or generation choice. There is no public claim/advance/evidence-authoring endpoint.

The native executor runs one lead routing request and at most two distinct specialist replies, using a strict server-owned registry and sequential tool dispatch. It saves operation identities before every model/tool call, real tool results before specialist replies, and handoff plus responses in the original conversation. The initiating actor's account pays conversational usage and passes existing account/global expense admission. Model selection and pricing remain the existing verified provider contract; no alternate provider, retry or browser-selected model was introduced. A trusted cancellation signal and final SQL authority check now propagate through monetary admission immediately before native text dispatch, including existing content generation. A cancelled, expired or membership-revised claim cannot dispatch a later paid step or overwrite cancellation with a successful result.

The unapplied conversation migration now has a five-minute claim lease, a service-only final execution-check RPC and an immutable per-turn `allowDraftGeneration` flag (default false). Only the project owner may set that flag; it is not a delegated spending or publication policy. The executor has a 250-second total deadline, each native call retains existing request/time/output limits, and late results cannot continue later steps. Unknown work is never automatically claimed again. Earlier saved receipts survive a later response failure. Cancellation cannot prove that an already-sent provider request was free or never completed; a retained article remains recoverable through the existing generation archive.

Implemented tool evidence:

* Project brief: fresh safe shared-project projection and bounded saved draft IDs; owners also see bounded current opportunity IDs.
* Draft read and structural SEO review: current authorized saved content/version, text/heading/meta counts and explicit partial-content limits. No live crawl, ranking, index or publication-approval claim.
* Project knowledge, weekly readiness and latest saved audit: owner-only readers, selected relevant fields, accepted-source limits and historical/missing-evidence distinctions. No scheduling or approval mutation.
* One retained content generation: owner/content specialist only, with the saved per-turn generation flag, an existing live opportunity from the exact project, existing generation allowance, monetary reserve and durable result archive. The response links a generation receipt; editor import and publication remain separate required actions. Creating a new opportunity from a new topic is not yet supported in chat.

Owner workspace data is never forwarded wholesale to a model. Collaborators use existing safe team projections and cannot read owner-only knowledge, audit, weekly state or generate by replacing the owner ID. The model cannot expand the tool schema, approve, publish, send outreach, place orders or change permissions. The current task is preserved exactly. Prior conversation text and receipt references are bounded with explicit omitted/shortened indicators; source and history text do not grant authority.

Focused executor verification passed 103 tests across seven files, including real local SQL claim/access/cancellation and a complete storage → existing shared-draft projection → structural tool → retained specialist-response path. Model responses are fixtures; these tests are not live provider or signed-in product acceptance. Native text tests confirm cancellation before reservation, a failed final authority check after reservation and cancellation during that check prevent provider dispatch. Raw provider failures never become conversation error text. A subsequent test verifies that all five receipts from a maximum-size plan survive conversation memory and that wider historical evidence is explicitly marked partial. The final full run below includes that test and the strengthened direct-RPC permission assertions.

Final integration evidence (same final code, before documentation-only changes):

| Check | Result | Local evidence |
| --- | --- | --- |
| Full application tests, two workers | 5,319 pass; 346 files; 124.71 seconds | `/tmp/milo-chat-executor-full-final.log` |
| Previous full run before final receipt-memory refinement | 5,318 pass; 346 files; 147.84 seconds | `/tmp/milo-chat-executor-full.log` |
| Production build, after final full run completed | Pass | `/tmp/milo-chat-executor-build-final.log` |
| TypeScript | Pass | `/tmp/milo-chat-executor-types-final2.log` |
| New/changed conversation, specialist and expense-file lint | Pass | `/tmp/milo-chat-executor-lint-final2.log` |
| Existing `ai.functions.ts` lint comparison | 16 inherited findings versus 17 at committed baseline; no new finding | `/tmp/milo-chat-executor-core-lint-{baseline,final}.json` |
| Whitespace and changed-line formatting | Pass | `git diff --check`; `/tmp/milo-chat-executor-format-final.log` |

The inherited full-run membership timeout remains valid historical evidence, followed by its isolated pass and now two full-suite passes. The membership test, its large-history inserts and its timeout are unchanged. Resource contention was not separately reproduced or established as a root cause. The local document-worker checks still emit optional-canvas/polyfill warnings; the build emits existing bundle warnings. These do not turn the passing local test/build runs into browser, provider, target-migration or production acceptance. Both candidate migrations remain unapplied; the recorded PR135 security-review hold remains open and was not retried unchanged.

Next implementation action: build the primary conversation screen and navigation with actor/owner/project-keyed state, own/shared client selection, named roles and portraits, persisted history, recovery/cancellation and authorized result destinations. Use the existing central language catalogs, retain their source-fingerprint/complete-key checks, and author new copy for all four runtime plus fifteen currently complete staged catalogs without claiming staged-language activation. Add functional browser tests for switching projects, a revoked/failed refresh, reload, repeated submission, mobile/keyboard operation and the specialist handoff. Then complete execution breadth, pending background dispatch, conversation export/deletion and real-use/release acceptance. No user-facing chat route is exposed by the backend checkpoint; it is not the completed main chat requirement.
