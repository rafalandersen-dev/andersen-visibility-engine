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
