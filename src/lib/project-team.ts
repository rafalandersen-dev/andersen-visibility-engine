import { z } from "zod";
import { teamProjectTarget } from "./project-team-view";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const uuid = z.string().uuid();
export const teamRole = z.enum(["viewer", "editor", "reviewer"]);
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const project = z.object({ projectId: id }).strict();
export const teamOwnerAction = z.discriminatedUnion("action", [
  project
    .extend({
      action: z.literal("invite"),
      inviteId: uuid,
      email: z.string().email().max(254),
      role: teamRole,
    })
    .strict(),
  project.extend({ action: z.literal("revoke"), inviteId: uuid }).strict(),
  project
    .extend({
      action: z.literal("role"),
      memberId: uuid,
      expectedRevision: revision,
      role: teamRole,
    })
    .strict(),
  project
    .extend({ action: z.literal("remove"), memberId: uuid, expectedRevision: revision })
    .strict(),
]);
export const teamAcceptInput = project.extend({ ownerId: uuid, inviteId: uuid }).strict();
export const teamRosterInput = project;
const date = z.string().datetime({ offset: true });
export const teamRoster = project
  .extend({
    ownerId: uuid,
    members: z
      .array(
        z
          .object({
            actorId: uuid,
            email: z.string().email().max(320).nullable(),
            role: teamRole,
            revision,
            active: z.boolean(),
            expiresAt: date.nullable(),
          })
          .strict(),
      )
      .max(1000),
    invitations: z
      .array(
        z
          .object({
            inviteId: uuid,
            email: z.string().email().max(254),
            role: teamRole,
            state: z.enum(["pending", "accepted", "revoked"]),
            expiresAt: date,
            createdAt: date,
          })
          .strict(),
      )
      .max(1000),
    audit: z
      .array(
        z
          .object({
            actorId: uuid,
            subjectId: uuid,
            action: z.enum(["invited", "invite_revoked", "accepted", "role_changed", "removed"]),
            revision: revision.nullable(),
            occurredAt: date,
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
const shared = project.extend({ ownerId: uuid, name: z.string().max(1000), role: teamRole });
export const myProjectTeams = z
  .object({
    actorId: uuid,
    projects: z.array(shared.extend({ revision }).strict()).max(1000),
    invitations: z.array(shared.extend({ inviteId: uuid, expiresAt: date }).strict()).max(1000),
  })
  .strict();

export const teamReadInput = teamProjectTarget
  .extend({
    assetId: id.optional(),
    offset: z.number().int().min(0).max(100000).default(0),
  })
  .strict();
export const teamCommentTarget = teamProjectTarget.extend({ assetId: id }).strict();
export const teamCommentRead = teamCommentTarget
  .extend({ offset: z.number().int().min(0).max(5000).default(0) })
  .strict();
export const teamCommentAdd = teamCommentTarget
  .extend({
    commentId: uuid,
    expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    body: z.string().trim().min(1).max(4000),
  })
  .strict();
export const teamComments = teamCommentTarget
  .extend({
    comments: z
      .array(
        z
          .object({
            commentId: uuid,
            mine: z.boolean(),
            authorName: z.string().max(120),
            body: z.string().min(1).max(4000),
            workspaceRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
            createdAt: date,
          })
          .strict(),
      )
      .max(100),
    remaining: z.number().int().min(0).max(5000),
  })
  .strict();
export const teamDraftFields = z
  .object({
    title: z.string().trim().min(1).max(1000),
    markdown: z.string().max(1000000),
    h1: z.string().max(1000),
    metaTitle: z.string().max(1000),
    metaDescription: z.string().max(4000),
    cta: z.string().max(16000),
    outline: z.array(z.string().max(1000)).max(100),
    faq: z.array(z.object({ q: z.string().max(1000), a: z.string().max(16000) }).strict()).max(100),
  })
  .strict();
export const teamDraftEdit = teamCommentTarget
  .extend({
    editId: uuid,
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
    expectedMembershipRevision: revision,
    fields: teamDraftFields,
  })
  .strict();
export const teamPolicyMode = z.enum(["disabled", "separate_reviewers", "editors_can_approve"]);
export const teamPolicy = teamProjectTarget
  .extend({
    mode: teamPolicyMode.nullable(),
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export const teamPolicyChange = teamRosterInput
  .extend({
    mode: teamPolicyMode,
    expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export const teamMediaInput = teamCommentTarget
  .extend({
    imageId: id,
    kind: z.enum(["content", "featured"]).optional(),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const teamReviewDecision = teamCommentTarget
  .extend({
    reviewId: uuid,
    expectedVersion: z
      .object({
        algorithm: z.literal("milo-publication-v1"),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
    expectedWorkspaceRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    expectedMembershipRevision: revision,
    expectedPolicyRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    approved: z.boolean(),
    acknowledged: z.boolean(),
    images: z
      .array(
        z
          .object({
            key: z.string().regex(/^(content|featured)_[A-Za-z0-9_-]{1,64}$/),
            byteHash: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(31),
  })
  .strict();
