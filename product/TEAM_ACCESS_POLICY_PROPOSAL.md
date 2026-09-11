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
