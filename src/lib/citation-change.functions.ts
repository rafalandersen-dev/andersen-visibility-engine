import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  changeApprovalInputSchema,
  changeArtifactInputSchema,
  changeArtifactTargetSchema,
  changeReceiptInputSchema,
  changeReceiptTargetSchema,
  delegateApprovalInputSchema,
  delegateReceiptInputSchema,
  inspectionAssignmentInputSchema,
  inspectionInputSchema,
  inspectionTargetSchema,
} from "./citation-change";
import { z } from "zod";

const ownerScope = z
  .object({
    expectedOwnerId: z.string().uuid(),
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  })
  .strict();
// OWNER endpoints: the authenticated `context.userId` IS the owner scope; `expectedOwnerId` only guards an
// account switch mid-session (never an authorization input).
export const saveChangeArtifactFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => changeArtifactInputSchema.parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-change.server")).saveChangeArtifact(
      { ownerId: context.userId, projectId: data.projectId },
      data,
    );
  });
export const readChangeArtifactsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ownerScope.parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-change.server")).readChangeArtifacts({
      ownerId: context.userId,
      projectId: data.projectId,
    });
  });
export const removeChangeArtifactFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => changeArtifactTargetSchema.parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-change.server")).removeChangeArtifact(
      { ownerId: context.userId, projectId: data.projectId },
      data.artifactId,
    );
  });
/** Owner approval of an artifact (the actor is the owner). */
export const setChangeApprovalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => changeApprovalInputSchema.parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-change.server")).setChangeApproval(context.userId, {
      ownerId: context.userId,
      projectId: data.projectId,
      artifactId: data.artifactId,
      expectedSha: data.expectedSha,
      approved: data.approved,
      expectedRevision: data.expectedRevision,
      requestId: data.requestId,
    });
  });
/** Owner performed declaration (the actor is the owner). */
export const saveChangeReceiptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => changeReceiptInputSchema.parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-change.server")).saveChangeReceipt(context.userId, {
      ownerId: context.userId,
      projectId: data.projectId,
      artifactId: data.artifactId,
      performedAt: data.performedAt,
    });
  });
export const removeChangeReceiptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => changeReceiptTargetSchema.parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-change.server")).removeChangeReceipt(
      { ownerId: context.userId, projectId: data.projectId },
      data.receiptId,
    );
  });
export const grantInspectionAssignmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => inspectionAssignmentInputSchema.parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-change.server")).grantInspectionAssignment(
      { ownerId: context.userId, projectId: data.projectId },
      { improvementRowId: data.improvementRowId, inspectorId: data.inspectorId },
    );
  });
export const revokeInspectionAssignmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => inspectionAssignmentInputSchema.parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-change.server")).revokeInspectionAssignment(
      { ownerId: context.userId, projectId: data.projectId },
      { improvementRowId: data.improvementRowId, inspectorId: data.inspectorId },
    );
  });
// ACTOR endpoints: the authenticated `context.userId` is the delegate/inspector; owner + project are supplied
// and the database decides authority (team policy + explicit assignment + independence from performer/approver).
export const setChangeApprovalAsDelegateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => delegateApprovalInputSchema.parse(v))
  .handler(async ({ data, context }) =>
    (await import("./citation-change.server")).setChangeApproval(context.userId, data),
  );
export const saveChangeReceiptAsDelegateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => delegateReceiptInputSchema.parse(v))
  .handler(async ({ data, context }) =>
    (await import("./citation-change.server")).saveChangeReceipt(context.userId, data),
  );
export const getImprovementForInspectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => inspectionTargetSchema.parse(v))
  .handler(async ({ data, context }) =>
    (await import("./citation-change.server")).getImprovementForInspection(context.userId, data),
  );
export const saveImprovementInspectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => inspectionInputSchema.parse(v))
  .handler(async ({ data, context }) =>
    (await import("./citation-change.server")).saveImprovementInspection(context.userId, data),
  );
