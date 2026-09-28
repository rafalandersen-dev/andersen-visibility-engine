/**
 * Owner-scoped approval provenance for the citation forward workflow (candidate migration 20260927190000,
 * Codex N2/S3). Returns whether one exact asset version is CURRENTLY approved under the unchanged released
 * predicate and, only then, the actual approver (the owner or the delegate reviewer recorded on the approval).
 * Nothing is inferred from a version hash or from roster membership; the owner never types an actor id.
 */
import { z } from "zod";
import type { KnowledgeRpc } from "./project-knowledge.server";

const scope = z
  .object({
    ownerId: z.string().uuid(),
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    assetId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    versionHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const approvalProvenanceSchema = z
  .object({
    approved: z.boolean(),
    approverKind: z.enum(["owner", "delegate"]).nullable(),
    approverId: z.string().uuid().nullable(),
    approvedAt: z.string().nullable(),
  })
  .strict();
export type ApprovalProvenance = z.infer<typeof approvalProvenanceSchema>;

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
        timer = setTimeout(() => reject(Error("publication_approval_unavailable")), 10000);
      }),
    ]);
    if (r.error) throw Error("publication_approval_unavailable");
    return r.data;
  } catch {
    // Every failure (a refused asset, a raw database error, transport, the timeout) collapses to one generic
    // code: no raw database text ever escapes and an uncertain state is never reported as approved.
    throw Error("publication_approval_unavailable");
  } finally {
    clearTimeout(timer);
  }
}
export async function readPublicationApprovalProvenance(
  raw: z.infer<typeof scope>,
  rpc?: KnowledgeRpc,
): Promise<ApprovalProvenance> {
  const s = scope.parse(raw);
  return approvalProvenanceSchema.parse(
    await call(
      "read_publication_approval_provenance_v1",
      { p_user: s.ownerId, p_project: s.projectId, p_asset: s.assetId, p_hash: s.versionHash },
      rpc,
    ),
  );
}
