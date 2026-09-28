/**
 * Server calls for change evidence (candidate migration 20260928120000). Owner endpoints take the authenticated
 * owner scope; actor endpoints take the authenticated inspector/delegate and the supplied owner/project; the
 * database decides authority from the live team membership/policy and explicit assignments. Only fixed outcome
 * tokens are surfaced; everything else collapses to `citation_change_unavailable`.
 */
import { z } from "zod";
import {
  changeApprovalInputSchema,
  changeApprovalProvenanceSchema,
  changeArtifactInputSchema,
  changeArtifactSchema,
  changeArtifactTargetSchema,
  changeArtifactsStateSchema,
  changeReceiptInputSchema,
  changeReceiptTargetSchema,
  changeSavedReceiptSchema,
  delegateApprovalInputSchema,
  delegateReceiptInputSchema,
  inspectionAssignmentInputSchema,
  inspectionInputSchema,
  inspectionReceiptSavedSchema,
  inspectionTargetSchema,
  inspectionViewSchema,
} from "./citation-change";
import type { KnowledgeRpc } from "./project-knowledge.server";

const SURFACED = new Set([
  "citation_change_unsupported",
  "citation_change_unavailable",
  "citation_change_stale",
  "citation_change_forbidden",
  "citation_change_unapproved",
  "citation_change_receipt_invalid",
  "citation_change_capacity",
  "citation_inspection_invalid",
  "citation_inspection_forbidden",
  "citation_inspection_stale",
  "citation_inspection_not_independent",
  "citation_inspection_identity_unavailable",
  "citation_inspection_version_conflict",
  "citation_improvement_unavailable",
]);
class ChangeError extends Error {}
async function call(name: string, args: Record<string, unknown>, injected?: KnowledgeRpc) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let rpc = injected;
    if (!rpc) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as { rpc: KnowledgeRpc };
      rpc = (method, params) => admin.rpc(method, params);
    }
    const r = await Promise.race([
      rpc(name, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("citation_change_unavailable")), 10000);
      }),
    ]);
    if (r.error) {
      const message = (r.error as { message?: unknown }).message;
      throw new ChangeError(
        typeof message === "string" && SURFACED.has(message)
          ? message
          : "citation_change_unavailable",
      );
    }
    return r.data;
  } catch (error) {
    throw error instanceof ChangeError ? error : Error("citation_change_unavailable");
  } finally {
    clearTimeout(timer);
  }
}
const owner = z
  .object({ ownerId: z.string().uuid(), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
  .strict();
const actorId = z.string().uuid();

export async function saveChangeArtifact(
  o: z.infer<typeof owner>,
  raw: z.infer<typeof changeArtifactInputSchema>,
  rpc?: KnowledgeRpc,
) {
  const s = owner.parse(o);
  const input = changeArtifactInputSchema.parse(raw);
  return changeArtifactSchema.omit({ approval: true, receipts: true }).parse(
    await call(
      "save_ai_citation_change_artifact",
      {
        p_user: s.ownerId,
        p_project: s.projectId,
        p_kind: input.kind,
        p_reference: input.reference,
        p_fields: input.fields,
      },
      rpc,
    ),
  );
}
export async function readChangeArtifacts(o: z.infer<typeof owner>, rpc?: KnowledgeRpc) {
  const s = owner.parse(o);
  return changeArtifactsStateSchema.parse(
    await call(
      "read_ai_citation_change_artifacts",
      { p_user: s.ownerId, p_project: s.projectId },
      rpc,
    ),
  );
}
export async function removeChangeArtifact(
  o: z.infer<typeof owner>,
  artifactId: string,
  rpc?: KnowledgeRpc,
) {
  const s = owner.parse(o);
  return z
    .literal(true)
    .parse(
      await call(
        "remove_ai_citation_change_artifact",
        { p_user: s.ownerId, p_project: s.projectId, p_id: z.string().uuid().parse(artifactId) },
        rpc,
      ),
    );
}
/** Approval by the authenticated actor: the owner (owner approval) or a team member under the reviewer/editor
 * policy (delegate approval). `expectedSha` is the approval subject's own identity. */
export async function setChangeApproval(
  actor: string,
  target: {
    ownerId: string;
    projectId: string;
    artifactId: string;
    expectedSha: string;
    approved: boolean;
    expectedRevision: number;
    requestId: string;
  },
  rpc?: KnowledgeRpc,
) {
  const a = actorId.parse(actor);
  const t = delegateApprovalInputSchema.parse(target);
  return changeApprovalProvenanceSchema.parse(
    await call(
      "set_ai_citation_change_approval",
      {
        p_actor: a,
        p_owner: t.ownerId,
        p_project: t.projectId,
        p_artifact: t.artifactId,
        p_expected_sha: t.expectedSha,
        p_approved: t.approved,
        p_expected_revision: t.expectedRevision,
        p_request: t.requestId,
      },
      rpc,
    ),
  );
}
export async function readChangeApprovalProvenance(
  o: z.infer<typeof owner>,
  artifactId: string,
  rpc?: KnowledgeRpc,
) {
  const s = owner.parse(o);
  return changeApprovalProvenanceSchema.parse(
    await call(
      "read_ai_citation_change_approval_provenance",
      {
        p_user: s.ownerId,
        p_project: s.projectId,
        p_artifact: z.string().uuid().parse(artifactId),
      },
      rpc,
    ),
  );
}
/** Performed declaration by the authenticated actor (owner or eligible member). */
export async function saveChangeReceipt(
  actor: string,
  target: { ownerId: string; projectId: string; artifactId: string; performedAt: string },
  rpc?: KnowledgeRpc,
) {
  const a = actorId.parse(actor);
  const t = delegateReceiptInputSchema.parse(target);
  return changeSavedReceiptSchema.parse(
    await call(
      "save_ai_citation_change_receipt",
      {
        p_actor: a,
        p_owner: t.ownerId,
        p_project: t.projectId,
        p_artifact: t.artifactId,
        p_performed_at: t.performedAt,
      },
      rpc,
    ),
  );
}
export async function removeChangeReceipt(
  o: z.infer<typeof owner>,
  receiptId: string,
  rpc?: KnowledgeRpc,
) {
  const s = owner.parse(o);
  return z
    .literal(true)
    .parse(
      await call(
        "remove_ai_citation_change_receipt",
        { p_user: s.ownerId, p_project: s.projectId, p_id: z.string().uuid().parse(receiptId) },
        rpc,
      ),
    );
}
export async function grantInspectionAssignment(
  o: z.infer<typeof owner>,
  target: { improvementRowId: string; inspectorId: string },
  rpc?: KnowledgeRpc,
) {
  const s = owner.parse(o);
  const t = z
    .object({ improvementRowId: z.string().uuid(), inspectorId: z.string().uuid() })
    .parse(target);
  return z
    .object({
      ownerId: z.string().uuid(),
      projectId: z.string(),
      improvementRowId: z.string().uuid(),
      inspectorId: z.string().uuid(),
      active: z.literal(true),
      revision: z.number().int().min(1),
    })
    .strict()
    .parse(
      await call(
        "grant_ai_citation_inspection_assignment",
        {
          p_owner: s.ownerId,
          p_project: s.projectId,
          p_row: t.improvementRowId,
          p_inspector: t.inspectorId,
        },
        rpc,
      ),
    );
}
export async function revokeInspectionAssignment(
  o: z.infer<typeof owner>,
  target: { improvementRowId: string; inspectorId: string },
  rpc?: KnowledgeRpc,
) {
  const s = owner.parse(o);
  const t = z
    .object({ improvementRowId: z.string().uuid(), inspectorId: z.string().uuid() })
    .parse(target);
  return z.literal(true).parse(
    await call(
      "revoke_ai_citation_inspection_assignment",
      {
        p_owner: s.ownerId,
        p_project: s.projectId,
        p_row: t.improvementRowId,
        p_inspector: t.inspectorId,
      },
      rpc,
    ),
  );
}
export async function getImprovementForInspection(
  actor: string,
  raw: z.infer<typeof inspectionTargetSchema>,
  rpc?: KnowledgeRpc,
) {
  const a = actorId.parse(actor);
  const t = inspectionTargetSchema.parse(raw);
  const view = inspectionViewSchema.parse(
    await call(
      "read_ai_citation_improvement_for_inspection",
      { p_actor: a, p_owner: t.ownerId, p_project: t.projectId, p_row: t.improvementRowId },
      rpc,
    ),
  );
  if (view.id.toLowerCase() !== t.improvementRowId.toLowerCase())
    throw Error("citation_change_unavailable");
  return view;
}
export async function saveImprovementInspection(
  actor: string,
  raw: z.infer<typeof inspectionInputSchema>,
  rpc?: KnowledgeRpc,
) {
  const a = actorId.parse(actor);
  const t = inspectionInputSchema.parse(raw);
  return inspectionReceiptSavedSchema.parse(
    await call(
      "save_ai_citation_improvement_inspection",
      {
        p_actor: a,
        p_owner: t.ownerId,
        p_project: t.projectId,
        p_row: t.improvementRowId,
        p_expected_sha: t.expectedSha,
        p_check: t.checkResult,
        p_observed_at: t.observedAt,
        p_expected_version: t.expectedVersion,
        p_expected_head: t.expectedHeadId,
      },
      rpc,
    ),
  );
}
export {
  changeApprovalInputSchema,
  changeArtifactTargetSchema,
  changeReceiptInputSchema,
  changeReceiptTargetSchema,
  inspectionAssignmentInputSchema,
};
