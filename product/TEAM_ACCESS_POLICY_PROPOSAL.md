# Project team access — proposed D07 decision

Status: proposal for the owner's decision, not an active permission grant. R04/R06 team workflows remain unfinished.

Current evidence: the workspace store hydrates an owner's complete workspace, while server functions derive the owner directly from the signed-in identity. The invite email template is a generic authentication template, not project membership. Reusing an owner's whole workspace for a collaborator would expose unrelated client projects and connector configuration. Collaboration therefore needs separate project-scoped reads and explicit per-action writes.

## Recommended default roles

| Action | Owner | Viewer | Editor | Reviewer |
| --- | --- | --- | --- | --- |
| Read assigned project's safe content and work status | Yes | Yes | Yes | Yes |
| Comment on drafts | Yes | Yes | Yes | Yes |
| Edit/save drafts | Yes | No | Yes | No |
| Approve/reject an exact saved version | Yes | No | No | Yes |
| Trigger paid generation, publish directly or send outreach | Existing owner controls | No | No | No |
| Configure billing, credentials, connectors or autonomy | Yes | No | No | No |
| Invite, change roles or remove members | Yes | No | No | No |

Membership is per project, not an account-wide role. Editors cannot approve their own work under this default. Reviewers can approve work for the existing owner-controlled publishing executor; approval cannot bypass source freshness, knowledge checks, budget controls or destination permissions. Existing owner-only solo behavior remains available.

Invitation acceptance must bind a signed-in, verified recipient to the exact project and intended role, expire and be revocable. No invitation is sent during implementation or acceptance tests without separate external-message authorization. Removal and role changes take effect on every server request and invalidate outstanding delegated approvals/actions as appropriate. Audit records distinguish the actor from the project owner.

## Implementation sequence

1. Introduce strict membership/action contracts and safe project-scoped projection. Do not return the owner workspace or raw project object, because it includes connector settings and private integration metadata.
2. Add service-owned membership/invitation state and server authorization with actor/owner separation. Test cross-project, revoked/expired membership, stale role, invitation replay and forged owner cases.
3. Implement a collaborator project view with scoped draft/comment actions, exact approval and work notifications. Do not hydrate it into the owner's ordinary workspace persistence path.
4. Integrate recipient assignment with membership and notification preferences; recipient eligibility must be rechecked before delivery.
5. Complete migration/review/release checks, then real owner/collaborator acceptance using approved test identities and explicit invitation permission.

D07 question: adopt the recommended separation between Editor and Reviewer, or allow Editors to approve their own drafts too? Either choice keeps billing, credentials, spending, autonomy, membership management and direct external actions owner-controlled unless separately designed and approved.

## Local implementation checkpoint

In progress on `codex/milo-project-teams-20260911`; not released. The first local workflow now includes:

- Safe project/draft projections, actor/owner-separated reads and private membership storage. Every snapshot rechecks active, unexpired membership under the owner workspace lock.
- Owner-only invitation creation/revocation, revision-checked role changes and removal, and recipient acceptance bound to a current verified identity matching the current email. Seven-day invitations cannot be replayed after acceptance/revocation. Removal revokes pending invitations to the account's current email. No external email transport is invoked.
- Private membership audit history, owner roster and per-user discovery of memberships and eligible invitations.
- Authenticated server functions, a four-locale collaborator screen linked from settings, and an onboarding exemption so a collaborator can open shared work without creating an owned project. Shared content is never hydrated into the owner's workspace store.
- Draft comments bound to the viewed workspace revision, author-attributed private storage, idempotent retries and immediate membership rechecks. Comments do not approve or mutate drafts.

Unreleased migrations: `20260911020000_project_team_reads.sql`, `20260911030000_project_team_membership.sql`, `20260911040000_project_team_comments.sql`, `20260911050000_project_team_edits.sql`. None has been applied to production. D07 remains pending. Owners and Editors now have scoped draft editing locally; delegated approval is not enabled. Pending work includes exact-version approval integrated with existing publication protections, notification recipient/delivery workflows, polished rendered draft review, review/release and real owner/collaborator acceptance. In-app invitation creation is an intermediate implementation, not completion of the full notification requirement.

Focused validation reached 39 tests across five files, including SQL-to-server projections, colliding owner/project IDs, removed/expired membership, verified identity and old email-confirmation cases, invitation replays, role revision checks, private-role privilege denial, comment version/replay/removal checks, endpoint authentication and deletion cascade. The full local suite passed 3,122 tests across 232 files. The final membership SQL subset passed 12 tests after the last storage adjustment; types, production build and focused lint passed. Single-session local database tests do not establish multi-session concurrency or signed-in acceptance.

## Scoped editing checkpoint

Owners and Editors can edit title, heading, metadata, Markdown, call to action, outline and FAQ in the collaborator view. Every save binds an opaque hash of the exact stored asset plus current membership revision. Browser-supplied approval, connector, evidence, media or destination fields are rejected. The transaction preserves the original record's other fields, returns the asset to In Review, holds pending queue rows, rejects an existing publishing row, increments workspace revision, and records actor plus before/after/patch hashes under a retry-safe edit identity. Existing publication and output-knowledge-review withdrawal triggers run. Reviewers/Viewers cannot edit through this endpoint.

The edit form keeps its original base while typing, detects a changed draft/role without silently replacing unsaved text, and allows an explicit load of the latest version. Transient content-query errors hide the stale view while preserving the mounted edit form. Editor UI copy is supplied in all four current locales. These are implementation facts, not signed-in acceptance results.

Validation at this checkpoint: full local3,125tests/232files, types, focused final lint and production build pass. Tests use the real publication-approval and output-knowledge-review migrations to verify withdrawal, plus scoped edit/replay/private-field/role/stale-hash/in-flight cases. Queue status tests use a local queue fixture; they are not multi-session scheduler or live external-publication proof. The complete team release and real-use gates remain open.

D07 implementation can support both proposed approval policies, with delegated approval remaining inactive until an owner selects one; the pending owner question has not been answered or inferred. This keeps the final decision explicit while allowing independent implementation to continue.

## Approval policy and grant storage checkpoint

Local policy storage supports disabled, separate Reviewers, and Editors-plus-Reviewers approval. An absent policy remains unselected/inactive. Only the authenticated owner can select or change it, with an expected policy revision. The owner selector is connected in the four current locales and never preselects a policy for an unconfigured project.

The new unreleased `20260911060000_project_team_approval_policy.sql` adds delegated actor/membership/policy identity to publication approvals and private approval history. It extends the existing approval reader to recheck role, active membership, expiry, account status and policy revision on every use. Member/policy changes eagerly withdraw delegated grants and hold pending queue work. The existing owner setter explicitly clears delegation metadata, preserving a later independent owner approval when a collaborator is removed. Re-enabling policy cannot revive an old grant. A reviewer who made the latest team edit cannot approve it under separation merely by changing roles.

The grant RPC remains service-only and is deliberately not exposed by an approve/reject server function yet. It expects the trusted review handler to derive the exact publication version, bind the saved asset hash/workspace revision/membership/policy, and show the assembled deliverable. Queue history remains untouched for in-flight publication; approval never arms a held queue. This is local storage/control implementation, not completed reviewer acceptance or delegated approval in production.

Next implementation evidence: `buildActiveInternalPaths` needs only each project's content `liveUrl` values plus the raw project's path settings; a scoped service context can avoid whole-owner workspace reads. Canonical output comes from `assembleContentAsset` and `publicationVersion`. Existing owner-only media functions live in `src/lib/image-storage.functions.ts`; strict path ownership helpers and image validation live in `src/lib/image-storage.ts`. Collaborator media must resolve the saved image under exact owner/project/asset membership, never trust an arbitrary browser path, and must not expose private storage paths or signed credentials in review HTML. Existing owner `KnowledgeOutputInspection` provides a sandboxed preview pattern, but its raw owner knowledge facts/whole-workspace read must not be reused as a collaborator response.

Approval-policy checkpoint validation: full local3,132tests/232filesPASS (412.74seconds, original run completed without restart), typesPASS, focused final lintPASS and production buildPASS. The SQL suite covers default-inactive policy, owner-only selection/current revision, editor gating, reviewer role-switch self-approval refusal, delegated invalidation, later independent owner approval, read-time expiry and policy re-enable non-revival. The expiry test models elapsed time by retaining a stale approved row in a local fixture; it does not disable production triggers. No migration, policy selection or approval was applied in production.

## Rendered review and secure media checkpoint

The new unreleased `20260911070000_project_team_review_context.sql` returns an exact, membership-checked private service context for one project and asset, plus only that project's published `liveUrl` inventory. This raw context stays server-side because project configuration includes credentials. The preview endpoint uses the canonical assembler and publication version, rechecks context after assembly, and explicitly projects the title/metadata/rendered HTML/version and an image manifest. Image locations are replaced with identifiers before returning HTML; unknown image locations make the complete preview unavailable.

The image endpoint accepts only saved project/asset/image identity, optional content/featured kind and expected draft hash. It verifies exact private-path owner/project/asset/image segments; public reuse is restricted to the same owner/project on configured storage. Public CMS images use only the project's own HTTPS origin, existing approved outbound-mode policy, same-origin bounded redirects, no credentials, streamed size limits and raster validation. No arbitrary external fetch or browser-provided storage path is accepted. Membership and draft hash are checked again after the download. Responses contain bytes and identifiers, not storage paths, signed URLs, connector settings or the owner workspace. Storage downloads use the existing storage SDK and check Blob size before decoding; the outer timeout bounds the response, while an SDK download itself cannot currently be aborted by that controller.

The four-locale rendered-review component resolves image identifiers sequentially, verifies browser image decoding, uses temporary Blob URLs in a sandboxed/CSP-constrained iframe, and revokes them on cleanup. Unknown/unavailable images produce an incomplete-review state. Content and featured variants are handled separately; repeated use of the same public image reuses one preview download. The preview remains read-only: no reviewer grant endpoint is exposed yet.

Full local suite3,153tests/234filesPASS183.07seconds. Focused cases cover path/project isolation, same-project reuse, stale draft/removed membership, public-origin redirects and outbound guard, byte limits/MIME rejection, timeout cleanup, featured variant, private context scope, canonical version equality, URL projection and context change during assembly. Final type and focused lint checks passed; the production build passed during implementation. Logs are retained in the continuation checkpoint. Browser decoding/Blob rendering and signed-in acceptance are implementation intentions not independently browser-verified here.

Before wiring approval, bind the acknowledgement to the exact preview and reviewed images, recheck saved context/policy/member state, and verify actual iframe image rendering as part of the UI's ready state. Current image decoding happens before iframe rendering, not inside the iframe. If image byte identity is part of the acknowledgement, compute and compare image digests on the trusted server; do not treat a browser boolean alone as proof of a complete image review. Existing source/knowledge publication protections remain separate and cannot be waived by delegation.


## Exact review decision checkpoint — local, 11 September 2026

The collaborator screen now exposes approve/request-changes controls with private, project-scoped decision history in all four locales. Approval requires the reviewer to acknowledge the rendered draft, successful browser image decoding and iframe image loading, an exact media manifest, and SHA-256 byte matches from fresh scoped server downloads. The server rechecks canonical publication version, raw draft hash, workspace revision, membership revision and selected policy before recording a decision. The database independently rechecks current access and revision under its workspace lock. Image-check timeout cannot proceed to a late approval write. A decision never publishes or resumes a held schedule.

Returning a version for changes does not require pretending that unavailable images were inspected. Owners can record a review under the absent/default policy and store no delegated grant. Delegated review remains governed by the explicitly selected owner policy. Historical records identify You/Owner/Collaborator without returning account IDs or emails, and are not presented as a current publication approval. An uncertain network outcome refreshes history instead of automatically retrying the write.

Validation: full local suite passed 3,169 tests across 235 files (130.77 seconds). Type checking, production build, changed-file lint and whitespace checks passed. Repository-wide lint remains failing outside the changed files (4,309 errors and 15 warnings); no clean whole-repository lint result is claimed. The initial focused 60 tests and additional owner/default-policy/history privacy and endpoint identity checks (31 tests across two files) also passed. Real browser and multi-session acceptance remain unverified; the existing browser access restriction has not been retried or bypassed. Notification transport and recipient eligibility, release review, migration/deployment and real owner/collaborator acceptance remain outstanding.


## Notification recipient controls — local, 11 September 2026

Owners can assign active members to project notifications, and recipients can independently opt in or out from their shared-project screen. Neither actor can change the other actor's setting. Both settings default off. All changes bind the current membership and settings revision and are privately audited; a role change, removal or expiry makes previous assignment/consent ineffective. The new service-only delivery admission function requires both settings, exact queued revisions, a current non-deleted/non-banned account, and a verified identity matching the current email address. The delivery worker must call this check immediately before transport; resolving the current address and suppression remains a separate required transport check.

The controls have four-locale UI, session-authenticated endpoints, strict scope/response validation, RLS-protected storage and no direct browser table/RPC permissions. New migration `20260911080000_project_team_notification_recipients.sql` is UNRELEASED and unapplied, bringing the team package to seven unapplied migrations. These controls alone do not queue or send notifications; no external messages have been sent. Event collection, dedupe/outbox, recipient-safe payloads, delivery rechecks and delivery history remain to be integrated before releasing the package. Existing owner digests remain separate until that integration is reviewed.

Validation: 31 focused tests across three files pass, including real local SQL constraints/permissions, separate actor authority, stale settings/membership, expiry/removal, audit attribution, email changes/bans and endpoint session binding. Type check, production build and changed-file lint pass. The previous full suite remains 3,169 tests/235 files at the prior decision checkpoint; it was not rerun for this recipient-control checkpoint. No browser or multi-session acceptance claim is made.


## Scoped team digest delivery — local, 11 September 2026

An isolated collaborator outbox now collects active project workflow incidents from fresh owner notification scans. It excludes account-level generation-capacity/billing details, keeps one incident per recipient, limits a digest to 50 items and one per project/recipient per hour, and rechecks exact settings/member revisions and current source state before transport. Owner inbox read state does not silently dismiss a collaborator's incident. Final admission also matches a SHA-256 hash of the resolved email against the current verified account address. Expired/revoked/changed consent, a changed address, resolved work or stale source cannot proceed to a send. Preflight failures retry with bounded leases; ambiguous/expired sends remain unknown without automatic replay.

A fair bounded scanner and two-message worker are connected to the private authenticated notification sweep behind separate `TEAM_NOTIFICATION_EMAIL_ENABLED` (off unless explicitly set). The existing owner-email switch does not enable team transport. The worker uses current-address verification, suppression and unsubscribe checks, an idempotency key and a 25-second transport observation timeout. Provider acceptance is labelled as provider acceptance, not confirmed mailbox delivery. Four-locale delivery history is scoped to the owner or exact recipient and links open the collaborator screen without approving or publishing anything. No live transport call or environment change was made.

Migration `20260911090000_project_team_notification_outbox.sql` is UNRELEASED/unapplied; eight new team migrations remain unapplied. Validation: full local run passed 3,192 tests across 238 files (154.90 seconds). The address-binding safeguard added after that run passed 42 focused tests across two files; the final SQL scanner check passed 33 tests. Final type checking and changed-file lint pass; the final production build passes. The 3,192-test run does not claim to include the subsequently added address-change regression. Remaining before team release: invitation notification delivery, broader team review and any findings, release checks and real owner/collaborator/multi-session acceptance. Existing browser restriction remains in force. Do not infer complete R06/D07 acceptance from local tests or the transport implementation.


## Invitation delivery and independent owner grants — local, 11 September 2026

An owner can explicitly request an email for a saved pending invitation after reviewing its exact recipient and role. The service binds both fields, records at most one delivery per invitation, limits requests to 20 per owner/hour, and exposes owner-scoped delivery status. Ordinary invitation creation still does not send email. A separate `TEAM_INVITATION_EMAIL_ENABLED` gate (unchanged/off) controls a bounded two-message worker on the private sweep. It rechecks expiry, acceptance, revocation, owner account state, recipient hash and role before sending; current suppression/unsubscribe checks precede admission. Preflight failures have bounded retries, while ambiguous sends stay unknown. Links contain no bearer invitation grant and require sign-in using the invited address plus explicit acceptance. Email copy supports four locales, using the owner's saved operational-email locale or English fallback. No live email, provider call or environment change occurred.

The new `20260911100000_project_team_invitation_delivery.sql` migration is UNRELEASED and unapplied; nine team migrations remain unapplied. This is implemented delivery, not real mailbox/identity/onboarding acceptance.

Release review also fixed an independent-owner-approval edge case: a collaborator approving the same already owner-approved version no longer converts the grant into one dependent on collaborator membership. The decision history still records the collaborator. Different-version approvals remain delegated, and rejection does not preserve an old owner grant. Tests cover these distinctions and member removal.

Validation: full local suite passed 3,213 tests across 240 files (253.10 seconds); final types, production build, changed-file lint and whitespace checks pass. The focused 104 tests across six files also passed after fixing a missing invitation-worker test mock. Remaining before release: full team review, findings, Linux/release checks, migration/deployment and real owner/collaborator/browser/multi-session acceptance. Include total private-sweep execution duration with owner/team/invitation transports in release acceptance; separate worker bounds do not prove the combined hosted request fits its runtime limit. D07 policy selection remains unanswered, and no policy or transport gate was activated by the agent.


## PR123 image-review findings — local fixes verified

Code review of b993f1c identified two gaps: verified image hashes were not retained for publication-time checks (P1, comment3987359817), and a distinct social/JSON-LD image could be omitted from the rendered review (P2, comment3987359828). The local fix stores the acknowledged manifest on the approval grant and makes the shared publication-approval boundary reload current media, compare byte hashes and recheck the saved version/grant before admitting publication. This is a pre-publication check, not a claim that remote URLs can never change afterward. Explicit legacy owner grants remain independent; team-review grants retain their media acknowledgement. The social physical asset is included visibly and downloaded through the existing scoped media restrictions without changing the canonical publication version.

Focused regression verification:89tests/6filespass, including overwritten bytes at an unchanged identity, missing social acknowledgement, changed final version/grant and persistence/legacy-owner behavior. Finaltypes/build/changed-filelintpass. The full rerun passed3,223tests/241files in150.81seconds. The first full attempt passed3,219 but hit an unrelated Stripe sandbox fixture setup timeout; those4tests passed separately in1.19seconds before the full successful rerun. No timeouts/assertions were weakened. Findings are ready to resolve after the verified fix is pushed. Initial security review completed08:40:28UTC onb993f1c with no additional posted findings; this is not a security review of the new unpushed changes.

### Active-member invitation review fix — 11 September

PR123 review of9ea6240 found that owners could create an unusable invitation for an already active project member. The unreleased membership migration now rejects creation against the account's current address and active, unexpired membership under the existing owner workspace lock. Removed/expired members remain eligible for a fresh invitation. Regression coverage also preserves revocation of historical pending invitations. Focused45 tests pass; full3,226tests/241files pass, types and changed-file lint pass. Prior9ea6240 Linux checks passed3,223tests/241files on both versions. The new fix still requires its own current-head Linux/review checks. Nine migrations remain unapplied and new mail gates disabled; this is not real owner/collaborator acceptance.

### Current account restrictions and notification capacity — 11 September

The next PR123 reviews found two further gaps. The central snapshot now checks and share-locks the actor's current auth row, rejecting deleted/banned accounts even when a previously issued session remains accepted. This protects direct draft/comment/review paths as well as listing. Notification capacity now limits outstanding pending/leased/sending rows using a matching partial index; accepted/cancelled/failed/unknown history and once-only item identities remain retained. A long-lived project is no longer permanently disabled by terminal history. Regressions cover direct restricted-account calls, expired bans,10,000 terminal rows followed by a new digest, retained history/deduplication, and10,000 outstanding rows across recipients. Focused58tests/2files and full3,233tests/241files pass. These SQL files remain unreleased and unapplied; release review/current-head Linux and real-use acceptance remain separate.

### Owner lifecycle and invitation history — 11 September

PR123 code review ofd7c4428 identified owner lifecycle suspension and a lifetime invitation cap. A private internal current-account assertion now protects the central snapshot's owner and actor, all owner membership/invitation/roster operations, invitation acceptance and owner policy changes. Discovery excludes suspended/deleted owners. Invitation capacity counts unexpired pending invitations; terminal history is retained. The roster returns at most1,000 invitations, prioritizing current pending invitations before recent history. Focused62tests/2files and full3,237tests/241files pass, including suspended-owner direct operations/discovery and1,000 historical versus pending invitations. The previous d7c4428 Linux run passed; these new changes require their own checks. All nine migrations remain unapplied and release/real-use acceptance remains open.

### Retained history and active capacity — 11 September

Current membership capacity counts active, unexpired members; the bounded roster prioritizes those members and retains former identities in storage. Comment, edit, review and notification-consent history limits now apply to the last hour, with matching indexes. Retained history and idempotency keys remain intact. Rejecting approval or disabling notifications is exempt from the positive-action rate limits. Comment pagination and its response contract now support history beyond5,000 rows. Existing project/asset capacity and authorization controls remain.

Focused77tests/3files and full3,244tests/241files passed, plus types/changed-file lint/production build. Two later owner-snapshot suspension regressions also pass in the final11-test read suite; they are additional to that full-run count. The completed security review of the older d7c4428 repeated the suspended-owner finding, already fixed in fe3a8c5; the added tests explicitly cover existing collaborators under a suspended owner. Current-head review/Linux/release acceptance remain pending; no team SQL or mail gate has been activated.

### Pinned remote review media — 11 September

Security review ofb192f2d found that a hostname could resolve privately when an outbound-enabled runtime used global fetch without enforced pinning. Remote review images now use a dedicated binary reader built on the existing homepage transport's DNS validation, pinned Node/Bun connections, original-host TLS verification, proxy refusal and per-hop checks. HTTPS and the saved project origin are enforced before each resolution/connection; declared and streamed5MiB limits, chunk bounds, cancellation and a10-second deadline are enforced. Binary bytes remain exact for acknowledgement/publication hashes. The existing outbound gate remains unchanged, and storage-scoped downloads plus final draft/membership and raster checks remain. No remote media was fetched in production.

Final focused74tests/3files, full3,252tests/241files, type checks, changed-file lint and production build pass. Regression cases cover private DNS, changed redirect resolution, off-origin redirects, Node/Bun byte preservation, parent cancellation and oversized streams. Fresh current-head review/Linux and release verification remain pending; all nine SQL files remain unapplied.

Review follow-up: expired pending invitations now display an explicit expired state in all four locales and stop offering email delivery or revocation as pending actions. The owner roster refreshes at the next invitation expiry even when left open. Delivery continues to enforce expiry in the database. Review comment 3988046870 addressed; no migration or delivery-gate change.

Review compatibility follow-up: self-contained featured/social image records remain reviewable after the source gallery entry is removed. Media lookup still checks the exact saved featured identifier and owner/project storage scope. Removed the readers' arbitrary30-image cap so existing larger articles remain accessible; context and projected-response byte budgets remain enforced. Regression coverage includes detached hero/social downloads, canonical preview,31-image preview, shared projection and selected media. Findings3988129036/3988129039 addressed.

Compatibility-fix validation: all3,258tests/241files pass; finalTypeScript, changed-filelint and productionbuild pass. No live image/provider requests or production writes were performed.

Large-article approval contract follow-up: replaced the remaining32-image attestation cap in both request validation and the unapplied approval SQL with an8MB JSON byte limit. Preview remains bounded at2MB; the larger attestation allowance covers hashes for its complete media manifest. Exact identifier/hash matching, unique keys, current authority/version checks and deadlines remain unchanged. A40-image review is exercised through the server and durable SQL receipt. Finding3988199800 addressed; regenerate the release migration manifest because the approval migration bytes changed.

Attestation-contract validation:3,259tests/241files pass, including40-image server verification and stored receipt; TypeScript and changed-filelint pass. Fresh Linux build/lock/review checks are required on the pushed revision.

Controlled-image compatibility follow-up: team media now applies the same controlled-origin policy as authoring/publication, including other approved Supabase deployments, then pins every request and redirect to the selected origin. Outbound admission, public-address checks, exact bytes and scoped current-storage reads remain enforced. Native Node and Bun image requests now advertise only the supported PNG/JPEG/WebP types. Findings3988297672/3988297681 addressed. All3,261tests/241files, TypeScript and changed-filelint pass.

## Unchanged saves and quality score review fixes — 11 September

Latest review findings on `8d255a8` are addressed locally: unchanged populated editor forms are disabled, and the database independently compares submitted fields against saved values with matching optional-field defaults. A no-op records its idempotent receipt while preserving exact content/hash/timestamp, workspace revision, publication approval, knowledge review and pending schedule. Actual changes to any of the eight editable content fields mark an existing quality score stale. Current membership, saved-hash, capacity and in-flight publication checks remain enforced.

Validation: 3,270 tests across 241 files pass, including nine additional database regressions (69 membership/migration tests); TypeScript, changed-file lint and production build pass. The unreleased edit migration changed and requires a refreshed guarded release packet. No migration or production deployment has been executed. Overall remains approximately 55%, implementation 70%; current-head release review and real owner/collaborator acceptance remain open.

The completed security review of `8d255a8` additionally requested per-actor comment limits. The unreleased comment migration now enforces 100 new comments per actor/project/hour beneath the existing 5,000 project/hour ceiling, using the same transaction lock and a supporting actor/time index. Exact retries precede quota checks; old history is retained and stops counting after an hour. Regression coverage verifies one actor is held while another can comment, exact retry behavior, and window recovery. Full suite: 3,271 tests / 241 files pass.

## Native image review admission — 11 September

The `10a2d44` code review identified a deployment incompatibility: the team image reader still required the public-audit `MILO_OUTBOUND_FETCH_MODE` switch, which is explicitly absent from the selected Lovable architecture. Removed that dependency for this separate native image reader. Admission still requires current scoped review authority and an approved image origin; the existing native reader independently enforces public DNS, socket pinning, HTTPS/exact-origin redirects, proxy refusal, deadlines and byte bounds. Public-audit transport policy is unchanged. Focused team media tests pass; no live fetch or production setting change was performed.

Admission-fix validation: types and changed-file lint pass. The full local run recorded 3,267 passes and four 5-second timeouts across two existing test files under concurrent checks; after those checks completed, both complete affected files plus media/native-fetch tests passed serially (159 tests / 4 files, 5.65 seconds). No assertions or test timeouts were changed. Logs `/tmp/milo-team-native-admission-{full,recheck,types,lint}.log`. Fresh Linux checks and current-head reviews remain required.

## Current-version independence and media capacity — 11 September

The reviewer separation check now considers only a content-changing team edit whose resulting hash matches the exact draft under review. An old edit no longer excludes a reviewer after an owner rewrite; a no-op receipt does not disguise the current author's edit. Actual-SQL tests cover own-current-edit refusal, later-owner-version approval and owner no-op preservation.

Media admission is actor-wide and occurs before either private context read or storage/origin access. The unreleased read migration adds a private `project_team_media_limits` table with atomic per-actor limits: four active leases, 120 starts per minute and 600 per hour. The lease lasts 60 seconds for crash recovery; ordinary work releases its own token when the underlying operation settles. A caller timeout does not prematurely release a still-running operation. Native fetching remains bounded/pinned, and SDK storage downloads now receive the same abort signal. Failed admission reads no context or image bytes; actor isolation, wrong-actor release, window/lease recovery, restricted accounts and private permissions are tested. Counters/leases are bounded operational state, not growing review history.

Nine migrations remain unapplied, now introducing 13 private/team tables. Approval and read SQL source hashes changed, so the release manifest and guarded packet require regeneration. No live image fetch, account change, migration or deployment was performed.

Current-fix validation: 3,278 tests / 241 files pass, including seven additional reviewer/media regressions; TypeScript and changed-file lint pass. The added timeout cleanup regression initially failed, exposing post-cancellation hashing; explicit cancellation checks now stop late work and the complete suite passes. Logs `/tmp/milo-team-media-budget-full-final.log`, `/tmp/milo-team-media-budget-types.log`, `/tmp/milo-team-media-budget-final-lint.log`.

## Aligning image batches and review authority — 11 September

The c96a4e7 code review found two prerequisite paths still using older behavior. Both approval and pre-publication image verification now process batches of four, matching the durable active-media allowance. Tests exercise 40-image approval and nine-image publication verification with an enforced four-active-read ceiling. The earlier `read_project_team_review_authority` SQL predicate now matches final approval: a content-changing team edit must produce the current draft hash to exclude its author under reviewer separation. The existing own-edit, owner-rewrite and owner-no-op cases now assert both authority and final admission. These changes remain unreleased.

The completed c96a4e7 security review also requested isolated draft-save limits and coalesced no-op receipts. The unreleased edit migration now limits new receipts to 120 per actor/project/hour beneath the 10,000 project ceiling. A partial unique index coalesces identical unchanged-version/patch/actor/membership receipts submitted with fresh IDs; exact recorded retries still return before capacity checks. No-op saves preserve the original draft and approvals. Actual-SQL coverage verifies fresh-ID coalescing, capacity-safe retries and the owner's ability to save while an editor is limited. Existing history is retained.

Final alignment/quota validation: full 3,280 tests / 241 files pass with one worker (71.50 seconds), TypeScript and changed-file lint pass. This includes the multi-image concurrency checks, shared review-authority predicates and fresh-ID no-op coalescing/per-actor quota. Logs `/tmp/milo-team-batch-authority-full-final.log`, `/tmp/milo-team-batch-authority-types-final.log`, `/tmp/milo-team-edit-quota-focused.log`. No production action has been performed.


## Publication image admission contention — 11 September

The 1e35a6a code review found that concurrent publications for one owner can compete for the four actor-wide image leases. Only the database's exact `team_media_capacity` sentinel now becomes a dedicated preflight capacity error. The approval boundary preserves this case as retryable before any connector dispatch; changed images, invalid approvals and other image-check failures still refuse publication. Scheduled work returns to pending and restores the already-incremented claim attempt, including at attempt three, so contention cannot exhaust the connector retry budget. Permanent and uncertain connector outcomes remain held.

Validation: all 3,283 tests / 242 files pass (one worker, 58.49 seconds); TypeScript, changed-file lint and production build pass. New regressions cover the database sentinel versus unrelated errors, approval propagation versus changed-image refusal, and queue retry/attempt restoration. No SQL changed, migration applied, live fetch, message or deployment performed. Current-head review and real acceptance remain open.


## Authorize before workspace admission — 11 September

The completed 1e35a6a security review identified that snapshot authorization acquired an exclusive owner workspace lock before rejecting removed or unrelated collaborators. Snapshot admission now checks current accounts and project membership without locks, acquires a shared workspace lock with NOWAIT for reads, and repeats authoritative account/membership checks under that lock. Account and membership share locks also use NOWAIT, preventing queued lock waits after a caller disconnects. A service-only optional `p_write` argument selects exclusive NOWAIT admission for comments, draft edits, approval decisions, recipient settings and invitation-delivery requests; those mutation paths retain version/quota serialization. All read-only callers keep shared admission.

The actual team RPC transport now receives a nine-second AbortSignal deadline beneath the ten-second application deadline. Cancellation is not treated as proof that a mutation rolled back, and existing uncertain-write recovery semantics remain unchanged. SQL regression coverage verifies unauthorized exclusive admission is refused, authorized admission succeeds, preliminary authorization precedes locking, and shared/exclusive NOWAIT paths exist. Transport coverage verifies the signal reaches the RPC builder. True multi-session production acceptance remains unverified.

Six unreleased migration sources changed (020000, 040000, 050000, 060000, 080000 and 100000); all nine remain unapplied. Regenerate the guarded packet and manifest before release. No production reads/writes, live transport, messages or policy activation were performed.

Read-admission validation: all 3,285 tests / 243 files pass with one worker (106.01 seconds), including 88 focused access/membership/transport tests. TypeScript, changed-file lint and production build pass. Logs `/tmp/milo-team-read-admission-{focused,full,types,lint}.log`.


## Preserve authorship across review decisions — 11 September

Code review of 12c1ffc found that approval/rejection status updates change the raw draft hash without changing the authored content. Edit receipts now store a private SHA-256 hash of the eight editable content fields, with the same empty defaults as the editor. Reviewer separation and preliminary authority match that content identity and exclude unchanged-save receipts. Status, timestamps, quality markers, schedules and publication bookkeeping no longer erase authorship; an actual owner rewrite still produces a different content identity. The original raw hashes continue to enforce exact-version editing and approval.

Actual-SQL regressions cover own edits, owner rewrites, owner no-ops, and both approved and rejected status transitions. The helper is private; the three modified migrations (050000, 060000 and 070000) remain unapplied. Release review and real acceptance remain open.

Authorship validation: full 3,287 tests / 243 files pass (79.29 seconds). The final stored-content hash readback is additionally verified by the complete 77-test membership/migration file. Changed-file lint passes; runtime application source is unchanged from the previously passing 12c1ffc production build. SQL source hashes and the migration rehearsal remain separate release evidence.


## Review budgets and lazy roster details — 11 September

The completed 12c1ffc security review found unrestricted repeated rejection history and unbounded retained preview images. All fresh decisions now share the project admission ceiling and a 120-per-actor/project/hour limit with a supporting index. Fresh-ID rejections of the same already-rejected version, actor, membership and policy coalesce without rewriting the draft, approval, workspace revision or history; current authority and exact draft checks still run. Other actors, including the owner, retain their own allowance.

Rendered previews now admit at most 128 images, reserve the endpoint's worst-case 5 MiB before each download within a 16 MiB aggregate retained-byte budget, and bound base64 before allocation. PNG/JPEG/WebP header inspection checks dimensions before Blob creation or browser decoding: 4,096 pixels per side, 8 Mi pixels per image and 16 Mi pixels per preview. Animated PNG/WebP and inconsistent dimensions are refused; browser decoding still verifies actual renderability. Failure/unmount revokes created object URLs. Forty small images remain supported. A four-locale message explains when images need reduction or a supported still format. These are conservative preview limits; oversized reviews remain incomplete rather than becoming approved without all evidence. Header contracts were checked against the W3C PNG and Google WebP specifications.

The completed d425328 code review found two UI mismatches. Social image evidence is now included only for an approved featured image, matching the assembled publication; retained draft social objects no longer block unrelated reviews. Owner roster notification settings and invitation delivery details mount only when their details panel is expanded. A 1,000-row static render verifies that collapsed details mount no request-consuming child components. Actual browser interaction acceptance remains outstanding.

Validation: all 3,298 tests / 245 files pass with one worker (54.42 seconds), including seven image budget/header checks, two decision-limit SQL regressions, the draft-social case and the lazy-details check. TypeScript, changed-file lint and production build pass. Logs `/tmp/milo-team-review-limits-{full,types-final,lint-final,build}.log`. The unreleased approval-policy migration changed; regenerate the guarded release packet before release. No production SQL, deployment, emails, live image fetch or policy change was performed.


## Draft refresh and shared notification preparation — 11 September

The f9a9609 code review found that the rendered preview could lag behind the parent draft after another session edited it. The rendered-review component is now keyed by draft ID/hash and membership revision; its query key includes the expected draft hash, and both loading and readiness refuse a different version. Parent refreshes therefore rebuild the preview and image acknowledgement state instead of displaying new draft text alongside old rendered content.

Notification queue preparation now refreshes each selected owner once per bounded sweep and reuses only that sweep's success/failure across the owner's recipients/projects. A failed refresh is not retried for every recipient; other owners still proceed. Queue admission remains recipient-specific, and each actual delivery retains its own immediate source/recipient checks. Two regressions cover 20 recipients across one owner's projects and isolation after an owner refresh fails. No email transport or gate was activated.

Refresh follow-up validation: all 3,300 tests / 245 files pass with one worker (129.63 seconds), including 11 delivery tests. TypeScript, changed-file lint and production build pass. Logs `/tmp/milo-team-refresh-{full,focused,lint}.log`. No SQL source changed in this follow-up.

Invitation acceptance hardening (2026-09-11): current verified recipient and pending, unexpired invitation eligibility are checked before any owner workspace lock. Workspace, recipient identity and invitation locks use NOWAIT; recipient/invitation eligibility is repeated under the workspace lock. The membership database suite passes 81 tests, including forged invitation rejection. Migration 20260911030000 remains unapplied; no invitations sent or production changes made. Overall progress remains approximately 55%, implementation 70%.

Legacy image compatibility (2026-09-11): team projections and scoped media requests preserve the existing unrestricted stored image identifier. Canonical previews keep existing safe review keys, while unsafe identifiers use a separate tilde-prefixed SHA-256 key derived from the JSON-encoded identifier. The disjoint format prevents a legacy identifier from colliding with an existing safe-key identifier; JSON encoding preserves distinct surrogate strings. Browser token replacement and approval JSON validation accept the same safe format. Raw identifiers are retained for exact media lookup and are not inserted as HTML tokens. The 127 focused projection/preview/media/database tests, TypeScript and changed-file lint pass. Migration060000 remains unapplied; no production change.

Latest exact team-branch validation: all 3,312 tests / 245 files pass (63.30 seconds); TypeScript, changed-file lint and production build pass. Logs /tmp/milo-legacy-image-{full,types,lint,build}.log. Real browser/owner-collaborator acceptance and release remain open.

Validation correction: the initial legacy-image TypeScript run found a missing required concept field in the new preview fixture. The fixture is corrected, and the final TypeScript run passes (/tmp/milo-legacy-image-types-final.log). Production code is unchanged by this fixture correction; the 3312-test regression and build results above remain applicable.
